const https = require('https');
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
            // No releases published yet
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

module.exports = {
  CURRENT_VERSION,
  GITHUB_REPO,
  checkForUpdates,
  isNewerVersion
};
