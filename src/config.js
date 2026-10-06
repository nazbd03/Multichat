const fs = require('fs');
const path = require('path');

function getWritableConfigPath() {
  try {
    // 1. Portable exe directory (if run as portable)
    if (process.env.PORTABLE_EXECUTABLE_DIR) {
      const portablePath = path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'config.json');
      if (!fs.existsSync(portablePath)) {
        try {
          const bundledConfig = path.join(__dirname, '..', 'config.json');
          if (fs.existsSync(bundledConfig)) {
            fs.copyFileSync(bundledConfig, portablePath);
          }
        } catch (e) {}
      }
      return portablePath;
    }

    // 2. Electron packaged app (save to userData so writes succeed)
    const electron = require('electron');
    const app = electron.app || (electron.remote && electron.remote.app);
    if (app && app.isPackaged) {
      const userConfig = path.join(app.getPath('userData'), 'config.json');
      if (!fs.existsSync(userConfig)) {
        const bundledConfig = path.join(__dirname, '..', 'config.json');
        if (fs.existsSync(bundledConfig)) {
          try {
            fs.copyFileSync(bundledConfig, userConfig);
          } catch (e) {}
        }
      }
      return userConfig;
    }
  } catch (e) {}

  // 3. Development / default path
  return path.join(__dirname, '..', 'config.json');
}

const CONFIG_PATH = getWritableConfigPath();

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
    ttsLang: 'es',
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
    messageFlash: true
  }
};

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      return deepMerge(DEFAULT_CONFIG, parsed);
    }
  } catch (err) {
    console.error('Error loading config.json, using defaults:', err.message);
  }
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
}

function saveConfig(newConfig) {
  try {
    const merged = deepMerge(loadConfig(), newConfig);
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2), 'utf8');
    return merged;
  } catch (err) {
    console.error('Error saving config.json:', err.message);
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
  DEFAULT_CONFIG
};
