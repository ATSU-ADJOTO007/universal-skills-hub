// Export, backup and restore. All formats are open:
//   skill export   folder or ZIP in Agent Skills layout, or a Markdown file
//   pack export    ZIP with pack.json and skills/<slug>/...
//   backup         ZIP with manifest.json (SHA-256 of every entry),
//                  library.json, skills/, blobs/ and history.jsonl
// A backup can be verified at any time and restored selectively.

import fsp from 'node:fs/promises';
import path from 'node:path';
import { zipEntries, collectDir, readZip } from './archive.js';
import { ensureDir, sha256, nowIso, timestampSlug, writeFileAtomic, exists, copyDir, listFiles } from './fsutil.js';
import { splitFrontmatter } from './skill-parser.js';

export const BACKUP_FORMAT = 'universal-skills-hub-backup';
export const PACK_FORMAT = 'universal-skills-hub-pack';

export async function exportSkill(hub, skillId, outPath, format = 'zip') {
  const skill = hub.library.get(skillId);
  const dir = hub.library.dir(skillId);
  if (format === 'folder') {
    const target = path.join(outPath, skill.slug);
    if (await exists(target)) throw new Error(`Le dossier existe déjà : ${target}`);
    await copyDir(dir, target);
    await hub.store.log('export.skill', `Skill exporté (dossier) : ${skill.name}`, { skillId, target });
    return target;
  }
  if (format === 'markdown') {
    const text = await fsp.readFile(path.join(dir, skill.instructionFile || 'SKILL.md'), 'utf8');
    const { body } = splitFrontmatter(text);
    const out = `# ${skill.name}\n\n${skill.description}\n\n${body.trim()}\n`;
    const file = outPath.toLowerCase().endsWith('.md') ? outPath : path.join(outPath, `${skill.slug}.md`);
    await writeFileAtomic(file, out);
    await hub.store.log('export.skill', `Skill exporté (Markdown) : ${skill.name}`, { skillId, target: file });
    return file;
  }
  const file = outPath.toLowerCase().endsWith('.zip') ? outPath : path.join(outPath, `${skill.slug}.zip`);
  await writeFileAtomic(file, zipEntries(await collectDir(dir, skill.slug)));
  await hub.store.log('export.skill', `Skill exporté (ZIP) : ${skill.name}`, { skillId, target: file });
  return file;
}

export async function exportPack(hub, packId, outFile) {
  const pack = hub.store.data.packs[packId];
  if (!pack) throw new Error('Pack introuvable.');
  const entries = {};
  const members = [];
  for (const sid of pack.skillIds) {
    const s = hub.library.find(sid);
    if (!s) continue;
    Object.assign(entries, await collectDir(hub.library.dir(sid), `skills/${s.slug}`));
    members.push({ slug: s.slug, name: s.name, contentHash: s.contentHash });
  }
  entries['pack.json'] = JSON.stringify({ format: PACK_FORMAT, formatVersion: 1, exportedAt: nowIso(), pack: { name: pack.name, description: pack.description, rules: pack.rules }, skills: members }, null, 2);
  const file = outFile.toLowerCase().endsWith('.zip') ? outFile : path.join(outFile, `pack-${pack.name.replace(/[^\w-]+/g, '-')}.zip`);
  await writeFileAtomic(file, zipEntries(entries));
  await hub.store.log('export.pack', `Pack exporté : ${pack.name}`, { packId, target: file, skills: members.length });
  return file;
}

/** Imports a pack archive: skills are deduplicated by content, the pack is recreated. */
export async function importPack(hub, file) {
  const entries = readZip(await fsp.readFile(file));
  if (!entries['pack.json']) throw new Error('Archive de pack invalide : pack.json manquant.');
  const meta = JSON.parse(entries['pack.json'].toString('utf8'));
  if (meta.format !== PACK_FORMAT) throw new Error('Format de pack non reconnu.');
  const results = await hub.importer.importZipBuffer(await fsp.readFile(file), { type: 'pack', path: file }, { onDuplicate: 'skip' });
  const ids = results.map((r) => r.id || r.existingId).filter(Boolean);
  const pack = await hub.createPack({ name: meta.pack?.name || 'Pack importé', description: meta.pack?.description || '', skillIds: ids, rules: meta.pack?.rules });
  return { pack, results };
}

export async function createBackup(hub, outFile, { includeVersions = true, includeHistory = true, label = 'manual' } = {}) {
  const store = hub.store;
  const entries = {};
  entries['library.json'] = JSON.stringify(store.data, null, 2);
  Object.assign(entries, await collectDir(path.join(store.dataDir, 'skills'), 'skills'));
  if (includeVersions) Object.assign(entries, await collectDir(path.join(store.dataDir, 'blobs'), 'blobs'));
  if (includeHistory && (await exists(store.historyFile))) entries['history.jsonl'] = await fsp.readFile(store.historyFile);
  const files = {};
  for (const [rel, data] of Object.entries(entries)) files[rel] = sha256(typeof data === 'string' ? Buffer.from(data) : data);
  const manifest = {
    format: BACKUP_FORMAT,
    formatVersion: 1,
    createdAt: nowIso(),
    label,
    counts: { skills: Object.keys(store.data.skills).length, packs: Object.keys(store.data.packs).length, files: Object.keys(files).length },
    includeVersions,
    files
  };
  entries['manifest.json'] = JSON.stringify(manifest, null, 2);
  const file = outFile || path.join(store.dataDir, 'backups', `backup-${timestampSlug()}.zip`);
  await ensureDir(path.dirname(file));
  await writeFileAtomic(file, zipEntries(entries));
  await store.log('backup.create', `Sauvegarde créée : ${path.basename(file)}`, { file, counts: manifest.counts });
  return { file, manifest };
}

