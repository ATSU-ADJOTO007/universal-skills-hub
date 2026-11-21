// Electron main process. Security settings: context isolation, sandboxed
// renderer, no Node.js integration, a strict Content Security Policy, no
// remote content and no navigation away from the local page.

import { app, BrowserWindow, ipcMain, dialog, shell, Notification, nativeTheme, Menu } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Hub } from '../core/hub.js';
import { buildApi } from './api.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.join(here, '..', '..', 'package.json'), 'utf8'));
let hub;
let api;
let win;

function dataDir() {
  return process.env.USH_DATA_DIR ? path.resolve(process.env.USH_DATA_DIR) : path.join(app.getPath('userData'), 'library');
}

function createWindow() {
  win = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 960,
    minHeight: 620,
    title: 'Universal Skills Hub',
    icon: path.join(here, '..', '..', 'assets', 'icon.png'),
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0f1220' : '#f6f5f1',
    show: false,
    webPreferences: {
      preload: path.join(here, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false
    }
  });
  win.once('ready-to-show', () => win.show());
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.loadFile(path.join(here, '..', 'renderer', 'index.html'));
  if (process.env.USH_SMOKE_DIR) runSmokeTest(path.resolve(process.env.USH_SMOKE_DIR));
}

// Scripted user flows for the smoke test. Elements are found by their visible
// French label, the way a user finds them. Native dialogs are not used.
async function runFlows(outDir, wait) {
  const js = (code) => win.webContents.executeJavaScript(`(async () => { ${code} })()`);
  const helpers = `
    const byText = (sel, txt) => [...document.querySelectorAll(sel)].find((e) => e.textContent.trim().includes(txt));
    const click = (txt, sel = 'button') => { const b = byText(sel, txt); if (!b) throw new Error('introuvable : ' + txt); b.click(); };
    const setVal = (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const toasts = () => [...document.querySelectorAll('.toast')].map((t) => t.textContent);
  `;
  const destDir = path.join(outDir, 'destination');
  const flows = [
    ['pack-intelligent', `location.hash = '#packs'; await sleep(700); click('Pack intelligent');  await sleep(300);
      setVal(document.querySelector('.modal input[type=text]'), 'Crée un pack pour faire de la recherche');
      click('Analyser', '.modal-foot button'); await sleep(1200);
      const covered = document.querySelector('.modal').innerText;
      click('Créer le pack', '.modal-foot button'); await sleep(1200);
      if (!document.querySelector('.card h2')) throw new Error('pack non créé');
      return covered.includes('Couverture des besoins');`],
    ['onglets-skill', `location.hash = '#library'; await sleep(800); document.querySelector('.list-row').click(); await sleep(600);
      for (const tab of ['Instructions', 'Fichiers', 'Versions', 'Sécurité', 'Installation', 'Fiche']) { click(tab, '.tab'); await sleep(500); if (document.querySelector('#skill-detail .notice.bad')) throw new Error('erreur onglet ' + tab); }
      return true;`],
    ['nouvelle-version', `click('Instructions', '.tab'); await sleep(500);
      const ta = document.querySelector('textarea.editor'); setVal(ta, ta.value + '\\nLigne ajoutée par le test de fumée.\\n');
      click('Enregistrer une nouvelle version'); await sleep(900);
      return document.querySelector('#skill-detail .panel-head').innerText.includes('v2');`],
    ['destination-et-synchronisation', `location.hash = '#agents'; await sleep(900); click('Ajouter une destination', '.page-head button'); await sleep(600);
      const m = document.querySelector('.modal');
      setVal([...m.querySelectorAll('input[type=text]')][1], ${JSON.stringify(destDir)});
      m.querySelectorAll('.stack input[type=checkbox]').forEach((c, i) => { if (i < 2) { c.checked = true; c.dispatchEvent(new Event('change')); } });
      click('Enregistrer', '.modal-foot button'); await sleep(1200);
      if (!byText('.modal h2', 'Plan de synchronisation')) throw new Error('plan non affiché');
      click('Appliquer', '.modal-foot button'); await sleep(1500);
      return toasts().some((t) => t.includes('Synchronisation'));`],
    ['recherche-globale', `const s = document.getElementById('global-search'); setVal(s, 'sql'); await sleep(900);
      return location.hash === '#library' && document.querySelectorAll('.list-row').length > 0;`]
  ];
  const results = [];
  for (const [name, body] of flows) {
    try {
      await js("document.querySelectorAll('.modal-backdrop').forEach((m) => m.remove())");
      const ok = await js(`${helpers}\n${body}`);
      results.push({ name, ok: ok === true });
    } catch (err) {
      results.push({ name, ok: false, error: err.message });
    }
    await wait(300);
    fs.writeFileSync(path.join(outDir, `flow-${name}.png`), (await win.webContents.capturePage()).toPNG());
  }
  const installed = fs.existsSync(destDir) ? fs.readdirSync(destDir) : [];
  results.push({ name: 'fichiers-installes', ok: installed.length >= 1, installed });
  return results;
}

