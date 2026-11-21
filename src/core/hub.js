// Facade used by the desktop app and the CLI. It wires the modules together
// and exposes one method per user action. Modules stay independent: the hub
// only orchestrates them.

import fs from 'node:fs';
import path from 'node:path';
import { Store } from './store.js';
import { Library } from './library.js';
import { Importer } from './importer.js';
import { normalizeSource, scanSource, summarizeScan, applyScan } from './detector.js';
import { SyncEngine, normalizeDestination } from './sync.js';
import { normalizePack, selectForTask, proposePack } from './packs.js';
import { findDuplicateGroups } from './duplicates.js';
import { listAdapters, getAdapter, describeAdapter, loadCustomAdapters } from './adapters/index.js';
import * as backup from './backup.js';
import { newId, nowIso, safeSlug } from './fsutil.js';
import { normForMatch, countKeyword, tokenize } from './text.js';
import { SECURITY_RULES } from './security.js';

export class Hub {
  constructor(store) {
    this.store = store;
    this.library = new Library(store);
    this.importer = new Importer(this.library);
    this.sync = new SyncEngine(this);
    this.watchers = new Map();
    this.timers = new Map();
    this.listeners = new Set();
    this.lastScans = new Map();
    if (!this.store.data.conflicts) this.store.data.conflicts = {};
  }

  static async open(dataDir) {
    const store = await Store.open(dataDir);
    const hub = new Hub(store);
    hub.customAdapters = await loadCustomAdapters(store.dataDir);
    return hub;
  }

  get data() {
    return this.store.data;
  }

  /** Events for the UI (scan finished, sync done, change detected). */
  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(type, payload = {}) {
    for (const fn of this.listeners) {
      try {
        fn({ type, ...payload });
      } catch {
        // a failing listener never stops the core
      }
    }
  }

  // ----- Library ---------------------------------------------------------

  search({ query = '', category = null, tag = null, packId = null, agentId = null, status = null, security = null, sort = 'relevance' } = {}) {
    let list = this.library.list();
    if (category) list = list.filter((s) => s.categories.includes(category));
    if (tag) list = list.filter((s) => (s.tags || []).includes(tag));
    if (packId) {
      const ids = new Set(this.data.packs[packId]?.skillIds || []);
      list = list.filter((s) => ids.has(s.id));
    }
    if (agentId) list = list.filter((s) => (s.installations || []).some((i) => i.adapterId === agentId) || s.origin?.agent === agentId);
    if (status) list = list.filter((s) => s.status === status);
    if (security) list = list.filter((s) => s.security?.level === security);
    const words = tokenize(query);
    let scored = list.map((s) => ({ s, score: 0 }));
    if (words.length) {
      scored = scored
        .map(({ s }) => {
          const name = normForMatch(`${s.name} ${s.slug}`.replace(/[-_]/g, ' '));
          const tags = normForMatch((s.tags || []).join(' '));
          const desc = normForMatch(s.description || '');
          const notes = normForMatch(s.notes || '');
          let score = 0;
          let all = true;
          for (const w of words) {
            const local = countKeyword(name, w) * 6 + countKeyword(tags, w) * 4 + countKeyword(desc, w) * 2 + countKeyword(notes, w) + (name.includes(w) ? 2 : 0) + (desc.includes(w) ? 0.5 : 0);
            if (!local) all = false;
            score += local;
          }
          return { s, score: all ? score * 1.5 : score };
        })
        .filter((x) => x.score > 0);
    }
    const sorters = {
      relevance: (a, b) => b.score - a.score || a.s.name.localeCompare(b.s.name),
      name: (a, b) => a.s.name.localeCompare(b.s.name),
      updated: (a, b) => b.s.updatedAt.localeCompare(a.s.updatedAt),
      imported: (a, b) => b.s.importedAt.localeCompare(a.s.importedAt)
    };
    scored.sort(sorters[sort] || sorters.relevance);
    return scored.map((x) => x.s);
  }

  async duplicates() {
    return findDuplicateGroups(await this.library.withBodies());
  }

  // ----- Categories ------------------------------------------------------

  async saveCategory({ id, label, keywords = [] }) {
    const cats = this.data.categories;
    const cid = id || safeSlug(label, 'categorie');
    const existing = cats.find((c) => c.id === cid);
    const kw = (Array.isArray(keywords) ? keywords : String(keywords).split(',')).map((k) => k.trim()).filter(Boolean);
    if (existing) Object.assign(existing, { label: label || existing.label, keywords: kw });
    else cats.push({ id: cid, label: label || cid, keywords: kw, builtin: false });
    await this.store.save();
    await this.store.log('category.save', `Catégorie enregistrée : ${label || cid}`, { categoryId: cid });
    return this.data.categories;
  }

