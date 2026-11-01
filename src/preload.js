const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('FLYANS', {
  version: () => ipcRenderer.invoke('flyans:version'),
  internet: () => ipcRenderer.invoke('flyans:internet'),
  /** Call once the colony world has drawn — keeps Electron splash up until then. */
  colonyReady: () => ipcRenderer.invoke('flyans:colony-ready'),
  onSplashStatus: (cb) => {
    if (typeof cb !== 'function') return;
    ipcRenderer.on('flyans:splash-status', (_e, msg) => {
      try {
        cb(msg);
      } catch (_) {
        /* ignore */
      }
    });
  },
  onCommand: (cb) => {
    if (typeof cb !== 'function') return;
    ipcRenderer.on('flyans:command', (_e, cmd) => {
      try {
        cb(cmd);
      } catch (_) {
        /* ignore */
      }
    });
  }
});
