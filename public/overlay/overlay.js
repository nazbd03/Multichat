(function () {
  const socket = io();
  const chatContainer = document.getElementById('chat-container');

  // Immediately load saved server configuration
  fetch('/api/config')
    .then(res => res.json())
    .then(cfg => applyConfig(cfg))
    .catch(() => {});

  let currentConfig = {
    theme: 'glassmorphism',
    fontSize: 16,
    messageDirection: 'bottom-up',
    maxMessages: 15,
    autoHideDelay: 15,
    animation: 'slide-left',
    exitAnimation: 'fade-out',
    cardOpacity: 85,
    borderRadius: 12,
    showPlatformBadge: true,
    showAvatar: true,
    showUserBadges: true,
    showTimestamp: false,
    soundEnabled: false,
    soundVolume: 50,
    ttsEnabled: false,
    ttsVolume: 80,
    ttsSpeed: 1.0,
    ttsRate: 1.0,
    ttsVoice: '',
    ttsCommandOnly: false,
    ttsCommand: '!tts',
    ttsPermissions: 'all',
    ttsAntiSpam: true,
    bannedWords: [],
    customTextColor: '#ffffff',
    customBorderSpeed: 'normal',
    textEffect: 'shadow',
    avatarShape: 'circle',
    messageGap: 'normal',
    messageFlash: true
  };

  const PLATFORM_ICONS = {
    twitch: '<svg viewBox="0 0 24 24"><path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z"/></svg>',
    youtube: '<svg viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>',
    kick: '<svg viewBox="0 0 24 24"><path d="M3 3h4.5v6.5h2V3h4.5v8.5l-4.5 4.5 5 8H9.5l-2.5-4.5V24H3V3z"/></svg>',
    tiktok: '<svg viewBox="0 0 24 24"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.97v7.86c-.01 2.37-.8 4.7-2.31 6.55-1.5 1.86-3.75 3.04-6.14 3.23-2.38.2-4.8-.46-6.68-1.92-1.89-1.47-3.03-3.69-3.14-6.1-.11-2.42.82-4.81 2.52-6.53 1.7-1.72 4.1-2.6 6.5-2.42.14 0 .28.01.42.02v4.06c-.45-.06-.91-.07-1.37-.02-1.3.14-2.49.91-3.07 2.06-.58 1.15-.46 2.55.3 3.6.76 1.05 2.07 1.63 3.36 1.48 1.3-.15 2.39-1.12 2.71-2.39.06-.24.08-.49.08-.74V.02z"/></svg>'
  };

  const PLATFORM_NAMES = {
    twitch: 'Twitch',
    youtube: 'YouTube',
    kick: 'Kick',
    tiktok: 'TikTok'
  };

  // Detect if running in preview iframe inside dashboard or preview mode
  const isPreview = (window.self !== window.top) || window.location.search.includes('preview');

  // Sound Synth via Web Audio API
  let audioCtx = null;
  function playNotificationSound(volumePercent) {
    if (isPreview) return; // Mute preview inside admin dashboard
    try {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }

      const now = audioCtx.currentTime;
      const gainNode = audioCtx.createGain();
      const vol = Math.max(0, Math.min(1, (volumePercent || 50) / 100));
      gainNode.gain.setValueAtTime(vol * 0.3, now);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      gainNode.connect(audioCtx.destination);

      const osc1 = audioCtx.createOscillator();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, now); // D5
      osc1.frequency.exponentialRampToValueAtTime(880, now + 0.15); // A5
      osc1.connect(gainNode);

      osc1.start(now);
      osc1.stop(now + 0.35);
    } catch (e) {
      console.warn('Audio playback error:', e);
    }
  }

  // Text-To-Speech (Strict Single-Stream Sequential Audio Queue)
  const ttsQueue = [];
  let isPlayingTts = false;
  const spokenMessageIds = new Set();
  let currentAudio = null;

  function processNextTts() {
    if (isPlayingTts || ttsQueue.length === 0) return;
    isPlayingTts = true;

    const item = ttsQueue.shift();
    const audio = new Audio(item.url);
    currentAudio = audio;
    const volume = Math.max(0, Math.min(1, (currentConfig.ttsVolume ?? 90) / 100));
    audio.volume = volume;
    const speed = Math.max(0.5, Math.min(2.5, parseFloat(currentConfig.ttsSpeed || currentConfig.ttsRate || 1.0)));
    audio.playbackRate = speed;

    const advance = () => {
      currentAudio = null;
      isPlayingTts = false;
      setTimeout(processNextTts, 150);
    };

    audio.onended = advance;
    audio.onerror = advance;

    audio.play().catch(() => {
      advance();
    });
  }

  function stopAndClearTts() {
    ttsQueue.length = 0;
    if (currentAudio) {
      try {
        currentAudio.pause();
        currentAudio.currentTime = 0;
        currentAudio.src = '';
      } catch (e) {}
      currentAudio = null;
    }
    isPlayingTts = false;
  }

  function skipCurrentTts() {
    if (currentAudio) {
      try {
        currentAudio.pause();
        currentAudio.currentTime = 0;
        currentAudio.src = '';
      } catch (e) {}
      currentAudio = null;
    }
    isPlayingTts = false;
    setTimeout(processNextTts, 80);
  }

  const recentSpokenTexts = new Map();

  function isDuplicateFlood(text) {
    const now = Date.now();
    const normalized = (text || '').toLowerCase().trim();
    if (!normalized) return false;
    if (recentSpokenTexts.has(normalized)) {
      const lastTime = recentSpokenTexts.get(normalized);
      if (now - lastTime < 12000) { // 12-second duplicate flood protection
        return true;
      }
    }
    recentSpokenTexts.set(normalized, now);
    if (recentSpokenTexts.size > 50) {
      for (const [k, t] of recentSpokenTexts.entries()) {
        if (now - t > 30000) recentSpokenTexts.delete(k);
      }
    }
    return false;
  }

  function cleanTtsSpam(rawText) {
    if (!rawText) return '';
    let text = rawText.trim();

    // 1. Remove URLs completely (http, https, www, discord.gg, etc.)
    text = text.replace(/(?:https?:\/\/|www\.)\S+/gi, '');
    text = text.replace(/\b[a-zA-Z0-9-]+\.(?:com|org|net|io|gg|tv|me|xyz|live|link)\S*/gi, '');

    // 2. Reduce excessive laughing spam: jajajajaja -> jaja, hahahahaha -> haha, xdxdxdxd -> xdxd
    text = text.replace(/(ja|je|ji|ha|he|hi|xd|lol){3,}/gi, '$1$1');

    // 3. Reduce character spam: e.g. "WWWWWWWWWW" -> "WW", "aaaaaa" -> "aa", "777777" -> "77"
    text = text.replace(/(.)\1{2,}/gu, '$1$1');

    // 4. Reduce repeated consecutive words: e.g. "hola hola hola hola hola" -> "hola hola"
    text = text.replace(/\b(\p{L}+)(?:\s+\1){2,}\b/giu, '$1 $1');

    // 5. Anti-Spam de números gigantescos y cadenas de números al azar:
    // a) Cortar números individuales excesivamente altos (más de 4 dígitos -> máx 3 cifras para evitar lecturas de billones)
    text = text.replace(/\d{5,}/g, (match) => match.slice(0, 3));

    // b) Cortar secuencias o listas de números al azar espaciados (ej: "1 2 3 4 5 6" o "94, 82, 10, 38")
    text = text.replace(/(?:\b\d{1,4}\b[\s,.-]+){2,}\b\d{1,4}\b/g, (match) => {
      const parts = match.split(/[\s,.-]+/).filter(Boolean);
      return parts.slice(0, 2).join(' ');
    });

    // c) Limitar total de dígitos acumulados en el mensaje a máximo 7 para bloquear flood de números al azar
    let accumulatedDigits = 0;
    text = text.replace(/\d+/g, (match) => {
      if (accumulatedDigits >= 7) return '';
      if (accumulatedDigits + match.length > 7) {
        const keep = match.slice(0, Math.max(0, 7 - accumulatedDigits));
        accumulatedDigits = 7;
        return keep;
      }
      accumulatedDigits += match.length;
      return match;
    });

    // d) Si el mensaje no contiene letras y eran puros números largos, limitar a 3 dígitos
    const hasLetters = /[a-zA-Z\u00C0-\u024F\u1E00-\u1EFF]/.test(text);
    if (!hasLetters && (text.match(/\d/g) || []).length > 3) {
      text = text.replace(/\D/g, '').slice(0, 3);
    }

    // 6. Clean unpronounceable symbols and non-speech clutter
    text = text.replace(/[^\p{L}\p{N}\s,!?¿¡]/gu, ' ').trim();

    // 7. Collapse multiple whitespace
    text = text.replace(/\s{2,}/g, ' ').trim();

    // 8. Limit max length to a sensible duration (e.g. 130 characters) so long copypastas are trimmed
    if (text.length > 130) {
      text = text.slice(0, 130).trim() + '...';
    }

    // 9. If after cleaning the text has no pronounceable words or letters, ignore
    if (!/[a-zA-Z0-9\u00C0-\u024F\u1E00-\u1EFF]/u.test(text)) {
      return '';
    }

    return text;
  }

  function containsBannedWord(text) {
    if (!currentConfig.bannedWords || !Array.isArray(currentConfig.bannedWords) || currentConfig.bannedWords.length === 0) {
      return false;
    }
    const cleanMsg = (text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    for (const rawWord of currentConfig.bannedWords) {
      if (!rawWord || !rawWord.trim()) continue;
      const cleanWord = rawWord.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (!cleanWord) continue;

      if (cleanMsg.includes(cleanWord)) return true;

      const charPatterns = cleanWord.split('').map(c => escapeRegExp(c) + '+');
      const pattern = charPatterns.join('[\\s._-]*');
      const regex = new RegExp(`(?:^|\\W)(${pattern})(?=\\W|$)`, 'i');
      if (regex.test(cleanMsg)) return true;
    }
    return false;
  }

  function speakMessage(msgId, username, text) {
    if (isPreview || !currentConfig.ttsEnabled) return;
    if (msgId && spokenMessageIds.has(msgId)) return;

    // Do not speak if message contains banned words
    if (containsBannedWord(text)) return;

    // Anti-spam cleanup
    let clean = text;
    if (currentConfig.ttsAntiSpam !== false) {
      clean = cleanTtsSpam(text);
      if (!clean) return;
      if (isDuplicateFlood(clean)) return;
    } else {
      clean = text
        .replace(/https?:\/\/\S+/gi, '')
        .replace(/[^\p{L}\p{N}\s,!?¿¡]/gu, '')
        .trim();
      if (!clean) return;
    }

    if (msgId) {
      spokenMessageIds.add(msgId);
      if (spokenMessageIds.size > 200) {
        const firstKey = spokenMessageIds.values().next().value;
        spokenMessageIds.delete(firstKey);
      }
    }

    const phrase = currentConfig.ttsReadUsername !== false
      ? `${username} dice: ${clean}`
      : clean;

    const voice = currentConfig.ttsLang || 'es_mx_002';
    const translateParam = currentConfig.ttsTranslate ? '&translate=1' : '';
    const url = `/api/tts?voice=${encodeURIComponent(voice)}${translateParam}&text=${encodeURIComponent(phrase.slice(0, 190))}`;

    ttsQueue.push({ url, text: phrase });
    processNextTts();
  }

  function checkTtsPermissions(user) {
    const perm = currentConfig.ttsPermissions || 'all';
    if (perm === 'all') return true;
    if (!user) return false;

    const isOwner = Boolean(user.isOwner);
    const isMod = Boolean(user.isMod);
    const isSub = Boolean(user.isSub);

    // Streamer / Owner can always use TTS
    if (isOwner) return true;

    if (perm === 'owner') return false;
    if (perm === 'mods') return isMod;
    if (perm === 'subs') return isSub;
    if (perm === 'mods_subs') return isMod || isSub;

    return true;
  }

  function getTtsMessageText(rawText) {
    if (!rawText) return null;
    const text = rawText.trim();
    const commandOnly = Boolean(currentConfig.ttsCommandOnly);
    const cmd = (currentConfig.ttsCommand || '!tts').trim();

    if (commandOnly) {
      if (!cmd) return text;
      // Case-insensitive check
      if (!text.toLowerCase().startsWith(cmd.toLowerCase())) {
        return null;
      }
      // Strip command prefix
      const afterCmd = text.slice(cmd.length).trim();
      return afterCmd.length > 0 ? afterCmd : null;
    } else {
      // If not command-only, but user typed the command, strip it so it doesn't say "!tts"
      if (cmd && text.toLowerCase().startsWith(cmd.toLowerCase())) {
        const afterCmd = text.slice(cmd.length).trim();
        return afterCmd.length > 0 ? afterCmd : text;
      }
      return text;
    }
  }

  function hexToRgba(hex, alpha = 1) {
    if (!hex) return `rgba(0, 0, 0, ${alpha})`;
    let c = hex.replace('#', '');
    if (c.length === 3) c = c.split('').map(x => x + x).join('');
    const num = parseInt(c, 16);
    if (isNaN(num)) return `rgba(0, 0, 0, ${alpha})`;
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  // Apply configuration to DOM
  function applyConfig(cfg) {
    if (!cfg) return;
    currentConfig = { ...currentConfig, ...cfg.overlay };

    const root = document.documentElement;

    // Apply Theme and Unique Modifiers
    const isCustom = Boolean(currentConfig.customThemeEnabled || currentConfig.theme === 'custom');
    const borderAnim = (currentConfig.customBorderAnim || 'rotating').replace(/_/g, '-');
    const borderStyle = (currentConfig.customBorderStyle || 'neon').replace(/_/g, '-');
    const borderSpeed = (currentConfig.customBorderSpeed || 'normal').replace(/_/g, '-');
    const textEffect = (currentConfig.textEffect || 'shadow').replace(/_/g, '-');
    const avatarShape = (currentConfig.avatarShape || 'circle').replace(/_/g, '-');
    const messageGap = (currentConfig.messageGap || 'normal').replace(/_/g, '-');
    const isMulti = currentConfig.customBorderMulticolor !== false;

    const commonClasses = `text-effect-${textEffect} avatar-shape-${avatarShape} message-gap-${messageGap}`;

    if (isCustom) {
      document.body.className = `theme-custom border-anim-${borderAnim} border-style-${borderStyle} border-speed-${borderSpeed} ${isMulti ? 'border-multicolor-active' : ''} ${commonClasses}`;

      const rawBg = currentConfig.customBgColor || '#000000';
      const opacity = (currentConfig.cardOpacity ?? 85) / 100;
      const bColor1 = currentConfig.customBorderColor || '#ff1244';
      const bColor2 = currentConfig.customBorderColor2 || '#00f0ff';
      const bWidth = parseFloat(currentConfig.customBorderWidth || 2.5);

      root.style.setProperty('--custom-raw-bg', rawBg);
      root.style.setProperty('--custom-bg-color', hexToRgba(rawBg, opacity));
      root.style.setProperty('--custom-border-color', bColor1);
      root.style.setProperty('--custom-border-color2', bColor2);
      root.style.setProperty('--custom-border-width', `${bWidth}px`);
      root.style.setProperty('--custom-glow-1', hexToRgba(bColor1, 0.5));
      root.style.setProperty('--custom-glow-2', hexToRgba(bColor2, 0.4));

      const textColor = currentConfig.customTextColor || '#ffffff';
      root.style.setProperty('--custom-text-color', textColor);

      if (isMulti) {
        root.style.setProperty('--custom-gradient-stops', `${bColor1} 0%, ${bColor1} 25%, ${bColor2} 75%, ${bColor1} 100%`);
      } else {
        root.style.setProperty('--custom-gradient-stops', `${bColor1} 0%, transparent 40%, ${bColor1} 80%`);
      }
    } else {
      document.body.className = `theme-${(currentConfig.theme || 'glassmorphism').replace(/_/g, '-')} ${commonClasses}`;
    }

    // Apply CSS Variables
    if (currentConfig.fontFamily) {
      root.style.setProperty('--chat-font-family', currentConfig.fontFamily);
      document.body.style.fontFamily = currentConfig.fontFamily;
    }
    root.style.setProperty('--chat-font-size', `${currentConfig.fontSize || 16}px`);
    root.style.setProperty('--chat-card-opacity', `${(currentConfig.cardOpacity ?? 85) / 100}`);
    root.style.setProperty('--chat-border-radius', `${currentConfig.borderRadius ?? 12}px`);

    // Direction
    if (currentConfig.messageDirection === 'top-down') {
      chatContainer.classList.add('direction-top-down');
    } else {
      chatContainer.classList.remove('direction-top-down');
    }
  }

  // Create message element
  function createMessageElement(msg) {
    const card = document.createElement('div');
    const flashClass = currentConfig.messageFlash ? ' flash-on-arrival' : '';
    card.className = `chat-message platform-${msg.platform} anim-${currentConfig.animation || 'slide-left'}${flashClass}`;
    card.id = `msg-${msg.id}`;

    if (msg.type === 'gift') card.classList.add('is-gift');
    if (msg.type === 'superchat') card.classList.add('is-superchat');
    if (msg.type === 'subscription') card.classList.add('is-sub');

    // 1. Avatar
    if (currentConfig.showAvatar) {
      const avatarWrap = document.createElement('div');
      avatarWrap.className = 'chat-avatar-container';

      let avatarUrl = (msg.user.avatar || '').trim();
      if (avatarUrl.startsWith('//')) {
        avatarUrl = 'https:' + avatarUrl;
      }

      const userName = msg.user.displayName || msg.user.name || 'User';

      if (avatarUrl && avatarUrl.startsWith('http')) {
        const img = document.createElement('img');
        img.className = 'chat-avatar';
        img.src = avatarUrl;
        img.alt = userName;
        img.loading = 'eager';
        img.decoding = 'async';
        img.onerror = () => {
          img.remove();
          avatarWrap.appendChild(createMonogram(userName, msg.user.color));
        };
        avatarWrap.appendChild(img);
      } else {
        avatarWrap.appendChild(createMonogram(userName, msg.user.color));
      }

      card.appendChild(avatarWrap);
    }

    // 2. Content wrapper
    const content = document.createElement('div');
    content.className = 'chat-content';

    // 2.1 Header
    const header = document.createElement('div');
    header.className = 'chat-header';

    // Platform Badge
    if (currentConfig.showPlatformBadge) {
      const pBadge = document.createElement('span');
      pBadge.className = `platform-badge ${msg.platform}`;
      pBadge.innerHTML = `${PLATFORM_ICONS[msg.platform] || ''} <span>${PLATFORM_NAMES[msg.platform] || msg.platform}</span>`;
      header.appendChild(pBadge);
    }

    // User Badges
    if (currentConfig.showUserBadges && Array.isArray(msg.user.badges)) {
      for (const b of msg.user.badges) {
        const uBadge = document.createElement('span');
        uBadge.className = `user-badge ${b.type}`;
        uBadge.textContent = b.label || b.type;
        header.appendChild(uBadge);
      }
    }

    // Username
    const userSpan = document.createElement('span');
    userSpan.className = 'chat-username';
    userSpan.style.color = msg.user.color || '#38bdf8';
    userSpan.textContent = msg.user.displayName || msg.user.name;
    header.appendChild(userSpan);

    // Timestamp
    if (currentConfig.showTimestamp) {
      const timeSpan = document.createElement('span');
      timeSpan.className = 'chat-timestamp';
      const d = new Date(msg.timestamp || Date.now());
      timeSpan.textContent = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
      header.appendChild(timeSpan);
    }

    content.appendChild(header);

    // 2.2 Special Event Highlight (Gift/Superchat)
    if (msg.type === 'superchat' && msg.extra?.amount) {
      const scBadge = document.createElement('div');
      scBadge.className = 'chat-special-badge';
      scBadge.textContent = `SuperChat: ${msg.extra.amount}`;
      content.appendChild(scBadge);
    }

    // 2.3 Body (Message text)
    const body = document.createElement('div');
    body.className = 'chat-body';
    body.innerHTML = msg.formattedMessage || escapeHtml(msg.message);
    content.appendChild(body);

    card.appendChild(content);

    // Auto-hide timeout
    const delay = parseInt(currentConfig.autoHideDelay, 10);
    if (!isNaN(delay) && delay > 0) {
      setTimeout(() => {
        removeMessageWithExitAnim(card);
      }, delay * 1000);
    }

    return card;
  }

  function removeMessageWithExitAnim(element) {
    if (!element || element.dataset.exiting) return;
    element.dataset.exiting = 'true';
    const exitAnim = currentConfig.exitAnimation || 'fade-out';
    element.classList.add(`exit-${exitAnim}`);
    element.classList.add('fade-out');
    setTimeout(() => {
      if (element.parentNode) {
        element.parentNode.removeChild(element);
      }
    }, 460);
  }

  function createMonogram(name, color) {
    const el = document.createElement('div');
    el.className = 'chat-avatar-fallback';
    const cleanName = (name || '?').trim();
    const colors = ['#6366f1', '#ec4899', '#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4'];
    let bg = color;
    if (!bg || bg.toLowerCase() === '#ffffff' || bg.toLowerCase() === '#000000') {
      let hash = 0;
      for (let i = 0; i < cleanName.length; i++) hash += cleanName.charCodeAt(i);
      bg = colors[Math.abs(hash) % colors.length];
    }
    el.style.backgroundColor = bg;
    el.textContent = cleanName.charAt(0).toUpperCase();
    return el;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function escapeRegExp(string) {
    return (string || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Socket Events
  socket.on('config-update', (cfg) => {
    applyConfig(cfg);
  });

  socket.on('chat-message', (msg) => {
    // Avoid rendering phantom blank cards if message is completely empty
    if (msg.type === 'chat' && !msg.formattedMessage && !msg.message) {
      return;
    }

    const element = createMessageElement(msg);
    if (!element) return;

    if (currentConfig.messageDirection === 'top-down') {
      chatContainer.insertBefore(element, chatContainer.firstChild);
    } else {
      chatContainer.appendChild(element);
    }

    // Prune excessive messages with exit animation
    const max = currentConfig.maxMessages || 15;
    const getActiveMessages = () => Array.from(chatContainer.children).filter(el => !el.dataset.exiting);
    while (getActiveMessages().length > max) {
      const active = getActiveMessages();
      const toRemove = currentConfig.messageDirection === 'top-down' ? active[active.length - 1] : active[0];
      if (toRemove) {
        removeMessageWithExitAnim(toRemove);
      } else {
        break;
      }
    }

    // Sound alert
    if (currentConfig.soundEnabled) {
      playNotificationSound(currentConfig.soundVolume);
    }

    // TTS (Filtered by roles, banned words, spam protection and optional command)
    if (currentConfig.ttsEnabled && (msg.type === 'chat' || msg.type === 'superchat')) {
      if (!msg.containsBannedWord && !containsBannedWord(msg.message)) {
        if (checkTtsPermissions(msg.user)) {
          const textToSpeak = getTtsMessageText(msg.message);
          if (textToSpeak && !containsBannedWord(textToSpeak)) {
            speakMessage(msg.id, msg.user.displayName || msg.user.name, textToSpeak);
          }
        }
      }
    }
  });

  socket.on('clear-chat', () => {
    chatContainer.innerHTML = '';
  });

  // TTS Queue controls from dashboard or shortcut
  socket.on('stop-tts', () => {
    stopAndClearTts();
  });

  socket.on('skip-tts', () => {
    skipCurrentTts();
  });
})();