  async deleteCategory(id) {
    this.data.categories = this.data.categories.filter((c) => c.id !== id);
    for (const s of this.library.list()) s.categories = s.categories.filter((c) => c !== id);
    await this.store.save();
    await this.store.log('category.delete', `Catégorie supprimée : ${id}`, { categoryId: id });
    return this.data.categories;
  }

  // ----- Packs -----------------------------------------------------------

  async createPack(input) {
    const pack = normalizePack(input);
    pack.skillIds = pack.skillIds.filter((id) => this.data.skills[id]);
    if (pack.isDefault) for (const p of Object.values(this.data.packs)) p.isDefault = false;
    this.data.packs[pack.id] = pack;
    await this.store.save();
    await this.store.log('pack.create', `Pack créé : ${pack.name}`, { packId: pack.id, skills: pack.skillIds.length });
    return pack;
  }

  async updatePack(id, patch) {
    const pack = this.data.packs[id];
    if (!pack) throw new Error('Pack introuvable.');
    const next = normalizePack({ ...pack, ...patch, rules: { ...pack.rules, ...(patch.rules || {}) }, id, createdAt: pack.createdAt });
    next.skillIds = next.skillIds.filter((sid) => this.data.skills[sid]);
    if (next.isDefault) for (const p of Object.values(this.data.packs)) if (p.id !== id) p.isDefault = false;
    this.data.packs[id] = next;
    await this.store.save();
    await this.store.log('pack.update', `Pack modifié : ${next.name}`, { packId: id, fields: Object.keys(patch) });
    return next;
  }

  async duplicatePack(id) {
    const pack = this.data.packs[id];
    if (!pack) throw new Error('Pack introuvable.');
    return this.createPack({ ...pack, id: undefined, name: `${pack.name} (copie)`, isDefault: false, createdAt: undefined });
  }

  async deletePack(id) {
    const pack = this.data.packs[id];
    if (!pack) throw new Error('Pack introuvable.');
    delete this.data.packs[id];
    for (const d of Object.values(this.data.destinations)) d.packIds = d.packIds.filter((p) => p !== id);
    await this.store.save();
    await this.store.log('pack.delete', `Pack supprimé (les Skills sont conservés) : ${pack.name}`, { packId: id, skillIds: pack.skillIds });
    return true;
  }

  async proposePack(request, opts) {
    return proposePack(await this.library.withBodies(), request, opts);
  }

  async selectForTask(task, opts = {}) {
    return selectForTask(await this.library.withBodies(), task, { ...opts, packs: this.data.packs });
  }

  // ----- Sources and detection ------------------------------------------

  async addSource(input) {
    const src = normalizeSource(input);
    this.data.sources[src.id] = src;
    await this.store.save();
    await this.store.log('source.add', `Source ajoutée : ${src.label}`, { sourceId: src.id, path: src.path });
    this.applySchedules();
    return src;
  }

  async updateSource(id, patch) {
    const cur = this.data.sources[id];
    if (!cur) throw new Error('Source introuvable.');
    this.data.sources[id] = normalizeSource({ ...cur, ...patch, id });
    await this.store.save();
    await this.store.log('source.update', `Source modifiée : ${cur.label}`, { sourceId: id, fields: Object.keys(patch) });
    this.applySchedules();
    return this.data.sources[id];
  }

  async removeSource(id) {
    const cur = this.data.sources[id];
    if (!cur) throw new Error('Source introuvable.');
    delete this.data.sources[id];
    this.stopWatching(id);
    await this.store.save();
    await this.store.log('source.remove', `Source retirée (les Skills importés sont conservés) : ${cur.label}`, { sourceId: id });
    return true;
  }

  async scan(sourceId, { apply = null } = {}) {
    const src = this.data.sources[sourceId];
    if (!src) throw new Error('Source introuvable.');
    const report = await scanSource(this.library, src);
    const summary = summarizeScan(report);
    src.lastScanAt = report.scannedAt;
    src.lastError = report.errors[0] || null;
    src.lastStats = summary;
    let applied = null;
    const opts = apply || { importNew: src.autoImport, updateModified: src.autoUpdate };
    if (opts.importNew || opts.updateModified || report.items.some((i) => i.state === 'moved' || i.state === 'renamed') || report.missing.length) {
      applied = await applyScan(this, src, report, opts);
    }
    await this.store.save();
    this.lastScans.set(sourceId, { report, summary });
    await this.store.log('source.scan', `Analyse de ${src.label} : ${summary.new} nouveau(x), ${summary.modified} modifié(s), ${summary.missing} absent(s)`, { sourceId, summary, applied: applied && { imported: applied.imported.length, updated: applied.updated.length, conflicts: applied.conflicts.length } });
    this.emit('scan', { sourceId, summary });
    return { report, summary, applied };
  }

