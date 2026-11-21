// Import engine: folders, single files, ZIP archives, pasted text, Git
// repositories and HTTPS URLs. Imported content is treated as untrusted data:
// it is copied, parsed and scanned, never executed.

import fsp from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ensureDir, isDirectory, newId, IGNORED_DIRS } from './fsutil.js';
import { parseSkillDir, parseSkillText, INSTRUCTION_FILES } from './skill-parser.js';
import { extractZip } from './archive.js';

const execFileP = promisify(execFile);
export const MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024;

/** Finds every folder that contains a SKILL.md under root (root included). */
export async function discoverSkillDirs(root, { maxDepth = 6, maxResults = 5000 } = {}) {
  const found = [];
  async function walk(dir, depth) {
    if (found.length >= maxResults) return;
    let entries;
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return; // unreadable or broken link: skipped, reported by the caller if needed
    }
    if (entries.some((e) => e.isFile() && INSTRUCTION_FILES.includes(e.name))) {
      found.push(dir);
      return; // a skill folder is a leaf: nested folders are its resources
    }
    if (depth >= maxDepth) return;
    for (const e of entries) {
      if (e.isDirectory() && !IGNORED_DIRS.has(e.name) && !e.name.startsWith('.git')) await walk(path.join(dir, e.name), depth + 1);
    }
  }
  await walk(root, 0);
  return found;
}

export class Importer {
  constructor(library) {
    this.library = library;
    this.store = library.store;
  }

  tmpDir() {
    return path.join(this.store.dataDir, 'tmp', newId('imp_'));
  }

  /** Imports parsed skills while handling exact duplicates. */
  async importParsed(parsedList, origin, { onDuplicate = 'skip' } = {}) {
    const results = [];
    for (const parsed of parsedList) {
      const dup = this.library.list().find((s) => s.contentHash === parsed.contentHash);
      if (dup && onDuplicate === 'skip') {
        results.push({ status: 'duplicate', name: parsed.name, existingId: dup.id, path: parsed.dir });
        continue;
      }
      const rel = origin.root && parsed.dir ? path.relative(origin.root, parsed.dir).split(path.sep).join('/') : null;
      const { skill, matches } = await this.library.add(parsed, { ...origin, path: origin.keepPath === false ? null : parsed.dir || origin.path, relPath: rel });
      results.push({ status: 'imported', id: skill.id, name: skill.name, security: skill.security.level, statusLabel: skill.status, matches: matches.slice(0, 3) });
    }
    return results;
  }

  async importFolder(dir, origin = {}, opts = {}) {
    if (!(await isDirectory(dir))) throw new Error(`Dossier introuvable ou illisible : ${dir}`);
    const dirs = await discoverSkillDirs(dir, { maxDepth: opts.maxDepth ?? this.store.data.settings.maxScanDepth });
    const parsed = [];
    for (const d of dirs) parsed.push(await parseSkillDir(d));
    const results = await this.importParsed(parsed, { type: 'folder', root: dir, ...origin }, opts);
    if (!dirs.length) results.push({ status: 'empty', path: dir, message: 'Aucun fichier SKILL.md trouvé.' });
    return results;
  }

  async importFile(file, origin = {}, opts = {}) {
    const ext = path.extname(file).toLowerCase();
    if (ext === '.zip' || ext === '.skill') return this.importZipFile(file, origin, opts);
    if (['.md', '.markdown', '.txt'].includes(ext)) {
      const base = path.basename(file);
      // A SKILL.md inside its folder is imported with its resources.
      if (INSTRUCTION_FILES.includes(base)) return this.importFolder(path.dirname(file), { type: 'file', ...origin }, { ...opts, maxDepth: 0 });
      const text = await fsp.readFile(file, 'utf8');
      const parsed = parseSkillText(text, path.basename(file, ext));
      return this.importParsed([parsed], { type: 'file', path: file, keepPath: false, ...origin }, opts);
    }
    throw new Error(`Format non pris en charge : ${ext || 'sans extension'}`);
  }

