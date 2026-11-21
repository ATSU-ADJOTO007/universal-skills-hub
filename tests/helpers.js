// Test helpers: temporary directories and synthetic skills. Tests never read
// or write the user's real agent folders.

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Hub } from '../src/core/hub.js';

export async function tmpDir(prefix = 'ush-test-') {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

export async function writeSkill(root, folder, { name, description, body = '', extra = {} } = {}) {
  const dir = path.join(root, folder);
  await fs.mkdir(dir, { recursive: true });
  const fm = [`name: ${name ?? path.basename(folder)}`];
  if (description !== null) fm.push(`description: ${description ?? `Skill ${path.basename(folder)} de test`}`);
  await fs.writeFile(path.join(dir, 'SKILL.md'), `---\n${fm.join('\n')}\n---\n\n# ${name ?? path.basename(folder)}\n\n${body}\n`);
  for (const [rel, content] of Object.entries(extra)) {
    const p = path.join(dir, ...rel.split('/'));
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, content);
  }
  return dir;
}

export async function newHub() {
  const dataDir = await tmpDir('ush-data-');
  const hub = await Hub.open(dataDir);
  return { hub, dataDir };
}

export const LOREM = {
  react: 'Build React components with hooks, CSS modules and accessibility checks. Use the frontend design system and test UI components.',
  api: 'Design REST API endpoints on the backend server, validate requests and document the API with OpenAPI.',
  sql: 'Write SQL queries for PostgreSQL, design the database schema and plan migrations with indexes.',
  audit: 'Audit comptable : contrôle interne, revue des écritures du grand livre, rapprochement bancaire et rapport d\'audit.',
  music: 'Compose a melody, suggest chord progressions and export MIDI files for the song.'
};
