const EventEmitter = require('events');
const WebSocket = require('ws');
const crypto = require('crypto');

const KICK_HEADERS = {
  'User-Agent': 'Kick: Live Streaming/3.0.0 (com.kick.mobile; build:400; iOS 17.5.1)',
  'Accept': 'application/json'
};

const KICK_REALTIME_HEADERS = {
  ...KICK_HEADERS,
  'Referer': 'https://kick.com',
  'Content-Type': 'application/json',
  'x-app-platform': 'web'
};

class KickConnector extends EventEmitter {
  constructor() {
    super();
    this.ws = null;
    this.channel = '';
    this.channelId = null;
    this.chatroomId = null;
    this.clientId = crypto.randomUUID ? crypto.randomUUID() : ('kc_' + Math.random().toString(36).substring(2, 12));
    this.status = 'disconnected';
    this.shouldReconnect = false;
    this.reconnectTimer = null;
    this.pingTimer = null;
    this.reconnectAttempts = 0;
    this.chatroomCache = {};
    this.avatarCache = new Map();
    this.lastError = null;
    this.seenMessageIds = new Map();
  }

  isDuplicate(id, dedupeKey) {
    const now = Date.now();
    if (this.seenMessageIds.size > 1000) {
      for (const [k, ts] of this.seenMessageIds.entries()) {
        if (now - ts > 60000) this.seenMessageIds.delete(k);
      }
    }
    const idStr = id ? String(id).trim() : '';
    if (idStr) {
      if (this.seenMessageIds.has(idStr)) {
        return true;
      }
      this.seenMessageIds.set(idStr, now);
      return false;
    }
    if (dedupeKey) {
      if (this.seenMessageIds.has(dedupeKey)) {
        const last = this.seenMessageIds.get(dedupeKey);
        if (now - last < 2000) {
          return true;
        }
      }
      this.seenMessageIds.set(dedupeKey, now);
    }
    return false;
  }

