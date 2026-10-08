const EventEmitter = require('events');
const { TikTokLiveConnection } = require('tiktok-live-connector');

class TikTokConnector extends EventEmitter {
  constructor() {
    super();
    this.connection = null;
    this.username = '';
    this.status = 'disconnected';
    this.shouldReconnect = false;
    this.reconnectTimer = null;
    this.lastError = null;
    this.seenMessageIds = new Map();
  }

  isDuplicate(id, dedupeKey) {
    const now = Date.now();
    if (this.seenMessageIds.size > 600) {
      for (const [k, ts] of this.seenMessageIds.entries()) {
        if (now - ts > 60000) this.seenMessageIds.delete(k);
      }
    }
    if (id && this.seenMessageIds.has(String(id))) {
      return true;
    }
    if (dedupeKey && this.seenMessageIds.has(dedupeKey)) {
      const last = this.seenMessageIds.get(dedupeKey);
      if (now - last < 8000) {
        return true;
      }
    }
    if (id) this.seenMessageIds.set(String(id), now);
    if (dedupeKey) this.seenMessageIds.set(dedupeKey, now);
    return false;
  }

  async connect(username, isBackgroundRetry = false) {
    if (!username) return;
    this.disconnect(false);

    this.username = username.trim().replace(/^@/, '');
    this.shouldReconnect = true;
    if (!isBackgroundRetry) {
      this.setStatus('connecting');
    }

    try {
      this.connection = new TikTokLiveConnection(this.username, {
        processInitialData: false,
        enableExtendedGiftInfo: false
      });

      this.connection.on('chat', (data) => {
        this.parseChat(data);
      });

      this.connection.on('gift', (data) => {
        // Only trigger once gift repeat combo finishes or individual gift
        if (data.giftType === 1 && !data.repeatEnd) {
          // In the middle of combo streak, avoid spamming 100 messages
          return;
        }
        this.parseGift(data);
      });

      this.connection.on('streamEnd', () => {
        console.log(`[TikTok] Stream finalizado para @${this.username}`);
        this.setStatus('offline', 'No en vivo (inicia directo)');
        if (this.shouldReconnect) {
          this.scheduleReconnect(35000, true);
        }
      });

      this.connection.on('disconnected', () => {
        console.log(`[TikTok] Desconectado de @${this.username}`);
        if (this.status !== 'disconnected') {
          this.setStatus('disconnected');
          if (this.shouldReconnect) {
            this.scheduleReconnect(15000, false);
          }
        }
      });

      this.connection.on('error', (err) => {
        // If still in the middle of connect(), catch block handles it
        if (this.status === 'connecting') return;
        const errInfo = this.formatError(err);
        console.error(`[TikTok] Error en @${this.username}:`, errInfo.message);
        this.setStatus(errInfo.status, errInfo.message);
        if (this.shouldReconnect) {
          this.scheduleReconnect(errInfo.delay, errInfo.status === 'offline');
        }
      });

      const state = await this.connection.connect();
      console.log(`[TikTok] Conectado exitosamente al Live de @${this.username} (Room ID: ${state.roomId})`);
      this.setStatus('connected');
    } catch (err) {
      const errInfo = this.formatError(err);
      if (errInfo.status === 'offline') {
        console.log(`[TikTok] @${this.username} no está en vivo actualmente. Verificando en segundo plano...`);
      } else {
        console.log(`[TikTok] Estado para @${this.username}: ${errInfo.message}`);
      }
      this.setStatus(errInfo.status, errInfo.message);
      if (this.shouldReconnect) {
        this.scheduleReconnect(errInfo.delay, errInfo.status === 'offline');
      }
    }
  }

