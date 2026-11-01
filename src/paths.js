const fs = require('fs');
const path = require('path');
const { app } = require('electron');

/** Repo root (dev) or packaged resources root. */
function repoRoot() {
  if (app.isPackaged) {
    // electron-builder extraResources land next to the exe in resources/
    return path.dirname(process.resourcesPath);
  }
  // src/ lives at the repo root, and studio/ sits beside it.
  return path.resolve(__dirname, '..');
}

function studioDir() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'studio');
  }
  return path.join(repoRoot(), 'studio');
}

function pythonCandidates() {
  const list = [];
  if (process.env.FLYANS_PYTHON) list.push(process.env.FLYANS_PYTHON);
  // Python from PATH (python launcher on Windows falls back to `py`).
  list.push('python');
  list.push('py');
  return list;
}

function resolvePython() {
  for (const c of pythonCandidates()) {
    if (c === 'python' || c === 'py') return c;
    if (fs.existsSync(c)) return c;
  }
  return 'python';
}

function colonyDataRoot() {
  // Per-user writable home for worlds, logs and recordings. Overridable via FLIES_DATA.
  if (process.env.FLIES_DATA) return process.env.FLIES_DATA;
  try {
    return path.join(app.getPath('userData'), 'colony');
  } catch (_) {
    return path.join(require('os').homedir(), 'FLYANS', 'colony');
  }
}

module.exports = { repoRoot, studioDir, resolvePython, colonyDataRoot };
