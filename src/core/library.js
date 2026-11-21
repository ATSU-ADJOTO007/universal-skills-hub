// Central skill library: records, managed copies, versions, metadata,
// classification and security status. Every change is logged in history.

import fsp from 'node:fs/promises';
import path from 'node:path';
import { ensureDir, newId, nowIso, safeSlug, exists, listFiles } from './fsutil.js';
import { parseSkillDir } from './skill-parser.js';
import { classify } from './classifier.js';
import { scanSkill } from './security.js';
import { findMatches } from './duplicates.js';
import { diffLines, compactDiff, diffFileSets } from './diff.js';

export const STATUSES = ['active', 'pending-review', 'incomplete', 'archived'];

function publicFiles(files) {
  return files.map(({ path: p, hash, size, kind, binary }) => ({ path: p, hash, size, kind, binary: !!binary }));
}

export class Library {
  constructor(store) {
    this.store = store;
    this._bodies = new Map();
  }

  get data() {
    return this.store.data;
  }

  list() {
    return Object.values(this.data.skills);
  }

  get(id) {
    const s = this.data.skills[id];
    if (!s) throw new Error(`Skill introuvable : ${id}`);
    return s;
  }

  find(id) {
    return this.data.skills[id] || null;
  }

  dir(id) {
    return this.store.skillDir(id);
  }

  uniqueSlug(base, exceptId = null) {
    const taken = new Set(this.list().filter((s) => s.id !== exceptId).map((s) => s.slug));
    let slug = safeSlug(base);
    let i = 2;
    while (taken.has(slug)) slug = `${safeSlug(base)}-${i++}`;
    return slug;
  }

  /** Body text cache used by search, duplicates and selection. */
  async body(id) {
    if (this._bodies.has(id)) return this._bodies.get(id);
    const s = this.get(id);
    let text = '';
    try {
      text = await fsp.readFile(path.join(this.dir(id), s.instructionFile || 'SKILL.md'), 'utf8');
    } catch {
      text = '';
    }
    this._bodies.set(id, text);
    return text;
  }

  async withBodies(skills = this.list()) {
    const out = [];
    for (const s of skills) out.push({ ...s, body: await this.body(s.id) });
    return out;
  }

  categoriesForClassification() {
    return this.data.categories;
  }

  analyze(parsed, origin) {
    const cls = this.data.settings?.autoClassify === false
      ? { categories: ['transversal'], confidence: 0, uncertain: true, details: [] }
      : classify(parsed, this.categoriesForClassification());
    const sec = scanSkill(parsed, { trustedSource: origin?.trusted });
    return { cls, sec };
  }

  statusFor(parsed, sec) {
    if (parsed.incomplete) return 'incomplete';
    if (sec.reviewRequired) return 'pending-review';
    return 'active';
  }

  async snapshotFiles(dir, files) {
    for (const f of files) {
      const buf = await fsp.readFile(path.join(dir, ...f.path.split('/')));
      await this.store.putBlob(buf);
    }
  }