  async applyScanSelection(sourceId, { paths, importNew = true, updateModified = true }) {
    const src = this.data.sources[sourceId];
    const last = this.lastScans.get(sourceId) || { report: await scanSource(this.library, src) };
    const applied = await applyScan(this, src, last.report, { importNew, updateModified, paths });
    return applied;
  }

  async scanAll({ onlyMode = null } = {}) {
    const out = [];
    for (const src of Object.values(this.data.sources)) {
      if (src.paused) continue;
      if (onlyMode && src.mode !== onlyMode) continue;
      try {
        out.push({ sourceId: src.id, ...(await this.scan(src.id)) });
      } catch (err) {
        out.push({ sourceId: src.id, error: err.message });
      }
    }
    return out;
  }

  /** Suggests sources for agent folders that exist on this machine. */
  async suggestSources(projectDir = null) {
    const out = [];
    for (const a of listAdapters()) {
      for (const loc of await a.locations(projectDir)) {
        const known = Object.values(this.data.sources).some((s) => path.resolve(s.path) === path.resolve(loc.path));
        out.push({ adapterId: a.id, label: `${a.label} (${loc.scope === 'user' ? 'personnel' : 'projet'})`, path: loc.path, state: loc.state, known });
      }
    }
    return out;
  }

  // ----- Agents and destinations ----------------------------------------

  async agents(projectDir = null) {
    const out = [];
    for (const a of listAdapters()) {
      const det = await a.detect();
      const locations = await a.locations(projectDir);
      const dests = Object.values(this.data.destinations).filter((d) => d.adapterId === a.id);
      const installed = this.library.list().filter((s) => (s.installations || []).some((i) => i.adapterId === a.id));
      out.push({ ...describeAdapter(a), detected: det.installed, evidence: det.evidence, locations, destinations: dests, installedCount: installed.length });
    }
    return out;
  }

  async addDestination(input) {
    const adapter = getAdapter(input.adapterId);
    if (!adapter) throw new Error('Adaptateur inconnu.');
    if (!adapter.capabilities.install) throw new Error(`${adapter.label} ne permet pas l'installation par fichiers. Utilisez l'exportation.`);
    const d = normalizeDestination(input);
    this.data.destinations[d.id] = d;
    await this.store.save();
    await this.store.log('destination.add', `Destination ajoutée : ${d.label}`, { destinationId: d.id, path: d.path, adapterId: d.adapterId });
    this.applySchedules();
    return d;
  }

  async updateDestination(id, patch) {
    const cur = this.data.destinations[id];
    if (!cur) throw new Error('Destination introuvable.');
    this.data.destinations[id] = normalizeDestination({ ...cur, ...patch, id });
    await this.store.save();
    await this.store.log('destination.update', `Destination modifiée : ${cur.label}`, { destinationId: id, fields: Object.keys(patch) });
    this.applySchedules();
    return this.data.destinations[id];
  }

  async removeDestination(id) {
    const cur = this.data.destinations[id];
    if (!cur) throw new Error('Destination introuvable.');
    delete this.data.destinations[id];
    for (const s of this.library.list()) s.installations = (s.installations || []).filter((i) => i.destinationId !== id);
    await this.store.save();
    await this.store.log('destination.remove', `Destination retirée (aucun fichier supprimé sur le disque) : ${cur.label}`, { destinationId: id });
    return true;
  }

  async planSync(destId) {
    return this.sync.plan(destId);
  }

  async runSync(destId, choices = {}, opts = {}) {
    const r = await this.sync.apply(destId, choices, opts);
    this.emit('sync', { destinationId: destId, applied: r.applied.length, conflicts: r.conflicts.length });
    return r;
  }

  async syncAll({ onlyMode = null } = {}) {
    const out = [];
    for (const d of Object.values(this.data.destinations)) {
      if (!d.enabled || (onlyMode && d.mode !== onlyMode)) continue;
      try {
        out.push({ destinationId: d.id, ...(await this.runSync(d.id, {}, { onlySafe: true })) });
      } catch (err) {
        out.push({ destinationId: d.id, error: err.message });
      }
    }
    return out;
  }

