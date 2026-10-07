const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const cors = require('cors');
const EventEmitter = require('events');

const appEvents = new EventEmitter();

const { loadConfig, saveConfig } = require('./config');
const TwitchConnector = require('./connectors/twitch');
const KickConnector = require('./connectors/kick');
const YouTubeConnector = require('./connectors/youtube');
const TikTokConnector = require('./connectors/tiktok');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

let config = loadConfig();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Explicit routes for convenience
app.get('/overlay', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(__dirname, '..', 'public', 'overlay', 'index.html'));
});

const os = require('os');
const { checkForUpdates, downloadFile, applyInPlaceUpdate, CURRENT_VERSION } = require('./updater');

app.get('/api/config', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.json(config);
});

app.get('/api/updates/check', async (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  const result = await checkForUpdates();
  res.json(result);
});

let isUpdating = false;

app.post('/api/updates/download-and-apply', async (req, res) => {
  if (isUpdating) {
    return res.status(409).json({ ok: false, error: 'Ya hay una descarga de actualización en curso.' });
  }

  try {
    const update = await checkForUpdates();
    if (!update.updateAvailable || !update.downloadUrl) {
      return res.status(400).json({ ok: false, error: 'No hay actualización disponible para descargar.' });
    }

    if (!update.hasExeAsset) {
      return res.json({ ok: false, requiresManualDownload: true, url: update.htmlUrl });
    }

    let targetExe = process.env.PORTABLE_EXECUTABLE_FILE;
    if (!targetExe || !fs.existsSync(targetExe)) {
      const candidates = [
        path.join(__dirname, '..', 'Multistream.Chat.exe'),
        path.join(__dirname, '..', 'Multistream Chat.exe'),
        path.join(__dirname, '..', 'Multichat Overlay.exe'),
        path.join(process.cwd(), 'Multistream.Chat.exe'),
        path.join(process.cwd(), 'Multistream Chat.exe')
      ];
      for (const cand of candidates) {
        if (fs.existsSync(cand)) {
          targetExe = cand;
          break;
        }
      }
    }

    // If targetExe is not set, default to placing the standalone exe directly on Desktop
    if (!targetExe || !fs.existsSync(targetExe)) {
      targetExe = path.join(os.homedir(), 'Desktop', 'Multistream.Chat.exe');
    }

    isUpdating = true;
    io.emit('update-progress', { status: 'downloading', percent: 0 });

    const tempExe = path.join(os.tmpdir(), `multichat_update_${Date.now()}.exe`);

    let lastSentPercent = -1;
    await downloadFile(update.downloadUrl, tempExe, (percent) => {
      if (percent !== lastSentPercent) {
        lastSentPercent = percent;
        io.emit('update-progress', { status: 'downloading', percent });
      }
    });

    io.emit('update-progress', { status: 'applying', percent: 100 });

    applyInPlaceUpdate(tempExe, targetExe, process.pid);

    res.json({ ok: true, message: 'Actualización descargada al 100%. Reiniciando en breves segundos...' });

    setTimeout(() => {
      appEvents.emit('quit-app');
    }, 2000);
  } catch (err) {
    isUpdating = false;
    io.emit('update-progress', { status: 'error', error: err.message });
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Desktop App Lifecycle endpoints (Second Plane / Tray / Background)
app.post('/api/app/hide', (req, res) => {
  appEvents.emit('hide-window');
  res.json({ ok: true, status: 'hidden' });
});

app.post('/api/app/show', (req, res) => {
  appEvents.emit('show-window');
  res.json({ ok: true, status: 'shown' });
});

app.post('/api/app/quit', (req, res) => {
  appEvents.emit('quit-app');
  res.json({ ok: true, status: 'quitting' });
});

app.post('/api/tts/stop', (req, res) => {
  io.emit('stop-tts');
  res.json({ ok: true, stopped: true });
});

app.post('/api/tts/skip', (req, res) => {
  io.emit('skip-tts');
  res.json({ ok: true, skipped: true });
});

// Tikfinity / External TikTok Webhook Bridge
app.post(['/api/tikfinity', '/api/tiktok/webhook'], (req, res) => {
  try {
    const data = req.body || {};
    const username = data.username || data.nickname || data.user || 'TikTokUser';
    const text = data.comment || data.message || data.text || '';
    const avatar = data.avatar || data.profilePictureUrl || '';
    const giftName = data.giftName || data.gift || '';
    const count = parseInt(data.giftCount || data.count || 1, 10);

    if (giftName) {
      const normalized = {
        id: `tt_tf_gift_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        platform: 'tiktok',
        user: {
          name: username,
          displayName: username,
          color: '#25F4EE',
          avatar,
          badges: [],
          isMod: false,
          isSub: false,
          isOwner: false,
          isVip: false
        },
        message: `¡Ha enviado ${count}x ${giftName}!`,
        formattedMessage: `🎁 <strong>¡Ha enviado ${count}x ${giftName}</strong>`,
        type: 'gift',
        extra: { giftName, giftCount: count },
        timestamp: Date.now()
      };
      io.emit('chat-message', normalized);
      return res.json({ ok: true, received: 'gift' });
    }

    if (text) {
      const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const normalized = {
        id: `tt_tf_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        platform: 'tiktok',
        user: {
          name: username,
          displayName: username,
          color: '#FE2C55',
          avatar,
          badges: [],
          isMod: false,
          isSub: false,
          isOwner: false,
          isVip: false
        },
        message: text,
        formattedMessage: escaped,
        type: 'chat',
        timestamp: Date.now()
      };
      io.emit('chat-message', normalized);
      return res.json({ ok: true, received: 'chat' });
    }

    res.status(400).json({ error: 'No message or gift provided' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function sanitizeTtsNumbers(raw) {
  if (!raw) return '';
  let str = raw;
  // 1. Normalize thousand separators (e.g. "10.000.000" or "10,000,000" -> 10000000)
  str = str.replace(/\b\d{1,3}(?:[.,]\d{3})+\b/g, m => m.replace(/[.,]/g, ''));
  // 2. Cap individual numbers up to 10,000,000 (10 millones)
  str = str.replace(/\b\d+\b/g, m => {
    if (m.length > 8) return '10000000';
    const val = parseInt(m, 10);
    if (isNaN(val)) return m;
    if (val > 10000000) return '10000000';
    return String(val);
  });
  // 3. Reduce lists/sequences of spaced numbers
  str = str.replace(/(?:\b\d+\b[\s,.-]+){3,}\b\d+\b/g, m => {
    const p = m.split(/[\s,.-]+/).filter(Boolean);
    return p.slice(0, 3).join(' ');
  });
  // 4. Limit accumulated digits to 18
  let count = 0;
  str = str.replace(/\d+/g, m => {
    if (count >= 18) return '';
    if (count + m.length > 18) {
      const keep = m.slice(0, Math.max(0, 18 - count));
      count = 18;
      return keep;
    }
    count += m.length;
    return m;
  });
  return str.trim();
}

// TTS Speech Audio Endpoint with High-Definition Streamer Voices & Accents
app.get('/api/tts', async (req, res) => {
  try {
    const rawText = sanitizeTtsNumbers((req.query.text || '').toString().slice(0, 250).trim());
    let voice = (req.query.voice || req.query.lang || 'es_mx_002').toString().trim();
    const shouldTranslate = req.query.translate === '1' || req.query.translate === 'true';

    if (!rawText) return res.status(400).send('No text provided');

    // Compatibility map for old lang codes to real neural voices
    const VOICE_MAP = {
      'es': 'es_mx_002',       // Latino / México
      'es-ES': 'es_002',       // España
      'es_es': 'es_002',
      'es_mx': 'es_mx_002',
      'en': 'en_us_001',       // English
      'en-US': 'en_us_001',
      'en-GB': 'en_male_narration',
      'pt': 'br_005',          // Portugués
      'fr': 'fr_001',
      'de': 'de_001',
      'de-DE': 'de_001',
      'ru': 'ru_001',
      'ru-RU': 'ru_001',
      'hi': 'google_hi',
      'hi-IN': 'google_hi',
      'ja': 'jp_001'
    };

    if (VOICE_MAP[voice]) {
      voice = VOICE_MAP[voice];
    }

    let speechText = rawText;

    // Optional translation to match target voice language
    if (shouldTranslate) {
      let targetLang = 'es';
      if (voice.startsWith('en_') && voice !== 'enrique') targetLang = 'en';
      else if (voice.startsWith('br_') || voice.startsWith('pt')) targetLang = 'pt';
      else if (voice.startsWith('fr_')) targetLang = 'fr';
      else if (voice.startsWith('de_') || voice === 'google_de') targetLang = 'de';
      else if (voice.startsWith('jp_') || voice.startsWith('ja')) targetLang = 'ja';
      else if (voice.startsWith('ru_') || voice === 'google_ru') targetLang = 'ru';
      else if (voice.startsWith('hi') || voice === 'google_hi' || voice.includes('_in_')) targetLang = 'hi';

      try {
        const transRes = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(rawText)}`, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });
        if (transRes.ok) {
          const transData = await transRes.json();
          if (transData && transData[0] && Array.isArray(transData[0])) {
            speechText = transData[0].map(part => part[0]).join('');
          }
        }
      } catch (transErr) {
        console.warn('[TTS] Translation fallback:', transErr.message);
      }
    }

    // 1. Fish Audio Character Voices (Rick Sanchez Latino, Goku Latino)
    const FISH_MODELS = {
      'rick_latino': 'f75ae6efbe9945c19be01e233e045d0e', // Rick Sanchez (científico más inteligente de toda la galaxia)
      'rick_sanchez': 'f75ae6efbe9945c19be01e233e045d0e',
      'goku_latino': '9f850ee9ada24b20a6866825eaefd3f8'  // Goku (Mario Castañeda DBZ)
    };

    if (FISH_MODELS[voice]) {
      const DEFAULT_FISH_KEY = 'sk-fish-TCVJK8dpgPADjTHb9FGQPHpNCM_n_cKetZEtfSc2ZCE';
      const fishApiKey = (config.overlay && config.overlay.fishApiKey && config.overlay.fishApiKey.trim()) || DEFAULT_FISH_KEY;
      const modelId = FISH_MODELS[voice];
      try {
        const fishRes = await fetch('https://api.fish.audio/v1/tts', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + fishApiKey,
            'Content-Type': 'application/json',
            'model': 's2.1-pro-free'
          },
          body: JSON.stringify({
            text: speechText.slice(0, 250),
            reference_id: modelId,
            format: 'mp3',
            model: 's2.1-pro-free'
          })
        });

        if (fishRes.ok) {
          res.setHeader('Content-Type', 'audio/mpeg');
          res.setHeader('Cache-Control', 'no-cache');
          const arrayBuf = await fishRes.arrayBuffer();
          return res.send(Buffer.from(arrayBuf));
        } else {
          console.warn('[TTS] Fish Audio status error:', fishRes.status);
        }
      } catch (fishErr) {
        console.warn('[TTS] Fish Audio error:', fishErr.message);
      }
      voice = 'es_mx_002'; // Fallback to Mexican voice if Fish Audio fails
    }

    // 2. Enrique Voice (Classic Streamer Amazon Polly voice)
    if (voice === 'enrique' || voice === 'polly_enrique') {
      try {
        const postData = `msg=${encodeURIComponent(speechText.slice(0, 250))}&lang=Enrique&source=ttsmp3`;
        const ttsRes = await fetch('https://ttsmp3.com/makemp3_new.php', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
          },
          body: postData
        });

        if (ttsRes.ok) {
          const ttsData = await ttsRes.json();
          if (ttsData && ttsData.URL) {
            const mp3Res = await fetch(ttsData.URL, {
              headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
            });
            if (mp3Res.ok) {
              res.setHeader('Content-Type', 'audio/mpeg');
              res.setHeader('Cache-Control', 'no-cache');
              const arrayBuf = await mp3Res.arrayBuffer();
              return res.send(Buffer.from(arrayBuf));
            }
          }
        }
      } catch (enriqueErr) {
        console.warn('[TTS] Enrique voice error, trying fallback:', enriqueErr.message);
      }
      voice = 'es_002'; // Fallback to Spanish male
    }

    // 2. High-Definition Streamer Voice API (TikTok Neural Voices)
    if (!voice.startsWith('google_')) {
      try {
        const ttRes = await fetch('https://tiktok-tts.weilnet.workers.dev/api/generation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: speechText.slice(0, 180), voice: voice })
        });
        if (ttRes.ok) {
          const ttData = await ttRes.json();
          if (ttData.success && ttData.data) {
            const buffer = Buffer.from(ttData.data, 'base64');
            res.setHeader('Content-Type', 'audio/mpeg');
            res.setHeader('Cache-Control', 'no-cache');
            return res.send(buffer);
          }
        }
      } catch (ttErr) {
        console.warn('[TTS] Primary voice engine failed, using fallback:', ttErr.message);
      }
    }

    // 3. Fallback to Google Translate TTS
    let gLang = 'es';
    if (voice === 'es_002' || voice === 'google_es_es' || voice === 'enrique') gLang = 'es-ES';
    else if (voice.startsWith('en_') && voice !== 'enrique') gLang = 'en';
    else if (voice.startsWith('br_') || voice.startsWith('pt')) gLang = 'pt';
    else if (voice.startsWith('fr_') || voice === 'google_fr') gLang = 'fr';
    else if (voice.startsWith('de_') || voice === 'google_de') gLang = 'de';
    else if (voice.startsWith('jp_') || voice.startsWith('ja')) gLang = 'ja';
    else if (voice.startsWith('ru_') || voice === 'google_ru') gLang = 'ru';
    else if (voice.startsWith('hi') || voice === 'google_hi' || voice.includes('_in_')) gLang = 'hi';

    const gUrl = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${encodeURIComponent(gLang)}&q=${encodeURIComponent(speechText.slice(0, 180))}`;
    const gRes = await fetch(gUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });

    if (gRes.ok) {
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Cache-Control', 'no-cache');
      const arrayBuf = await gRes.arrayBuffer();
      return res.send(Buffer.from(arrayBuf));
    }

    res.status(502).send('Error generating TTS');
  } catch (err) {
    console.error('[TTS] Error generating speech:', err.message);
    res.status(500).send('TTS server error');
  }
});

// Platform connectors
const connectors = {
  twitch: new TwitchConnector(),
  kick: new KickConnector(),
  youtube: new YouTubeConnector(),
  tiktok: new TikTokConnector()
};

const statuses = {
  twitch: { status: 'disconnected', error: null },
  kick: { status: 'disconnected', error: null },
  youtube: { status: 'disconnected', error: null },
  tiktok: { status: 'disconnected', error: null }
};

// Wire up connectors
for (const [platform, connector] of Object.entries(connectors)) {
  connector.on('message', (msg) => {
    // Filter banned words if configured
    if (config.overlay.bannedWords && config.overlay.bannedWords.length > 0) {
      const isFiltered = filterMessage(msg, config.overlay.bannedWords);
      if (isFiltered.blocked) return;
      msg.message = isFiltered.text;
      msg.formattedMessage = isFiltered.formatted;
      if (isFiltered.hasBannedWord) {
        msg.containsBannedWord = true;
      }
    }

    io.emit('chat-message', msg);
  });

  connector.on('status', (data) => {
    statuses[platform] = { status: data.status, error: data.error };
    io.emit('status-update', { platform, status: data.status, error: data.error });
  });
}

function normalizeTextForFilter(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function filterMessage(msg, bannedWords) {
  let text = msg.message || '';
  let formatted = msg.formattedMessage || text;
  let blocked = false;
  let hasBannedWord = false;

  for (const rawWord of bannedWords) {
    if (!rawWord || !rawWord.trim()) continue;
    const cleanWord = normalizeTextForFilter(rawWord.trim());
    if (!cleanWord) continue;

    // Pattern allowing repeated letters and optional spaces/symbols between letters
    const charPatterns = cleanWord.split('').map(c => escapeRegExp(c) + '+');
    const flexiblePattern = charPatterns.join('[\\s._-]*');

    // Accent and leetspeak tolerant regex
    const accentSafePattern = cleanWord.split('').map(c => {
      if (c === 'a') return '[aáàäâ4@]';
      if (c === 'e') return '[eéèëê3]';
      if (c === 'i') return '[iíìïî1!]';
      if (c === 'o') return '[oóòöô0]';
      if (c === 'u') return '[uúùüû]';
      if (c === 's') return '[s$5]';
      return escapeRegExp(c);
    }).map(p => p + '+').join('[\\s._-]*');

    const censorRegex = new RegExp(`(?:^|\\W)(${accentSafePattern})(?=\\W|$)`, 'gi');
    const replaceRegex = new RegExp(accentSafePattern, 'gi');

    const normText = normalizeTextForFilter(text);
    if (censorRegex.test(text) || new RegExp(`(?:^|\\W)(${flexiblePattern})(?=\\W|$)`, 'gi').test(normText) || normText.includes(cleanWord)) {
      hasBannedWord = true;
      text = text.replace(replaceRegex, '***');
      formatted = formatted.replace(replaceRegex, '***');
    }
  }

  return { blocked, text, formatted, hasBannedWord };
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Socket.io handlers
io.on('connection', (socket) => {
  // Send current state to newly connected client
  socket.emit('config-update', config);
  socket.emit('status-all', statuses);

  // Client requests config update
  socket.on('update-config', (newConfig) => {
    try {
      config = saveConfig(newConfig);
      io.emit('config-update', config);
      applyPlatformConnections();
    } catch (err) {
      socket.emit('error-msg', 'Error al guardar la configuración');
    }
  });

  // Client manually triggers connection for a platform
  socket.on('toggle-platform', ({ platform, enabled, value }) => {
    if (config.platforms[platform]) {
      config.platforms[platform].enabled = enabled;
      if (value !== undefined) {
        if (platform === 'youtube') config.platforms.youtube.query = value;
        else if (platform === 'tiktok') config.platforms.tiktok.username = value;
        else config.platforms[platform].channel = value;
      }
      config = saveConfig(config);
      io.emit('config-update', config);
      applyPlatformConnection(platform);
    }
  });

  // Client sends test message
  socket.on('send-test-message', (data) => {
    const testMsg = createTestMessage(data.platform || 'twitch', data.text, data.user);
    io.emit('chat-message', testMsg);
  });

  // Client clears overlay chat
  socket.on('clear-chat', () => {
    io.emit('clear-chat');
  });

  // Stop current audio and clear full TTS queue
  socket.on('stop-tts', () => {
    io.emit('stop-tts');
  });

  // Skip current playing audio only
  socket.on('skip-tts', () => {
    io.emit('skip-tts');
  });
});

function applyPlatformConnection(platform) {
  const pConfig = config.platforms[platform];
  const connector = connectors[platform];
  if (!connector || !pConfig) return;

  if (pConfig.enabled) {
    if (platform === 'twitch' && pConfig.channel) {
      connector.connect(pConfig.channel);
    } else if (platform === 'kick' && pConfig.channel) {
      connector.connect(pConfig.channel);
    } else if (platform === 'youtube' && pConfig.query) {
      connector.connect(pConfig.query);
    } else if (platform === 'tiktok' && pConfig.username) {
      connector.connect(pConfig.username);
    } else {
      connector.disconnect();
    }
  } else {
    connector.disconnect();
  }
}

function applyPlatformConnections() {
  for (const platform of Object.keys(connectors)) {
    applyPlatformConnection(platform);
  }
}

function createTestMessage(platform, customText, customUser) {
  const testUsers = {
    twitch: {
      name: customUser || 'TwitchGamer',
      displayName: customUser || 'TwitchGamer',
      color: '#9146FF',
      avatar: 'https://static-cdn.jtvnw.net/jtv_user_pictures/9194fe99-31c3-4a19-93de-ec99dc83f73c-profile_image-300x300.png',
      badges: [{ type: 'broadcaster', label: 'Streamer' }, { type: 'moderator', label: 'Mod' }, { type: 'subscriber', label: 'Sub' }],
      isOwner: true,
      isSub: true,
      isMod: true,
      isVip: false
    },
    kick: {
      name: customUser || 'KickLegend',
      displayName: customUser || 'KickLegend',
      color: '#53FC18',
      avatar: 'https://files.kick.com/images/user/52910800/profile_image/conversion/d7459e3e-8bf3-42fc-be63-e223c728c1b6-fullsize.webp',
      badges: [{ type: 'verified', label: 'Verificado' }, { type: 'subscriber', label: 'Sub' }],
      isOwner: false,
      isSub: true,
      isMod: false,
      isVip: false
    },
    youtube: {
      name: customUser || 'SuperFanYT',
      displayName: customUser || 'SuperFanYT',
      color: '#FF0000',
      avatar: 'https://yt3.ggpht.com/a/default-user=s88-c-k-c0x00ffffff-no-rj',
      badges: [{ type: 'subscriber', label: 'Miembro' }],
      isOwner: false,
      isSub: true,
      isMod: false,
      isVip: false
    },
    tiktok: {
      name: customUser || 'TikTokerPro',
      displayName: customUser || 'TikTokerPro',
      color: '#FE2C55',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
      badges: [{ type: 'subscriber', label: 'Sub' }],
      isOwner: false,
      isSub: true,
      isMod: false,
      isVip: false
    }
  };

  const sampleTexts = {
    twitch: '¡Hola a todos! Qué buen directo bro PogChamp 🔥',
    kick: '¡Wenas! El stream en Kick va con todo 🟢🚀',
    youtube: '¡Saludos desde México! Dejen su like gente 👍✨',
    tiktok: '¡Qué buen contenido! Te dejé mis tap taps ❤️🎁'
  };

  const user = testUsers[platform] || testUsers.twitch;
  const msgText = customText || sampleTexts[platform] || 'Mensaje de prueba multistream';

  return {
    id: `test_${platform}_${Date.now()}`,
    platform,
    user,
    message: msgText,
    formattedMessage: msgText,
    type: 'chat',
    timestamp: Date.now()
  };
}

const PORT = config.port || 3333;

function startServer(port = PORT) {
  return new Promise((resolve, reject) => {
    if (server.listening) {
      return resolve(server);
    }

    server.listen(port, () => {
      console.log(`====================================================`);
      console.log(`🚀 MULTICAT STREAM OVERLAY ACTIVO`);
      console.log(`💻 Panel de Control:   http://localhost:${port}`);
      console.log(`📺 URL para OBS:       http://localhost:${port}/overlay`);
      console.log(`====================================================`);

      // Auto-connect configured platforms
      applyPlatformConnections();
      resolve(server);
    });

    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`[Server] Puerto ${port} ya está en uso.`);
        resolve(server);
      } else {
        reject(err);
      }
    });
  });
}

if (require.main === module) {
  startServer().catch(console.error);
}

module.exports = { app, server, io, startServer, applyPlatformConnections, appEvents };
