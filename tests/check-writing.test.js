// Tests of the forbidden dash check. The forbidden characters are built from
// their code points so this test file itself stays clean.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmpDir } from './helpers.js';
import { scanFile } from '../scripts/check-writing.mjs';

const EM = String.fromCharCode(0x2014);
const EN = String.fromCharCode(0x2013);
const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'check-writing.mjs');

function run(cwd, ...args) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

async function repo(files) {
  const root = await tmpDir('ush-wc-');
  for (const [rel, content] of Object.entries(files)) {
    const p = path.join(root, ...rel.split('/'));
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, content);
  }
  return root;
}

test('clean file and clean repository: exit 0', async () => {
  const root = await repo({ 'README.md': 'Simple text - with a hyphen.\n', 'docs/a.txt': 'ok\n' });
  const r = run(root);
  assert.equal(r.code, 0, r.out + r.err);
  assert.match(r.out, /OK: 2 fichier/);
});

test('em dash is detected with the right line number: exit 1', async () => {
  const root = await repo({ 'README.md': `line one\nline two\nbad ${EM} here\n` });
  const r = run(root);
  assert.equal(r.code, 1);
  assert.match(r.out, new RegExp(`ERROR: README\\.md:3 contains forbidden character "${EM}"`));
  assert.match(r.out, /Publication bloquée : 1 violation détectée\./);
});

test('en dash is detected', async () => {
  const root = await repo({ 'docs/INSTALL.md': `pages 1${EN}5\n` });
  const r = run(root);
  assert.equal(r.code, 1);
  assert.match(r.out, new RegExp(`ERROR: docs/INSTALL\\.md:1 contains forbidden character "${EN}"`));
});

test('several violations in one file and in several files', async () => {
  const root = await repo({ 'a.md': `${EM} x ${EN}\n\nlast ${EM}\n`, 'b.yaml': `k: "v ${EN} w"\n`, 'c.json': `{"a": "${EM}"}\n` });
  const r = run(root, '--json');
  const data = JSON.parse(r.out);
  assert.equal(r.code, 1);
  assert.equal(data.violations.length, 5);
  const a = data.violations.filter((v) => v.file === 'a.md');
  assert.deepEqual(a.map((v) => v.line), [1, 1, 3]);
  assert.deepEqual(a.map((v) => v.column), [1, 5, 6]);
  assert.equal(new Set(data.violations.map((v) => v.file)).size, 3);
});

test('excluded folders, excluded files, other extensions and binary files are ignored', async () => {
  const bin = Buffer.concat([Buffer.from([0, 1, 2, 0]), Buffer.from(EM)]);
  const root = await repo({
    'node_modules/pkg/README.md': `${EM}\n`,
    'dist/out.md': `${EM}\n`,
    'package-lock.json': `{"x": "${EM}"}\n`,
    'image.md': bin,
    'code.py': `# ${EM}\n`,
    'ok.md': 'fine\n'
  });
  const r = run(root);
  assert.equal(r.code, 0, r.out);
});

test('configuration adds extensions and exclusions', async () => {
  const root = await repo({ 'app.js': `const s = "${EM}";\n`, 'skip/x.md': `${EM}\n`, '.writingcheck.json': JSON.stringify({ extraExtensions: ['.js'], excludeDirs: ['skip'] }) });
  const r = run(root);
  assert.equal(r.code, 1);
  assert.match(r.out, /app\.js:1/);
  assert.doesNotMatch(r.out, /skip/);
});

test('missing directory: exit 2', async () => {
  const root = await repo({ 'a.md': 'ok\n' });
  const r = run(root, 'does-not-exist');
  assert.equal(r.code, 2);
  assert.match(r.err, /chemin introuvable/);
});

test('read error is reported', async () => {
  const root = await repo({ 'a.md': 'ok\n' });
  const errors = [];
  // Reading a directory as a file raises an access error (EISDIR) on every platform.
  const v = scanFile(root, root, errors);
  assert.equal(v.length, 0);
  assert.equal(errors.length, 1);
  assert.match(errors[0].error, /lecture impossible/);
});

test('--fix proposes without writing, --fix --yes writes a plain hyphen', async () => {
  const root = await repo({ 'a.md': `x ${EM} y ${EN} z\n` });
  let r = run(root, '--fix');
  assert.equal(r.code, 1);
  assert.match(r.out, /PROPOSED: a\.md \(2 remplacement/);
  assert.equal(await fs.readFile(path.join(root, 'a.md'), 'utf8'), `x ${EM} y ${EN} z\n`);
  r = run(root, '--fix', '--yes');
  assert.equal(r.code, 0);
  assert.equal(await fs.readFile(path.join(root, 'a.md'), 'utf8'), 'x - y - z\n');
  assert.equal(run(root).code, 0);
});

test('--staged checks only staged files', async () => {
  const root = await repo({ 'clean.md': 'ok\n', 'dirty.md': `${EM}\n` });
  const git = (...a) => execFileSync('git', a, { cwd: root, stdio: 'pipe' });
  git('init', '-q');
  git('add', 'clean.md');
  assert.equal(run(root, '--staged').code, 0);
  git('add', 'dirty.md');
  const r = run(root, '--staged');
  assert.equal(r.code, 1);
  assert.match(r.out, /dirty\.md:1/);
});

test('pre-commit hook blocks a commit containing a forbidden character', async () => {
  const root = await repo({ 'a.md': 'ok\n' });
  const projectRoot = path.join(path.dirname(SCRIPT), '..');
  await fs.mkdir(path.join(root, 'scripts'));
  await fs.copyFile(SCRIPT, path.join(root, 'scripts', 'check-writing.mjs'));
  await fs.cp(path.join(projectRoot, '.githooks'), path.join(root, '.githooks'), { recursive: true });
  const git = (...a) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', ...a], { cwd: root, encoding: 'utf8' });
  git('init', '-q');
  git('config', 'core.hooksPath', '.githooks');
  git('add', '.');
  assert.equal(git('commit', '-q', '-m', 'clean').status, 0);
  await fs.writeFile(path.join(root, 'b.md'), `bad ${EM}\n`);
  git('add', 'b.md');
  const c = git('commit', '-q', '-m', 'dirty');
  assert.notEqual(c.status, 0, 'commit must be refused');
  assert.match(c.stdout + c.stderr, /b\.md:1/);
});
