/**
 * FLYANS — dedicated Chromium window over the colony studio.
 * Splash stays until the colony world signals ready (not merely HTML load).
 */
const { app, BrowserWindow, dialog, shell, Menu, ipcMain, net } = require('electron');
const { autoUpdater } = require('electron-updater');
const { spawn } = require('child_process');
const http = require('http');
const https = require('https');
const path = require('path');
const fs = require('fs');
const { studioDir, resolvePython, colonyDataRoot } = require('./paths');

const OWNER_PORT = Number(process.env.FLIES_OWNER_PORT || 8776);
const OWNER_URL = `http://127.0.0.1:${OWNER_PORT}/`;
const VERSION = app.getVersion();

let mainWindow = null;
let splashWindow = null;
let studioProc = null;
/** True only if this process spawned record_server (do not kill a pre-existing :8776). */
let studioOwned = false;
let shuttingDown = false;
/** Tiny brand beat only — never pad a slow load with fake delay. */
const SPLASH_BRAND_MS = 0;
let splashShownAt = 0;
let revealLockZoom = null;
let revealedMain = false;

app.setName('FLYANS');
app.setAppUserModelId('com.briksquared.flyans');

app.commandLine.appendSwitch('js-flags', '--max-old-space-size=8192');
app.commandLine.appendSwitch('high-dpi-support', '1');
if (process.env.FLYANS_SCALE) {
  app.commandLine.appendSwitch('force-device-scale-factor', String(process.env.FLYANS_SCALE));
}

function log(...args) {
  console.log('[FLYANS]', ...args);
}

function iconPath() {
  const ico = path.join(__dirname, '..', 'assets', 'icon.ico');
  return fs.existsSync(ico) ? ico : undefined;
}

function probeUrl(url, timeoutMs = 2500) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (ok, detail) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok, detail });
    };
    const timer = setTimeout(() => {
      try {
        request.abort();
      } catch (_) {
        /* ignore */
      }
      done(false, 'timeout');
    }, timeoutMs);

    let request;
    try {
      request = net.request({ method: 'GET', url, redirect: 'follow' });
    } catch (err) {
      done(false, String(err.message || err));
      return;
    }
    request.setHeader('User-Agent', `FLYANS/${VERSION}`);
    request.on('response', (response) => {
      response.on('data', () => {});
      response.on('end', () => {
        const code = response.statusCode || 0;
        done(code > 0 && code < 500, `http ${code}`);
      });
    });
    request.on('error', (err) => done(false, String(err.message || err)));
    request.end();
  });
}

function probeUrlNode(hostname, pathName = '/', timeoutMs = 2500) {
  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname,
        path: pathName,
        method: 'GET',
        timeout: timeoutMs,
        headers: { 'User-Agent': `FLYANS/${VERSION}`, Accept: '*/*' }
      },
      (res) => {
        res.resume();
        const code = res.statusCode || 0;
        resolve({ ok: code > 0 && code < 500, detail: `node http ${code}` });
      }
    );
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, detail: 'node timeout' });
    });
    req.on('error', (err) => resolve({ ok: false, detail: String(err.message || err) }));
    req.end();
  });
}

/** Non-blocking: used for updates only, never gates opening the colony. */
async function checkInternet(timeoutMs = 2500) {
  if (typeof net.isOnline === 'function' && net.isOnline() === false) {
    return { ok: false, error: 'net.isOnline() false' };
  }
  const targets = [
    { kind: 'net', url: 'https://api.github.com/' },
    { kind: 'net', url: 'https://www.msftconnecttest.com/connecttest.txt' },
    { kind: 'node', host: 'api.github.com', path: '/' }
  ];
  const errors = [];
  for (const t of targets) {
    const result =
      t.kind === 'net'
        ? await probeUrl(t.url, timeoutMs)
        : await probeUrlNode(t.host, t.path, timeoutMs);
    if (result.ok) return { ok: true, via: t.url || t.host, status: result.detail };
    errors.push(`${t.url || t.host}: ${result.detail}`);
  }
  return { ok: false, error: errors[0] || 'unreachable' };
}

function urlUp(url, timeoutMs = 400) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      res.resume();
      resolve(!!(res.statusCode && res.statusCode < 500));
    });
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.on('error', () => resolve(false));
  });
}

function waitForUrl(url, { tries = 120, delayMs = 40 } = {}) {
  return new Promise((resolve, reject) => {
    let n = 0;
    const tick = () => {
      n += 1;
      const req = http.get(url, { timeout: 800 }, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) resolve(true);
        else if (n >= tries) reject(new Error('studio not ready'));
        else setTimeout(tick, delayMs);
      });
      req.on('timeout', () => {
        req.destroy();
        if (n >= tries) reject(new Error('studio not ready'));
        else setTimeout(tick, delayMs);
      });
      req.on('error', () => {
        if (n >= tries) reject(new Error('studio not ready'));
        else setTimeout(tick, delayMs);
      });
    };
    tick();
  });
}

