// Preload script: the only bridge between the page and the main process.
// It exposes a small API and nothing else.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ush', {
  async call(method, ...args) {
    const r = await ipcRenderer.invoke('ush:call', method, args);
    if (!r.ok) throw new Error(r.error);
    return r.value;
  },
  dialog: (kind, opts) => ipcRenderer.invoke('ush:dialog', kind, opts),
  reveal: (p) => ipcRenderer.invoke('ush:reveal', p),
  notify: (title, body) => ipcRenderer.invoke('ush:notify', title, body),
  setTheme: (theme) => ipcRenderer.invoke('ush:theme', theme),
  onEvent(cb) {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on('ush:event', handler);
    return () => ipcRenderer.removeListener('ush:event', handler);
  }
});
