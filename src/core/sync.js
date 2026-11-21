// Synchronization from the library to agent destinations.
//
// A destination is an agent folder (for example ~/.claude/skills) linked to an
// adapter. The plan compares three states for each skill: the library copy,
// the copy written during the last installation and the copy currently on
// disk. Only safe actions run automatically. Anything that could lose data
// becomes a conflict that the user resolves, and every overwrite or removal is
// preceded by a backup.

import fsp from 'node:fs/promises';
import path from 'node:path';
import { newId, nowIso, exists, sha256, ensureDir, copyDir, timestampSlug, listFiles } from './fsutil.js';
import { computeContentHash } from './skill-parser.js';
import { getAdapter } from './adapters/index.js';
import { diffLines, compactDiff } from './diff.js';

export const DESTINATION_MODES = ['manual', 'startup', 'on-change', 'interval'];
export const SAFE_ACTIONS = new Set(['install', 'update']);

export function normalizeDestination(input) {
  return {
    id: input.id || newId('dst_'),
    label: String(input.label || input.adapterId || 'Destination'),
    adapterId: String(input.adapterId || 'generic-folder'),
    path: path.resolve(String(input.path || '')),
    scope: input.scope === 'project' ? 'project' : 'user',
    mode: DESTINATION_MODES.includes(input.mode) ? input.mode : 'manual',
    intervalMinutes: Math.max(1, Number(input.intervalMinutes) || 60),
    enabled: input.enabled !== false,
    skillIds: Array.isArray(input.skillIds) ? [...new Set(input.skillIds)] : [],
    packIds: Array.isArray(input.packIds) ? [...new Set(input.packIds)] : [],
    createdAt: input.createdAt || nowIso(),
    lastSyncAt: input.lastSyncAt || null
  };
}

/** Hash of what is currently at the destination, or null when absent. */
export async function destinationHash(adapter, target) {
  if (!(await exists(target))) return null;
  if (adapter.layout === 'single-file') return sha256(await fsp.readFile(target));
  const files = [];
  for (const rel of await listFiles(target)) {
    const buf = await fsp.readFile(path.join(target, ...rel.split('/')));
    files.push({ path: rel, hash: sha256(buf) });
  }
  return computeContentHash(files);
}

export class SyncEngine {
  constructor(hub) {
    this.hub = hub;
  }

  get data() {
    return this.hub.store.data;
  }

  targetSkillIds(dest) {
    const ids = new Set(dest.skillIds);
    for (const pid of dest.packIds) {
      const pack = this.data.packs[pid];
      if (pack && pack.enabled !== false) for (const sid of pack.skillIds) ids.add(sid);
    }
    return [...ids].filter((id) => this.data.skills[id]);
  }

  installation(skill, destId) {
    return (skill.installations || []).find((i) => i.destinationId === destId) || null;
  }

  async plan(destId) {
    const dest = this.data.destinations[destId];
    if (!dest) throw new Error('Destination introuvable.');
    const adapter = getAdapter(dest.adapterId);
    if (!adapter) throw new Error(`Adaptateur inconnu : ${dest.adapterId}`);
    if (!adapter.capabilities?.install) throw new Error(`${adapter.label} ne permet pas l'installation par fichiers. Utilisez l'exportation manuelle.`);
    const items = [];
    const wanted = new Set(this.targetSkillIds(dest));
    for (const skillId of wanted) {
      const skill = this.data.skills[skillId];
      const target = adapter.targetPath(dest.path, skill);
      const inst = this.installation(skill, destId);
      const current = await destinationHash(adapter, target);
      const blocked = skill.status === 'pending-review' || skill.status === 'archived';
      const base = { skillId, name: skill.name, target };
      if (blocked) {
        items.push({ ...base, action: 'blocked', reason: skill.status === 'archived' ? 'Skill archivé.' : 'Vérification de sécurité en attente.' });
        continue;
      }
      if (!inst) {
        if (current === null) items.push({ ...base, action: 'install' });
        else items.push({ ...base, action: 'conflict', reason: 'Un dossier non géré par le hub existe déjà à cet emplacement.', kind: 'unmanaged' });
        continue;
      }
      if (current === null) {
        items.push({ ...base, action: 'missing', reason: 'Supprimé à la destination depuis la dernière synchronisation.' });
        continue;
      }
      const libChanged = skill.contentHash !== inst.libraryHash;
      const destChanged = current !== inst.installedHash;
      if (!libChanged && !destChanged) items.push({ ...base, action: 'up-to-date' });
      else if (libChanged && !destChanged) items.push({ ...base, action: 'update', fromVersion: inst.version, toVersion: skill.currentVersion });
      else if (!libChanged && destChanged) items.push({ ...base, action: 'conflict', kind: 'destination-modified', reason: 'Modifié à la destination. Une version plus récente peut exister hors de la bibliothèque.' });
      else items.push({ ...base, action: 'conflict', kind: 'both-modified', reason: 'Modifié dans la bibliothèque et à la destination.' });
    }
    for (const skill of Object.values(this.data.skills)) {
      const inst = this.installation(skill, destId);
      if (inst && !wanted.has(skill.id)) items.push({ skillId: skill.id, name: skill.name, target: inst.path, action: 'remove', reason: 'Ne fait plus partie de la sélection de cette destination.' });
    }
    return { destinationId: destId, adapterId: adapter.id, items, plannedAt: nowIso() };
  }

