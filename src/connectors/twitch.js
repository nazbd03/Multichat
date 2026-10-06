const EventEmitter = require('events');
const WebSocket = require('ws');

class TwitchConnector extends EventEmitter {
  constructor() {
    super();
    this.ws = null;
    this.channel = '';
    this.status = 'disconnected';
    this.reconnectTimer = null;
    this.shouldReconnect = false;
    this.avatarCache = new Map();
  }

  connect(channel) {
    if (!channel) return;
    this.disconnect();

    this.channel = channel.toLowerCase().replace(/^#/, '').trim();
    this.shouldReconnect = true;
    this.setStatus('connecting');
    this.resolveAvatar(this.channel).catch(() => {});

    try {
      this.ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443');

      this.ws.on('open', () => {
        this.setStatus('connected');
        const anonNick = `justinfan${Math.floor(10000 + Math.random() * 89999)}`;
        this.ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
        this.ws.send('PASS SCHMOOPIE');
        this.ws.send(`NICK ${anonNick}`);
        this.ws.send(`JOIN #${this.channel}`);
      });

      this.ws.on('message', (data) => {
        const raw = data.toString();
        this.handleRawMessage(raw);
      });

      this.ws.on('error', (err) => {
        console.error(`[Twitch] Error (${this.channel}):`, err.message);
        this.setStatus('error', err.message);
      });

      this.ws.on('close', () => {
        if (this.status !== 'disconnected') {
          this.setStatus('disconnected');
          if (this.shouldReconnect) {
            this.scheduleReconnect();
          }
        }
      });
    } catch (err) {
      this.setStatus('error', err.message);
    }
  }

  disconnect() {
    this.shouldReconnect = false;
    clearTimeout(this.reconnectTimer);
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
        console.log(`[Twitch] Reconnecting to #${this.channel}...`);
        this.connect(this.channel);
      }
    }, 4000);
  }

  setStatus(status, error = null) {
    this.status = status;
    this.emit('status', { platform: 'twitch', status, error });
  }

  handleRawMessage(raw) {
    const lines = raw.split('\r\n');
    for (const line of lines) {
      if (!line) continue;

      if (line.startsWith('PING')) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send('PONG :tmi.twitch.tv');
        }
        continue;
      }

      if (line.includes('PRIVMSG')) {
        this.parsePrivMsg(line);
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
      const timeoutId = setTimeout(() => controller.abort(), 2500);
      const res = await fetch(`https://decapi.me/twitch/avatar/${encodeURIComponent(key)}`, {
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        const text = (await res.text()).trim();
        if (text && text.startsWith('http') && !text.includes('User not found') && !text.includes('error')) {
          this.avatarCache.set(key, text);
          return text;
        }
      }
    } catch (e) {}

    return '';
  }

  async parsePrivMsg(line) {
    try {
      let tags = {};
      let remaining = line;

      if (remaining.startsWith('@')) {
        const spaceIdx = remaining.indexOf(' ');
        const tagsStr = remaining.substring(1, spaceIdx);
        remaining = remaining.substring(spaceIdx + 1);

        for (const pair of tagsStr.split(';')) {
          const eqIdx = pair.indexOf('=');
          if (eqIdx !== -1) {
            tags[pair.substring(0, eqIdx)] = pair.substring(eqIdx + 1);
          }
        }
      }

      // Format: :username!username@username.tmi.twitch.tv PRIVMSG #channel :Message text
      const msgMatch = remaining.match(/^:([^!]+)![^ ]+ PRIVMSG #[^ ]+ :?(.*)$/);
      if (!msgMatch) return;

      const rawUser = msgMatch[1];
      const messageContent = msgMatch[2] || '';

      const displayName = tags['display-name'] || rawUser;
      const color = tags['color'] || this.getFallbackColor(displayName);
      const isMod = tags['mod'] === '1';
      const isSub = Boolean(tags['subscriber'] === '1' || (tags['badges'] && tags['badges'].includes('subscriber')));
      const isOwner = tags['badges'] ? tags['badges'].includes('broadcaster') : false;
      const isVip = tags['badges'] ? tags['badges'].includes('vip') : false;

      const badges = [];
      if (isOwner) badges.push({ type: 'broadcaster', label: 'Streamer' });
      if (isMod) badges.push({ type: 'moderator', label: 'Mod' });
      if (isVip) badges.push({ type: 'vip', label: 'VIP' });
      if (isSub) badges.push({ type: 'subscriber', label: 'Sub' });

      // Emotes replacement
      const formattedMessage = this.formatTwitchEmotes(messageContent, tags['emotes']);

      // Fetch or use cached real Twitch avatar (using raw login name)
      const avatar = await this.resolveAvatar(rawUser);

      const normalizedMsg = {
        id: tags['id'] || `tw_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        platform: 'twitch',
        user: {
          name: rawUser,
          displayName,
          color,
          avatar,
          badges,
          isMod,
          isSub,
          isOwner,
          isVip
        },
        message: messageContent,
        formattedMessage,
        type: 'chat',
        timestamp: tags['tmi-sent-ts'] ? parseInt(tags['tmi-sent-ts'], 10) : Date.now()
      };

      this.emit('message', normalizedMsg);
    } catch (err) {
      console.error('[Twitch] Error parsing PRIVMSG:', err);
    }
  }

  formatTwitchEmotes(message, emotesTag) {
    if (!emotesTag) return escapeHtml(message);

    // emotesTag format: 25:0-4,12-16/1902:6-10
    const replacements = [];
    const emoteEntries = emotesTag.split('/');

    for (const entry of emoteEntries) {
      const [emoteId, positionsStr] = entry.split(':');
      if (!emoteId || !positionsStr) continue;

      const positions = positionsStr.split(',');
      for (const pos of positions) {
        const [start, end] = pos.split('-').map(Number);
        if (!isNaN(start) && !isNaN(end)) {
          replacements.push({
            start,
            end,
            emoteId,
            text: message.substring(start, end + 1)
          });
        }
      }
    }

    if (replacements.length === 0) return escapeHtml(message);

    // Sort descending by start to avoid altering index offsets
    replacements.sort((a, b) => b.start - a.start);

    let html = message;
    for (const rep of replacements) {
      const emoteUrl = `https://static-cdn.jtvnw.net/emoticons/v2/${rep.emoteId}/default/dark/1.0`;
      const imgTag = `<img class="chat-emote" src="${emoteUrl}" alt="${escapeHtml(rep.text)}" title="${escapeHtml(rep.text)}" />`;
      html = html.substring(0, rep.start) + imgTag + html.substring(rep.end + 1);
    }

    return html;
  }

  getFallbackColor(name) {
    const colors = [
      '#FF4500', '#2E8B57', '#00FF7F', '#1E90FF', '#FF69B4',
      '#8A2BE2', '#00FFFF', '#FFD700', '#FF1493', '#00FA9A'
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
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

module.exports = TwitchConnector;