  /**
   * Adds a parsed skill to the library. The source folder (parsed.dir) or the
   * in-memory contents (paste import) are copied into the managed directory.
   * The original files are never modified.
   */
  async add(parsed, origin = {}, { note = 'Importation initiale' } = {}) {
    const id = newId('sk_');
    const target = this.dir(id);
    await ensureDir(target);
    if (parsed.dir) {
      for (const f of parsed.files) {
        const to = path.join(target, ...f.path.split('/'));
        await ensureDir(path.dirname(to));
        await fsp.copyFile(path.join(parsed.dir, ...f.path.split('/')), to);
      }
    } else {
      for (const [rel, text] of Object.entries(parsed.contents)) {
        const to = path.join(target, ...rel.split('/'));
        await ensureDir(path.dirname(to));
        await fsp.writeFile(to, text);
      }
    }
    await this.snapshotFiles(target, parsed.files);
    const existing = await this.withBodies();
    const matches = findMatches({ ...parsed, id }, existing);
    const { cls, sec } = this.analyze(parsed, origin);
    const now = nowIso();
    const skill = {
      id,
      slug: this.uniqueSlug(parsed.frontmatter?.name || parsed.name || parsed.folderName),
      name: parsed.name || parsed.folderName,
      description: parsed.description,
      instructionFile: parsed.instructionFile || 'SKILL.md',
      categories: cls.categories,
      classification: { source: 'auto', confidence: cls.confidence, uncertain: cls.uncertain, details: cls.details },
      tags: parsed.tags || [],
      author: parsed.author,
      license: parsed.license,
      label: parsed.version,
      allowedTools: parsed.allowedTools || [],
      origin: { type: origin.type || 'folder', path: origin.path || parsed.dir || null, url: origin.url || null, sourceId: origin.sourceId || null, agent: origin.agent || null, relPath: origin.relPath || null },
      originHash: parsed.contentHash,
      importedAt: now,
      updatedAt: now,
      status: this.statusFor(parsed, sec),
      security: { ...sec, reviewed: false, reviewedAt: null },
      warnings: parsed.warnings,
      notes: '',
      dependencies: Array.isArray(parsed.frontmatter?.dependencies) ? parsed.frontmatter.dependencies.map(String) : [],
      priority: 0,
      contentHash: parsed.contentHash,
      instructionsHash: parsed.instructionsHash,
      structureHash: parsed.structureHash,
      files: publicFiles(parsed.files),
      currentVersion: 1,
      versions: [{ n: 1, contentHash: parsed.contentHash, files: publicFiles(parsed.files), createdAt: now, note, source: origin.type || 'folder' }],
      installations: [],
      relations: matches.slice(0, 10).map((m) => ({ skillId: m.skillId, relation: m.relation, similarity: m.similarity }))
    };
    this.data.skills[id] = skill;
    this._bodies.delete(id);
    await this.store.save();
    await this.store.log('skill.import', `Skill importé : ${skill.name}`, { skillId: id, origin: skill.origin, security: sec.level, duplicates: matches.length });
    return { skill, matches };
  }

  /** Re-reads the managed copy and records a new version when the content changed. */
  async commitManagedChanges(id, { note = 'Modification', source = 'edit' } = {}) {
    const s = this.get(id);
    const parsed = await parseSkillDir(this.dir(id));
    if (parsed.contentHash === s.contentHash) return { changed: false, skill: s };
    await this.snapshotFiles(this.dir(id), parsed.files);
    const { cls, sec } = this.analyze(parsed, s.origin);
    const now = nowIso();
    const n = s.currentVersion + 1;
    s.versions.push({ n, contentHash: parsed.contentHash, files: publicFiles(parsed.files), createdAt: now, note, source });
    s.currentVersion = n;
    s.name = parsed.name || s.name;
    s.description = parsed.description;
    s.tags = s.tags.length ? s.tags : parsed.tags;
    s.allowedTools = parsed.allowedTools;
    s.label = parsed.version || s.label;
    s.files = publicFiles(parsed.files);
    s.contentHash = parsed.contentHash;
    s.instructionsHash = parsed.instructionsHash;
    s.structureHash = parsed.structureHash;
    s.warnings = parsed.warnings;
    s.updatedAt = now;
    if (s.classification.source === 'auto') {
      s.categories = cls.categories;
      s.classification = { source: 'auto', confidence: cls.confidence, uncertain: cls.uncertain, details: cls.details };
    }
    // A content change invalidates a previous security review.
    s.security = { ...sec, reviewed: false, reviewedAt: null };
    if (s.status !== 'archived') s.status = this.statusFor(parsed, sec);
    this._bodies.delete(id);
    await this.store.save();
    await this.store.log('skill.version', `Nouvelle version ${n} de ${s.name}`, { skillId: id, version: n, note, source });
    return { changed: true, skill: s, version: n };
  }