  async importZipBuffer(buf, origin = {}, opts = {}) {
    const tmp = this.tmpDir();
    await ensureDir(tmp);
    try {
      await extractZip(buf, tmp);
      const dirs = await discoverSkillDirs(tmp);
      const parsed = [];
      for (const d of dirs) parsed.push(await parseSkillDir(d));
      const results = await this.importParsed(parsed, { type: 'zip', keepPath: false, ...origin }, opts);
      if (!dirs.length) results.push({ status: 'empty', message: 'Archive sans SKILL.md.' });
      return results;
    } finally {
      await fsp.rm(tmp, { recursive: true, force: true });
    }
  }

  async importZipFile(file, origin = {}, opts = {}) {
    const buf = await fsp.readFile(file);
    return this.importZipBuffer(buf, { type: 'zip', path: file, ...origin }, opts);
  }

  async importText(text, name = 'pasted-skill', origin = {}, opts = {}) {
    if (!String(text || '').trim()) throw new Error('Texte vide.');
    return this.importParsed([parseSkillText(text, name)], { type: 'paste', keepPath: false, ...origin }, opts);
  }

  /** Clones a public Git repository (depth 1) with the system git, then imports its skills. */
  async importGit(url, origin = {}, opts = {}) {
    if (!/^(https:\/\/|git@)[\w.@:/~+-]+$/.test(url)) throw new Error('URL Git refusée : seules les adresses https:// ou git@ sont acceptées.');
    const tmp = this.tmpDir();
    await ensureDir(path.dirname(tmp));
    try {
      // A clone never installs the repository's own hooks; nothing from it is executed.
      await execFileP('git', ['clone', '--depth', '1', '--no-tags', '--', url, tmp], { timeout: 120000, windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
      const dirs = await discoverSkillDirs(tmp);
      const parsed = [];
      for (const d of dirs) parsed.push(await parseSkillDir(d));
      const results = await this.importParsed(parsed, { type: 'git', url, keepPath: false, root: tmp, ...origin }, opts);
      if (!dirs.length) results.push({ status: 'empty', message: 'Dépôt sans SKILL.md.' });
      return results;
    } finally {
      await fsp.rm(tmp, { recursive: true, force: true });
    }
  }

  /** Downloads a SKILL.md or a ZIP over HTTPS, with a size limit. */
  async importUrl(url, origin = {}, opts = {}) {
    let u;
    try {
      u = new URL(url);
    } catch {
      throw new Error('URL invalide.');
    }
    if (u.protocol !== 'https:') throw new Error('Seules les URL https:// sont acceptées.');
    if (/^(github\.com|gitlab\.com|codeberg\.org)$/.test(u.hostname) && !/\/(raw|blob)\//.test(u.pathname) && !u.pathname.endsWith('.zip')) {
      return this.importGit(url.replace(/\/$/, ''), origin, opts);
    }
    const res = await fetch(u, { redirect: 'follow' });
    if (!res.ok) throw new Error(`Téléchargement impossible : HTTP ${res.status}`);
    const len = Number(res.headers.get('content-length') || 0);
    if (len > MAX_DOWNLOAD_BYTES) throw new Error('Fichier trop volumineux.');
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_DOWNLOAD_BYTES) throw new Error('Fichier trop volumineux.');
    const isZip = buf[0] === 0x50 && buf[1] === 0x4b;
    if (isZip) return this.importZipBuffer(buf, { type: 'url', url, ...origin }, opts);
    const name = path.basename(u.pathname).replace(/\.(md|markdown|txt)$/i, '') || 'downloaded-skill';
    return this.importParsed([parseSkillText(buf.toString('utf8'), name === 'SKILL' ? 'downloaded-skill' : name)], { type: 'url', url, keepPath: false, ...origin }, opts);
  }
}
