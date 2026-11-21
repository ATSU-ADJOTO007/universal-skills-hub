#!/usr/bin/env node
// Writing check: blocks the em dash (U+2014) and the en dash (U+2013).
//
// Usage
//   node scripts/check-writing.mjs [paths...]      check files or folders (default: .)
//   node scripts/check-writing.mjs --staged        check files staged for commit
//   node scripts/check-writing.mjs --fix           show the proposed replacements
//   node scripts/check-writing.mjs --fix --yes     write the replacements
//   node scripts/check-writing.mjs --json          machine readable output
//   node scripts/check-writing.mjs --config file   use another configuration file
//
// Exit codes
//   0  no violation
//   1  violations found (publication blocked)
//   2  usage or access error (missing path, unreadable file)
//
// The forbidden characters are written as escapes so this file never contains
// them. Configuration: .writingcheck.json at the repository root.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const FORBIDDEN = new Map([
  [String.fromCharCode(0x2014), 'em dash'],
  [String.fromCharCode(0x2013), 'en dash']
]);

export const DEFAULT_CONFIG = {
  extensions: ['.md', '.mdx', '.txt', '.rst', '.html', '.htm', '.xml', '.json', '.yaml', '.yml', '.toml', '.csv', '.log', '.adoc'],
  extraExtensions: [],
  excludeDirs: ['node_modules', '.git', 'dist', 'build', 'coverage', '.venv', 'venv', '.cache', '__pycache__', '.next', '.turbo', 'out'],
  excludeFiles: ['package-lock.json'],
  replacement: '-'
};

export function loadConfig(file) {
  const cfg = { ...DEFAULT_CONFIG };
  if (file && fs.existsSync(file)) {
    const user = JSON.parse(fs.readFileSync(file, 'utf8'));
    Object.assign(cfg, user);
  }
  cfg.allExtensions = new Set([...cfg.extensions, ...(cfg.extraExtensions || [])].map((e) => e.toLowerCase()));
  cfg.excludeDirSet = new Set(cfg.excludeDirs);
  cfg.excludeFileSet = new Set((cfg.excludeFiles || []).map((f) => f.replace(/\\/g, '/')));
  return cfg;
}

function isBinary(buf) {
  const len = Math.min(buf.length, 8000);
  for (let i = 0; i < len; i++) if (buf[i] === 0) return true;
  return false;
}

function excludedFile(rel, cfg) {
  const norm = rel.replace(/\\/g, '/');
  return cfg.excludeFileSet.has(norm) || cfg.excludeFileSet.has(path.basename(norm));
}

function targeted(file, cfg) {
  return cfg.allExtensions.has(path.extname(file).toLowerCase());
}

/** Collects target files under the given paths. */
export function collect(paths, cfg, root, errors) {
  const files = [];
  function walk(p) {
    let st;
    try {
      st = fs.lstatSync(p);
    } catch (err) {
      errors.push({ path: p, error: err.code === 'ENOENT' ? 'chemin introuvable' : err.message });
      return;
    }
    if (st.isSymbolicLink()) return;
    if (st.isDirectory()) {
      if (cfg.excludeDirSet.has(path.basename(p)) && path.resolve(p) !== path.resolve(root)) return;
      let entries;
      try {
        entries = fs.readdirSync(p);
      } catch (err) {
        errors.push({ path: p, error: `lecture du dossier impossible (${err.code || err.message})` });
        return;
      }
      for (const e of entries.sort()) walk(path.join(p, e));
    } else if (st.isFile() && targeted(p, cfg) && !excludedFile(path.relative(root, p), cfg)) {
      files.push(p);
    }
  }
  for (const p of paths) walk(path.resolve(root, p));
  return files;
}