  /** Replaces the managed copy with the content of another folder, then versions it. */
  async updateFromDir(id, dir, { note = 'Mise à jour depuis la source', source = 'source' } = {}) {
    const target = this.dir(id);
    const backup = await this.store.moveToTrash(target, `${id}-before-update`);
    await ensureDir(target);
    const files = await listFiles(dir);
    for (const rel of files) {
      const to = path.join(target, ...rel.split('/'));
      await ensureDir(path.dirname(to));
      await fsp.copyFile(path.join(dir, ...rel.split('/')), to);
    }
    const res = await this.commitManagedChanges(id, { note, source });
    if (!res.changed && backup) await fsp.rm(backup, { recursive: true, force: true });
    return res;
  }

  /** Explicit edit of the instruction file, always traceable through a new version. */
  async editInstructions(id, text, note = 'Modification manuelle des instructions') {
    const s = this.get(id);
    await fsp.writeFile(path.join(this.dir(id), s.instructionFile || 'SKILL.md'), text);
    return this.commitManagedChanges(id, { note, source: 'edit' });
  }

  async readFile(id, rel) {
    const s = this.get(id);
    if (!s.files.some((f) => f.path === rel)) throw new Error('Fichier inconnu pour ce Skill.');
    return fsp.readFile(path.join(this.dir(id), ...rel.split('/')), 'utf8');
  }

  async versionFileText(id, n, rel) {
    const s = this.get(id);
    const v = s.versions.find((x) => x.n === n);
    if (!v) throw new Error(`Version ${n} introuvable.`);
    const f = v.files.find((x) => x.path === rel);
    if (!f) return null;
    return (await this.store.getBlob(f.hash)).toString('utf8');
  }

  async compareVersions(id, a, b) {
    const s = this.get(id);
    const va = s.versions.find((x) => x.n === a);
    const vb = s.versions.find((x) => x.n === b);
    if (!va || !vb) throw new Error('Version introuvable.');
    const sets = diffFileSets(va.files, vb.files);
    const files = [];
    for (const rel of [...sets.modified, ...sets.added, ...sets.removed]) {
      const fa = va.files.find((f) => f.path === rel);
      const fb = vb.files.find((f) => f.path === rel);
      if ((fa && fa.binary) || (fb && fb.binary)) {
        files.push({ path: rel, binary: true });
        continue;
      }
      const ta = fa ? (await this.store.getBlob(fa.hash)).toString('utf8') : '';
      const tb = fb ? (await this.store.getBlob(fb.hash)).toString('utf8') : '';
      files.push({ path: rel, diff: compactDiff(diffLines(ta, tb)) });
    }
    return { ...sets, files };
  }

  /** Restores an older version by writing it as a new version (nothing is lost). */
  async restoreVersion(id, n) {
    const s = this.get(id);
    const v = s.versions.find((x) => x.n === n);
    if (!v) throw new Error(`Version ${n} introuvable.`);
    for (const f of v.files) if (!(await this.store.hasBlob(f.hash))) throw new Error(`Contenu manquant pour ${f.path} (version ${n}).`);
    const target = this.dir(id);
    await this.store.moveToTrash(target, `${id}-before-restore-v${n}`);
    await ensureDir(target);
    for (const f of v.files) {
      const to = path.join(target, ...f.path.split('/'));
      await ensureDir(path.dirname(to));
      await fsp.writeFile(to, await this.store.getBlob(f.hash));
    }
    const res = await this.commitManagedChanges(id, { note: `Restauration de la version ${n}`, source: 'restore' });
    await this.store.log('skill.restore', `Version ${n} restaurée pour ${s.name}`, { skillId: id, version: n });
    return res;
  }

  async updateMeta(id, patch) {
    const s = this.get(id);
    const allowed = ['tags', 'notes', 'priority', 'dependencies', 'label'];
    for (const k of allowed) if (k in patch) s[k] = patch[k];
    if ('categories' in patch) {
      s.categories = [...new Set(patch.categories)].filter((c) => this.data.categories.some((x) => x.id === c));
      s.classification = { ...s.classification, source: 'user', confidence: 1, uncertain: false };
    }
    if ('status' in patch && STATUSES.includes(patch.status)) s.status = patch.status;
    s.updatedAt = nowIso();
    await this.store.save();
    await this.store.log('skill.meta', `Métadonnées modifiées : ${s.name}`, { skillId: id, fields: Object.keys(patch) });
    return s;
  }

