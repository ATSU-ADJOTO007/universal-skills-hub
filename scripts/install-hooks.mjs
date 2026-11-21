#!/usr/bin/env node
// Points this repository's Git hooks to .githooks. Only the local repository
// configuration is changed (git config --local); the global Git configuration
// and identity are never touched. Runs automatically on "npm install".

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
if (!fs.existsSync(path.join(root, '.git'))) {
  console.log('install-hooks: pas de dépôt Git ici, rien à faire.');
  process.exit(0);
}
try {
  execFileSync('git', ['config', '--local', 'core.hooksPath', '.githooks'], { cwd: root, stdio: 'pipe' });
  for (const h of ['pre-commit', 'pre-push']) {
    const p = path.join(root, '.githooks', h);
    if (fs.existsSync(p)) fs.chmodSync(p, 0o755);
  }
  console.log('install-hooks: hooks actifs (.githooks/pre-commit, .githooks/pre-push).');
} catch (err) {
  console.error(`install-hooks: échec (${err.message}).`);
  process.exit(1);
}