/** Recomputes every hash listed in the manifest. */
export async function verifyBackup(file) {
  const entries = readZip(await fsp.readFile(file));
  if (!entries['manifest.json']) return { ok: false, errors: ['manifest.json manquant.'], manifest: null };
  const manifest = JSON.parse(entries['manifest.json'].toString('utf8'));
  const errors = [];
  if (manifest.format !== BACKUP_FORMAT) errors.push('Format de sauvegarde non reconnu.');
  for (const [rel, hash] of Object.entries(manifest.files || {})) {
    if (!entries[rel]) errors.push(`Fichier manquant : ${rel}`);
    else if (sha256(entries[rel]) !== hash) errors.push(`Empreinte incorrecte : ${rel}`);
  }
  for (const rel of Object.keys(entries)) if (rel !== 'manifest.json' && !(rel in (manifest.files || {}))) errors.push(`Fichier non déclaré : ${rel}`);
  let library = null;
  try {
    library = JSON.parse(entries['library.json'].toString('utf8'));
  } catch {
    errors.push('library.json illisible.');
  }
  return {
    ok: errors.length === 0,
    errors,
    manifest: { ...manifest, files: undefined, fileCount: Object.keys(manifest.files || {}).length },
    contents: library ? {
      skills: Object.values(library.skills || {}).map((s) => ({ id: s.id, name: s.name })),
      packs: Object.values(library.packs || {}).map((p) => ({ id: p.id, name: p.name })),
      sources: Object.keys(library.sources || {}).length,
      destinations: Object.keys(library.destinations || {}).length
    } : null
  };
}

/**
 * Restores selected parts of a verified backup. A backup of the current state
 * is created first (unless disabled in the settings).
 * selection: {skills: 'all' | string[], packs: boolean, settings: boolean,
 *             sources: boolean, destinations: boolean, categories: boolean,
 *             replaceExisting: boolean}
 */
export async function restoreBackup(hub, file, selection = {}) {
  const check = await verifyBackup(file);
  if (!check.ok) throw new Error(`Sauvegarde invalide : ${check.errors.slice(0, 3).join(' ; ')}`);
  const store = hub.store;
  let safety = null;
  if (store.data.settings.backupBeforeRestore !== false) safety = (await createBackup(hub, null, { label: 'before-restore' })).file;
  const entries = readZip(await fsp.readFile(file));
  const lib = JSON.parse(entries['library.json'].toString('utf8'));
  const wanted = selection.skills === 'all' ? Object.keys(lib.skills || {}) : (selection.skills || []);
  const restored = { skills: [], skippedExisting: [], packs: 0, settings: false, sources: 0, destinations: 0, categories: false };
  for (const [rel, data] of Object.entries(entries)) {
    if (rel.startsWith('blobs/')) {
      const dest = path.join(store.dataDir, ...rel.split('/'));
      if (!(await exists(dest))) {
        await ensureDir(path.dirname(dest));
        await fsp.writeFile(dest, data);
      }
    }
  }
  for (const id of wanted) {
    const rec = lib.skills?.[id];
    if (!rec) continue;
    if (store.data.skills[id] && !selection.replaceExisting) {
      restored.skippedExisting.push(id);
      continue;
    }
    if (store.data.skills[id]) await store.moveToTrash(store.skillDir(id), `${id}-before-restore`);
    const prefix = `skills/${id}/`;
    for (const [rel, data] of Object.entries(entries)) {
      if (!rel.startsWith(prefix)) continue;
      const dest = path.join(store.skillDir(id), ...rel.slice(prefix.length).split('/'));
      await ensureDir(path.dirname(dest));
      await fsp.writeFile(dest, data);
    }
    rec.installations = store.data.skills[id]?.installations || [];
    store.data.skills[id] = rec;
    hub.library._bodies.delete(id);
    restored.skills.push(id);
  }
  if (selection.packs) for (const p of Object.values(lib.packs || {})) {
    store.data.packs[p.id] = { ...p, skillIds: p.skillIds.filter((s) => store.data.skills[s]) };
    restored.packs++;
  }
  if (selection.settings) {
    store.data.settings = { ...store.data.settings, ...lib.settings };
    restored.settings = true;
  }
  if (selection.categories && Array.isArray(lib.categories)) {
    store.data.categories = lib.categories;
    restored.categories = true;
  }
  if (selection.sources) for (const s of Object.values(lib.sources || {})) {
    store.data.sources[s.id] = s;
    restored.sources++;
  }
  if (selection.destinations) for (const d of Object.values(lib.destinations || {})) {
    store.data.destinations[d.id] = d;
    restored.destinations++;
  }
  await store.save();
  await store.log('backup.restore', `Restauration depuis ${path.basename(file)} : ${restored.skills.length} Skill(s)`, { file, safety, restored });
  return { restored, safetyBackup: safety };
}

export async function listBackups(hub) {
  const dir = path.join(hub.store.dataDir, 'backups');
  const out = [];
  for (const f of await fsp.readdir(dir).catch(() => [])) {
    if (!f.endsWith('.zip')) continue;
    const st = await fsp.stat(path.join(dir, f));
    out.push({ file: path.join(dir, f), name: f, size: st.size, createdAt: st.mtime.toISOString() });
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export { listFiles };