  async backupTarget(dest, target, reason) {
    if (!(await exists(target))) return null;
    const dir = path.join(this.hub.store.dataDir, 'backups', 'overwrites', `${timestampSlug()}-${dest.id}`);
    await ensureDir(dir);
    const out = path.join(dir, path.basename(target));
    const st = await fsp.stat(target);
    if (st.isDirectory()) await copyDir(target, out);
    else await fsp.copyFile(target, out);
    await this.hub.store.log('backup.overwrite', `Copie de sauvegarde avant ${reason} : ${target}`, { destinationId: dest.id, target, backup: out });
    return out;
  }

  async writeSkill(dest, adapter, skill, target) {
    if (adapter.layout === 'skill-folder' && (await exists(target))) await fsp.rm(target, { recursive: true, force: true });
    await adapter.install(this.hub.library.dir(skill.id), dest.path, skill);
    const installedHash = await destinationHash(adapter, target);
    skill.installations = (skill.installations || []).filter((i) => i.destinationId !== dest.id);
    skill.installations.push({ destinationId: dest.id, adapterId: adapter.id, path: target, installedHash, libraryHash: skill.contentHash, version: skill.currentVersion, installedAt: nowIso() });
  }

  /**
   * Runs the plan. Without explicit choices only safe actions run.
   * choices: {skillId: 'apply' | 'keep-library' | 'keep-destination' | 'skip' | 'reinstall' | 'remove'}
   */
  async apply(destId, choices = {}, { onlySafe = false } = {}) {
    const dest = this.data.destinations[destId];
    const adapter = getAdapter(dest.adapterId);
    const plan = await this.plan(destId);
    const result = { applied: [], skipped: [], conflicts: [], errors: [] };
    await ensureDir(dest.path);
    for (const item of plan.items) {
      const skill = this.data.skills[item.skillId];
      const choice = choices[item.skillId];
      try {
        if (item.action === 'install' && choice !== 'skip') {
          await this.writeSkill(dest, adapter, skill, item.target);
          result.applied.push({ ...item, done: 'installed' });
        } else if (item.action === 'update' && choice !== 'skip') {
          await this.backupTarget(dest, item.target, 'mise à jour');
          await this.writeSkill(dest, adapter, skill, item.target);
          result.applied.push({ ...item, done: 'updated' });
        } else if (item.action === 'conflict') {
          if (onlySafe || !choice || choice === 'skip') {
            result.conflicts.push(item);
            this.hub.addConflict({ kind: 'destination', destinationId: destId, skillId: item.skillId, path: item.target, reason: item.reason, conflictKind: item.kind });
          } else if (choice === 'keep-library') {
            await this.backupTarget(dest, item.target, 'écrasement');
            await this.writeSkill(dest, adapter, skill, item.target);
            this.hub.resolveConflictsFor(item.skillId, destId);
            result.applied.push({ ...item, done: 'overwritten-with-library' });
          } else if (choice === 'keep-destination') {
            if (adapter.layout !== 'skill-folder') throw new Error(`Récupération impossible pour ${adapter.label} : le format converti ne contient pas tout le Skill.`);
            await this.hub.library.updateFromDir(skill.id, item.target, { note: `Récupéré depuis ${dest.label}`, source: 'destination' });
            const h = await destinationHash(adapter, item.target);
            skill.installations = (skill.installations || []).filter((i) => i.destinationId !== dest.id);
            skill.installations.push({ destinationId: dest.id, adapterId: adapter.id, path: item.target, installedHash: h, libraryHash: skill.contentHash, version: skill.currentVersion, installedAt: nowIso() });
            this.hub.resolveConflictsFor(item.skillId, destId);
            result.applied.push({ ...item, done: 'pulled-into-library' });
          }
        } else if (item.action === 'missing') {
          if (choice === 'reinstall') {
            await this.writeSkill(dest, adapter, skill, item.target);
            result.applied.push({ ...item, done: 'reinstalled' });
          } else if (choice === 'forget') {
            skill.installations = skill.installations.filter((i) => i.destinationId !== destId);
            result.applied.push({ ...item, done: 'forgotten' });
          } else result.skipped.push(item);
        } else if (item.action === 'remove') {
          if (choice === 'remove' && !onlySafe) {
            const current = await destinationHash(adapter, item.target);
            const inst = this.installation(skill, destId);
            if (current !== null && current !== inst.installedHash) throw new Error('Modifié à la destination : suppression refusée. Résolvez d\'abord le conflit.');
            await this.backupTarget(dest, item.target, 'retrait');
            await this.hub.store.moveToTrash(item.target, `${dest.id}-${path.basename(item.target)}`);
            skill.installations = skill.installations.filter((i) => i.destinationId !== destId);
            result.applied.push({ ...item, done: 'removed' });
          } else result.skipped.push(item);
        } else result.skipped.push(item);
      } catch (err) {
        result.errors.push({ ...item, error: err.message });
      }
    }
    dest.lastSyncAt = nowIso();
    await this.hub.store.save();
    await this.hub.store.log('sync.run', `Synchronisation ${dest.label} : ${result.applied.length} action(s), ${result.conflicts.length} conflit(s), ${result.errors.length} erreur(s)`, { destinationId: destId, applied: result.applied.map((a) => ({ skillId: a.skillId, done: a.done })), conflicts: result.conflicts.length, errors: result.errors });
    return result;
  }