  cleanChannelInput(raw) {
    if (!raw) return '';
    return raw
      .toString()
      .trim()
      .replace(/^https?:\/\/(?:www\.)?kick\.com\//i, '')
      .replace(/[\/\?#].*$/, '')
      .replace(/^@/, '')
      .toLowerCase();
  }

  async connect(channel) {
    if (!channel) return;
    this.disconnect();

    this.channel = this.cleanChannelInput(channel);
    this.shouldReconnect = true;
    this.setStatus('connecting');

    try {
      // 1. Resolve channel metadata & chatroom ID
      let resolved = await this.resolveChannelInfo(this.channel);
      if (!resolved || !resolved.chatroomId) {
        if (this.channelId && this.chatroomId) {
          console.warn(`[Kick] Usando IDs cacheados para "${this.channel}": Channel=${this.channelId}, Chatroom=${this.chatroomId}`);
          resolved = { channelId: this.channelId, chatroomId: this.chatroomId };
        } else {
          throw new Error(`Canal "${this.channel}" no encontrado en Kick`);
        }
      }

      this.channelId = resolved.channelId;
      this.chatroomId = resolved.chatroomId;
      console.log(`[Kick] Conectando a canal "${this.channel}" (Channel: ${this.channelId}, Chatroom: ${this.chatroomId})`);

      // 2. Negotiate Centrifugo token and WS endpoint
      const realtimeInfo = await this.negotiateRealtime(this.channelId);

      // 3. Connect via Centrifugo WebSocket
      this.connectWebSocket(realtimeInfo.wsUrl, realtimeInfo.token);
    } catch (err) {
      console.error('[Kick] Connection error:', err.message);
      this.setStatus('error', err.message);
      if (this.shouldReconnect) {
        this.scheduleReconnect();
      }
    }
  }

  async resolveChannelInfo(channel) {
    // Direct chatroom number entered
    if (/^\d+$/.test(channel)) {
      const chatroomId = parseInt(channel, 10);
      return { channelId: chatroomId, chatroomId };
    }

    if (this.chatroomCache[channel]) {
      return this.chatroomCache[channel];
    }

    // Try kick mobile-authorized API endpoints (v1 then v2)
    const endpoints = [
      `https://kick.com/api/v1/channels/${channel}`,
      `https://kick.com/api/v2/channels/${channel}`
    ];

    for (const url of endpoints) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(url, { headers: KICK_HEADERS, signal: controller.signal });
        clearTimeout(timeoutId);

        if (res.ok) {
          const data = await res.json();
          const channelId = data.id || data.channel_id;
          const chatroomId = data.chatroom?.id || data.chatroom_id;
          const avatar = data.user?.profile_pic || data.user?.profilepic || data.user?.profile_image || '';

          if (avatar) {
            this.avatarCache.set(channel.toLowerCase(), avatar);
          }

          if (chatroomId) {
            const info = { channelId: channelId || chatroomId, chatroomId };
            this.chatroomCache[channel] = info;
            return info;
          }
        } else if (res.status === 404) {
          throw new Error(`Canal "${channel}" no existe en Kick`);
        }
      } catch (e) {
        if (e.message.includes('no existe')) throw e;
      }
    }

    return null;
  }

  async negotiateRealtime(channelId) {
    this.clientId = crypto.randomUUID ? crypto.randomUUID() : ('kc_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9));
    // 1. Get Centrifugo auth token
    let token = '';
    try {
      const authRes = await fetch('https://web.kick.com/api/v1/realtime/auth/connection', {
        method: 'POST',
        headers: KICK_REALTIME_HEADERS,
        body: JSON.stringify({ client_id: this.clientId }),
        signal: AbortSignal.timeout(5000)
      });
      if (authRes.ok) {
        const authData = await authRes.json();
        token = authData.data?.token || '';
      }
    } catch (e) {
      console.warn('[Kick] Realtime token negotiation warning:', e.message);
    }

    // 2. Get WebSocket URL for chatroom
    let wsUrl = 'wss://realtime.us-west-2.platform.kick.com/connection/websocket';
    try {
      const connRes = await fetch(`https://web.kick.com/api/v1/realtime/channels/${channelId}/chat/connection`, {
        method: 'POST',
        headers: KICK_REALTIME_HEADERS,
        body: JSON.stringify({
          client: { id: this.clientId, type: 'web' },
          capabilities: { accepted_providers: [{ provider: 'centrifugo' }] }
        }),
        signal: AbortSignal.timeout(5000)
      });
      if (connRes.ok) {
        const connData = await connRes.json();
        const found = connData.data?.connections?.find(c => c.provider === 'centrifugo');
        if (found?.credentials?.url) {
          wsUrl = found.credentials.url;
        }
      }
    } catch (e) {
      console.warn('[Kick] Realtime endpoint discovery warning, using fallback:', e.message);
    }

    return { token, wsUrl };
  }

  connectWebSocket(wsUrl, token) {
    try {
      const currentWs = new WebSocket(wsUrl, { headers: { 'User-Agent': KICK_HEADERS['User-Agent'] } });
      this.ws = currentWs;
      let lastActivity = Date.now();

      currentWs.on('open', () => {
        if (this.ws !== currentWs) return;
        lastActivity = Date.now();
        // Send Centrifugo connect handshake
        const connectPayload = {
          id: 1,
          connect: token ? { token } : {}
        };
        currentWs.send(JSON.stringify(connectPayload));

        // Keep-alive heartbeat ping every 20 seconds & zombie watchdog
        clearInterval(this.pingTimer);
        this.pingTimer = setInterval(() => {
          if (this.ws !== currentWs) return;

          // Check for dead zombie connection (no frame received in 45 seconds)
          if (Date.now() - lastActivity > 45000) {
            console.warn(`[Kick] Sin respuesta de Centrifugo en "${this.channel}" por 45s. Forzando reconexión limpia...`);
            try {
              currentWs.terminate();
            } catch (e) {}
            return;
          }

          if (currentWs.readyState === WebSocket.OPEN) {
            try {
              currentWs.send('{}');
            } catch (e) {}
          }
        }, 20000);
      });

      currentWs.on('message', (raw) => {
        if (this.ws !== currentWs) return;
        lastActivity = Date.now();
        const lines = raw.toString().split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          // Centrifugo ping from server: reply with empty pong '{}'
          if (trimmed === '{}') {
            if (currentWs.readyState === WebSocket.OPEN) {
              try {
                currentWs.send('{}');
              } catch (e) {}
            }
            continue;
          }

          try {
            const msg = JSON.parse(trimmed);
            this.handleCentrifugoMessage(msg);
          } catch (err) {
            console.error('[Kick] Message parse error:', err.message);
          }
        }
      });

      currentWs.on('error', (err) => {
        if (this.ws !== currentWs) return;
        console.error(`[Kick] WS error (${this.channel}):`, err.message);
        this.setStatus('error', err.message);
      });

      currentWs.on('close', (code, reason) => {
        if (this.ws !== currentWs) return;
        clearInterval(this.pingTimer);
        console.log(`[Kick] WS cerrado (${this.channel}) code=${code} reason=${reason}`);
        this.setStatus('disconnected');
        if (this.shouldReconnect) {
          this.scheduleReconnect();
        }
      });
    } catch (err) {
      console.error('[Kick] WebSocket init error:', err.message);
      this.setStatus('error', err.message);
      if (this.shouldReconnect) {
        this.scheduleReconnect();
      }
    }
  }

  handleCentrifugoMessage(msg) {
    // 1. Connect response
    if (msg.id === 1 && msg.connect) {
      this.reconnectAttempts = 0;
      this.setStatus('connected');
      console.log(`[Kick] Centrifugo conectado exitosamente para "${this.channel}". Suscribiendo a chatrooms.${this.chatroomId}.v2`);

      // Subscribe to chatroom channel
      const subPayload = {
        id: 2,
        subscribe: {
          channel: `chatrooms.${this.chatroomId}.v2`
        }
      };
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(subPayload));
      }
      return;
    }

