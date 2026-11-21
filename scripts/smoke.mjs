#!/usr/bin/env node
// Desktop smoke test: starts the real Electron app on a temporary library
// seeded with examples/skills, opens every view in light and dark mode, runs
// scripted user flows, then quits. Screenshots and report.json are written to
// the output folder (default: a temporary folder).
//
//   npm run test:smoke [-- <output folder>]

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import electronPath from 'electron';
import { Hub } from '../src/core/hub.js';

const root = process.cwd();
const out = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'ush-smoke-')));
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'ush-smoke-data-'));
const hub = await Hub.open(data);
await hub.importer.importFolder(path.join(root, 'examples', 'skills'));
console.log(`Library seeded with ${hub.library.list().length} example skills in ${data}`);

const r = spawnSync(electronPath, ['.'], { cwd: root, env: { ...process.env, USH_DATA_DIR: data, USH_SMOKE_DIR: out }, stdio: 'inherit', timeout: 240000 });
const reportFile = path.join(out, 'report.json');
if (!fs.existsSync(reportFile)) {
  console.error(`ERROR: no report written (electron status ${r.status}, ${r.error?.message || r.signal || ''})`);
  process.exit(1);
}
const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
const badViews = Object.entries(report.views).filter(([, v]) => v.hasError).map(([k]) => k);
console.log(`Views checked: ${Object.keys(report.views).length}, with error: ${badViews.length}`);
for (const f of report.flows) console.log(`${f.ok ? 'PASS' : 'FAIL'} flow ${f.name}${f.error ? ` (${f.error})` : ''}`);
console.log(`Console errors: ${report.errors.length}`);
console.log(`Screenshots: ${out}`);
process.exit(r.status === 0 ? 0 : 1);