function startStudioServer() {
  const cwd = studioDir();
  const script = path.join(cwd, 'record_server.py');
  if (!fs.existsSync(script)) {
    throw new Error(`Studio missing: ${script}`);
  }
  const py = resolvePython();
  log('starting studio', py, cwd);
  const env = {
    ...process.env,
    FLIES_OWNER_PORT: String(OWNER_PORT),
    PYTHONUNBUFFERED: '1',
    FLIES_DATA: colonyDataRoot(),
    FLYANS_PACKAGED: app.isPackaged ? '1' : '0'
  };
  // Worlds, logs and recordings always write to the per-user colony data root
  // (see paths.js) — never into the app's install tree.
  studioProc = spawn(py, [script], {
    cwd,
    env,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  studioOwned = true;
  studioProc.stdout.on('data', (d) => log('studio:', String(d).trim()));
  studioProc.stderr.on('data', (d) => log('studio err:', String(d).trim()));
  studioProc.on('exit', (code) => {
    log('studio exited', code);
    studioProc = null;
    studioOwned = false;
    if (!shuttingDown && mainWindow && !mainWindow.isDestroyed()) {
      dialog.showErrorBox('FLYANS', `The colony server stopped (code ${code}). Restart FLYANS.`);
    }
  });
  return studioProc;
}

function stopStudioServer() {
  if (!studioOwned || !studioProc || studioProc.killed) return;
  try {
    studioProc.kill();
  } catch (_) {
    /* ignore */
  }
  studioProc = null;
  studioOwned = false;
}

function splashStatus(msg) {
  if (!splashWindow || splashWindow.isDestroyed()) return;
  try {
    splashWindow.webContents.send('flyans:splash-status', msg);
  } catch (_) {
    /* ignore */
  }
}

function createSplash() {
  splashShownAt = Date.now();
  splashWindow = new BrowserWindow({
    width: 440,
    height: 320,
    frame: false,
    resizable: false,
    show: true,
    center: true,
    backgroundColor: '#0a0612',
    alwaysOnTop: true,
    icon: iconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  splashWindow.loadFile(path.join(__dirname, 'splash.html'));
}

/**
 * Reveal main only when the colony world is ready (IPC), not when HTML first paints.
 * That avoids the half-loaded “version flash + in-page loader” the user hates.
 */
async function revealMain() {
  if (revealedMain || !mainWindow || mainWindow.isDestroyed()) return;
  revealedMain = true;
  const brandLeft = Math.max(0, SPLASH_BRAND_MS - (Date.now() - splashShownAt));
  if (brandLeft > 0) await new Promise((r) => setTimeout(r, brandLeft));
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    if (typeof revealLockZoom === 'function') revealLockZoom();
  } catch (_) {
    /* ignore */
  }
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
  }
  splashWindow = null;
  mainWindow.show();
  mainWindow.focus();
  log('colony revealed');
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    backgroundColor: '#0a0612',
    title: `FLYANS ${VERSION}`,
    icon: iconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      spellcheck: false
    }
  });

  revealLockZoom = () => {
    try {
      mainWindow.webContents.setZoomFactor(1);
      mainWindow.webContents.setZoomLevel(0);
      mainWindow.webContents.setVisualZoomLevelLimits(1, 1);
    } catch (_) {
      /* ignore */
    }
  };

  mainWindow.webContents.on('did-finish-load', () => {
    splashStatus('Building colony…');
    try {
      revealLockZoom();
    } catch (_) {
      /* ignore */
    }
  });
  mainWindow.webContents.on('did-navigate', revealLockZoom);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Failsafe only after a long wait. Revealing at ~22s showed a half-built city (blobs, missing
  // temples, cloud jump) because deferred world work was still running. Prefer colonyReady IPC.
  setTimeout(() => {
    if (!revealedMain) {
      log('colony-ready timeout — forcing deferred-ready then reveal');
      splashStatus('Opening…');
      try {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents
            .executeJavaScript(
              `try{window.__colonyDeferredReady=true;document.body.classList.remove('booting');window.__hideLoader&&window.__hideLoader();}catch(e){}`,
              true
            )
            .catch(() => {});
        }
      } catch (_) {
        /* ignore */
      }
      // Give the page a beat to paint after deferred-ready, then reveal.
      setTimeout(() => {
        revealMain().catch(() => {});
      }, 1500);
    }
  }, 90000);

  mainWindow.loadURL(OWNER_URL);
}

function sendCommand(cmd) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    mainWindow.webContents.send('flyans:command', cmd);
  } catch (_) {
    /* ignore */
  }
}