/** Scans one file. Returns violations with 1-based line and column numbers. */
export function scanFile(file, root, errors) {
  let buf;
  try {
    buf = fs.readFileSync(file);
  } catch (err) {
    errors.push({ path: file, error: `lecture impossible (${err.code || err.message})` });
    return [];
  }
  if (isBinary(buf)) return [];
  const text = buf.toString('utf8');
  const rel = path.relative(root, file).split(path.sep).join('/');
  const out = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    for (let col = 0; col < line.length; col++) {
      const ch = line[col];
      if (FORBIDDEN.has(ch)) out.push({ file: rel, line: i + 1, column: col + 1, char: ch, name: FORBIDDEN.get(ch), excerpt: line.trim().slice(0, 140) });
    }
  });
  return out;
}

export function fixText(text, replacement = '-') {
  let t = text;
  // " X " around a dash becomes " - ", other occurrences become "-".
  for (const ch of FORBIDDEN.keys()) t = t.split(ch).join(replacement);
  return t;
}

function stagedFiles(root) {
  const outp = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'], { cwd: root, encoding: 'utf8' });
  return outp.split('\0').filter(Boolean);
}

export function run(argv, { root = process.cwd(), stdout = console.log, stderr = console.error } = {}) {
  const args = argv.filter((a) => !a.startsWith('--'));
  const flags = new Set(argv.filter((a) => a.startsWith('--')));
  let configFile = path.join(root, '.writingcheck.json');
  const ci = argv.indexOf('--config');
  if (ci >= 0) {
    configFile = path.resolve(root, argv[ci + 1] || '');
    args.splice(args.indexOf(argv[ci + 1]), 1);
  }
  let cfg;
  try {
    cfg = loadConfig(configFile);
  } catch (err) {
    stderr(`ERROR: configuration illisible (${configFile}) : ${err.message}`);
    return 2;
  }
  const errors = [];
  let files;
  if (flags.has('--staged')) {
    try {
      files = stagedFiles(root).map((f) => path.join(root, f)).filter((f) => targeted(f, cfg) && !excludedFile(path.relative(root, f), cfg) && fs.existsSync(f));
    } catch (err) {
      stderr(`ERROR: impossible de lire les fichiers indexés par git : ${err.message}`);
      return 2;
    }
  } else {
    files = collect(args.length ? args : ['.'], cfg, root, errors);
  }
  const violations = files.flatMap((f) => scanFile(f, root, errors));
  if (flags.has('--json')) {
    stdout(JSON.stringify({ files: files.length, violations, errors }, null, 2));
  } else {
    for (const v of violations) stdout(`ERROR: ${v.file}:${v.line} contains forbidden character "${v.char}" (${v.name}, colonne ${v.column})\n       ${v.excerpt}`);
    for (const e of errors) stderr(`ERROR: ${path.relative(root, e.path) || e.path} : ${e.error}`);
  }
  if (flags.has('--fix') && violations.length) {
    const byFile = [...new Set(violations.map((v) => v.file))];
    for (const rel of byFile) {
      const abs = path.join(root, rel);
      const text = fs.readFileSync(abs, 'utf8');
      const fixed = fixText(text, cfg.replacement);
      if (flags.has('--yes')) {
        fs.writeFileSync(abs, fixed);
        stdout(`FIXED: ${rel}`);
      } else {
        stdout(`PROPOSED: ${rel} (${violations.filter((v) => v.file === rel).length} remplacement(s) par "${cfg.replacement}")`);
      }
    }
    if (!flags.has('--yes')) stdout('Aucun fichier modifié. Relancez avec --fix --yes pour appliquer les remplacements.');
  }
  if (!flags.has('--json')) {
    if (violations.length) stdout(`Publication bloquée : ${violations.length} violation${violations.length > 1 ? 's' : ''} détectée${violations.length > 1 ? 's' : ''}.`);
    else if (!errors.length) stdout(`OK: ${files.length} fichier(s) vérifié(s), aucun caractère interdit.`);
  }
  if (errors.length) return 2;
  if (violations.length && !(flags.has('--fix') && flags.has('--yes'))) return 1;
  return 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) process.exitCode = run(process.argv.slice(2));
