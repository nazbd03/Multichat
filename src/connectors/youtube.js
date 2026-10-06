const EventEmitter = require('events');
const { LiveChat } = require('youtube-chat');

class YouTubeConnector extends EventEmitter {
  constructor() {
    super();
    this.liveChat = null;
    this.query = '';
    this.status = 'disconnected';
    this.shouldReconnect = false;
    this.reconnectTimer = null;
  }

  parseQuery(input) {
    if (!input) return null;
    const str = input.trim();

    // Check full URLs
    // e.g. https://www.youtube.com/watch?v=xxxx
    const watchMatch = str.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/live\/)([a-zA-Z0-9_-]{11})/);
    if (watchMatch) {
      return { liveId: watchMatch[1] };
    }

    // Direct 11 char Video ID
    if (/^[a-zA-Z0-9_-]{11}$/.test(str)) {
      return { liveId: str };
    }

    // Direct Channel ID UC...
    if (/^UC[a-zA-Z0-9_-]{22}$/.test(str)) {
      return { channelId: str };
    }

    // Handle @channel or plain handle
    const handle = str.startsWith('@') ? str : `@${str}`;
    return { handle };
  }

  async connect(query, isBackgroundRetry = false) {
    if (!query) return;
    this.disconnect(false);

    this.query = query;
    this.shouldReconnect = true;
    if (!isBackgroundRetry) {
      this.setStatus('connecting');
    }

    const options = this.parseQuery(query);
    if (!options) {
      this.setStatus('error', 'Identificador de YouTube inválido');
      return;
    }

    try {
      this.liveChat = new LiveChat(options);

      this.liveChat.on('start', (liveId) => {
        console.log(`[YouTube] LiveChat iniciado para ID: ${liveId}`);
        this.setStatus('connected');
      });

      this.liveChat.on('chat', (chatItem) => {
        this.parseChatItem(chatItem);
      });

      this.liveChat.on('error', (err) => {
        console.error('[YouTube] Error:', err.message || err);
        const errMsg = err.message || 'Error en stream de YouTube';
        const isOffline = errMsg.includes('No se encontró') || errMsg.includes('not found') || errMsg.includes('offline');
        if (isOffline) {
          this.setStatus('offline', 'No en vivo (esperando directo)');
          if (this.shouldReconnect) {
            this.scheduleReconnect(35000, true);
          }
        } else {
          this.setStatus('error', errMsg);
          if (this.shouldReconnect) {
            this.scheduleReconnect(20000, false);
          }
        }
      });

      this.liveChat.on('end', (reason) => {
        console.log('[YouTube] Stream finalizado:', reason);
        if (this.status !== 'disconnected') {
          this.setStatus('offline', 'No en vivo (esperando directo)');
          if (this.shouldReconnect) {
            this.scheduleReconnect(35000, true);
          }
        }
      });

      const started = await this.liveChat.start();
      if (!started) {
        throw new Error('No se encontró una transmisión en vivo activa');
      }
    } catch (err) {
      const errMsg = err.message || '';
      const isOffline = errMsg.includes('No se encontró') || errMsg.includes('not found') || errMsg.includes('offline') || errMsg.includes('Live stream not found');
      if (isOffline) {
        console.log(`[YouTube] Canal no está en vivo actualmente para ${this.query}. Reintentando en segundo plano...`);
        this.setStatus('offline', 'No en vivo (esperando directo)');
        if (this.shouldReconnect) {
          this.scheduleReconnect(35000, true);
        }
      } else {
        console.error('[YouTube] Connection failed:', errMsg);
        this.setStatus('error', errMsg);
        if (this.shouldReconnect) {
          this.scheduleReconnect(20000, false);
        }
      }
    }
  }

  parseChatItem(item) {
    try {
      const author = item.author || {};
      const username = author.name || 'YouTubeUser';
      let avatar = '';
      if (author.thumbnail) {
        avatar = typeof author.thumbnail === 'string' ? author.thumbnail : (author.thumbnail.url || '');
      }
      if (!avatar && Array.isArray(author.thumbnails) && author.thumbnails.length > 0) {
        avatar = author.thumbnails[author.thumbnails.length - 1].url || '';
      }
      if (!avatar && item.authorPhoto?.thumbnails?.length > 0) {
        avatar = item.authorPhoto.thumbnails[item.authorPhoto.thumbnails.length - 1].url || '';
      }
      if (avatar && avatar.startsWith('//')) avatar = 'https:' + avatar;

      const isOwner = Boolean(author.badge && (author.badge.label === 'Owner' || author.badge.label === 'Propietario'));
      const isMod = Boolean(author.badge && (author.badge.label === 'Moderator' || author.badge.label === 'Moderador'));
      const isMember = Boolean(author.badge && (author.badge.label?.includes('Member') || author.badge.label?.includes('Miembro')));

      const badges = [];
      if (isOwner) badges.push({ type: 'broadcaster', label: 'Creador' });
      if (isMod) badges.push({ type: 'moderator', label: 'Mod' });
      if (isMember) badges.push({ type: 'subscriber', label: 'Miembro' });

      // Build message text & HTML with custom emojis
      let rawText = '';
      let formattedHtml = '';

      if (Array.isArray(item.message)) {
        for (const part of item.message) {
          if (part.text) {
            rawText += part.text;
            formattedHtml += escapeHtml(part.text);
          } else if (part.url) {
            rawText += part.alt || '[emoji]';
            formattedHtml += `<img class="chat-emote" src="${part.url}" alt="${escapeHtml(part.alt || '')}" title="${escapeHtml(part.alt || '')}" />`;
          }
        }
      } else if (typeof item.message === 'string') {
        rawText = item.message;
        formattedHtml = escapeHtml(item.message);
      }

      // Check if superchat
      const isSuperChat = item.superchat !== undefined;
      let superChatAmount = '';
      if (isSuperChat && item.superchat) {
        superChatAmount = item.superchat.amount || '';
      }

      const normalizedMsg = {
        id: item.id || `yt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        platform: 'youtube',
        user: {
          name: username,
          displayName: username,
          color: '#FF0000',
          avatar,
          badges,
          isMod,
          isSub: isMember,
          isOwner,
          isVip: false
        },
        message: rawText,
        formattedMessage: formattedHtml,
        type: isSuperChat ? 'superchat' : 'chat',
        extra: isSuperChat ? { amount: superChatAmount } : null,
        timestamp: item.timestamp ? new Date(item.timestamp).getTime() : Date.now()
      };

      this.emit('message', normalizedMsg);
    } catch (err) {
      console.error('[YouTube] Error parsing chat item:', err);
    }
  }

  disconnect(resetReconnect = true) {
    if (resetReconnect) {
      this.shouldReconnect = false;
    }
    clearTimeout(this.reconnectTimer);
    if (this.liveChat) {
      try {
        this.liveChat.stop();
      } catch (e) {}
      this.liveChat = null;
    }
    if (resetReconnect) {
      this.setStatus('disconnected');
    }
  }

  scheduleReconnect(delay = 35000, isBackgroundRetry = true) {
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      if (this.shouldReconnect && this.query) {
        console.log(`[YouTube] Verificando en segundo plano si ${this.query} está en vivo...`);
        this.connect(this.query, isBackgroundRetry);
      }
    }, delay);
  }

  setStatus(status, error = null) {
    if (this.status === status && this.lastError === error) return;
    this.status = status;
    this.lastError = error;
    this.emit('status', { platform: 'youtube', status, error });
  }
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

module.exports = YouTubeConnector;
