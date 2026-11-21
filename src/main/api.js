// Whitelist of the operations the renderer may call. The renderer never gets
// direct file system or Node.js access; each call is routed here.

import { listAdapters, describeAdapter } from '../core/adapters/index.js';

function clean(value) {
  // Removes caches (keys starting with "_") and makes the value serializable.
  if (value === undefined) return null;
  return JSON.parse(JSON.stringify(value, (k, v) => (k.startsWith('_') ? undefined : v)));
}

export function buildApi(hub, extra = {}) {
  const lib = hub.library;
  const api = {
    // Dashboard and library
    dashboard: () => hub.dashboard(),
    search: (filters) => hub.search(filters || {}),
    getSkill: async (id) => {
      const s = lib.get(id);
      return { skill: s, instructions: await lib.body(id), packs: Object.values(hub.data.packs).filter((p) => p.skillIds.includes(id)).map((p) => ({ id: p.id, name: p.name })) };
    },
    readFile: (id, rel) => lib.readFile(id, rel),
    versionFileText: (id, n, rel) => lib.versionFileText(id, n, rel),
    updateMeta: (id, patch) => lib.updateMeta(id, patch),
    editInstructions: async (id, text, note) => {
      const r = await lib.editInstructions(id, text, note);
      hub.onLibraryChanged().catch(() => {});
      return r;
    },
    compareVersions: (id, a, b) => lib.compareVersions(id, a, b),
    restoreVersion: async (id, n) => {
      const r = await lib.restoreVersion(id, n);
      hub.onLibraryChanged().catch(() => {});
      return r;
    },
    reclassify: (id) => lib.reclassify(id),
    rescanSecurity: (id) => lib.rescanSecurity(id),
    reviewSecurity: (id, approved, comment) => lib.reviewSecurity(id, approved, comment),
    removeSkill: (id) => lib.remove(id),
    listTrash: () => lib.listTrash(),
    recoverFromTrash: (file) => lib.recoverFromTrash(file),
    duplicates: () => hub.duplicates(),

    // Import
    importFolder: (p, opts) => hub.importer.importFolder(p, {}, opts || {}),
    importFile: (p, opts) => hub.importer.importFile(p, {}, opts || {}),
    importText: (text, name, opts) => hub.importer.importText(text, name, {}, opts || {}),
    importGit: (url, opts) => hub.importer.importGit(url, {}, opts || {}),
    importUrl: (url, opts) => hub.importer.importUrl(url, {}, opts || {}),

    // Categories
    listCategories: () => hub.data.categories,
    saveCategory: (c) => hub.saveCategory(c),
    deleteCategory: (id) => hub.deleteCategory(id),

    // Packs and selection
    listPacks: () => Object.values(hub.data.packs),
    createPack: (p) => hub.createPack(p),
    updatePack: (id, patch) => hub.updatePack(id, patch),
    duplicatePack: (id) => hub.duplicatePack(id),
    deletePack: (id) => hub.deletePack(id),
    proposePack: (request) => hub.proposePack(request),
    selectForTask: (task, opts) => hub.selectForTask(task, opts || {}),
    exportPack: (id, out) => hub.exportPack(id, out),
    importPack: (file) => hub.importPack(file),

    // Sources
    listSources: () => Object.values(hub.data.sources),
    suggestSources: (projectDir) => hub.suggestSources(projectDir || null),
    addSource: (s) => hub.addSource(s),
    updateSource: (id, patch) => hub.updateSource(id, patch),
    removeSource: (id) => hub.removeSource(id),
    scan: (id) => hub.scan(id, { apply: { importNew: false, updateModified: false } }),
    applyScanSelection: (id, sel) => hub.applyScanSelection(id, sel),

    // Agents and destinations
    agents: (projectDir) => hub.agents(projectDir || null),
    adapters: () => listAdapters().map(describeAdapter),
    listDestinations: () => Object.values(hub.data.destinations),
    addDestination: (d) => hub.addDestination(d),
    updateDestination: (id, patch) => hub.updateDestination(id, patch),
    removeDestination: (id) => hub.removeDestination(id),
    planSync: (id) => hub.planSync(id),
    runSync: (id, choices) => hub.runSync(id, choices || {}),
    diffWithDestination: (destId, skillId) => hub.sync.diffWithDestination(destId, skillId),
    exportForAgent: (adapterId, skillId, outDir) => hub.exportForAgent(adapterId, skillId, outDir),

    // Conflicts, history, security
    openConflicts: () => hub.openConflicts().map((c) => ({ ...c, skillName: hub.data.skills[c.skillId]?.name || c.skillId })),
    resolveConflict: (id, choice) => hub.resolveConflict(id, choice),
    history: (opts) => hub.store.readHistory(opts || {}),
    securityOverview: () => hub.securityOverview(),

    // Settings and backups
    getSettings: () => hub.data.settings,
    updateSettings: (patch) => hub.updateSettings(patch),
    dataInfo: () => ({ dataDir: hub.store.dataDir, customAdapters: hub.customAdapters, version: extra.version || null }),
    createBackup: (file, opts) => hub.createBackup(file || null, opts || {}),
    verifyBackup: (file) => hub.verifyBackup(file),
    restoreBackup: (file, sel) => hub.restoreBackup(file, sel),
    listBackups: () => hub.listBackups(),
    exportSkill: (id, out, format) => hub.exportSkill(id, out, format)
  };
  return {
    methods: Object.keys(api),
    async call(method, args) {
      if (!Object.prototype.hasOwnProperty.call(api, method)) throw new Error(`Opération inconnue : ${method}`);
      return clean(await api[method](...(Array.isArray(args) ? args : [])));
    }
  };
}
