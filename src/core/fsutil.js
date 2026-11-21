// File system helpers shared by the core modules.
// Every write that replaces existing data goes through atomic helpers so a
// crash never leaves a half-written library file.

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export const IGNORED_DIRS = new Set([
  'node_modules', '.git', '.hg', '.svn', 'dist', 'build', 'coverage',
  '.venv', 'venv', '__pycache__', '.cache', '.next', '.turbo'
]);

export function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

export async function exists(p) {
  try {
    await fsp.access(p);
    return true;
  } catch {
    return false;
  }
}

export async function isDirectory(p) {
  try {
    return (await fsp.stat(p)).isDirectory();
  } catch {
    return false;
  }
}

export async function ensureDir(p) {
  await fsp.mkdir(p, { recursive: true });
  return p;
}

export async function writeFileAtomic(file, data) {
  await ensureDir(path.dirname(file));
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fsp.writeFile(tmp, data);
  await fsp.rename(tmp, file);
}

export async function readJson(file, fallback) {
  try {
    return JSON.parse(await fsp.readFile(file, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT' && fallback !== undefined) return fallback;
    throw err;
  }
}

export async function writeJsonAtomic(file, value) {
  await writeFileAtomic(file, JSON.stringify(value, null, 2) + '\n');
}

/**
 * Lists files of a directory recursively and returns POSIX relative paths.
 * Symbolic links are not followed, so a broken link never breaks a scan.
 */
export async function listFiles(root, { maxFiles = 2000, ignore = IGNORED_DIRS } = {}) {
  const out = [];
  async function walk(dir, rel) {
    let entries;
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const e of entries) {
      if (out.length >= maxFiles) return;
      const relPath = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (ignore.has(e.name)) continue;
        await walk(path.join(dir, e.name), relPath);
      } else if (e.isFile()) {
        out.push(relPath);
      }
    }
  }
  await walk(root, '');
  return out;
}

export async function copyDir(src, dest, { files } = {}) {
  const list = files || (await listFiles(src));
  for (const rel of list) {
    const from = path.join(src, ...rel.split('/'));
    const to = path.join(dest, ...rel.split('/'));
    await ensureDir(path.dirname(to));
    await fsp.copyFile(from, to);
  }
  return list;
}

export function safeSlug(input, fallback = 'skill') {
  const slug = String(input || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return slug || fallback;
}

/** Rejects relative paths that would escape their root (zip slip, "..", absolute). */
export function isSafeRelativePath(rel) {
  if (!rel || typeof rel !== 'string') return false;
  if (rel.includes('\0')) return false;
  const norm = rel.replace(/\\/g, '/');
  if (norm.startsWith('/') || /^[a-zA-Z]:/.test(norm)) return false;
  return !norm.split('/').some((part) => part === '..');
}

export function newId(prefix = '') {
  return prefix + crypto.randomBytes(8).toString('hex');
}

export function nowIso() {
  return new Date().toISOString();
}

export function timestampSlug() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

export function isBinaryBuffer(buf) {
  const len = Math.min(buf.length, 8000);
  for (let i = 0; i < len; i++) if (buf[i] === 0) return true;
  return false;
}

export function statSync(p) {
  try {
    return fs.statSync(p);
  } catch {
    return null;
  }
}
