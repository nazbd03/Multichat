(function () {
  const socket = io();

  // Elements
  const obsUrlDisplay = document.getElementById('obs-url-display');
  const btnCopyObs = document.getElementById('btn-copy-obs');
  const btnClearChat = document.getElementById('btn-clear-chat');
  const toast = document.getElementById('toast');

  // Platform inputs & buttons
  const platforms = {
    twitch: {
      input: document.getElementById('input-twitch-channel'),
      btn: document.getElementById('btn-toggle-twitch'),
      status: document.getElementById('status-twitch'),
      card: document.getElementById('card-twitch')
    },
    kick: {
      input: document.getElementById('input-kick-channel'),
      btn: document.getElementById('btn-toggle-kick'),
      status: document.getElementById('status-kick'),
      card: document.getElementById('card-kick')
    },
    youtube: {
      input: document.getElementById('input-youtube-query'),
      btn: document.getElementById('btn-toggle-youtube'),
      status: document.getElementById('status-youtube'),
      card: document.getElementById('card-youtube')
    },
    tiktok: {
      input: document.getElementById('input-tiktok-username'),
      btn: document.getElementById('btn-toggle-tiktok'),
      status: document.getElementById('status-tiktok'),
      card: document.getElementById('card-tiktok')
    }
  };

  // Settings elements
  const selectAppTheme = document.getElementById('select-app-theme');
  const settingTheme = document.getElementById('setting-theme');
  const settingFont = document.getElementById('setting-font');
  const settingFontSize = document.getElementById('setting-font-size');
  const valFontSize = document.getElementById('val-font-size');
  const settingCardOpacity = document.getElementById('setting-card-opacity');
  const valCardOpacity = document.getElementById('val-card-opacity');
  const settingBorderRadius = document.getElementById('setting-border-radius');
  const valBorderRadius = document.getElementById('val-border-radius');
  const settingAnimation = document.getElementById('setting-animation');
  const settingExitAnimation = document.getElementById('setting-exit-animation');
  const settingAutohide = document.getElementById('setting-autohide');
  const settingMaxMessages = document.getElementById('setting-max-messages');
  const valMaxMessages = document.getElementById('val-max-messages');
  const settingDirection = document.getElementById('setting-direction');
  const settingBannedWords = document.getElementById('setting-banned-words');

  // Custom Style elements
  const settingCustomThemeEnable = document.getElementById('setting-custom-theme-enable');
  const panelCustomStyle = document.getElementById('panel-custom-style');
  const customPreviewCard = document.getElementById('custom-preview-card');
  const settingCustomBgColor = document.getElementById('setting-custom-bg-color');
  const settingCustomBgColorText = document.getElementById('setting-custom-bg-color-text');
  const settingCustomTextColor = document.getElementById('setting-custom-text-color');
  const settingCustomTextColorText = document.getElementById('setting-custom-text-color-text');
  const settingCustomBorderMulticolor = document.getElementById('setting-custom-border-multicolor');
  const wrapBorderColor2 = document.getElementById('wrap-border-color-2');
  const settingCustomBorderColor = document.getElementById('setting-custom-border-color');
  const settingCustomBorderColorText = document.getElementById('setting-custom-border-color-text');
  const settingCustomBorderColor2 = document.getElementById('setting-custom-border-color2');
  const settingCustomBorderColor2Text = document.getElementById('setting-custom-border-color2-text');
  const settingCustomBorderAnim = document.getElementById('setting-custom-border-anim');
  const settingCustomBorderStyle = document.getElementById('setting-custom-border-style');
  const settingCustomBorderWidth = document.getElementById('setting-custom-border-width');
  const valCustomBorderWidth = document.getElementById('val-custom-border-width');
  const settingCustomBorderSpeed = document.getElementById('setting-custom-border-speed');
  const settingTextEffect = document.getElementById('setting-text-effect');
  const settingAvatarShape = document.getElementById('setting-avatar-shape');
  const settingMessageGap = document.getElementById('setting-message-gap');
  const settingMessageFlash = document.getElementById('setting-message-flash');

  const settingShowPlatformBadge = document.getElementById('setting-show-platform-badge');
  const settingShowAvatar = document.getElementById('setting-show-avatar');
  const settingShowUserBadges = document.getElementById('setting-show-user-badges');
  const settingShowTimestamp = document.getElementById('setting-show-timestamp');
  const settingSoundEnabled = document.getElementById('setting-sound-enabled');
  const settingTtsEnabled = document.getElementById('setting-tts-enabled');
  const settingTtsReadUsername = document.getElementById('setting-tts-read-username');
  const settingTtsTranslate = document.getElementById('setting-tts-translate');
  const settingTtsPermissions = document.getElementById('setting-tts-permissions');
  const settingTtsCommandOnly = document.getElementById('setting-tts-command-only');
  const settingTtsCommand = document.getElementById('setting-tts-command');
  const wrapTtsCommand = document.getElementById('wrap-tts-command');
  const settingTtsAntiSpam = document.getElementById('setting-tts-anti-spam');
  const settingTtsLang = document.getElementById('setting-tts-lang');
  const settingTtsVolume = document.getElementById('setting-tts-volume');
  const valTtsVolume = document.getElementById('val-tts-volume');
  const settingTtsSpeed = document.getElementById('setting-tts-speed');
  const valTtsSpeed = document.getElementById('val-tts-speed');
  const btnTestTts = document.getElementById('btn-test-tts');
  const btnSkipTts = document.getElementById('btn-skip-tts');
  const btnStopTts = document.getElementById('btn-stop-tts');

  const SAMPLE_PHRASES = {
    'rick_latino': '¡Wubba Lubba Dub Dub! Soy Rick Sanchez, el científico más inteligente de toda la galaxia.',
    'goku_latino': '¡Hola a todos! Soy Goku, gracias por venir al directo amigos.',
    'es_mx_002': '¡Qué onda compas! Esta es la voz con acento de México y Latinoamérica.',
    'enrique': '¡Hola a todos! Soy Enrique, la voz clásica española para tus directos.',
    'es_002': '¡Hola chavales! Esta es la voz masculina con acento de España.',
    'es_female_f6': 'Hola a todos, esta es la voz femenina en español.',
    'es_male_m3': 'Atención a todos, esta es la voz grave y profunda de locutor.',
    'en_male_narration': 'In a world of streamers, this is the epic movie trailer voice.',
    'en_us_001': 'Hey everyone! This is the viral TikTok Jessie voice.',
    'en_us_006': 'What is up guys? This is the Joey American voice.',
    'br_001': 'Olá galera! Esta é a voz brasileira feminina.',
    'br_005': 'Olá galera! Esta é a voz brasileira masculina.',
    'fr_001': 'Bonjour à tous, ceci est la voix française de Paris.',
    'de_001': 'Hallo zusammen! Dies ist die deutsche weibliche Stimme.',
    'de_002': 'Hallo Freunde! Dies ist die deutsche männliche Stimme.',
    'google_de': 'Hallo, das ist die klassische deutsche Google-Stimme.',
    'ru_001': 'Привет всем! Это русская озвучка для стрима.',
    'google_ru': 'Привет, это классический русский голос Google.',
    'google_hi': 'नमस्ते दोस्तों! यह हिंदी और भारतीय आवाज का परीक्षण है।',
    'en_in_001': 'Hello friends! This is the Indian English accent voice test.',
    'jp_001': 'みなさんこんにちは！アニメ音声テストです。',
    'google_es': 'Hola, esta es la voz clásica de Google en español latino.',
    'google_es_es': 'Hola, esta es la voz clásica de Google en español de España.'
  };

  const btnSaveSettings = document.getElementById('btn-save-settings');

  // Test elements
  const testButtons = document.querySelectorAll('.btn-test');
  const inputCustomMsg = document.getElementById('input-custom-msg');
  const selectTestPlatform = document.getElementById('select-test-platform');
  const btnSendCustom = document.getElementById('btn-send-custom');

  let currentConfig = null;

  // App Theme Switcher (4 Themes: midnight, cyberpunk, purple, minecraft)
  function applyAppTheme(theme) {
    if (!theme) return;
    document.documentElement.setAttribute('data-app-theme', theme);
    if (selectAppTheme) selectAppTheme.value = theme;
    try {
      localStorage.setItem('multichat_app_theme', theme);
    } catch (e) {}
  }

  // Load saved app theme
  const savedAppTheme = localStorage.getItem('multichat_app_theme') || 'midnight';
  applyAppTheme(savedAppTheme);

  if (selectAppTheme) {
    selectAppTheme.addEventListener('change', () => {
      const selected = selectAppTheme.value;
      applyAppTheme(selected);
      if (currentConfig) {
        liveUpdateConfig();
      }
      const themeName = selectAppTheme.options[selectAppTheme.selectedIndex]?.text || selected;
      showToast(`Tema del panel cambiado: ${themeName}`);
    });
  }

  // Set OBS URL correctly based on current window location
  const obsUrl = `${window.location.protocol}//${window.location.host}/overlay`;
  obsUrlDisplay.textContent = obsUrl;

  // Copy OBS URL
  btnCopyObs.addEventListener('click', () => {
    navigator.clipboard.writeText(obsUrl).then(() => {
      showToast('¡URL de OBS copiada al portapapeles!');
    }).catch(() => {
      showToast('URL: ' + obsUrl);
    });
  });

  // Hide App to System Tray (Second Plane)
  const btnHideApp = document.getElementById('btn-hide-app');
  if (btnHideApp) {
    btnHideApp.addEventListener('click', async () => {
      showToast('Ocultando ventana a segundo plano...');
      try {
        await fetch('/api/app/hide', { method: 'POST' });
      } catch (err) {
        console.warn('Error ocultando ventana:', err);
      }
    });
  }

  // Range Slider Visual Feedbacks
  settingFontSize.addEventListener('input', () => {
    valFontSize.textContent = `${settingFontSize.value}px`;
    liveUpdateConfig();
  });

  settingCardOpacity.addEventListener('input', () => {
    valCardOpacity.textContent = `${settingCardOpacity.value}%`;
    liveUpdateConfig();
  });

  settingBorderRadius.addEventListener('input', () => {
    valBorderRadius.textContent = `${settingBorderRadius.value}px`;
    liveUpdateConfig();
  });

  settingMaxMessages.addEventListener('input', () => {
    valMaxMessages.textContent = settingMaxMessages.value;
    liveUpdateConfig();
  });

  if (settingTtsVolume) {
    settingTtsVolume.addEventListener('input', () => {
      valTtsVolume.textContent = `${settingTtsVolume.value}%`;
      liveUpdateConfig();
    });
  }

  if (settingTtsSpeed) {
    settingTtsSpeed.addEventListener('input', () => {
      valTtsSpeed.textContent = `${parseFloat(settingTtsSpeed.value).toFixed(2)}x`;
      liveUpdateConfig();
    });
  }

  if (btnTestTts) {
    btnTestTts.addEventListener('click', () => {
      const voice = settingTtsLang ? settingTtsLang.value : 'es_mx_002';
      const volume = settingTtsVolume ? (parseInt(settingTtsVolume.value, 10) / 100) : 0.9;
      const speed = settingTtsSpeed ? parseFloat(settingTtsSpeed.value) || 1.0 : 1.0;
      const testPhrase = SAMPLE_PHRASES[voice] || SAMPLE_PHRASES['es_mx_002'];
      const testText = (settingTtsReadUsername && settingTtsReadUsername.checked)
        ? `Streamer dice: ${testPhrase}`
        : testPhrase;
      const audio = new Audio(`/api/tts?voice=${encodeURIComponent(voice)}&t=${Date.now()}&text=${encodeURIComponent(testText)}`);
      audio.volume = Math.max(0, Math.min(1, volume));
      audio.playbackRate = Math.max(0.5, Math.min(2.5, speed));
      audio.play().catch(e => console.error('Error playing test TTS:', e));
      const selectedOptionText = settingTtsLang.options[settingTtsLang.selectedIndex]?.text || voice;
      showToast(`🔊 Probando: ${selectedOptionText}`);
    });
  }

  // Selects & Checkboxes live change
  [
    settingTheme, settingFont, settingAnimation, settingExitAnimation, settingAutohide,
    settingDirection, settingShowPlatformBadge, settingShowAvatar,
    settingShowUserBadges, settingShowTimestamp, settingSoundEnabled,
    settingTtsEnabled, settingTtsReadUsername, settingTtsTranslate, settingTtsLang,
    settingTtsPermissions, settingTtsCommandOnly, settingTtsAntiSpam,
    settingCustomBorderSpeed, settingTextEffect, settingAvatarShape,
    settingMessageGap, settingMessageFlash
  ].forEach(elem => {
    if (elem) {
      elem.addEventListener('change', () => {
        if (wrapTtsCommand && settingTtsCommandOnly) {
          wrapTtsCommand.style.opacity = settingTtsCommandOnly.checked ? '1' : '0.5';
        }
        updateCustomPreview();
        liveUpdateConfig();
      });
    }
  });

  // TTS Queue Controls (Stop all / Skip current)
  if (btnStopTts) {
    btnStopTts.addEventListener('click', () => {
      socket.emit('stop-tts');
      showToast('⏹️ Audios detenidos y cola limpiada');
    });
  }

  if (btnSkipTts) {
    btnSkipTts.addEventListener('click', () => {
      socket.emit('skip-tts');
      showToast('⏭️ Audio saltado al siguiente');
    });
  }

  if (settingTtsCommand) {
    settingTtsCommand.addEventListener('input', () => {
      liveUpdateConfig();
    });
  }

  // Custom Style Toggles & Synchronization
  if (settingTheme) {
    settingTheme.addEventListener('change', () => {
      const isCustom = settingTheme.value === 'custom';
      if (settingCustomThemeEnable) settingCustomThemeEnable.checked = isCustom;
      if (panelCustomStyle) panelCustomStyle.style.display = isCustom ? 'block' : 'none';
      updateCustomPreview();
      liveUpdateConfig();
    });
  }

  if (settingCustomThemeEnable) {
    settingCustomThemeEnable.addEventListener('change', () => {
      const isCustom = settingCustomThemeEnable.checked;
      if (settingTheme) {
        if (isCustom) {
          settingTheme.value = 'custom';
        } else {
          settingTheme.value = (currentConfig?.overlay?.theme && currentConfig.overlay.theme !== 'custom')
            ? currentConfig.overlay.theme
            : 'neon_red_cyan';
        }
      }
      if (panelCustomStyle) panelCustomStyle.style.display = isCustom ? 'block' : 'none';
      updateCustomPreview();
      liveUpdateConfig();
    });
  }

  if (settingCustomBorderMulticolor) {
    settingCustomBorderMulticolor.addEventListener('change', () => {
      if (wrapBorderColor2) wrapBorderColor2.style.display = settingCustomBorderMulticolor.checked ? 'flex' : 'none';
      updateCustomPreview();
      liveUpdateConfig();
    });
  }

  // Color Pickers <-> Hex Inputs sync
  function syncColorPair(picker, textInput) {
    if (!picker || !textInput) return;
    picker.addEventListener('input', () => {
      textInput.value = picker.value.toUpperCase();
      updateCustomPreview();
      liveUpdateConfig();
    });
    textInput.addEventListener('input', () => {
      let val = textInput.value.trim();
      if (!val.startsWith('#')) val = '#' + val;
      if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
        picker.value = val;
        updateCustomPreview();
        liveUpdateConfig();
      }
    });
  }

  syncColorPair(settingCustomBgColor, settingCustomBgColorText);
  syncColorPair(settingCustomTextColor, settingCustomTextColorText);
  syncColorPair(settingCustomBorderColor, settingCustomBorderColorText);
  syncColorPair(settingCustomBorderColor2, settingCustomBorderColor2Text);

  if (settingCustomBorderAnim) {
    settingCustomBorderAnim.addEventListener('change', () => {
      updateCustomPreview();
      liveUpdateConfig();
    });
  }

  if (settingCustomBorderStyle) {
    settingCustomBorderStyle.addEventListener('change', () => {
      updateCustomPreview();
      liveUpdateConfig();
    });
  }

  if (settingCustomBorderWidth) {
    settingCustomBorderWidth.addEventListener('input', () => {
      if (valCustomBorderWidth) valCustomBorderWidth.textContent = `${settingCustomBorderWidth.value}px`;
      updateCustomPreview();
      liveUpdateConfig();
    });
  }

  function updateCustomPreview() {
    if (!customPreviewCard) return;

    const bg = settingCustomBgColor ? settingCustomBgColor.value : '#000000';
    const textColor = settingCustomTextColor ? settingCustomTextColor.value : '#ffffff';
    const isMulti = settingCustomBorderMulticolor ? settingCustomBorderMulticolor.checked : true;
    const c1 = settingCustomBorderColor ? settingCustomBorderColor.value : '#ff1244';
    const c2 = settingCustomBorderColor2 ? settingCustomBorderColor2.value : '#00f0ff';
    const anim = settingCustomBorderAnim ? settingCustomBorderAnim.value : 'rotating';
    const style = settingCustomBorderStyle ? settingCustomBorderStyle.value : 'neon';
    const bWidth = settingCustomBorderWidth ? settingCustomBorderWidth.value : '2.5';
    const radius = settingBorderRadius ? settingBorderRadius.value : '12';

    customPreviewCard.style.borderRadius = `${radius}px`;

    if (anim === 'rotating') {
      customPreviewCard.style.border = `${bWidth}px solid transparent`;
      customPreviewCard.style.background = `linear-gradient(${bg}, ${bg}) padding-box, linear-gradient(135deg, ${c1} 0%, ${isMulti ? c2 : c1} 100%) border-box`;
    } else if (anim === 'rainbow_wave') {
      customPreviewCard.style.border = `${bWidth}px solid transparent`;
      customPreviewCard.style.background = `linear-gradient(${bg}, ${bg}) padding-box, linear-gradient(135deg, #ff0055, #ff7700, #ffee00, #00ff66, #00f0ff, #7700ff) border-box`;
    } else if (anim === 'fire_glow') {
      customPreviewCard.style.border = `${bWidth}px solid #ff2200`;
      customPreviewCard.style.background = bg;
    } else if (anim === 'cyber_glitch' || anim === 'breathe_dual' || anim === 'pulse') {
      customPreviewCard.style.border = `${bWidth}px solid ${c1}`;
      customPreviewCard.style.background = bg;
    } else {
      // static
      if (isMulti) {
        customPreviewCard.style.border = `${bWidth}px solid transparent`;
        customPreviewCard.style.background = `linear-gradient(${bg}, ${bg}) padding-box, linear-gradient(135deg, ${c1} 0%, ${c2} 100%) border-box`;
      } else {
        customPreviewCard.style.border = `${bWidth}px solid ${c1}`;
        customPreviewCard.style.background = bg;
      }
    }

    if (style === 'neon') {
      customPreviewCard.style.outline = 'none';
      customPreviewCard.style.boxShadow = `0 4px 20px rgba(0,0,0,0.85), 0 0 14px ${c1}99, 0 0 20px ${c2}66`;
    } else if (style === 'double_neon') {
      customPreviewCard.style.outline = `${Math.max(1.5, bWidth * 0.7)}px solid ${c2}`;
      customPreviewCard.style.outlineOffset = '3px';
      customPreviewCard.style.boxShadow = `0 0 16px ${c1}88, 0 0 24px ${c2}66, 0 4px 20px rgba(0,0,0,0.9)`;
    } else if (style === 'minecraft_block') {
      customPreviewCard.style.borderRadius = '0px';
      customPreviewCard.style.border = `${bWidth}px solid #373737`;
      customPreviewCard.style.borderColor = '#8f8f8f #373737 #373737 #8f8f8f';
      customPreviewCard.style.outline = 'none';
      customPreviewCard.style.boxShadow = '3px 3px 0px #1a1a1a';
    } else if (style === 'minecraft_dirt') {
      customPreviewCard.style.borderRadius = '0px';
      customPreviewCard.style.backgroundColor = '#573d26';
      customPreviewCard.style.backgroundImage = "url('/overlay/textures/minecraft_dirt.svg')";
      customPreviewCard.style.backgroundSize = '48px 48px';
      customPreviewCard.style.backgroundRepeat = 'repeat';
      customPreviewCard.style.border = '4px solid #2b1d12';
      customPreviewCard.style.borderTop = '4px solid #7cb342';
      customPreviewCard.style.borderBottom = '4px solid #1a110a';
      customPreviewCard.style.outline = 'none';
      customPreviewCard.style.boxShadow = '4px 4px 0px #110b06';
    } else if (style === 'minecraft_diamond') {
      customPreviewCard.style.borderRadius = '0px';
      customPreviewCard.style.border = `${bWidth}px solid #00aaaa`;
      customPreviewCard.style.borderColor = '#55ffff #00aaaa #00aaaa #55ffff';
      customPreviewCard.style.outline = 'none';
      customPreviewCard.style.boxShadow = '0 0 14px rgba(85, 255, 255, 0.6), 3px 3px 0px #004444';
    } else if (style === 'minecraft_gui') {
      customPreviewCard.style.borderRadius = '0px';
      customPreviewCard.style.background = '#c6c6c6';
      customPreviewCard.style.borderTop = `${bWidth}px solid #ffffff`;
      customPreviewCard.style.borderLeft = `${bWidth}px solid #ffffff`;
      customPreviewCard.style.borderRight = `${bWidth}px solid #555555`;
      customPreviewCard.style.borderBottom = `${bWidth}px solid #555555`;
      customPreviewCard.style.outline = 'none';
      customPreviewCard.style.boxShadow = '3px 3px 0px #000000';
    } else if (style === 'holographic') {
      customPreviewCard.style.outline = 'none';
      customPreviewCard.style.boxShadow = `0 0 12px rgba(255,0,255,0.45), 0 0 20px rgba(0,255,255,0.45), 0 0 28px rgba(255,255,0,0.3)`;
    } else if (style === 'gradient_soft') {
      customPreviewCard.style.border = 'none';
      customPreviewCard.style.outline = 'none';
      customPreviewCard.style.boxShadow = `0 0 22px ${c1}aa, 0 0 40px ${c2}88, 0 8px 30px rgba(0,0,0,0.95)`;
    } else {
      customPreviewCard.style.outline = 'none';
      customPreviewCard.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.6)';
    }

    const previewUser = customPreviewCard.querySelector('.preview-username');
    if (previewUser) previewUser.style.color = c1;

    const previewMessage = customPreviewCard.querySelector('.preview-message-text');
    if (previewMessage) {
      previewMessage.style.color = textColor;
      const effect = settingTextEffect ? settingTextEffect.value : 'shadow';
      if (effect === 'shadow') {
        previewMessage.style.textShadow = '0 2px 4px rgba(0,0,0,0.95), 0 0 3px #000';
      } else if (effect === 'minecraft_shadow') {
        previewMessage.style.textShadow = '2px 2px 0px #3f3f3f';
      } else if (effect === 'neon_glow') {
        previewMessage.style.textShadow = `0 0 6px #fff, 0 0 14px ${c1}`;
      } else if (effect === 'retro_stroke') {
        previewMessage.style.textShadow = '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000';
      } else {
        previewMessage.style.textShadow = 'none';
      }
    }

    const previewAvatar = customPreviewCard.querySelector('.preview-avatar');
    if (previewAvatar) {
      previewAvatar.style.backgroundColor = c1;
      previewAvatar.style.borderColor = isMulti ? c2 : c1;
      previewAvatar.style.boxShadow = `0 0 8px ${isMulti ? c2 : c1}99`;
      const shape = settingAvatarShape ? settingAvatarShape.value : 'circle';
      if (shape === 'squircle') {
        previewAvatar.style.borderRadius = '10px';
        previewAvatar.style.clipPath = 'none';
        previewAvatar.style.transform = 'none';
      } else if (shape === 'minecraft_skin') {
        previewAvatar.style.borderRadius = '0px';
        previewAvatar.style.clipPath = 'none';
        previewAvatar.style.transform = 'none';
        previewAvatar.style.border = '2px solid #555555';
        previewAvatar.style.boxShadow = '2px 2px 0px rgba(0, 0, 0, 0.85)';
      } else if (shape === 'hexagon') {
        previewAvatar.style.clipPath = 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)';
        previewAvatar.style.borderRadius = '0';
        previewAvatar.style.transform = 'none';
      } else if (shape === 'rounded_diamond') {
        previewAvatar.style.borderRadius = '6px';
        previewAvatar.style.transform = 'rotate(45deg)';
        previewAvatar.style.clipPath = 'none';
      } else {
        previewAvatar.style.borderRadius = '50%';
        previewAvatar.style.clipPath = 'none';
        previewAvatar.style.transform = 'none';
      }
    }
  }

  // Save Settings button
  btnSaveSettings.addEventListener('click', () => {
    sendFullConfig();
    showToast('Configuración guardada correctamente');
  });

  // Platform Connect / Disconnect Buttons
  for (const [platform, pElems] of Object.entries(platforms)) {
    pElems.btn.addEventListener('click', () => {
      if (!currentConfig) return;
      const pConfig = currentConfig.platforms[platform];
      const isCurrentlyEnabled = pConfig?.enabled;
      const willEnable = !isCurrentlyEnabled;

      let value = '';
      if (platform === 'youtube') value = pElems.input.value.trim();
      else if (platform === 'tiktok') value = pElems.input.value.trim();
      else value = pElems.input.value.trim();

      if (willEnable && !value) {
        alert(`Por favor ingresa el canal o usuario para ${platform.toUpperCase()}`);
        pElems.input.focus();
        return;
      }

      socket.emit('toggle-platform', {
        platform,
        enabled: willEnable,
        value
      });
    });

    // Enter key inside inputs triggers connect
    pElems.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        pElems.btn.click();
      }
    });
  }

  // Simulator Test Buttons
  testButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const p = btn.getAttribute('data-platform');
      socket.emit('send-test-message', { platform: p });
    });
  });

  // Custom Message Sender
  btnSendCustom.addEventListener('click', sendCustomTest);
  inputCustomMsg.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendCustomTest();
  });

  function sendCustomTest() {
    const text = inputCustomMsg.value.trim();
    if (!text) return;
    const platform = selectTestPlatform.value;
    socket.emit('send-test-message', {
      platform,
      text,
      user: 'StreamerVIP'
    });
    inputCustomMsg.value = '';
  }

  // Clear Chat Button
  btnClearChat.addEventListener('click', () => {
    socket.emit('clear-chat');
    showToast('Chat del overlay limpiado');
  });

  // Socket: Config Update
  socket.on('config-update', (config) => {
    currentConfig = config;
    populateUI(config);
  });

  // Socket: Status Update
  socket.on('status-update', (data) => {
    updatePlatformStatus(data.platform, data.status, data.error);
  });

  socket.on('status-all', (allStatuses) => {
    for (const [plat, data] of Object.entries(allStatuses)) {
      updatePlatformStatus(plat, data.status, data.error);
    }
  });

  function populateUI(config) {
    if (!config) return;

    if (config.appTheme) {
      applyAppTheme(config.appTheme);
    }

    // Platform Fields
    if (config.platforms) {
      if (config.platforms.twitch) {
        platforms.twitch.input.value = config.platforms.twitch.channel || '';
        updatePlatformBtnState('twitch', config.platforms.twitch.enabled);
      }
      if (config.platforms.kick) {
        platforms.kick.input.value = config.platforms.kick.channel || '';
        updatePlatformBtnState('kick', config.platforms.kick.enabled);
      }
      if (config.platforms.youtube) {
        platforms.youtube.input.value = config.platforms.youtube.query || '';
        updatePlatformBtnState('youtube', config.platforms.youtube.enabled);
      }
      if (config.platforms.tiktok) {
        platforms.tiktok.input.value = config.platforms.tiktok.username || '';
        updatePlatformBtnState('tiktok', config.platforms.tiktok.enabled);
      }
    }

    // Overlay Fields
    if (config.overlay) {
      const o = config.overlay;
      settingTheme.value = o.theme || 'glassmorphism';
      settingFont.value = o.fontFamily || "'Inter', sans-serif";
      settingFontSize.value = o.fontSize || 16;
      valFontSize.textContent = `${settingFontSize.value}px`;

      settingCardOpacity.value = o.cardOpacity ?? 85;
      valCardOpacity.textContent = `${settingCardOpacity.value}%`;

      settingBorderRadius.value = o.borderRadius ?? 12;
      valBorderRadius.textContent = `${settingBorderRadius.value}px`;

      settingAnimation.value = o.animation || 'slide-left';
      if (settingExitAnimation) settingExitAnimation.value = o.exitAnimation || 'fade-out';
      settingAutohide.value = o.autoHideDelay ?? 15;
      settingMaxMessages.value = o.maxMessages || 15;
      valMaxMessages.textContent = settingMaxMessages.value;
      settingDirection.value = o.messageDirection || 'bottom-up';

      settingShowPlatformBadge.checked = Boolean(o.showPlatformBadge);
      settingShowAvatar.checked = Boolean(o.showAvatar);
      settingShowUserBadges.checked = Boolean(o.showUserBadges);
      settingShowTimestamp.checked = Boolean(o.showTimestamp);
      settingSoundEnabled.checked = Boolean(o.soundEnabled);
      settingTtsEnabled.checked = o.ttsEnabled !== false;
      if (settingTtsReadUsername) settingTtsReadUsername.checked = o.ttsReadUsername !== false;
      if (settingTtsTranslate) settingTtsTranslate.checked = Boolean(o.ttsTranslate);
      if (settingTtsPermissions) settingTtsPermissions.value = o.ttsPermissions || 'all';
      if (settingTtsCommandOnly) {
        settingTtsCommandOnly.checked = Boolean(o.ttsCommandOnly);
        if (wrapTtsCommand) wrapTtsCommand.style.opacity = settingTtsCommandOnly.checked ? '1' : '0.5';
      }
      if (settingTtsCommand) settingTtsCommand.value = o.ttsCommand || '!tts';
      if (settingTtsAntiSpam) settingTtsAntiSpam.checked = o.ttsAntiSpam !== false;
      if (settingTtsLang) {
        const legacyMap = {
          'es': 'es_mx_002',
          'es-ES': 'es_002',
          'en': 'en_us_001',
          'en-GB': 'en_male_narration',
          'pt': 'br_005',
          'fr': 'fr_001',
          'ja': 'jp_001'
        };
        const voiceVal = legacyMap[o.ttsLang] || o.ttsLang || 'es_mx_002';
        settingTtsLang.value = voiceVal;
        if (!settingTtsLang.value) settingTtsLang.value = 'es_mx_002';
      }
      if (settingTtsVolume) {
        settingTtsVolume.value = o.ttsVolume || 90;
        valTtsVolume.textContent = `${settingTtsVolume.value}%`;
      }
      if (settingTtsSpeed) {
        const spd = o.ttsSpeed ?? 1.0;
        settingTtsSpeed.value = spd;
        valTtsSpeed.textContent = `${parseFloat(spd).toFixed(2)}x`;
      }

      if (Array.isArray(o.bannedWords)) {
        settingBannedWords.value = o.bannedWords.join(', ');
      }

      // Custom Style Fields
      const isCustom = Boolean(o.customThemeEnabled || o.theme === 'custom');
      if (settingCustomThemeEnable) {
        settingCustomThemeEnable.checked = isCustom;
      }
      if (panelCustomStyle) {
        panelCustomStyle.style.display = isCustom ? 'block' : 'none';
      }
      if (isCustom) {
        settingTheme.value = 'custom';
      }

      if (settingCustomBgColor) {
        const bg = o.customBgColor || '#000000';
        settingCustomBgColor.value = bg;
        if (settingCustomBgColorText) settingCustomBgColorText.value = bg.toUpperCase();
      }

      if (settingCustomTextColor) {
        const tc = o.customTextColor || '#ffffff';
        settingCustomTextColor.value = tc;
        if (settingCustomTextColorText) settingCustomTextColorText.value = tc.toUpperCase();
      }

      if (settingCustomBorderMulticolor) {
        settingCustomBorderMulticolor.checked = o.customBorderMulticolor !== false;
        if (wrapBorderColor2) {
          wrapBorderColor2.style.display = settingCustomBorderMulticolor.checked ? 'flex' : 'none';
        }
      }

      if (settingCustomBorderColor) {
        const bc1 = o.customBorderColor || '#ff1244';
        settingCustomBorderColor.value = bc1;
        if (settingCustomBorderColorText) settingCustomBorderColorText.value = bc1.toUpperCase();
      }

      if (settingCustomBorderColor2) {
        const bc2 = o.customBorderColor2 || '#00f0ff';
        settingCustomBorderColor2.value = bc2;
        if (settingCustomBorderColor2Text) settingCustomBorderColor2Text.value = bc2.toUpperCase();
      }

      if (settingCustomBorderAnim) {
        settingCustomBorderAnim.value = o.customBorderAnim || 'rotating';
      }

      if (settingCustomBorderStyle) {
        settingCustomBorderStyle.value = o.customBorderStyle || 'neon';
      }

      if (settingCustomBorderSpeed) {
        settingCustomBorderSpeed.value = o.customBorderSpeed || 'normal';
      }

      if (settingCustomBorderWidth) {
        settingCustomBorderWidth.value = o.customBorderWidth ?? 2.5;
        if (valCustomBorderWidth) valCustomBorderWidth.textContent = `${settingCustomBorderWidth.value}px`;
      }

      if (settingTextEffect) {
        settingTextEffect.value = o.textEffect || 'shadow';
      }

      if (settingAvatarShape) {
        settingAvatarShape.value = o.avatarShape || 'circle';
      }

      if (settingMessageGap) {
        settingMessageGap.value = o.messageGap || 'normal';
      }

      if (settingMessageFlash) {
        settingMessageFlash.checked = o.messageFlash !== false;
      }

      updateCustomPreview();
    }
  }

  function updatePlatformBtnState(platform, isEnabled) {
    const p = platforms[platform];
    if (!p) return;
    if (isEnabled) {
      p.btn.textContent = 'Desconectar';
      p.btn.classList.add('is-connected');
    } else {
      p.btn.textContent = 'Conectar';
      p.btn.classList.remove('is-connected');
    }
  }

  function updatePlatformStatus(platform, status, error) {
    const p = platforms[platform];
    if (!p) return;

    p.status.className = `status-indicator ${status}`;
    const label = p.status.querySelector('.label');

    if (status === 'connected') {
      label.textContent = 'En vivo';
      p.status.title = 'Conectado al chat en vivo';
    } else if (status === 'connecting') {
      label.textContent = 'Conectando...';
      p.status.title = 'Estableciendo conexión...';
    } else if (status === 'offline') {
      label.textContent = error || 'No en vivo';
      p.status.title = 'El canal no está transmitiendo en vivo actualmente. Se conectará automáticamente cuando inicies directo.';
    } else if (status === 'error') {
      label.textContent = error ? (error.length > 26 ? error.slice(0, 24) + '...' : error) : 'Error';
      p.status.title = error || 'Error de conexión';
    } else {
      label.textContent = 'Desconectado';
      p.status.title = 'Desconectado';
    }
  }

  function liveUpdateConfig() {
    if (!currentConfig) return;
    gatherAndSendConfig(false);
  }

  function sendFullConfig() {
    gatherAndSendConfig(true);
  }

  function gatherAndSendConfig(shouldToast) {
    const bannedWordsArr = settingBannedWords.value
      .split(',')
      .map(w => w.trim())
      .filter(w => w.length > 0);

    const isCustom = Boolean(settingCustomThemeEnable && settingCustomThemeEnable.checked);
    const activeAppTheme = selectAppTheme ? selectAppTheme.value : (localStorage.getItem('multichat_app_theme') || 'midnight');

    const updatedConfig = {
      ...currentConfig,
      appTheme: activeAppTheme,
      overlay: {
        ...currentConfig.overlay,
        theme: isCustom ? 'custom' : settingTheme.value,
        customThemeEnabled: isCustom,
        customBgColor: settingCustomBgColor ? settingCustomBgColor.value : '#000000',
        customTextColor: settingCustomTextColor ? settingCustomTextColor.value : '#ffffff',
        customBorderMulticolor: settingCustomBorderMulticolor ? settingCustomBorderMulticolor.checked : true,
        customBorderColor: settingCustomBorderColor ? settingCustomBorderColor.value : '#ff1244',
        customBorderColor2: settingCustomBorderColor2 ? settingCustomBorderColor2.value : '#00f0ff',
        customBorderAnim: settingCustomBorderAnim ? settingCustomBorderAnim.value : 'rotating',
        customBorderStyle: settingCustomBorderStyle ? settingCustomBorderStyle.value : 'neon',
        customBorderSpeed: settingCustomBorderSpeed ? settingCustomBorderSpeed.value : 'normal',
        customBorderWidth: settingCustomBorderWidth ? parseFloat(settingCustomBorderWidth.value) : 2.5,
        textEffect: settingTextEffect ? settingTextEffect.value : 'shadow',
        avatarShape: settingAvatarShape ? settingAvatarShape.value : 'circle',
        messageGap: settingMessageGap ? settingMessageGap.value : 'normal',
        messageFlash: settingMessageFlash ? settingMessageFlash.checked : true,
        fontFamily: settingFont.value,
        fontSize: parseInt(settingFontSize.value, 10),
        cardOpacity: parseInt(settingCardOpacity.value, 10),
        borderRadius: parseInt(settingBorderRadius.value, 10),
        animation: settingAnimation.value,
        exitAnimation: settingExitAnimation ? settingExitAnimation.value : 'fade-out',
        autoHideDelay: parseInt(settingAutohide.value, 10),
        maxMessages: parseInt(settingMaxMessages.value, 10),
        messageDirection: settingDirection.value,
        showPlatformBadge: settingShowPlatformBadge.checked,
        showAvatar: settingShowAvatar.checked,
        showUserBadges: settingShowUserBadges.checked,
        showTimestamp: settingShowTimestamp.checked,
        soundEnabled: settingSoundEnabled.checked,
        ttsEnabled: settingTtsEnabled.checked,
        ttsReadUsername: settingTtsReadUsername ? settingTtsReadUsername.checked : true,
        ttsTranslate: settingTtsTranslate ? settingTtsTranslate.checked : false,
        ttsPermissions: settingTtsPermissions ? settingTtsPermissions.value : 'all',
        ttsCommandOnly: settingTtsCommandOnly ? settingTtsCommandOnly.checked : false,
        ttsCommand: settingTtsCommand ? settingTtsCommand.value.trim() || '!tts' : '!tts',
        ttsAntiSpam: settingTtsAntiSpam ? settingTtsAntiSpam.checked : true,
        ttsLang: settingTtsLang ? settingTtsLang.value : 'es_mx_002',
        fishApiKey: currentConfig.overlay?.fishApiKey || 'sk-fish-TCVJK8dpgPADjTHb9FGQPHpNCM_n_cKetZEtfSc2ZCE',
        ttsVolume: settingTtsVolume ? parseInt(settingTtsVolume.value, 10) : 90,
        ttsSpeed: settingTtsSpeed ? parseFloat(settingTtsSpeed.value) : 1.0,
        bannedWords: bannedWordsArr
      }
    };

    socket.emit('update-config', updatedConfig);
    if (shouldToast) {
      showToast('Configuración guardada');
    }
  }

  // Update Checker (GitHub Releases)
  const btnCheckUpdate = document.getElementById('btn-check-update');
  const updateBanner = document.getElementById('update-banner');
  const updateTitle = document.getElementById('update-title');
  const updateDesc = document.getElementById('update-desc');
  const btnDownloadUpdate = document.getElementById('btn-download-update');
  const btnDirectDownload = document.getElementById('btn-direct-download');
  const btnDismissUpdate = document.getElementById('btn-dismiss-update');

  if (btnDismissUpdate) {
    btnDismissUpdate.addEventListener('click', () => {
      if (updateBanner) updateBanner.style.display = 'none';
    });
  }

  // Socket listener for live progress
  socket.on('update-progress', (data) => {
    if (!btnDownloadUpdate) return;
    if (data.status === 'downloading') {
      const p = data.percent || 0;
      btnDownloadUpdate.textContent = `⏳ Descargando: ${p}%...`;
      btnDownloadUpdate.style.pointerEvents = 'none';
    } else if (data.status === 'applying') {
      btnDownloadUpdate.textContent = '🚀 Reiniciando aplicación...';
      showToast('Descarga completada al 100%. Aplicando actualización y reiniciando...');
    } else if (data.status === 'error') {
      btnDownloadUpdate.textContent = 'Actualizar y Reiniciar';
      btnDownloadUpdate.style.pointerEvents = 'auto';
      showToast('Error en actualización: ' + (data.error || 'Fallo desconocido'));
    }
  });

  let latestUpdateData = null;

  if (btnDownloadUpdate) {
    btnDownloadUpdate.addEventListener('click', async (e) => {
      e.preventDefault();
      if (!latestUpdateData) return;

      if (!latestUpdateData.hasExeAsset) {
        window.open(latestUpdateData.htmlUrl, '_blank');
        return;
      }

      btnDownloadUpdate.textContent = '⏳ Conectando...';
      btnDownloadUpdate.style.pointerEvents = 'none';
      showToast('Iniciando descarga... La app se reiniciará automáticamente al terminar.');

      try {
        const res = await fetch('/api/updates/download-and-apply', { method: 'POST' });
        const resData = await res.json();
        if (resData.ok) {
          showToast(resData.message || 'Actualización lista. Reiniciando...');
          btnDownloadUpdate.textContent = '🚀 Reiniciando app...';
        } else if (resData.requiresManualDownload) {
          window.open(resData.url, '_blank');
          btnDownloadUpdate.textContent = 'Actualizar y Reiniciar';
          btnDownloadUpdate.style.pointerEvents = 'auto';
        } else {
          showToast('Error: ' + (resData.error || 'No se pudo aplicar'));
          btnDownloadUpdate.textContent = 'Actualizar y Reiniciar';
          btnDownloadUpdate.style.pointerEvents = 'auto';
        }
      } catch (err) {
        showToast('Error de conexión con el actualizador');
        btnDownloadUpdate.textContent = 'Actualizar y Reiniciar';
        btnDownloadUpdate.style.pointerEvents = 'auto';
      }
    });
  }

  async function checkGithubUpdates(manual = false) {
    try {
      if (manual) showToast('Buscando actualizaciones...');
      const res = await fetch('/api/updates/check');
      const data = await res.json();
      latestUpdateData = data;

      if (data.updateAvailable) {
        if (updateBanner) {
          if (updateTitle) updateTitle.textContent = `🚀 ¡Nueva versión disponible: ${data.latestVersion}!`;
          if (updateDesc) updateDesc.textContent = `Tienes instalada la v${data.currentVersion}. Se actualizará este mismo ejecutable sin instaladores ni duplicados.`;
          if (btnDownloadUpdate) {
            btnDownloadUpdate.textContent = data.hasExeAsset ? 'Actualizar y Reiniciar' : 'Ver en GitHub';
            btnDownloadUpdate.style.pointerEvents = 'auto';
          }
          if (btnDirectDownload && data.downloadUrl) {
            btnDirectDownload.href = data.downloadUrl;
            btnDirectDownload.style.display = 'inline-block';
          }
          updateBanner.style.display = 'block';
        }
        if (manual) showToast(`¡Nueva versión ${data.latestVersion} disponible!`);
      } else {
        if (manual) {
          showToast(`Tienes la última versión (v${data.currentVersion})`);
        }
      }
    } catch (e) {
      if (manual) showToast('No se pudo verificar en GitHub');
    }
  }

  if (btnCheckUpdate) {
    btnCheckUpdate.addEventListener('click', () => checkGithubUpdates(true));
  }

  // Check automatically on load (after 2 seconds)
  setTimeout(() => checkGithubUpdates(false), 2000);
})();
