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

  async connect(query) {
    if (!query) return;
    this.disconnect();

    this.query = query;
    this.shouldReconnect = true;
    this.setStatus('connecting');

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
        this.setStatus('error', err.message || 'Error en stream de YouTube');
        if (this.shouldReconnect) {
          this.scheduleReconnect();
        }
      });

      this.liveChat.on('end', (reason) => {
        console.log('[YouTube] Stream finalizado:', reason);
        if (this.status !== 'disconnected') {
          this.setStatus('disconnected');
          if (this.shouldReconnect) {
            this.scheduleReconnect();
          }
        }
      });

      const started = await this.liveChat.start();
      if (!started) {
        throw new Error('No se encontró una transmisión en vivo activa');
      }
    } catch (err) {
      console.error('[YouTube] Connection failed:', err.message);
      this.setStatus('error', err.message);
      if (this.shouldReconnect) {
        this.scheduleReconnect();
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

  disconnect() {
    this.shouldReconnect = false;
    clearTimeout(this.reconnectTimer);
    if (this.liveChat) {
      try {
        this.liveChat.stop();
      } catch (e) {}
      this.liveChat = null;
    }
    this.setStatus('disconnected');
  }

  scheduleReconnect() {
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      if (this.shouldReconnect && this.query) {
        console.log(`[YouTube] Reintentando conexión con ${this.query}...`);
        this.connect(this.query);
      }
    }, 10000);
  }

  setStatus(status, error = null) {
    this.status = status;
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
