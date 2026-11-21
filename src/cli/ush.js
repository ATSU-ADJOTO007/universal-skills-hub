#!/usr/bin/env node
// Command line interface built on the same core as the desktop app.
//
//   node src/cli/ush.js <command> [arguments]   (or: npm run cli -- <command>)
//
// Commands
//   info                         data folder and counts
//   list [query]                 list or search skills
//   import <path|url>            import a folder, file, ZIP, Git URL or HTTPS URL
//   agents                       adapters, detection and locations
//   suggest                      agent folders found on this computer
//   source-add <path> [label]    add a watched source (read only, manual)
//   scan [sourceId]              scan one or all sources (no automatic import)
//   pack-propose <request...>    smart pack proposal (nothing is saved)
//   select <task...>             skill selection for a task
//   backup [file]                create a backup
//   verify <file>                verify a backup
//
// The data folder defaults to the desktop app folder; set USH_DATA_DIR to use another one.

import os from 'node:os';
import path from 'node:path';
import { Hub } from '../core/hub.js';

function defaultDataDir() {
  if (process.env.USH_DATA_DIR) return path.resolve(process.env.USH_DATA_DIR);
  const appData = process.env.APPDATA || (process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Application Support') : process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'));
  return path.join(appData, 'universal-skills-hub', 'library');
}

const out = (x) => console.log(typeof x === 'string' ? x : JSON.stringify(x, (k, v) => (k.startsWith('_') ? undefined : v), 2));

async function main([cmd, ...args]) {
  if (!cmd || cmd === 'help' || cmd === '--help') {
    out('Usage: ush <info|list|import|agents|suggest|source-add|scan|pack-propose|select|backup|verify> [args]');
    return 0;
  }
  const hub = await Hub.open(defaultDataDir());
  switch (cmd) {
    case 'info': {
      const d = await hub.dashboard();
      out({ dataDir: hub.store.dataDir, skills: d.skills, packs: d.packs, sources: d.sources, destinations: d.destinations, conflicts: d.conflicts, securityAlerts: d.securityAlerts });
      break;
    }
    case 'list':
      for (const s of hub.search({ query: args.join(' '), sort: args.length ? 'relevance' : 'name' })) out(`${s.id}  ${s.name}  [${s.status}, ${s.security?.level}]  ${s.categories.join(', ')}`);
      break;
    case 'import': {
      const target = args[0];
      if (!target) throw new Error('Chemin ou URL requis.');
      let r;
      if (/^https:\/\//.test(target)) r = await hub.importer.importUrl(target);
      else if (/^git@/.test(target)) r = await hub.importer.importGit(target);
      else if (/\.(zip|skill|md|markdown|txt)$/i.test(target)) r = await hub.importer.importFile(path.resolve(target));
      else r = await hub.importer.importFolder(path.resolve(target));
      for (const x of r) out(`${x.status.padEnd(10)} ${x.name || x.message || ''}${x.security && x.security !== 'none' ? `  (risque ${x.security})` : ''}`);
      break;
    }
    case 'agents':
      for (const a of await hub.agents()) out(`${a.id.padEnd(22)} ${a.compatibility.padEnd(11)} ${a.detected ? 'détecté' : '-'}  ${a.locations.map((l) => `${l.path} [${l.state}]`).join(' ; ')}`);
      break;
    case 'suggest':
      for (const s of await hub.suggestSources()) out(`${s.state.padEnd(12)} ${s.label}  ${s.path}`);
      break;
    case 'source-add':
      out(await hub.addSource({ path: path.resolve(args[0]), label: args[1] }));
      break;
    case 'scan': {
      const ids = args[0] ? [args[0]] : Object.keys(hub.data.sources);
      for (const id of ids) {
        const r = await hub.scan(id, { apply: { importNew: false, updateModified: false } });
        out({ source: hub.data.sources[id].label, ...r.summary, errors: r.report.errors });
      }
      break;
    }
    case 'pack-propose':
      out(await hub.proposePack(args.join(' ')));
      break;
    case 'select':
      out(await hub.selectForTask(args.join(' ')));
      break;
    case 'backup':
      out((await hub.createBackup(args[0] ? path.resolve(args[0]) : null)).file);
      break;
    case 'verify': {
      const v = await hub.verifyBackup(path.resolve(args[0]));
      out({ ok: v.ok, errors: v.errors, manifest: v.manifest });
      return v.ok ? 0 : 1;
    }
    default:
      throw new Error(`Commande inconnue : ${cmd}`);
  }
  return 0;
}

main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (err) => {
  console.error(`ERROR: ${err.message}`);
  process.exitCode = 1;
});
