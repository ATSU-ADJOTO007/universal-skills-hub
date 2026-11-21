#!/usr/bin/env node
// Secret and sensitive file scan run before push and in CI.
// It looks for token formats (not for words), private keys and files that
// must never be published. Exit 1 when something is found, 2 on error.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const PATTERNS = [
  { id: 'private-key', re: /-----BEGIN (RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY( BLOCK)?-----/ },
  { id: 'aws-access-key', re: /\b(AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { id: 'github-token', re: /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}\b|\bgithub_pat_[A-Za-z0-9_]{60,}\b/ },
  { id: 'anthropic-key', re: /\bsk-ant-[A-Za-z0-9_-]{30,}\b/ },
  { id: 'openai-key', re: /\bsk-(proj-)?[A-Za-z0-9]{32,}\b/ },
  { id: 'slack-token', re: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/ },
  { id: 'google-api-key', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { id: 'stripe-key', re: /\b(sk|rk)_live_[0-9A-Za-z]{20,}\b/ },
  { id: 'npm-token', re: /\bnpm_[A-Za-z0-9]{36}\b/ },
  { id: 'assigned-secret', re: /\b(password|passwd|secret|api_key|apikey|access_token)\s*[:=]\s*['"][^'"\s]{12,}['"]/i }
];

export const SENSITIVE_FILES = [/(^|\/)\.env(\.[\w-]+)?$/, /\.pem$/, /\.p12$/, /\.pfx$/, /(^|\/)id_(rsa|ed25519|ecdsa|dsa)$/, /\.kdbx$/, /(^|\/)credentials(\.json)?$/, /(^|\/)library\.json$/, /(^|\/)history\.jsonl$/];
const ALLOWED_SENSITIVE = [/(^|\/)\.env\.example$/];

function listTracked(root) {
  try {
    const out = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' });
    return out.split('\0').filter(Boolean);
  } catch {
    const files = [];
    const skip = new Set(['node_modules', '.git', 'dist']);
    (function walk(d, rel) {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (e.isDirectory()) {
          if (!skip.has(e.name)) walk(path.join(d, e.name), rel ? `${rel}/${e.name}` : e.name);
        } else if (e.isFile()) files.push(rel ? `${rel}/${e.name}` : e.name);
      }
    })(root, '');
    return files;
  }
}

export function scan(root) {
  const findings = [];
  for (const rel of listTracked(root)) {
    const norm = rel.replace(/\\/g, '/');
    if (SENSITIVE_FILES.some((re) => re.test(norm)) && !ALLOWED_SENSITIVE.some((re) => re.test(norm))) findings.push({ file: norm, line: null, id: 'sensitive-file' });
    let buf;
    try {
      buf = fs.readFileSync(path.join(root, rel));
    } catch {
      continue;
    }
    if (buf.length > 2 * 1024 * 1024 || buf.subarray(0, 8000).includes(0)) continue;
    const lines = buf.toString('utf8').split(/\r?\n/);
    lines.forEach((line, i) => {
      for (const p of PATTERNS) if (p.re.test(line)) findings.push({ file: norm, line: i + 1, id: p.id });
    });
  }
  return findings;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const root = process.cwd();
  try {
    const f = scan(root);
    for (const x of f) console.log(`ERROR: ${x.file}${x.line ? `:${x.line}` : ''} ${x.id === 'sensitive-file' ? 'fichier sensible à ne pas publier' : `ressemble à un secret (${x.id})`}`);
    if (f.length) {
      console.log(`Publication bloquée : ${f.length} élément(s) sensible(s) détecté(s). Le contenu n'est pas affiché.`);
      process.exitCode = 1;
    } else console.log('OK: aucun secret ni fichier sensible détecté.');
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    process.exitCode = 2;
  }
}
