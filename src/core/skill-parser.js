// Reads a skill folder or a skill text and returns a normalized description.
// The parser never rewrites the original content: it only extracts metadata.

import fsp from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { listFiles, sha256, isBinaryBuffer } from './fsutil.js';

export const INSTRUCTION_FILES = ['SKILL.md', 'skill.md', 'Skill.md'];

const SCRIPT_EXT = new Set(['.sh', '.bash', '.zsh', '.ps1', '.psm1', '.py', '.js', '.mjs', '.cjs', '.ts', '.bat', '.cmd', '.rb', '.pl', '.php', '.lua', '.vbs']);
const EXEC_EXT = new Set(['.exe', '.dll', '.so', '.dylib', '.bin', '.msi', '.com', '.scr', '.jar', '.app', '.deb', '.rpm']);
const CONFIG_EXT = new Set(['.json', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.env']);
const TEXT_EXT = new Set(['.md', '.mdx', '.txt', '.rst', '.adoc', '.html', '.htm', '.xml', '.csv']);

export function fileKind(rel) {
  const base = rel.split('/').pop();
  if (INSTRUCTION_FILES.includes(base) && !rel.includes('/')) return 'instructions';
  const ext = path.extname(base).toLowerCase();
  if (EXEC_EXT.has(ext)) return 'executable';
  if (SCRIPT_EXT.has(ext)) return 'script';
  if (CONFIG_EXT.has(ext) || base === '.env') return 'config';
  if (TEXT_EXT.has(ext)) return rel.startsWith('references/') ? 'reference' : 'document';
  return 'resource';
}

/** Splits a Markdown document into YAML frontmatter and body. */
export function splitFrontmatter(text) {
  const src = String(text || '').replace(/^﻿/, '');
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  if (!m) return { frontmatter: {}, body: src, hasFrontmatter: false, error: null };
  try {
    const data = YAML.parse(m[1]) || {};
    const fm = typeof data === 'object' && !Array.isArray(data) ? data : {};
    return { frontmatter: fm, body: src.slice(m[0].length), hasFrontmatter: true, error: null };
  } catch (err) {
    return { frontmatter: {}, body: src.slice(m[0].length), hasFrontmatter: true, error: String(err.message || err) };
  }
}

export function normalizeText(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function firstHeading(body) {
  const m = String(body).match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : '';
}

function firstParagraph(body) {
  const lines = String(body).split(/\r?\n/);
  const para = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t) {
      if (para.length) break;
      continue;
    }
    if (t.startsWith('#') || t.startsWith('```')) {
      if (para.length) break;
      continue;
    }
    para.push(t);
  }
  return para.join(' ').slice(0, 300);
}

function toTags(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String).map((s) => s.trim()).filter(Boolean);
  return String(value).split(/[,;]/).map((s) => s.trim()).filter(Boolean);
}

/** Builds the metadata block from the instruction text. */
export function describeInstructions(text, fallbackName = '') {
  const { frontmatter, body, hasFrontmatter, error } = splitFrontmatter(text);
  const warnings = [];
  if (error) warnings.push(`Frontmatter YAML invalide : ${error}`);
  if (!hasFrontmatter) warnings.push('Aucun frontmatter YAML (name, description).');
  const name = String(frontmatter.name || firstHeading(body) || fallbackName || '').trim();
  const description = String(frontmatter.description || firstParagraph(body) || '').trim();
  if (!frontmatter.name) warnings.push('Champ "name" absent du frontmatter.');
  if (!frontmatter.description) warnings.push('Champ "description" absent du frontmatter.');
  const meta = frontmatter.metadata && typeof frontmatter.metadata === 'object' ? frontmatter.metadata : {};
  return {
    name,
    description,
    version: String(frontmatter.version || meta.version || '').trim() || null,
    author: String(frontmatter.author || meta.author || '').trim() || null,
    license: frontmatter.license ? String(frontmatter.license) : null,
    tags: toTags(frontmatter.tags || meta.tags),
    allowedTools: toTags(frontmatter['allowed-tools'] || frontmatter.allowed_tools),
    frontmatter,
    body,
    warnings
  };
}

export function computeContentHash(files) {
  const lines = [...files].sort((a, b) => a.path.localeCompare(b.path)).map((f) => `${f.path}\0${f.hash}`);
  return sha256(lines.join('\n'));
}

export function computeStructureHash(files) {
  return sha256([...files].map((f) => f.path).sort().join('\n'));
}

/** Returns the instruction file name of a folder, or null. */
export async function findInstructionFile(dir) {
  let entries;
  try {
    entries = await fsp.readdir(dir);
  } catch {
    return null;
  }
  for (const name of INSTRUCTION_FILES) if (entries.includes(name)) return name;
  return null;
}

/**
 * Parses a skill folder. Files are read once; text content is kept only for
 * files under 512 KB so the scan stays light.
 */
export async function parseSkillDir(dir, { readContent = true } = {}) {
  const instructionFile = await findInstructionFile(dir);
  const rels = await listFiles(dir);
  const files = [];
  const contents = {};
  for (const rel of rels) {
    const abs = path.join(dir, ...rel.split('/'));
    let buf;
    try {
      buf = await fsp.readFile(abs);
    } catch {
      continue;
    }
    const binary = isBinaryBuffer(buf);
    files.push({ path: rel, size: buf.length, hash: sha256(buf), kind: fileKind(rel), binary });
    // The instruction file is always read: name and description come from it.
    if ((readContent || rel === instructionFile) && !binary && buf.length < 512 * 1024) contents[rel] = buf.toString('utf8');
  }
  const instructionsText = instructionFile ? contents[instructionFile] ?? '' : '';
  const meta = describeInstructions(instructionsText, path.basename(dir));
  const warnings = [...meta.warnings];
  if (!instructionFile) warnings.unshift('Fichier SKILL.md introuvable : Skill incomplet.');
  return {
    dir,
    folderName: path.basename(dir),
    instructionFile,
    ...meta,
    warnings,
    incomplete: !instructionFile || !meta.name || !meta.description,
    files,
    contents,
    contentHash: computeContentHash(files),
    structureHash: computeStructureHash(files),
    instructionsHash: sha256(normalizeText(meta.body))
  };
}

/** Parses a skill provided as raw text (copy and paste import). */
export function parseSkillText(text, fallbackName = 'pasted-skill') {
  const meta = describeInstructions(text, fallbackName);
  const buf = Buffer.from(text, 'utf8');
  const files = [{ path: 'SKILL.md', size: buf.length, hash: sha256(buf), kind: 'instructions', binary: false }];
  return {
    dir: null,
    folderName: fallbackName,
    instructionFile: 'SKILL.md',
    ...meta,
    incomplete: !meta.name || !meta.description,
    files,
    contents: { 'SKILL.md': text },
    contentHash: computeContentHash(files),
    structureHash: computeStructureHash(files),
    instructionsHash: sha256(normalizeText(meta.body))
  };
}