  async exportForAgent(adapterId, skillId, outDir) {
    const a = getAdapter(adapterId);
    if (!a) throw new Error('Adaptateur inconnu.');
    const format = a.exportFormat === 'markdown' ? 'markdown' : a.layout === 'single-file' ? 'cursor' : 'zip';
    if (format === 'cursor') {
      const skill = this.library.get(skillId);
      return a.install(this.library.dir(skillId), outDir, skill);
    }
    return backup.exportSkill(this, skillId, outDir, format);
  }

  // ----- Conflicts -------------------------------------------------------

  addConflict(c) {
    const existing = Object.values(this.data.conflicts).find((x) => !x.resolvedAt && x.skillId === c.skillId && x.destinationId === c.destinationId && x.sourceId === c.sourceId);
    if (existing) return existing;
    const conflict = { id: newId('cf_'), createdAt: nowIso(), resolvedAt: null, ...c };
    this.data.conflicts[conflict.id] = conflict;
    this.store.log('conflict.detected', `Conflit détecté : ${this.data.skills[c.skillId]?.name || c.skillId}`, { conflict });
    return conflict;
  }

  resolveConflictsFor(skillId, destinationId) {
    for (const c of Object.values(this.data.conflicts)) if (!c.resolvedAt && c.skillId === skillId && c.destinationId === destinationId) c.resolvedAt = nowIso();
  }

  async resolveConflict(id, choice) {
    const c = this.data.conflicts[id];
    if (!c) throw new Error('Conflit introuvable.');
    if (c.destinationId) {
      const r = await this.runSync(c.destinationId, { [c.skillId]: choice });
      c.resolvedAt = nowIso();
      c.resolution = choice;
      await this.store.save();
      return r;
    }
    if (c.sourceId) {
      if (choice === 'keep-source') {
        await this.library.updateFromDir(c.skillId, c.path, { note: 'Conflit résolu : version de la source conservée (version locale archivée dans l\'historique)', source: 'source' });
        this.library.get(c.skillId).originHash = c.sourceHash;
      } else if (choice === 'keep-library') {
        this.library.get(c.skillId).originHash = c.sourceHash; // the source version is acknowledged but not imported
      } else if (choice === 'import-as-copy') {
        await this.importer.importFolder(c.path, { type: 'source', sourceId: null }, { maxDepth: 0, onDuplicate: 'import' });
      }
      c.resolvedAt = nowIso();
      c.resolution = choice;
      await this.store.save();
      await this.store.log('conflict.resolved', `Conflit résolu (${choice})`, { conflictId: id });
      return { ok: true };
    }
    throw new Error('Conflit sans contexte.');
  }

  openConflicts() {
    return Object.values(this.data.conflicts).filter((c) => !c.resolvedAt);
  }

  // ----- Settings, dashboard, security ----------------------------------

  async updateSettings(patch) {
    const allowed = Object.keys(this.data.settings);
    for (const [k, v] of Object.entries(patch)) if (allowed.includes(k)) this.data.settings[k] = v;
    await this.store.save();
    await this.store.log('settings.update', 'Paramètres modifiés', { fields: Object.keys(patch) });
    return this.data.settings;
  }

  async dashboard() {
    const skills = this.library.list();
    const history = await this.store.readHistory({ limit: 400 });
    const dayAgo = Date.now() - 7 * 864e5;
    const recentImports = history.filter((h) => h.type === 'skill.import' && Date.parse(h.ts) > dayAgo).length;
    const pendingSources = Object.values(this.data.sources).reduce((n, s) => n + ((s.lastStats?.new || 0) + (s.lastStats?.modified || 0)), 0);
    const errors = history.filter((h) => /error|failed/.test(h.type) || (h.errors && h.errors.length)).length + Object.values(this.data.sources).filter((s) => s.lastError).length;
    return {
      skills: skills.length,
      packs: Object.keys(this.data.packs).length,
      agents: listAdapters().length,
      destinations: Object.keys(this.data.destinations).length,
      sources: Object.keys(this.data.sources).length,
      newDetected: Object.values(this.data.sources).reduce((n, s) => n + (s.lastStats?.new || 0), 0),
      recentImports,
      pendingChanges: pendingSources,
      syncs: history.filter((h) => h.type === 'sync.run').length,
      lastSync: history.find((h) => h.type === 'sync.run')?.ts || null,
      errors,
      conflicts: this.openConflicts().length,
      securityAlerts: skills.filter((s) => s.status === 'pending-review' || s.security?.level === 'high').length,
      byStatus: Object.fromEntries(['active', 'pending-review', 'incomplete', 'archived'].map((st) => [st, skills.filter((s) => s.status === st).length])),
      byCategory: this.data.categories.map((c) => ({ id: c.id, label: c.label, count: skills.filter((s) => s.categories.includes(c.id)).length })).filter((c) => c.count).sort((a, b) => b.count - a.count),
      recent: history.slice(0, 8)
    };
  }