    // 2. Subscription confirmation
    if (msg.id === 2 && msg.subscribe) {
      console.log(`[Kick] Suscripción a chat activa para "${this.channel}"`);
      return;
    }

    // 3. Incoming publication message
    if (msg.push && msg.push.pub && msg.push.pub.data) {
      const pubData = msg.push.pub.data;
      const event = pubData.event || msg.push.pub.tags?.event;
      const rawData = pubData.data;
      let payload = rawData;
      if (typeof rawData === 'string') {
        try {
          payload = JSON.parse(rawData);
        } catch (e) {
          payload = rawData;
        }
      }

      if (event === 'App\\Events\\ChatMessageEvent' || event === 'ChatMessageEvent') {
        this.parseChatMessage(payload).catch(err => console.error('[Kick] Error in parseChatMessage:', err));
      } else if (event === 'App\\Events\\SubscriptionEvent' || event === 'App\\Events\\GiftedSubscriptionsEvent' || event === 'SubscriptionEvent' || event === 'GiftedSubscriptionsEvent') {
        this.parseSubscription(event, payload).catch(err => console.error('[Kick] Error in parseSubscription:', err));
      }
    }
  }

  async resolveAvatar(username) {
    const key = (username || '').toLowerCase().trim();
    if (!key) return '';
    if (this.avatarCache.has(key)) {
      return this.avatarCache.get(key);
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`https://kick.com/api/v1/users/${encodeURIComponent(key)}`, {
        signal: controller.signal,
        headers: KICK_HEADERS
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        const data = await res.json();
        const pic = data.profilepic || data.profile_pic || data.profile_thumb;
        if (pic && typeof pic === 'string' && pic.startsWith('http')) {
          this.avatarCache.set(key, pic);
          return pic;
        }
      }
    } catch (e) {}

    return '';
  }

  async parseChatMessage(data) {
    try {
      const sender = data.sender || {};
      const identity = sender.identity || {};
      const username = sender.username || 'KickUser';
      const color = identity.color || '#53FC18';
      const rawBadges = identity.badges || [];
      const rawBadgesV2 = identity.badges_v2 || [];

      let isOwner = false;
      let isMod = false;
      let isSub = false;
      let isVip = false;

      const badges = [];

      for (const b of rawBadges) {
        const type = (b.type || '').toLowerCase();
        if (type === 'broadcaster' || type === 'host') {
          isOwner = true;
          badges.push({ type: 'broadcaster', label: 'Streamer' });
        } else if (type === 'moderator') {
          isMod = true;
          badges.push({ type: 'moderator', label: 'Mod' });
        } else if (type === 'subscriber') {
          isSub = true;
          badges.push({ type: 'subscriber', label: 'Sub' });
        } else if (type === 'vip') {
          isVip = true;
          badges.push({ type: 'vip', label: 'VIP' });
        } else if (type === 'verified') {
          badges.push({ type: 'verified', label: 'Verificado' });
        } else if (type === 'og') {
          badges.push({ type: 'og', label: 'OG' });
        }
      }

      for (const b of rawBadgesV2) {
        const name = (b.name || '').toLowerCase();
        if (name === 'broadcaster' || name === 'host') {
          isOwner = true;
          if (!badges.some(x => x.type === 'broadcaster')) badges.push({ type: 'broadcaster', label: 'Streamer' });
        } else if (name === 'moderator') {
          isMod = true;
          if (!badges.some(x => x.type === 'moderator')) badges.push({ type: 'moderator', label: 'Mod' });
        } else if (name === 'subscriber') {
          isSub = true;
          if (!badges.some(x => x.type === 'subscriber')) badges.push({ type: 'subscriber', label: 'Sub' });
        } else if (name === 'vip') {
          isVip = true;
          if (!badges.some(x => x.type === 'vip')) badges.push({ type: 'vip', label: 'VIP' });
        } else if (name === 'verified') {
          if (!badges.some(x => x.type === 'verified')) badges.push({ type: 'verified', label: 'Verificado' });
        } else if (name === 'og') {
          if (!badges.some(x => x.type === 'og')) badges.push({ type: 'og', label: 'OG' });
        }
      }

      const rawMessage = data.content || '';
      const formattedMessage = this.formatKickEmotes(rawMessage);

      const rawMsgId = data.id;
      const dedupeKey = `${username.toLowerCase()}:${rawMessage.toLowerCase().trim()}`;
      if (this.isDuplicate(rawMsgId, dedupeKey)) {
        return;
      }

      const avatar = sender.profile_pic 
        || sender.profile_thumb 
        || sender.profile_image 
        || sender.avatar 
        || this.avatarCache.get(username.toLowerCase())
        || '';

      if (!avatar) {
        // Resolve in background without blocking instant chat delivery
        this.resolveAvatar(username).catch(() => {});
      }

      const stableId = rawMsgId ? `kick_${rawMsgId}` : `kick_${username}_${Date.now()}`;

      const normalizedMsg = {
        id: stableId,
        platform: 'kick',
        user: {
          name: username,
          displayName: username,
          color,
          avatar,
          badges,
          isMod,
          isSub,
          isOwner,
          isVip
        },
        message: rawMessage,
        formattedMessage,
        type: 'chat',
        timestamp: data.created_at ? new Date(data.created_at).getTime() : Date.now()
      };

      this.emit('message', normalizedMsg);
    } catch (err) {
      console.error('[Kick] Error parsing chat message:', err);
    }
  }

  async parseSubscription(eventType, data) {
    try {
      const username = data.username || (data.gifter && data.gifter.username) || 'KickUser';
      const isGift = eventType.includes('Gifted');
      const count = data.gift_count || 1;
      const avatar = data.profile_pic || data.profile_thumb || this.avatarCache.get(username.toLowerCase()) || '';
      if (!avatar) {
        this.resolveAvatar(username).catch(() => {});
      }

      const normalizedMsg = {
        id: `kick_sub_${Date.now()}`,
        platform: 'kick',
        user: {
          name: username,
          displayName: username,
          color: '#53FC18',
          avatar,
          badges: [{ type: 'subscriber', label: 'Sub' }],
          isSub: true
        },
        message: isGift ? `¡Ha regalado ${count} suscripción(es) en Kick!` : `¡Se ha suscrito en Kick!`,
        formattedMessage: isGift ? `🎁 <strong>¡Ha regalado ${count} suscripción(es) en Kick!</strong>` : `⭐ <strong>¡Se ha suscrito en Kick!</strong>`,
        type: 'subscription',
        extra: { giftCount: count, isGift },
        timestamp: Date.now()
      };

      this.emit('message', normalizedMsg);
    } catch (err) {
      console.error('[Kick] Error parsing subscription:', err);
    }
  }

  formatKickEmotes(message) {
    return escapeHtml(message).replace(/\[emote:(\d+):([a-zA-Z0-9_-]+)\]/g, (match, id, name) => {
      const url = `https://files.kick.com/emotes/${id}/fullsize`;
      return `<img class="chat-emote" src="${url}" alt="${name}" title="${name}" />`;
    });
  }

  disconnect() {
    this.shouldReconnect = false;
    clearTimeout(this.reconnectTimer);
    clearInterval(this.pingTimer);
    if (this.ws) {
      try {
        this.ws.removeAllListeners();
        this.ws.close();
      } catch (e) {}
      this.ws = null;
    }
    this.setStatus('disconnected');
  }

  scheduleReconnect() {
    clearTimeout(this.reconnectTimer);
    this.reconnectAttempts++;
    const delay = Math.min(1500 * Math.max(1, this.reconnectAttempts), 8000);
    this.reconnectTimer = setTimeout(() => {
      if (this.shouldReconnect && this.channel) {
        console.log(`[Kick] Reintentando conexión con canal "${this.channel}" en ${Math.round(delay / 1000)}s...`);
        this.connect(this.channel);
      }
    }, delay);
  }

  setStatus(status, error = null) {
    if (this.status === status && this.lastError === error) return;
    this.status = status;
    this.lastError = error;
    this.emit('status', { platform: 'kick', status, error });
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

module.exports = KickConnector;
