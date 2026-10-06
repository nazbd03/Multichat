const EventEmitter = require('events');
const WebSocket = require('ws');

const KICK_PUSHER_URL = 'wss://ws-us2.pusher.com/app/32cbd69e4b950bf97679?protocol=7&client=js&version=8.4.0&flash=false';

class KickConnector extends EventEmitter {
  constructor() {
    super();
    this.ws = null;
    this.channel = '';
    this.chatroomId = null;
    this.status = 'disconnected';
    this.shouldReconnect = false;
    this.reconnectTimer = null;
    this.pingTimer = null;
    this.chatroomCache = {};
    this.avatarCache = new Map();
    this.lastError = null;
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
      // 1. Resolve chatroom ID (with cache support)
      let chatroomId = this.chatroomCache[this.channel];
      if (!chatroomId) {
        chatroomId = await this.resolveChatroomId(this.channel);
      }

      if (!chatroomId) {
        throw new Error(`Canal "${this.channel}" no encontrado en Kick`);
      }

      this.chatroomId = chatroomId;
      this.chatroomCache[this.channel] = chatroomId;
      console.log(`[Kick] Chatroom ID obtenido para "${this.channel}": ${chatroomId}`);

      // 2. Connect to Pusher
      this.connectWebSocket();
    } catch (err) {
      console.error('[Kick] Connection error:', err.message);
      this.setStatus('error', err.message);
      if (this.shouldReconnect) {
        this.scheduleReconnect();
      }
    }
  }

  async resolveChatroomId(channel) {
    // If user entered a number directly (chatroom ID)
    if (/^\d+$/.test(channel)) {
      return parseInt(channel, 10);
    }

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
    };

    // 1. Try kick public v2 API
    try {
      const res = await fetch(`https://kick.com/api/v2/channels/${channel}`, { headers });
      if (res.ok) {
        const data = await res.json();
        if (data.user && data.user.profile_pic) {
          this.avatarCache.set(channel.toLowerCase(), data.user.profile_pic);
        }
        if (data.chatroom && data.chatroom.id) {
          return data.chatroom.id;
        }
      } else if (res.status === 404) {
        throw new Error(`Canal "${channel}" no existe en Kick`);
      }
    } catch (e) {
      if (e.message.includes('no existe')) throw e;
    }

    // 2. Try kick public v1 API
    try {
      const res = await fetch(`https://kick.com/api/v1/channels/${channel}`, { headers });
      if (res.ok) {
        const data = await res.json();
        if (data.chatroom && data.chatroom.id) {
          return data.chatroom.id;
        }
      }
    } catch (e) {}

    // 3. Fallback: Parse HTML from channel page
    try {
      const res = await fetch(`https://kick.com/${channel}`, { headers });
      if (res.ok) {
        const html = await res.text();
        const match = html.match(/"chatroom":\{"id":(\d+)/);
        if (match) {
          return parseInt(match[1], 10);
        }
      }
    } catch (e) {}

    return null;
  }

  connectWebSocket() {
    this.ws = new WebSocket(KICK_PUSHER_URL);

    this.ws.on('open', () => {
      this.setStatus('connected');
      // Subscribe to chatroom
      const subPayload = {
        event: 'pusher:subscribe',
        data: {
          auth: '',
          channel: `chatrooms.${this.chatroomId}.v2`
        }
      };
      this.ws.send(JSON.stringify(subPayload));

      // Pusher ping interval every 30s
      this.pingTimer = setInterval(() => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ event: 'pusher:ping', data: {} }));
        }
      }, 30000);
    });

    this.ws.on('message', (data) => {
      try {
        const parsed = JSON.parse(data.toString());
        this.handlePusherMessage(parsed);
      } catch (err) {
        console.error('[Kick] Message parse error:', err);
      }
    });

    this.ws.on('error', (err) => {
      console.error(`[Kick] WS error (${this.channel}):`, err.message);
      this.setStatus('error', err.message);
    });

    this.ws.on('close', () => {
      clearInterval(this.pingTimer);
      if (this.status !== 'disconnected') {
        this.setStatus('disconnected');
        if (this.shouldReconnect) {
          this.scheduleReconnect();
        }
      }
    });
  }

  handlePusherMessage(payload) {
    const event = payload.event;

    // Responder al ping del servidor de Pusher para evitar desconexión cada 120 segundos
    if (event === 'pusher:ping') {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ event: 'pusher:pong', data: {} }));
      }
      return;
    }

    if (event === 'pusher:pong') {
      return;
    }

    if (event === 'App\\Events\\ChatMessageEvent') {
      const chatData = typeof payload.data === 'string' ? JSON.parse(payload.data) : payload.data;
      this.parseChatMessage(chatData).catch(err => console.error('[Kick] Error in parseChatMessage:', err));
    } else if (event === 'App\\Events\\SubscriptionEvent' || event === 'App\\Events\\GiftedSubscriptionsEvent') {
      const subData = typeof payload.data === 'string' ? JSON.parse(payload.data) : payload.data;
      this.parseSubscription(event, subData).catch(err => console.error('[Kick] Error in parseSubscription:', err));
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
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
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
      const color = identity.color || '#53FC18'; // Kick neon green
      const rawBadges = identity.badges || [];

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

      const rawMessage = data.content || '';
      const formattedMessage = this.formatKickEmotes(rawMessage);

      let avatar = sender.profile_pic 
        || sender.profile_thumb 
        || sender.profile_image 
        || sender.avatar 
        || this.avatarCache.get(username.toLowerCase())
        || '';

      if (!avatar) {
        avatar = await this.resolveAvatar(username);
      }

      const normalizedMsg = {
        id: data.id || `kick_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
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
      let avatar = data.profile_pic || data.profile_thumb || this.avatarCache.get(username.toLowerCase()) || '';
      if (!avatar) {
        avatar = await this.resolveAvatar(username);
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
    // Kick emotes are formatted as [emote:ID:NAME]
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
        this.ws.close();
      } catch (e) {}
      this.ws = null;
    }
    this.setStatus('disconnected');
  }

  scheduleReconnect() {
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      if (this.shouldReconnect && this.channel) {
        console.log(`[Kick] Reconnecting to channel ${this.channel}...`);
        this.connect(this.channel);
      }
    }, 5000);
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