  securityOverview() {
    const skills = this.library.list();
    return {
      rules: SECURITY_RULES,
      pending: skills.filter((s) => s.status === 'pending-review').map(pick),
      withScripts: skills.filter((s) => (s.security?.scripts || []).length).map(pick),
      withExecutables: skills.filter((s) => (s.security?.executables || []).length).map(pick),
      withPermissions: skills.filter((s) => (s.security?.permissions || []).length).map(pick),
      high: skills.filter((s) => s.security?.level === 'high').map(pick),
      unknownSources: skills.filter((s) => ['url', 'git', 'paste', 'zip'].includes(s.origin?.type) && !s.security?.reviewed).map(pick),
      modifiedAfterReview: skills.filter((s) => s.security?.reviewed === false && s.currentVersion > 1 && s.security?.level !== 'none').map(pick)
    };
    function pick(s) {
      return { id: s.id, name: s.name, level: s.security?.level, findings: s.security?.findings || [], status: s.status, origin: s.origin?.type };
    }
  }

  // ----- Scheduling and watching ----------------------------------------

  stopWatching(sourceId) {
    const w = this.watchers.get(sourceId);
    if (w) {
      w.close();
      this.watchers.delete(sourceId);
    }
    const t = this.timers.get(sourceId);
    if (t) {
      clearInterval(t);
      this.timers.delete(sourceId);
    }
  }

  stopAll() {
    for (const id of [...this.watchers.keys(), ...this.timers.keys()]) this.stopWatching(id);
  }

  /** Starts file watchers and timers according to each source and destination mode. */
  applySchedules() {
    if (!this.schedulingEnabled) return;
    this.stopAll();
    for (const src of Object.values(this.data.sources)) {
      if (src.paused) continue;
      if (src.mode === 'watch') {
        try {
          let timer = null;
          const w = fs.watch(src.path, { recursive: true }, () => {
            clearTimeout(timer);
            timer = setTimeout(() => this.scan(src.id).catch((err) => this.emit('error', { message: err.message })), 1500);
          });
          w.on('error', (err) => this.emit('error', { message: `Surveillance de ${src.label} : ${err.message}` }));
          this.watchers.set(src.id, w);
        } catch (err) {
          src.lastError = `Surveillance impossible : ${err.message}`;
        }
      } else if (src.mode === 'interval') {
        this.timers.set(src.id, setInterval(() => this.scan(src.id).catch(() => {}), src.intervalMinutes * 60000));
      }
    }
    for (const d of Object.values(this.data.destinations)) {
      if (d.enabled && d.mode === 'interval') this.timers.set(d.id, setInterval(() => this.runSync(d.id, {}, { onlySafe: true }).catch(() => {}), d.intervalMinutes * 60000));
    }
  }

  /** Called once by the desktop app after start. */
  async startBackground() {
    this.schedulingEnabled = true;
    if (this.data.settings.scanOnStartup) {
      await this.scanAll({ onlyMode: 'startup' });
      await this.scanAll({ onlyMode: 'watch' });
    }
    await this.syncAll({ onlyMode: 'startup' });
    this.applySchedules();
  }

  /** Pushes library changes to destinations set to "on-change". */
  async onLibraryChanged() {
    return this.syncAll({ onlyMode: 'on-change' });
  }

  // ----- Backups ---------------------------------------------------------

  createBackup(file, opts) {
    return backup.createBackup(this, file, opts);
  }
  verifyBackup(file) {
    return backup.verifyBackup(file);
  }
  restoreBackup(file, selection) {
    return backup.restoreBackup(this, file, selection);
  }
  listBackups() {
    return backup.listBackups(this);
  }
  exportSkill(id, out, format) {
    return backup.exportSkill(this, id, out, format);
  }
  exportPack(id, out) {
    return backup.exportPack(this, id, out);
  }
  importPack(file) {
    return backup.importPack(this, file);
  }
}
