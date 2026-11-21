// Local persistent store. Everything is kept in open formats inside a single
// data directory:
//
//   library.json      skills, packs, categories, sources, destinations, settings
//   skills/<id>/      managed copy of each skill (Agent Skills layout)
//   blobs/<aa>/<sha>  content addressed file contents used by versions
//   history.jsonl     one JSON event per line
//   trash/            deleted or overwritten data, recoverable
//   backups/          backup archives

import fsp from 'node:fs/promises';
import path from 'node:path';
import { ensureDir, readJson, writeJsonAtomic, exists, sha256, timestampSlug, nowIso } from './fsutil.js';
import { DEFAULT_CATEGORIES } from './classifier.js';

export const SCHEMA_VERSION = 1;

export const DEFAULT_SETTINGS = {
  language: 'fr',
  theme: 'system',
  notifications: true,
  autoClassify: true,
  autoImportNew: false,
  scanOnStartup: true,
  backupBeforeRestore: true,
  maxScanDepth: 6,
  writingCheckExtensions: ['.md', '.mdx', '.txt', '.rst', '.html', '.htm', '.xml', '.json', '.yaml', '.yml', '.toml', '.csv', '.log', '.adoc'],
  logRetentionDays: 365
};

export function emptyLibrary() {
  return {
    schemaVersion: SCHEMA_VERSION,
    createdAt: nowIso(),
    skills: {},
    packs: {},
    categories: DEFAULT_CATEGORIES.map((c) => ({ ...c, keywords: [...c.keywords], builtin: true })),
    sources: {},
    destinations: {},
    settings: { ...DEFAULT_SETTINGS }
  };
}

export class Store {
  constructor(dataDir) {
    this.dataDir = path.resolve(dataDir);
    this.libraryFile = path.join(this.dataDir, 'library.json');
    this.historyFile = path.join(this.dataDir, 'history.jsonl');
    this.data = null;
    this._queue = Promise.resolve();
  }

  static async open(dataDir) {
    const s = new Store(dataDir);
    await s.load();
    return s;
  }

  skillDir(id) {
    return path.join(this.dataDir, 'skills', id);
  }

  blobPath(hash) {
    return path.join(this.dataDir, 'blobs', hash.slice(0, 2), hash);
  }

  async load() {
    await ensureDir(this.dataDir);
    for (const d of ['skills', 'blobs', 'trash', 'backups']) await ensureDir(path.join(this.dataDir, d));
    const data = await readJson(this.libraryFile, null);
    this.data = data ? migrate(data) : emptyLibrary();
    if (!data) await this.save();
    return this.data;
  }

  /** Serializes writes so concurrent operations never interleave. */
  save() {
    this._queue = this._queue.then(() => writeJsonAtomic(this.libraryFile, this.data));
    return this._queue;
  }

  async putBlob(buf) {
    const hash = sha256(buf);
    const p = this.blobPath(hash);
    if (!(await exists(p))) {
      await ensureDir(path.dirname(p));
      await fsp.writeFile(p, buf);
    }
    return hash;
  }

  async getBlob(hash) {
    return fsp.readFile(this.blobPath(hash));
  }

  async hasBlob(hash) {
    return exists(this.blobPath(hash));
  }

  async log(type, message, details = {}) {
    const entry = { ts: nowIso(), type, message, ...details };
    await ensureDir(this.dataDir);
    await fsp.appendFile(this.historyFile, JSON.stringify(entry) + '\n');
    return entry;
  }

  async readHistory({ limit = 500, type = null } = {}) {
    let text = '';
    try {
      text = await fsp.readFile(this.historyFile, 'utf8');
    } catch {
      return [];
    }
    const out = [];
    const lines = text.split('\n');
    for (let i = lines.length - 1; i >= 0 && out.length < limit; i--) {
      if (!lines[i]) continue;
      try {
        const e = JSON.parse(lines[i]);
        if (!type || e.type === type || e.type.startsWith(type + '.')) out.push(e);
      } catch {
        // A damaged line is skipped, the rest of the history stays readable.
      }
    }
    return out;
  }

  /** Moves a path to the trash instead of deleting it. Returns the trash path. */
  async moveToTrash(p, label = 'item') {
    if (!(await exists(p))) return null;
    const dest = path.join(this.dataDir, 'trash', `${timestampSlug()}-${label}`);
    await ensureDir(path.dirname(dest));
    try {
      await fsp.rename(p, dest);
    } catch (err) {
      if (err.code !== 'EXDEV') throw err;
      await fsp.cp(p, dest, { recursive: true });
      await fsp.rm(p, { recursive: true, force: true });
    }
    return dest;
  }
}

function migrate(data) {
  const base = emptyLibrary();
  const out = { ...base, ...data };
  out.settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
  for (const key of ['skills', 'packs', 'sources', 'destinations']) out[key] = data[key] || {};
  if (!Array.isArray(out.categories) || !out.categories.length) out.categories = base.categories;
  out.schemaVersion = SCHEMA_VERSION;
  return out;
}
