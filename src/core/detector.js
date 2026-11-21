// Source scanning. A source is a folder (or an agent folder) the user asked
// the hub to watch. A scan compares what is on disk with what the library
// knows and classifies each skill as new, modified, unchanged, moved, renamed,
// duplicate, incomplete or missing. Applying a scan never overwrites a newer
// local version silently: local edits turn into conflicts.

import path from 'node:path';
import { newId, nowIso, isDirectory } from './fsutil.js';
import { parseSkillDir } from './skill-parser.js';
import { discoverSkillDirs } from './importer.js';
import { exists } from './fsutil.js';

export const SOURCE_MODES = ['manual', 'startup', 'watch', 'interval'];

export function normalizeSource(input) {
  const mode = SOURCE_MODES.includes(input.mode) ? input.mode : 'manual';
  return {
    id: input.id || newId('src_'),
    label: String(input.label || path.basename(input.path || '') || 'Source'),
    path: path.resolve(String(input.path || '')),
    adapterId: input.adapterId || null,
    readOnly: input.readOnly !== false, // sources are read only unless the user says otherwise
    paused: !!input.paused,
    mode,
    intervalMinutes: Math.max(1, Number(input.intervalMinutes) || 30),
    autoImport: !!input.autoImport,
    autoUpdate: !!input.autoUpdate,
    maxDepth: Math.min(12, Math.max(0, Number(input.maxDepth ?? 6))),
    createdAt: input.createdAt || nowIso(),
    lastScanAt: input.lastScanAt || null,
    lastError: input.lastError || null,
    lastStats: input.lastStats || null
  };
}

export async function scanSource(library, source) {
  const report = { sourceId: source.id, scannedAt: nowIso(), items: [], missing: [], errors: [] };
  if (!(await isDirectory(source.path))) {
    report.errors.push(`Dossier inaccessible : ${source.path} (absent, lien cassé ou permissions insuffisantes).`);
    return report;
  }
  const dirs = await discoverSkillDirs(source.path, { maxDepth: source.maxDepth });
  const linked = library.list().filter((s) => s.origin?.sourceId === source.id);
  const byPath = new Map(linked.map((s) => [path.resolve(s.origin.path || ''), s]));
  const seenSkillIds = new Set();
  const all = library.list();
  for (const dir of dirs) {
    let parsed;
    try {
      parsed = await parseSkillDir(dir, { readContent: false });
    } catch (err) {
      report.errors.push(`${dir} : ${err.message}`);
      continue;
    }
    const base = { dir, name: parsed.name || parsed.folderName, contentHash: parsed.contentHash, incomplete: parsed.incomplete, warnings: parsed.warnings };
    const known = byPath.get(path.resolve(dir));
    if (known) {
      seenSkillIds.add(known.id);
      const localEdit = known.contentHash !== known.originHash;
      if (parsed.contentHash === known.originHash) report.items.push({ ...base, state: 'unchanged', skillId: known.id });
      else report.items.push({ ...base, state: 'modified', skillId: known.id, localEdit });
      continue;
    }
    const movedFrom = linked.find((s) => !seenSkillIds.has(s.id) && s.originHash === parsed.contentHash && !byPath.has(path.resolve(dir)));
    if (movedFrom && !(await exists(movedFrom.origin.path || ''))) {
      seenSkillIds.add(movedFrom.id);
      const renamed = path.basename(movedFrom.origin.path || '') !== path.basename(dir);
      report.items.push({ ...base, state: renamed ? 'renamed' : 'moved', skillId: movedFrom.id, previousPath: movedFrom.origin.path });
      continue;
    }
    const dup = all.find((s) => s.contentHash === parsed.contentHash || s.originHash === parsed.contentHash);
    if (dup) {
      report.items.push({ ...base, state: 'duplicate', skillId: dup.id });
      continue;
    }
    report.items.push({ ...base, state: parsed.incomplete ? 'incomplete' : 'new' });
  }
  for (const s of linked) {
    if (seenSkillIds.has(s.id)) continue;
    if (!(await exists(s.origin.path || ''))) report.missing.push({ skillId: s.id, name: s.name, path: s.origin.path });
  }
  return report;
}

export function summarizeScan(report) {
  const count = (st) => report.items.filter((i) => i.state === st).length;
  return {
    total: report.items.length,
    new: count('new'),
    modified: count('modified'),
    unchanged: count('unchanged'),
    moved: count('moved') + count('renamed'),
    duplicate: count('duplicate'),
    incomplete: count('incomplete'),
    missing: report.missing.length,
    errors: report.errors.length
  };
}

/**
 * Applies a scan. Options select what is done automatically:
 *   importNew       import new and incomplete skills
 *   updateModified  create a new library version from a modified source,
 *                   only when the library copy has no local edit
 *   paths           optional list of directories to restrict the action
 */
export async function applyScan(hub, source, report, { importNew = false, updateModified = false, paths = null } = {}) {
  const { library, importer, store } = hub;
  const selected = (i) => !paths || paths.includes(i.dir);
  const done = { imported: [], updated: [], relinked: [], conflicts: [], markedMissing: [] };
  for (const item of report.items) {
    if (!selected(item)) continue;
    if ((item.state === 'new' || item.state === 'incomplete') && importNew) {
      const res = await importer.importFolder(item.dir, { type: 'source', sourceId: source.id, agent: source.adapterId, trusted: false }, { maxDepth: 0, onDuplicate: 'skip' });
      done.imported.push(...res.filter((r) => r.status === 'imported'));
    } else if (item.state === 'modified' && updateModified) {
      const skill = library.get(item.skillId);
      if (skill.contentHash !== skill.originHash) {
        const c = hub.addConflict({ kind: 'source', sourceId: source.id, skillId: skill.id, path: item.dir, sourceHash: item.contentHash, reason: 'Le Skill a été modifié dans la bibliothèque et dans la source.' });
        done.conflicts.push(c);
      } else {
        await library.updateFromDir(skill.id, item.dir, { note: `Mise à jour depuis la source ${source.label}`, source: 'source' });
        skill.originHash = item.contentHash;
        done.updated.push(skill.id);
      }
    } else if (item.state === 'moved' || item.state === 'renamed') {
      const skill = library.get(item.skillId);
      skill.origin.path = item.dir;
      skill.origin.missing = false;
      done.relinked.push(skill.id);
      await store.log('source.moved', `Skill ${item.state === 'renamed' ? 'renommé' : 'déplacé'} dans la source : ${skill.name}`, { skillId: skill.id, from: item.previousPath, to: item.dir });
    }
  }
  for (const m of report.missing) {
    const skill = library.find(m.skillId);
    if (skill && !skill.origin.missing) {
      skill.origin.missing = true;
      done.markedMissing.push(skill.id);
      await store.log('source.missing', `Skill supprimé de la source (conservé dans la bibliothèque) : ${skill.name}`, { skillId: skill.id, path: m.path });
    }
  }
  await store.save();
  return done;
}
