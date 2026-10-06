const fs = require('fs');
const path = require('path');
const os = require('os');

function getWritableConfigPath() {
  try {
    let appDataDir = '';

    // 1. Check Electron app userData (%APPDATA%\multichat on Windows)
    try {
      const electron = require('electron');
      const app = electron.app || (electron.remote && electron.remote.app);
      if (app && typeof app.getPath === 'function') {
        appDataDir = app.getPath('userData');
      }
    } catch (e) {}

    // 2. Direct environment fallback (%APPDATA% Roaming or %LOCALAPPDATA% Local)
    if (!appDataDir) {
      const base = process.env.APPDATA || process.env.LOCALAPPDATA || (process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Application Support') : path.join(os.homedir(), '.config'));
      appDataDir = path.join(base, 'multichat');
    }

    if (!fs.existsSync(appDataDir)) {
      fs.mkdirSync(appDataDir, { recursive: true });
    }

    const configPath = path.join(appDataDir, 'config.json');

    // If config.json does not yet exist in AppData, seed it from bundled/clean config
    if (!fs.existsSync(configPath)) {
      const bundledConfig = path.join(__dirname, '..', 'config.json');
      if (fs.existsSync(bundledConfig)) {
        try {
          fs.copyFileSync(bundledConfig, configPath);
        } catch (e) {}
      }
    }

    return configPath;
  } catch (err) {
    console.error('Error resolving AppData config path:', err.message);
    const fallbackDir = path.join(process.env.APPDATA || process.env.LOCALAPPDATA || os.tmpdir(), 'multichat');
    try { fs.mkdirSync(fallbackDir, { recursive: true }); } catch (_) {}
    return path.join(fallbackDir, 'config.json');
  }
}

const DEFAULT_FISH_KEY = 'sk-fish-TCVJK8dpgPADjTHb9FGQPHpNCM_n_cKetZEtfSc2ZCE';

const DEFAULT_CONFIG = {
  port: 3333,
  appTheme: 'midnight', // midnight, cyberpunk, purple, minecraft
  platforms: {
    twitch: { enabled: false, channel: '' },
    youtube: { enabled: false, query: '', mode: 'auto' }, // query can be @handle, channelId, or video URL/ID
    kick: { enabled: false, channel: '' },
    tiktok: { enabled: false, username: '' }
  },
  overlay: {
    theme: 'glassmorphism', // glassmorphism, cyberpunk, neon_purple, minimal_clean, bubble_cute, pixel_retro
    fontFamily: "'Inter', sans-serif",
    fontSize: 16,
    messageDirection: 'bottom-up', // bottom-up or top-down
    maxMessages: 15,
    autoHideDelay: 15, // seconds (0 to disable)
    animation: 'slide-left', // slide-left, slide-up, pop-in, fade
    exitAnimation: 'fade-out', // fade-out, slide-right, slide-left, slide-up, slide-down, pop-out
    cardOpacity: 85, // percentage
    borderRadius: 12,
    showPlatformBadge: true,
    showAvatar: true,
    showUserBadges: true,
    showTimestamp: false,
    soundEnabled: false,
    soundVolume: 50,
    ttsEnabled: true,
    ttsVolume: 90,
    ttsSpeed: 1.0,
    ttsLang: 'rick_sanchez_latino',
    ttsReadUsername: true,
    ttsTranslate: false,
    ttsCommandOnly: false,
    ttsCommand: '!tts',
    ttsPermissions: 'all',
    ttsAntiSpam: true,
    bannedWords: [],
    customThemeEnabled: false,
    customBgColor: '#000000',
    customTextColor: '#ffffff',
    customBorderMulticolor: true,
    customBorderColor: '#ff1244',
    customBorderColor2: '#00f0ff',
    customBorderAnim: 'rotating',
    customBorderStyle: 'neon',
    customBorderSpeed: 'normal',
    customBorderWidth: 2.5,
    textEffect: 'shadow',
    avatarShape: 'circle',
    messageGap: 'normal',
    messageFlash: true,
    fishApiKey: DEFAULT_FISH_KEY
  }
};

function loadConfig() {
  try {
    const configPath = getWritableConfigPath();
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf8');
      const parsed = JSON.parse(raw);
      return deepMerge(DEFAULT_CONFIG, parsed);
    }
  } catch (err) {
    console.error('Error loading config.json from AppData, using defaults:', err.message);
  }
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
}

function saveConfig(newConfig) {
  try {
    const configPath = getWritableConfigPath();
    const merged = deepMerge(loadConfig(), newConfig);
    fs.writeFileSync(configPath, JSON.stringify(merged, null, 2), 'utf8');
    return merged;
  } catch (err) {
    console.error('Error saving config.json to AppData:', err.message);
    throw err;
  }
}

function deepMerge(target, source) {
  const output = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      if (key in target) {
        output[key] = deepMerge(target[key], source[key]);
      } else {
        output[key] = source[key];
      }
    } else {
      output[key] = source[key];
    }
  }
  return output;
}

module.exports = {
  loadConfig,
  saveConfig,
  DEFAULT_CONFIG,
  getWritableConfigPath,
  CONFIG_PATH: getWritableConfigPath()
};
