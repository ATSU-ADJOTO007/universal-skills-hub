#!/usr/bin/env node
// Additional writing quality checks. They report warnings and never block,
// unless --strict is passed. The forbidden dash check lives in
// check-writing.mjs and stays independent from this script.
//
// Checks: trailing spaces, mixed line endings, missing final newline, empty
// Markdown files, broken local Markdown links, invalid UTF-8.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EXT = new Set(['.md', '.txt', '.yml', '.yaml', '.json']);
const SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'coverage']);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP.has(e.name)) walk(p, out);
    } else if (e.isFile() && EXT.has(path.extname(e.name).toLowerCase())) out.push(p);
  }
  return out;
}

export function checkFile(file, root) {
  const rel = path.relative(root, file).split(path.sep).join('/');
  const warnings = [];
  const buf = fs.readFileSync(file);
  const text = buf.toString('utf8');
  if (Buffer.from(text, 'utf8').length !== buf.length || text.includes('�')) warnings.push(`${rel}: encodage UTF-8 invalide`);
  if (rel.endsWith('.md') && !text.trim()) warnings.push(`${rel}: fichier Markdown vide`);
  const crlf = (text.match(/\r\n/g) || []).length;
  const lf = (text.match(/(?<!\r)\n/g) || []).length;
  if (crlf && lf) warnings.push(`${rel}: fins de ligne mélangées (CRLF et LF)`);
  if (text && !text.endsWith('\n')) warnings.push(`${rel}: pas de retour à la ligne final`);
  let inCode = false;
  text.split(/\r?\n/).forEach((line, i) => {
    if (/^\s*```/.test(line)) inCode = !inCode;
    if (/[ \t]+$/.test(line) && !(rel.endsWith('.md') && / {2}$/.test(line))) warnings.push(`${rel}:${i + 1}: espaces en fin de ligne`);
    if (rel.endsWith('.md') && !inCode) {
      for (const m of line.matchAll(/\]\(([^)\s]+)\)/g)) {
        const target = m[1].split('#')[0];
        if (!target || /^[a-z]+:/i.test(target)) continue;
        if (!fs.existsSync(path.resolve(path.dirname(file), decodeURI(target)))) warnings.push(`${rel}:${i + 1}: lien local cassé (${m[1]})`);
      }
    }
  });
  return warnings;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const root = process.cwd();
  const warnings = walk(root).flatMap((f) => checkFile(f, root));
  for (const w of warnings) console.log(`WARNING: ${w}`);
  console.log(warnings.length ? `${warnings.length} avertissement(s).` : 'OK: aucun avertissement de qualité.');
  if (warnings.length && process.argv.includes('--strict')) process.exitCode = 1;
}