// Smoke test mode (USH_SMOKE_DIR=<folder>): opens every view, saves a
// screenshot per view, records renderer errors, then quits with exit code 1
// if an error was seen. Used to check start, rendering and shutdown for real.
function runSmokeTest(outDir) {
  const errors = [];
  fs.mkdirSync(outDir, { recursive: true });
  win.webContents.on('console-message', (e) => {
    const level = e.level ?? e.params?.level;
    if (level === 'error' || level === 3) errors.push(e.message ?? e.params?.message);
  });
  win.webContents.on('render-process-gone', (_e, d) => errors.push(`renderer gone: ${d.reason}`));
  win.webContents.once('did-finish-load', async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const views = ['dashboard', 'library', 'packs', 'agents', 'sources', 'history', 'security', 'settings'];
    const report = { views: {}, errors };
    await wait(1500);
    for (const theme of ['light', 'dark']) {
      await win.webContents.executeJavaScript(`document.documentElement.dataset.theme = '${theme}'`);
      for (const v of views) {
        await win.webContents.executeJavaScript(`location.hash = '#${v}'`);
        await wait(900);
        if (v === 'library') {
          await win.webContents.executeJavaScript(`(document.querySelector('.list-row') || { click() {} }).click()`);
          await wait(700);
        }
        const text = await win.webContents.executeJavaScript('document.getElementById("view").innerText.slice(0, 400)');
        report.views[`${theme}-${v}`] = { hasError: /notice bad/.test(await win.webContents.executeJavaScript('document.getElementById("view").innerHTML.slice(0, 2000)')), text };
        const img = await win.webContents.capturePage();
        fs.writeFileSync(path.join(outDir, `${theme}-${v}.png`), img.toPNG());
      }
    }
    await win.webContents.executeJavaScript(`document.documentElement.dataset.theme = 'light'`);
    report.flows = await runFlows(outDir, wait);
    fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
    const flowFailed = report.flows.some((f) => !f.ok);
    app.exit(errors.length || flowFailed || Object.values(report.views).some((x) => x.hasError) ? 1 : 0);
  });
}

function registerIpc() {
  ipcMain.handle('ush:call', async (_e, method, args) => {
    try {
      return { ok: true, value: await api.call(method, args) };
    } catch (err) {
      await hub.store.log('app.error', `Erreur : ${err.message}`, { method }).catch(() => {});
      return { ok: false, error: err.message };
    }
  });
  ipcMain.handle('ush:dialog', async (_e, kind, opts = {}) => {
    if (kind === 'folder') {
      const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'], title: opts.title });
      return r.canceled ? null : r.filePaths[0];
    }
    if (kind === 'file') {
      const r = await dialog.showOpenDialog(win, { properties: ['openFile'], title: opts.title, filters: opts.filters });
      return r.canceled ? null : r.filePaths[0];
    }
    if (kind === 'save') {
      const r = await dialog.showSaveDialog(win, { title: opts.title, defaultPath: opts.defaultPath, filters: opts.filters });
      return r.canceled ? null : r.filePath;
    }
    if (kind === 'confirm') {
      const r = await dialog.showMessageBox(win, { type: opts.danger ? 'warning' : 'question', buttons: [opts.cancel || 'Annuler', opts.ok || 'Confirmer'], defaultId: 0, cancelId: 0, title: 'Universal Skills Hub', message: opts.message || '', detail: opts.detail || '' });
      return r.response === 1;
    }
    return null;
  });
  ipcMain.handle('ush:reveal', (_e, p) => {
    if (typeof p === 'string' && fs.existsSync(p)) shell.showItemInFolder(p);
    return true;
  });
  ipcMain.handle('ush:notify', (_e, title, body) => {
    if (hub.data.settings.notifications && Notification.isSupported()) new Notification({ title, body }).show();
    return true;
  });
  ipcMain.handle('ush:theme', (_e, theme) => {
    nativeTheme.themeSource = ['light', 'dark'].includes(theme) ? theme : 'system';
    return nativeTheme.shouldUseDarkColors;
  });
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  hub = await Hub.open(dataDir());
  api = buildApi(hub, { version: pkg.version });
  nativeTheme.themeSource = ['light', 'dark'].includes(hub.data.settings.theme) ? hub.data.settings.theme : 'system';
  registerIpc();
  createWindow();
  hub.on((event) => win?.webContents.send('ush:event', event));
  await hub.store.log('app.start', `Démarrage de Universal Skills Hub ${pkg.version}`, {});
  hub.startBackground().catch((err) => win?.webContents.send('ush:event', { type: 'error', message: err.message }));
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', async () => {
  hub?.stopAll();
  await hub?.store.log('app.stop', 'Arrêt de Universal Skills Hub', {}).catch(() => {});
  if (process.platform !== 'darwin') app.quit();
});
