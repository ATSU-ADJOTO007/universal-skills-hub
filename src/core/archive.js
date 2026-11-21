// ZIP helpers built on fflate. Extraction checks every entry path so an
// archive cannot write outside its target directory (zip slip), and limits the
// total size to protect against archive bombs.

import fsp from 'node:fs/promises';
import path from 'node:path';
import { zipSync, unzipSync } from 'fflate';
import { ensureDir, isSafeRelativePath, listFiles } from './fsutil.js';

export const MAX_UNZIPPED_BYTES = 200 * 1024 * 1024;
export const MAX_ENTRIES = 5000;

/** Builds a zip from a map of {relativePath: Buffer|string}. */
export function zipEntries(entries) {
  const input = {};
  for (const [rel, data] of Object.entries(entries)) {
    if (!isSafeRelativePath(rel)) throw new Error(`Chemin refusé dans l'archive : ${rel}`);
    input[rel] = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
  }
  return Buffer.from(zipSync(input, { level: 6 }));
}

/** Adds every file of a directory under a prefix. */
export async function collectDir(dir, prefix = '') {
  const entries = {};
  for (const rel of await listFiles(dir)) {
    entries[prefix ? `${prefix}/${rel}` : rel] = await fsp.readFile(path.join(dir, ...rel.split('/')));
  }
  return entries;
}

/** Reads a zip buffer and returns the entries after validation. */
export function readZip(buf) {
  let total = 0;
  let count = 0;
  const files = unzipSync(new Uint8Array(buf), {
    filter(file) {
      count++;
      if (count > MAX_ENTRIES) throw new Error('Archive refusée : trop de fichiers.');
      total += file.originalSize || 0;
      if (total > MAX_UNZIPPED_BYTES) throw new Error('Archive refusée : taille décompressée trop importante.');
      return true;
    }
  });
  const out = {};
  for (const [name, data] of Object.entries(files)) {
    if (name.endsWith('/')) continue; // directory entry
    if (!isSafeRelativePath(name)) throw new Error(`Archive refusée : chemin dangereux "${name}".`);
    if (name.startsWith('__MACOSX/') || name.endsWith('.DS_Store')) continue;
    out[name] = Buffer.from(data);
  }
  return out;
}

export async function extractZip(buf, targetDir) {
  const entries = readZip(buf);
  const root = path.resolve(targetDir);
  for (const [rel, data] of Object.entries(entries)) {
    const dest = path.resolve(root, ...rel.split('/'));
    if (!dest.startsWith(root + path.sep)) throw new Error(`Archive refusée : chemin hors du dossier cible "${rel}".`);
    await ensureDir(path.dirname(dest));
    await fsp.writeFile(dest, data);
  }
  return Object.keys(entries);
}