function buildMenu(netOk) {
  const template = [
    {
      label: 'FLYANS',
      submenu: [
        {
          label: 'About FLYANS',
          accelerator: 'CmdOrCtrl+Shift+/',
          click: () => sendCommand('about')
        },
        { type: 'separator' },
        {
          label: 'Check for Updates…',
          enabled: !!netOk,
          click: () => checkForUpdates(true)
        },
        { type: 'separator' },
        { role: 'quit', label: 'Quit FLYANS' }
      ]
    },
    {
      label: 'File',
      submenu: [
        {
          label: 'Save World',
          accelerator: 'CmdOrCtrl+S',
          click: () => sendCommand('save')
        },
        { type: 'separator' },
        { label: 'Reload Colony', role: 'reload' },
        { label: 'Force Reload', role: 'forceReload' }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Options…',
          click: () => sendCommand('options')
        },
        {
          label: 'Chronicle…',
          click: () => sendCommand('chronicle')
        },
        { type: 'separator' },
        {
          label: 'Photo Mode',
          click: () => sendCommand('photo')
        },
        {
          label: 'Cinema Mode',
          click: () => sendCommand('cinema')
        },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Colony',
      submenu: [
        {
          label: 'Open Studio in Browser',
          click: () => shell.openExternal(OWNER_URL)
        },
        {
          label: 'Open Data Folder',
          click: () => shell.openPath(colonyDataRoot())
        }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Colony Help',
          accelerator: 'F1',
          click: () => sendCommand('help')
        },
        {
          label: 'Keyboard Shortcuts',
          click: () => sendCommand('shortcuts')
        },
        {
          label: 'About FLYANS…',
          click: () => {
            dialog.showMessageBox(mainWindow || undefined, {
              type: 'info',
              title: 'FLYANS',
              message: `FLYANS ${VERSION}`,
              detail: [
                'Fly colony observatory.',
                `Studio: ${OWNER_URL}`,
                `Data: ${colonyDataRoot()}`,
                `Internet: ${netOk ? 'connected' : 'offline / unchecked'}`,
                'Updates: GitHub Releases (briksquared/flyans)'
              ].join('\n')
            });
          }
        }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function setupAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowDowngrade = false;
  autoUpdater.on('checking-for-update', () => log('checking for update'));
  autoUpdater.on('update-available', (info) => log('update available', info.version));
  autoUpdater.on('update-not-available', () => log('up to date'));
  autoUpdater.on('error', (err) => log('updater error', err && err.message));
  autoUpdater.on('update-downloaded', (info) => {
    log('update downloaded', info.version);
    if (!mainWindow) return;
    dialog
      .showMessageBox(mainWindow, {
        type: 'info',
        title: 'FLYANS update ready',
        message: `Version ${info.version} is ready.`,
        detail: 'Restart now to install?',
        buttons: ['Restart', 'Later'],
        defaultId: 0,
        cancelId: 1
      })
      .then(({ response }) => {
        if (response === 0) {
          shuttingDown = true;
          autoUpdater.quitAndInstall();
        }
      });
  });
}

async function checkForUpdates(userInitiated) {
  if (!app.isPackaged) {
    if (userInitiated) {
      dialog.showMessageBox({
        type: 'info',
        title: 'FLYANS',
        message: 'Updates run from the installed Program Files build.',
        detail: 'Dev `npm start` does not publish or apply releases.'
      });
    }
    return;
  }
  const netInfo = await checkInternet();
  if (!netInfo.ok) {
    if (userInitiated) {
      dialog.showErrorBox('FLYANS', 'No internet connection. Updates need GitHub.');
    }
    return;
  }
  try {
    await autoUpdater.checkForUpdates();
  } catch (err) {
    log('checkForUpdates failed', err && err.message);
    if (userInitiated) {
      dialog.showErrorBox('FLYANS', `Update check failed: ${err.message || err}`);
    }
  }
}

async function ensureStudioListening() {
  splashStatus('Checking colony server…');
  if (await urlUp(OWNER_URL)) {
    log('reusing existing studio on', OWNER_PORT);
    splashStatus('Colony server ready');
    return;
  }
  splashStatus('Starting studio server…');
  startStudioServer();
  splashStatus(`Waiting for :${OWNER_PORT}…`);
  await waitForUrl(OWNER_URL);
  splashStatus('Colony server ready');
}

async function boot() {
  createSplash();
  // Menu assumes online until proven otherwise; never block splash on GitHub.
  buildMenu(true);

  try {
    await ensureStudioListening();
    splashStatus('Loading colony…');
  } catch (err) {
    dialog.showErrorBox(
      'FLYANS',
      `Could not start the colony studio server.\n\n${err.message}\n\nPython: ${resolvePython()}\nStudio: ${studioDir()}`
    );
    app.quit();
    return;
  }

  createMainWindow();
  setupAutoUpdater();
  // Updates after the colony is up — never on the splash path.
  setTimeout(() => {
    checkInternet().then((netInfo) => {
      buildMenu(!!netInfo.ok);
      if (netInfo.ok) checkForUpdates(false);
    });
  }, 12000);
}

ipcMain.handle('flyans:version', () => VERSION);
ipcMain.handle('flyans:internet', () => checkInternet());
ipcMain.handle('flyans:colony-ready', async () => {
  splashStatus('Colony ready');
  await revealMain();
  return true;
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(boot);

  app.on('before-quit', () => {
    shuttingDown = true;
    // Do NOT kill record_server — leaving :8776 up makes the next launch skip Python boot.
  });

  app.on('window-all-closed', () => {
    shuttingDown = true;
    app.quit();
  });
}