  parseChat(data) {
    try {
      const u = data.user || data.userDetails || {};

      const username = u.nickname
        || data.nickname
        || u.displayId
        || data.uniqueId
        || u.uniqueId
        || 'TikTokUser';

      const handle = u.displayId
        || data.uniqueId
        || u.uniqueId
        || u.nickname
        || username;

      let avatar = (u.avatarLarge?.urlList?.[0])
        || (u.avatarMedium?.urlList?.[0])
        || (u.avatarThumb?.urlList?.[0])
        || data.profilePictureUrl
        || (Array.isArray(data.profilePictureUrls) ? data.profilePictureUrls[0] : (typeof data.profilePictureUrls === 'string' ? data.profilePictureUrls : ''))
        || (data.userDetails?.profilePictureUrls ? (Array.isArray(data.userDetails.profilePictureUrls) ? data.userDetails.profilePictureUrls[0] : data.userDetails.profilePictureUrls) : '')
        || u.profilePictureUrl
        || '';

      // In tiktok-live-connector v2 / protobuf v3, message text is in `content`
      const text = (typeof data.content === 'string' ? data.content : '')
        || (typeof data.comment === 'string' ? data.comment : '')
        || (typeof data.text === 'string' ? data.text : '')
        || (typeof data.message === 'string' ? data.message : '')
        || '';

      if (!text && (!data.emotes || data.emotes.length === 0)) {
        return;
      }

      const isOwner = Boolean(data.userIdentity?.isAnchor || data.isAnchor || u.userAttr?.isSuperAdmin);
      const isMod = Boolean(data.userIdentity?.isModeratorOfAnchor || data.isModerator || u.userAttr?.isAdmin);
      const isSub = Boolean(data.userIdentity?.isSubscriberOfAnchor || data.isSubscriber || (u.fansClub && u.fansClub.fansLevel > 0));

      const badges = [];
      if (isOwner) badges.push({ type: 'broadcaster', label: 'Anfitrión' });
      if (isMod) badges.push({ type: 'moderator', label: 'Mod' });
      if (isSub) badges.push({ type: 'subscriber', label: 'Sub' });

      let formattedMessage = escapeHtml(text);

      // Handle animated / static TikTok emotes if present
      if (Array.isArray(data.emotes) && data.emotes.length > 0) {
        for (const item of data.emotes) {
          const emoteObj = item.emote;
          const emoteUrl = emoteObj?.image?.urlList?.[0];
          const emoteId = emoteObj?.emoteId || emoteObj?.placeHolder;
          if (emoteUrl && emoteId) {
            formattedMessage = formattedMessage.split(emoteId).join(
              `<img class="chat-emote" src="${emoteUrl}" alt="${escapeHtml(emoteId)}" />`
            );
          }
        }
      }

      const rawMsgId = data.msgId || data.common?.msgId;
      const dedupeKey = `${handle}:${text}`;
      if (this.isDuplicate(rawMsgId, dedupeKey)) {
        return;
      }

      const stableId = rawMsgId ? `tt_${rawMsgId}` : `tt_${handle}_${Date.now()}`;

      const normalizedMsg = {
        id: stableId,
        platform: 'tiktok',
        user: {
          name: handle,
          displayName: username,
          color: '#FE2C55', // TikTok signature pink/red
          avatar,
          badges,
          isMod,
          isSub,
          isOwner,
          isVip: false
        },
        message: text,
        formattedMessage: formattedMessage || escapeHtml(text),
        type: 'chat',
        timestamp: Date.now()
      };

      this.emit('message', normalizedMsg);
    } catch (err) {
      console.error('[TikTok] Error parsing chat message:', err);
    }
  }