  async reclassify(id) {
    const s = this.get(id);
    const cls = classify({ ...s, body: await this.body(id) }, this.data.categories);
    s.categories = cls.categories;
    s.classification = { source: 'auto', confidence: cls.confidence, uncertain: cls.uncertain, details: cls.details };
    await this.store.save();
    return s;
  }

  async rescanSecurity(id) {
    const s = this.get(id);
    const parsed = await parseSkillDir(this.dir(id));
    const sec = scanSkill(parsed, { trustedSource: s.origin?.trusted });
    const keepReview = s.security?.reviewed && s.contentHash === parsed.contentHash;
    s.security = { ...sec, reviewed: keepReview, reviewedAt: keepReview ? s.security.reviewedAt : null };
    await this.store.save();
    return s;
  }

  /** Records the user's decision after reviewing a flagged skill. */
  async reviewSecurity(id, approved, comment = '') {
    const s = this.get(id);
    s.security = { ...s.security, reviewed: true, reviewedAt: nowIso(), approved: !!approved, comment };
    if (approved && s.status === 'pending-review') s.status = 'active';
    if (!approved) s.status = 'archived';
    await this.store.save();
    await this.store.log('security.review', `${approved ? 'Approuvé' : 'Refusé'} après vérification : ${s.name}`, { skillId: id, comment });
    return s;
  }

  /** Deletion moves the managed copy to the trash; the versions stay in blobs. */
  async remove(id) {
    const s = this.get(id);
    const trash = await this.store.moveToTrash(this.dir(id), `${id}-deleted`);
    const record = path.join(this.store.dataDir, 'trash', `${path.basename(trash || id)}.record.json`);
    await fsp.writeFile(record, JSON.stringify(s, null, 2));
    delete this.data.skills[id];
    for (const p of Object.values(this.data.packs)) p.skillIds = p.skillIds.filter((x) => x !== id);
    this._bodies.delete(id);
    await this.store.save();
    await this.store.log('skill.delete', `Skill supprimé (récupérable dans la corbeille) : ${s.name}`, { skillId: id, trash, record });
    return { trash, record };
  }

  /** Lists recoverable deleted skills. */
  async listTrash() {
    const dir = path.join(this.store.dataDir, 'trash');
    const out = [];
    for (const f of await fsp.readdir(dir).catch(() => [])) {
      if (!f.endsWith('.record.json')) continue;
      try {
        const rec = JSON.parse(await fsp.readFile(path.join(dir, f), 'utf8'));
        out.push({ file: f, id: rec.id, name: rec.name, folder: f.replace(/\.record\.json$/, '') });
      } catch {
        // ignore unreadable records
      }
    }
    return out;
  }

  async recoverFromTrash(recordFile) {
    const dir = path.join(this.store.dataDir, 'trash');
    const rec = JSON.parse(await fsp.readFile(path.join(dir, recordFile), 'utf8'));
    const folder = path.join(dir, recordFile.replace(/\.record\.json$/, ''));
    if (this.data.skills[rec.id]) throw new Error('Ce Skill existe déjà dans la bibliothèque.');
    if (!(await exists(folder))) throw new Error('Dossier du Skill absent de la corbeille.');
    await fsp.rename(folder, this.dir(rec.id));
    await fsp.rm(path.join(dir, recordFile), { force: true });
    rec.slug = this.uniqueSlug(rec.slug, rec.id);
    this.data.skills[rec.id] = rec;
    await this.store.save();
    await this.store.log('skill.recover', `Skill récupéré depuis la corbeille : ${rec.name}`, { skillId: rec.id });
    return rec;
  }
}