  /** Shows the differences between the library copy and the destination copy. */
  async diffWithDestination(destId, skillId) {
    const dest = this.data.destinations[destId];
    const adapter = getAdapter(dest.adapterId);
    const skill = this.data.skills[skillId];
    const target = adapter.targetPath(dest.path, skill);
    const libDir = this.hub.library.dir(skillId);
    if (adapter.layout === 'single-file') {
      const lib = adapter.convert(await fsp.readFile(path.join(libDir, 'SKILL.md'), 'utf8'), skill);
      const cur = (await exists(target)) ? await fsp.readFile(target, 'utf8') : '';
      return { files: [{ path: path.basename(target), diff: compactDiff(diffLines(cur, lib)) }] };
    }
    const libFiles = await listFiles(libDir);
    const dstFiles = (await exists(target)) ? await listFiles(target) : [];
    const all = [...new Set([...libFiles, ...dstFiles])].sort();
    const files = [];
    for (const rel of all) {
      const a = dstFiles.includes(rel) ? await fsp.readFile(path.join(target, ...rel.split('/')), 'utf8') : '';
      const b = libFiles.includes(rel) ? await fsp.readFile(path.join(libDir, ...rel.split('/')), 'utf8') : '';
      if (a !== b) files.push({ path: rel, diff: compactDiff(diffLines(a, b)), onlyIn: !dstFiles.includes(rel) ? 'library' : !libFiles.includes(rel) ? 'destination' : null });
    }
    return { files, legend: 'Lignes "-" : destination. Lignes "+" : bibliothèque.' };
  }
}