  parseGift(data) {
    try {
      const u = data.user || data.userDetails || {};

      const username = u.nickname
        || data.nickname
        || u.displayId
        || data.uniqueId
        || u.uniqueId
        || 'TikTokUser';

      const handle = u.displayId
        || data.uniqueId
        || u.uniqueId
        || u.nickname
        || username;

      let avatar = (u.avatarMedium?.urlList?.[0])
        || (u.avatarThumb?.urlList?.[0])
        || (u.avatarLarge?.urlList?.[0])
        || data.profilePictureUrl
        || (Array.isArray(data.profilePictureUrls) ? data.profilePictureUrls[0] : (typeof data.profilePictureUrls === 'string' ? data.profilePictureUrls : ''))
        || (data.userDetails?.profilePictureUrls ? (Array.isArray(data.userDetails.profilePictureUrls) ? data.userDetails.profilePictureUrls[0] : data.userDetails.profilePictureUrls) : '')
        || u.profilePictureUrl
        || '';

      const g = data.gift || data.giftDetails || {};
      const giftName = data.giftName || g.name || g.describe || 'Regalo';
      const count = data.repeatCount || data.comboCount || data.groupCount || 1;
      const giftIcon = data.giftPictureUrl
        || (g.image?.urlList?.[0])
        || (g.icon?.urlList?.[0])
        || '';

      const diamonds = (data.diamondCount || g.diamondCount || 0) * count;

      const text = `¡Ha enviado ${count}x ${giftName}!`;
      let formatted = `🎁 <strong>¡Ha enviado ${count}x ${escapeHtml(giftName)}!</strong>`;
      if (giftIcon) {
        formatted += ` <img class="chat-emote chat-gift-icon" src="${giftIcon}" alt="${escapeHtml(giftName)}" />`;
      }

      const rawMsgId = data.msgId || data.common?.msgId;
      const dedupeKey = `gift:${handle}:${giftName}:${count}`;
      if (this.isDuplicate(rawMsgId, dedupeKey)) {
        return;
      }

      const stableId = rawMsgId ? `tt_gift_${rawMsgId}` : `tt_gift_${handle}_${Date.now()}`;

      const normalizedMsg = {
        id: stableId,
        platform: 'tiktok',
        user: {
          name: handle,
          displayName: username,
          color: '#25F4EE', // TikTok cyan
          avatar,
          badges: [],
          isMod: false,
          isSub: false,
          isOwner: false,
          isVip: false
        },
        message: text,
        formattedMessage: formatted,
        type: 'gift',
        extra: {
          giftName,
          giftCount: count,
          giftIcon,
          diamonds
        },
        timestamp: Date.now()
      };

      this.emit('message', normalizedMsg);
    } catch (err) {
      console.error('[TikTok] Error parsing gift:', err);
    }
  }

  disconnect(resetReconnect = true) {
    if (resetReconnect) {
      this.shouldReconnect = false;
    }
    clearTimeout(this.reconnectTimer);
    if (this.connection) {
      try {
        this.connection.disconnect();
      } catch (e) {}
      this.connection = null;
    }
    if (resetReconnect) {
      this.setStatus('disconnected');
    }
  }

  formatError(err) {
    const errorObj = err?.exception || err;
    const raw = (errorObj && (errorObj.message || errorObj.info || errorObj.toString())) || '';
    if (
      raw.includes("isn't online") ||
      raw.includes("not online") ||
      raw.includes("LIVE has ended") ||
      raw.includes("offline") ||
      raw.includes("ROOM_NOT_FOUND") ||
      raw.includes("UserOfflineError")
    ) {
      return {
        status: 'offline',
        message: 'No en vivo (inicia directo)',
        delay: 35000
      };
    }
    if (raw.includes('User not found') || raw.includes('user not found') || raw.includes('could not be found')) {
      return {
        status: 'error',
        message: 'Usuario no encontrado',
        delay: 30000
      };
    }
    if (raw.includes('Too many requests') || raw.includes('rate limit') || raw.includes('429')) {
      return {
        status: 'error',
        message: 'Límite de solicitudes (espera)',
        delay: 30000
      };
    }
    if (raw.includes('Empty Payload') || raw.includes('SignatureMissingTokensError')) {
      return {
        status: 'error',
        message: 'Error de firma de TikTok',
        delay: 20000
      };
    }
    return {
      status: 'error',
      message: raw.length > 25 ? raw.slice(0, 22) + '...' : raw || 'Error de conexión',
      delay: 20000
    };
  }

  scheduleReconnect(delay = 10000, isBackgroundRetry = false) {
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      if (this.shouldReconnect && this.username) {
        if (!isBackgroundRetry) {
          console.log(`[TikTok] Reintentando conexión con @${this.username}...`);
        }
        this.connect(this.username, isBackgroundRetry);
      }
    }, delay);
  }

  setStatus(status, error = null) {
    if (this.status === status && this.lastError === error) return;
    this.status = status;
    this.lastError = error;
    this.emit('status', { platform: 'tiktok', status, error });
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

module.exports = TikTokConnector;
