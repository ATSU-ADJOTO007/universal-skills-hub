// Static checks of the renderer: every translation key used by the interface
// exists in French and English, every renderer call targets a whitelisted API
// method, and no skill data is inserted as HTML.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { newHub } from './helpers.js';
import { buildApi } from '../src/main/api.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'renderer');
const app = fs.readFileSync(path.join(dir, 'app.js'), 'utf8');
const ui = fs.readFileSync(path.join(dir, 'ui.js'), 'utf8');

function dictionaries() {
  const sandbox = { window: {}, document: { documentElement: {} } };
  vm.runInNewContext(fs.readFileSync(path.join(dir, 'i18n.js'), 'utf8'), sandbox);
  return { fr: new Set(sandbox.window.I18N_KEYS.fr), en: new Set(sandbox.window.I18N_KEYS.en) };
}

test('i18n: static keys exist in both languages', () => {
  const { fr, en } = dictionaries();
  const used = new Set([...app.matchAll(/\bt\(\s*'([^']+)'/g), ...ui.matchAll(/window\.t\(\s*'([^']+)'/g)].map((m) => m[1]));
  for (let i = 1; i <= 6; i++) used.add(`smart.ex${i}`);
  const missingFr = [...used].filter((k) => !fr.has(k));
  const missingEn = [...used].filter((k) => !en.has(k));
  assert.deepEqual(missingFr, []);
  assert.deepEqual(missingEn, []);
});

test('i18n: dynamic key families are complete', () => {
  const { fr, en } = dictionaries();
  const families = {
    'nav.': ['dashboard', 'library', 'packs', 'agents', 'sources', 'history', 'security', 'settings'],
    'status.': ['active', 'pending-review', 'incomplete', 'archived'],
    'sec.': ['none', 'low', 'medium', 'high'],
    'compat.': ['native', 'adapter', 'manual', 'unverified'],
    'sync.a.': ['install', 'update', 'up-to-date', 'conflict', 'missing', 'remove', 'blocked'],
    'scan.': ['new', 'modified', 'unchanged', 'moved', 'renamed', 'duplicate', 'incomplete'],
    'rel.': ['exact', 'same-instructions', 'renamed', 'minor-change', 'variant', 'partial', 'homonym'],
    'kind.': ['instructions', 'script', 'executable', 'config', 'reference', 'document', 'resource'],
    'origin.': ['folder', 'file', 'zip', 'paste', 'git', 'url', 'source', 'pack'],
    'mode.': ['manual', 'startup', 'on-change', 'interval'],
    'smode.': ['manual', 'startup', 'watch', 'interval'],
    'path.': ['ok', 'missing', 'broken-link', 'not-a-directory'],
    'import.status.': ['imported', 'duplicate', 'empty'],
    'skill.tab.': ['overview', 'instructions', 'files', 'versions', 'security', 'install'],
    'cap.': ['detect', 'import', 'export', 'install', 'sync'],
    'restore.': ['packs', 'settings', 'sources', 'destinations', 'categories', 'replaceExisting']
  };
  for (const [prefix, list] of Object.entries(families)) for (const k of list) {
    assert.ok(fr.has(prefix + k), `fr ${prefix + k}`);
    assert.ok(en.has(prefix + k), `en ${prefix + k}`);
  }
});

test('renderer: every API call is whitelisted', async () => {
  const { hub } = await newHub();
  const api = buildApi(hub);
  const calls = new Set([...app.matchAll(/call\(\s*'([a-zA-Z]+)'/g)].map((m) => m[1]));
  const unknown = [...calls].filter((m) => !api.methods.includes(m));
  assert.deepEqual(unknown, []);
  await assert.rejects(api.call('constructor', []), /inconnue/);
  await assert.rejects(api.call('__proto__', []), /inconnue/);
});

test('renderer: no innerHTML or insertAdjacentHTML', () => {
  for (const src of [app, ui]) {
    assert.doesNotMatch(src, /\.innerHTML\s*=/);
    assert.doesNotMatch(src, /insertAdjacentHTML/);
    assert.doesNotMatch(src, /\beval\(/);
  }
});

test('api: a few calls return serializable data', async () => {
  const { hub } = await newHub();
  const api = buildApi(hub, { version: 'test' });
  const d = await api.call('dashboard', []);
  assert.equal(d.skills, 0);
  const agents = await api.call('agents', []);
  assert.ok(agents.length >= 7);
  const info = await api.call('dataInfo', []);
  assert.equal(info.version, 'test');
});
