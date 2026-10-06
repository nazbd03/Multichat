const https = require('https');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const packageJson = require('../package.json');

const GITHUB_REPO = 'nazbd03/Multichat';
const CURRENT_VERSION = packageJson.version || '1.0.0';

function isNewerVersion(latest, current) {
  const clean = v => (v || '').replace(/^v/i, '').trim().split('.').map(x => parseInt(x, 10) || 0);
  const [lMaj = 0, lMin = 0, lPatch = 0] = clean(latest);
  const [cMaj = 0, cMin = 0, cPatch = 0] = clean(current);
  if (lMaj > cMaj) return true;
  if (lMaj < cMaj) return false;
  if (lMin > cMin) return true;
  if (lMin < cMin) return false;
  return lPatch > cPatch;
}

function checkForUpdates() {
  return new Promise((resolve) => {
    const options = {
      hostname: 'api.github.com',
      path: `/repos/${GITHUB_REPO}/releases/latest`,
      method: 'GET',
      headers: {
        'User-Agent': 'Multichat-Overlay-App',
        'Accept': 'application/vnd.github.v3+json'
      },
      timeout: 8000
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          if (res.statusCode === 404) {
            return resolve({
              updateAvailable: false,
              currentVersion: CURRENT_VERSION,
              message: 'Aún no hay releases publicadas en GitHub'
            });
          }

          if (res.statusCode !== 200) {
            return resolve({
              updateAvailable: false,
              currentVersion: CURRENT_VERSION,
              error: `GitHub API respondió con código ${res.statusCode}`
            });
          }

          const release = JSON.parse(data);
          const latestTag = release.tag_name || release.name || '';
          const hasUpdate = isNewerVersion(latestTag, CURRENT_VERSION);

          // Find .exe asset if uploaded to release
          let exeAsset = null;
          if (Array.isArray(release.assets)) {
            exeAsset = release.assets.find(a => (a.name || '').toLowerCase().endsWith('.exe'));
          }

          resolve({
            updateAvailable: hasUpdate,
            currentVersion: CURRENT_VERSION,
            latestVersion: latestTag,
            releaseName: release.name || latestTag,
            releaseNotes: release.body || 'Sin descripción',
            htmlUrl: release.html_url || `https://github.com/${GITHUB_REPO}/releases`,
            hasExeAsset: Boolean(exeAsset),
            downloadUrl: exeAsset ? exeAsset.browser_download_url : (release.html_url || `https://github.com/${GITHUB_REPO}/releases`),
            publishedAt: release.published_at
          });
        } catch (e) {
          resolve({
            updateAvailable: false,
            currentVersion: CURRENT_VERSION,
            error: e.message
          });
        }
      });
    });

    req.on('error', (err) => {
      resolve({
        updateAvailable: false,
        currentVersion: CURRENT_VERSION,
        error: err.message
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        updateAvailable: false,
        currentVersion: CURRENT_VERSION,
        error: 'Timeout al conectar con GitHub'
      });
    });

    req.end();
  });
}

function downloadFile(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    function get(currentUrl) {
      try {
        const parsed = new URL(currentUrl);
        const client = parsed.protocol === 'https:' ? https : http;

        const req = client.get(currentUrl, {
          headers: {
            'User-Agent': 'Multichat-Overlay-App'
          }
        }, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            return get(res.headers.location);
          }
          if (res.statusCode !== 200) {
            return reject(new Error(`Error al descargar: HTTP ${res.statusCode}`));
          }

          const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
          let receivedBytes = 0;

          const fileStream = fs.createWriteStream(destPath);
          res.on('data', chunk => {
            receivedBytes += chunk.length;
            if (onProgress && totalBytes > 0) {
              onProgress(Math.round((receivedBytes / totalBytes) * 100));
            }
          });

          res.pipe(fileStream);
          fileStream.on('finish', () => {
            fileStream.close(resolve);
          });
          fileStream.on('error', err => {
            fs.unlink(destPath, () => {});
            reject(err);
          });
        });

        req.on('error', reject);
      } catch (err) {
        reject(err);
      }
    }

    get(url);
  });
}

function applyInPlaceUpdate(downloadedExePath, targetExePath) {
  const batPath = path.join(os.tmpdir(), `multichat_updater_${Date.now()}.bat`);
  const batContent = `@echo off
chcp 65001 >nul
timeout /t 2 /nobreak >nul
copy /y "${downloadedExePath}" "${targetExePath}" >nul
if exist "${downloadedExePath}" del /f /q "${downloadedExePath}" >nul
start "" "${targetExePath}"
(goto) 2>nul & del "%~f0"
`;

  fs.writeFileSync(batPath, batContent, 'utf8');

  const child = spawn('cmd.exe', ['/c', batPath], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  });
  child.unref();

  return true;
}

module.exports = {
  CURRENT_VERSION,
  GITHUB_REPO,
  checkForUpdates,
  downloadFile,
  applyInPlaceUpdate,
  isNewerVersion
};
