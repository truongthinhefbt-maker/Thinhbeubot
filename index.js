// ============================================================
//  DISCORD BOT FULL FEATURED - 87+ CHỨC NĂNG
//  Gộp chung 1 file duy nhất - Deploy ngay lên Railway
// ============================================================

const {
  Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder,
  EmbedBuilder, PermissionFlagsBits, ActivityType, Collection,
  ActionRowBuilder, ButtonBuilder, ButtonStyle
} = require('discord.js');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const dns = require('dns').promises;
const net = require('net');

// ══════════════════════════════════════════════════════════
//  BIẾN MÔI TRƯỜNG
// ══════════════════════════════════════════════════════════
const TOKEN      = process.env.TOKEN;
const GROQ_KEY   = process.env.GROQ_API_KEY;
const WEATHER_KEY = process.env.WEATHER_API_KEY;

if (!TOKEN) {
  console.error('❌ Thiếu biến TOKEN!');
  process.exit(1);
}

// ══════════════════════════════════════════════════════════
//  DATABASE (JSON FILE)
// ══════════════════════════════════════════════════════════
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function loadDB(name) {
  const p = path.join(DATA_DIR, `${name}.json`);
  if (!fs.existsSync(p)) return {};
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return {}; }
}

function saveDB(name, data) {
  fs.writeFileSync(path.join(DATA_DIR, `${name}.json`), JSON.stringify(data, null, 2));
}

// XP/Level system
function getXP(guildId, userId) {
  const db = loadDB('xp');
  return db[guildId]?.[userId] ?? { xp: 0, level: 0, lastMsg: 0 };
}

function addXP(guildId, userId, amount) {
  const db = loadDB('xp');
  if (!db[guildId]) db[guildId] = {};
  const user = db[guildId][userId] ?? { xp: 0, level: 0, lastMsg: 0 };
  user.xp += amount;
  let leveledUp = false;
  while (user.xp >= (user.level + 1) * 100 + 100) {
    user.xp -= (user.level + 1) * 100 + 100;
    user.level++;
    leveledUp = true;
  }
  user.lastMsg = Date.now();
  db[guildId][userId] = user;
  saveDB('xp', db);
  return { ...user, leveledUp };
}

function getLeaderboard(guildId, limit = 10) {
  const db = loadDB('xp');
  const guild = db[guildId] ?? {};
  return Object.entries(guild)
    .map(([userId, data]) => ({ userId, ...data }))
    .sort((a, b) => b.level - a.level || b.xp - a.xp)
    .slice(0, limit);
}

// Warns
function addWarn(guildId, userId, reason, modId) {
  const db = loadDB('warns');
  if (!db[guildId]) db[guildId] = {};
  if (!db[guildId][userId]) db[guildId][userId] = [];
  db[guildId][userId].push({ id: Date.now(), reason, modId, date: new Date().toISOString() });
  saveDB('warns', db);
  return db[guildId][userId];
}

function getWarns(guildId, userId) {
  const db = loadDB('warns');
  return db[guildId]?.[userId] ?? [];
}

function clearWarns(guildId, userId) {
  const db = loadDB('warns');
  if (db[guildId]) db[guildId][userId] = [];
  saveDB('warns', db);
}

// Check-in
function checkIn(guildId, userId) {
  const db = loadDB('checkin');
  if (!db[guildId]) db[guildId] = {};
  const today = new Date().toDateString();
  const user = db[guildId][userId] ?? { lastDate: null, streak: 0, total: 0 };
  if (user.lastDate === today) return { alreadyDone: true, streak: user.streak, total: user.total };
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  user.streak = user.lastDate === yesterday ? user.streak + 1 : 1;
  user.lastDate = today;
  user.total = (user.total ?? 0) + 1;
  db[guildId][userId] = user;
  saveDB('checkin', db);
  return { alreadyDone: false, streak: user.streak, total: user.total };
}

// Stats
function incrementStat(key) {
  const db = loadDB('stats');
  db[key] = (db[key] ?? 0) + 1;
  saveDB('stats', db);
}

// ══════════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════════
const COLORS = {
  primary: 0x5865F2, success: 0x57F287, warning: 0xFEE75C,
  danger: 0xED4245, info: 0x5BC0DE, music: 0xFF0000, groq: 0xF55036,
};

function embed(title, desc, color = COLORS.primary) {
  return new EmbedBuilder().setTitle(title).setDescription(desc).setColor(color).setTimestamp();
}

function successEmbed(title, desc) { return embed(`✅ ${title}`, desc, COLORS.success); }
function errorEmbed(title, desc) { return embed(`❌ ${title}`, desc, COLORS.danger); }

async function askGroq(prompt, system = null, maxTokens = 1024) {
  if (!GROQ_KEY) throw new Error('Chưa có GROQ_API_KEY');
  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: prompt });

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_KEY}` },
    body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages, max_tokens: maxTokens, temperature: 0.7 }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.choices?.[0]?.message?.content ?? '';
}

async function searchYouTube(query) {
  const res = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
    { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = await res.text();
  const videoId = html.match(/"videoId":"([a-zA-Z0-9_-]{11})"/)?.[1];
  if (!videoId) return null;
  return {
    videoId, url: `https://www.youtube.com/watch?v=${videoId}`,
    title: html.match(/"title":{"runs":\[{"text":"([^"]+)"}/)?.[1] ?? query,
    channel: html.match(/"ownerText":{"runs":\[{"text":"([^"]+)"}/)?.[1] ?? '',
    duration: html.match(/"simpleText":"(\d+:\d+(?::\d+)?)"/)?.[1] ?? '',
    thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
  };
}

function decodeHtml(text) {
  return `${text ?? ''}`
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x2F;/g, '/');
}

function stripHtmlTags(text) {
  return decodeHtml(`${text ?? ''}`.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

async function searchTikTok(query) {
  const searchQuery = `${query}`.trim();
  if (!searchQuery) return null;

  const searchUrl = `https://www.tiktok.com/search/video?q=${encodeURIComponent(searchQuery)}`;
  const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(`site:tiktok.com ${searchQuery}`)}`;

  try {
    const res = await fetch(ddgUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const html = await res.text();

    const matches = [...html.matchAll(/<a[^>]+class="result__a"[^>]+href="[^"]*uddg=([^"&]+)[^"]*"[^>]*>(.*?)<\/a>/gsi)];
    for (const match of matches) {
      const url = decodeURIComponent(match[1]);
      if (!/tiktok\.com\/@[^/]+\/video\/\d+/i.test(url)) continue;
      const title = stripHtmlTags(match[2]) || `TikTok result cho "${searchQuery}"`;
      const creator = url.match(/tiktok\.com\/(@[^/]+)\//i)?.[1] ?? 'TikTok Creator';
      return { url, title, creator, searchUrl, isSearchPage: false };
    }

    const directUrl = html.match(/https?:\/\/(?:www\.)?tiktok\.com\/@[^"' <]+\/video\/\d+/i)?.[0];
    if (directUrl) {
      const creator = directUrl.match(/tiktok\.com\/(@[^/]+)\//i)?.[1] ?? 'TikTok Creator';
      return { url: directUrl, title: `TikTok result cho "${searchQuery}"`, creator, searchUrl, isSearchPage: false };
    }
  } catch {}

  return {
    url: searchUrl,
    title: `Mở kết quả TikTok cho "${searchQuery}"`,
    creator: 'TikTok Search',
    searchUrl,
    isSearchPage: true,
  };
}

function randomFrom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function truncate(text, max = 1000) { return text.length > max ? text.slice(0, max) + '...' : text; }

function normalizeLookupTarget(input) {
  const raw = `${input ?? ''}`.trim();
  if (!raw) return '';
  try {
    const withProtocol = /^[a-z]+:\/\//i.test(raw) ? raw : `http://${raw}`;
    return new URL(withProtocol).hostname || raw;
  } catch {
    return raw.replace(/^https?:\/\//i, '').split('/')[0].split('?')[0].split('#')[0];
  }
}

async function resolveLookupIp(input) {
  const target = normalizeLookupTarget(input);
  if (!target) throw new Error('EMPTY_TARGET');
  if (net.isIP(target)) return { query: target, ip: target, hostname: null };

  try {
    const result = await dns.lookup(target);
    if (result?.address) return { query: target, ip: result.address, hostname: target };
  } catch {}

  try {
    const res = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(target)}&type=A`);
    const data = await res.json();
    const answer = data.Answer?.find(a => a.type === 1)?.data;
    if (answer && net.isIP(answer)) return { query: target, ip: answer, hostname: target };
  } catch {}

  throw new Error('RESOLVE_FAILED');
}

async function lookupIpData(input) {
  const resolved = await resolveLookupIp(input);
  let lastError = null;

  const providers = [
    async () => {
      const res = await fetch(`https://ipwho.is/${encodeURIComponent(resolved.ip)}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'ipwho_failed');
      return {
        query: resolved.query,
        ip: data.ip || resolved.ip,
        hostname: resolved.hostname,
        type: data.type || (net.isIP(resolved.ip) === 6 ? 'IPv6' : 'IPv4'),
        city: data.city || 'Không rõ',
        region: data.region || 'Không rõ',
        country: data.country || 'Không rõ',
        isp: data.connection?.isp || data.connection?.org || 'Không rõ',
        org: data.connection?.org || 'Không rõ',
        timezone: data.timezone?.id || 'Không rõ',
        latitude: data.latitude,
        longitude: data.longitude,
        flag: data.flag?.emoji || '🌍',
      };
    },
    async () => {
      const res = await fetch(`https://ipapi.co/${encodeURIComponent(resolved.ip)}/json/`);
      const data = await res.json();
      if (data.error) throw new Error(data.reason || 'ipapi_failed');
      return {
        query: resolved.query,
        ip: data.ip || resolved.ip,
        hostname: resolved.hostname,
        type: net.isIP(resolved.ip) === 6 ? 'IPv6' : 'IPv4',
        city: data.city || 'Không rõ',
        region: data.region || 'Không rõ',
        country: data.country_name || 'Không rõ',
        isp: data.org || 'Không rõ',
        org: data.org || 'Không rõ',
        timezone: data.timezone || 'Không rõ',
        latitude: data.latitude,
        longitude: data.longitude,
        flag: '🌍',
      };
    },
  ];

  for (const provider of providers) {
    try {
      return await provider();
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error('LOOKUP_FAILED');
}

function stripVietnameseAccents(text) {
  return `${text ?? ''}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

function normalizeGameText(text) {
  return `${text ?? ''}`
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeAnswerText(text) {
  return stripVietnameseAccents(normalizeGameText(text)).toLowerCase().trim();
}

function getSyllables(text) {
  return normalizeGameText(text).split(' ').filter(Boolean);
}

function isCompoundWord(text) {
  return getSyllables(text).length >= 2;
}

function getFirstSyllable(text) {
  return getSyllables(text)[0] ?? '';
}

function getLastSyllable(text) {
  const syllables = getSyllables(text);
  return syllables[syllables.length - 1] ?? '';
}

function scrambleLetters(text) {
  const chars = normalizeGameText(text).replace(/\s+/g, '').split('');
  if (chars.length <= 1) return chars.join(' / ');

  const original = chars.join('');
  let shuffled = [...chars];
  for (let i = 0; i < 8; i++) {
    shuffled = [...chars];
    for (let j = shuffled.length - 1; j > 0; j--) {
      const k = Math.floor(Math.random() * (j + 1));
      [shuffled[j], shuffled[k]] = [shuffled[k], shuffled[j]];
    }
    if (shuffled.join('') !== original) break;
  }
  return shuffled.join(' / ');
}

async function validateNoiTuPhrase(text) {
  const content = normalizeGameText(text);
  if (!content || !isCompoundWord(content)) return false;

  const syllables = getSyllables(content);
  if (syllables.length < 2 || syllables.length > 6) return false;
  if (syllables.some(s => s.length > 12 || !/[aeiouy]/i.test(stripVietnameseAccents(s)))) return false;

  if (noiTuValidationCache.has(content)) return noiTuValidationCache.get(content);

  if (!GROQ_KEY) {
    noiTuValidationCache.set(content, true);
    return true;
  }

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_KEY}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        temperature: 0,
        max_tokens: 8,
        messages: [
          {
            role: 'system',
            content: 'Bạn là bộ lọc cho game nối từ tiếng Việt. Chỉ trả lời đúng một từ: VALID hoặc INVALID.'
          },
          {
            role: 'user',
            content:
              `Đánh giá cụm từ tiếng Việt sau: "${content}".\n` +
              'VALID nếu đây là từ ghép, cụm từ, collocation hoặc thành ngữ tự nhiên có nghĩa.\n' +
              'INVALID nếu đây là chuỗi ghép bừa, vô nghĩa, quá gượng ép hoặc không tự nhiên.\n' +
              'Chỉ trả lời VALID hoặc INVALID.'
          }
        ]
      }),
    });

    const data = await res.json();
    const verdict = `${data.choices?.[0]?.message?.content ?? ''}`.trim().toUpperCase();
    const isValid = /^VALID\b/.test(verdict);
    noiTuValidationCache.set(content, isValid);
    return isValid;
  } catch {
    noiTuValidationCache.set(content, true);
    return true;
  }
}

function canManageChannelGame(interaction, hostId) {
  return interaction.user.id === hostId || interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages);
}

const xoGames = new Map();
const noiTuGames = new Map();
const vuaTiengVietGames = new Map();
const noiTuValidationCache = new Map();

const XO_WIN_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

const NOI_TU_WORD_BANK = [
  'học sinh', 'sinh viên', 'viên ngọc', 'ngọc trai', 'trai đẹp',
  'đẹp đôi', 'đôi mắt', 'mắt kính', 'kính mời', 'mời bạn',
  'bạn bè', 'bè bạn', 'bầu trời', 'trời xanh', 'xanh lá',
  'lá thư', 'thư viện', 'viện bảo tàng', 'tàng hình', 'hình như',
];

const VUA_TIENG_VIET_QUESTIONS = [
  { answer: 'áo dài', category: 'Trang phục', difficulty: 'easy' },
  { answer: 'bánh mì', category: 'Ẩm thực', difficulty: 'easy' },
  { answer: 'hoa sen', category: 'Thiên nhiên', difficulty: 'easy' },
  { answer: 'học sinh', category: 'Học đường', difficulty: 'easy' },
  { answer: 'mặt trời', category: 'Thiên nhiên', difficulty: 'easy' },
  { answer: 'xe đạp', category: 'Phương tiện', difficulty: 'easy' },
  { answer: 'bồ câu', category: 'Động vật', difficulty: 'medium' },
  { answer: 'cầu vồng', category: 'Thiên nhiên', difficulty: 'medium' },
  { answer: 'máy tính', category: 'Công nghệ', difficulty: 'medium' },
  { answer: 'thủ đô', category: 'Địa lý', difficulty: 'medium' },
  { answer: 'trống đồng', category: 'Lịch sử', difficulty: 'medium' },
  { answer: 'xe cứu hỏa', category: 'Phương tiện', difficulty: 'medium' },
  { answer: 'bạch tuộc', category: 'Động vật', difficulty: 'hard' },
  { answer: 'dạ khúc', category: 'Âm nhạc', difficulty: 'hard' },
  { answer: 'hải đăng', category: 'Biển cả', difficulty: 'hard' },
  { answer: 'phù sa', category: 'Địa lý', difficulty: 'hard' },
  { answer: 'thủy triều', category: 'Thiên nhiên', difficulty: 'hard' },
  { answer: 'vũ trụ', category: 'Khoa học', difficulty: 'hard' },
];

function getXOWinner(board) {
  for (const [a, b, c] of XO_WIN_LINES) {
    if (board[a] && board[a] === board[b] && board[b] === board[c]) return board[a];
  }
  return null;
}

function buildXOButtons(game) {
  return Array.from({ length: 3 }, (_, row) => {
    const actionRow = new ActionRowBuilder();
    for (let col = 0; col < 3; col++) {
      const index = row * 3 + col;
      const cell = game.board[index];
      let style = ButtonStyle.Secondary;
      if (cell === 'X') style = ButtonStyle.Danger;
      if (cell === 'O') style = ButtonStyle.Primary;
      actionRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`xo:${game.channelId}:${index}`)
          .setLabel(cell || String(index + 1))
          .setStyle(style)
          .setDisabled(Boolean(cell) || Boolean(game.winner))
      );
    }
    return actionRow;
  });
}

function buildXOEmbed(game) {
  const status = game.winner === 'draw'
    ? '🤝 Trận này hòa nhau.'
    : game.winner
      ? `🏆 <@${game.players[game.winner]}> đã thắng với quân ${game.winner}.`
      : `🎯 Đến lượt <@${game.players[game.turn]}> (${game.turn}).`;

  return new EmbedBuilder()
    .setTitle('❌ X O Arena')
    .setColor(game.winner ? (game.winner === 'draw' ? COLORS.warning : COLORS.success) : COLORS.primary)
    .setDescription(`❌ Người chơi X: <@${game.players.X}>\n⭕ Người chơi O: <@${game.players.O}>\n\n${status}`)
    .setFooter({ text: 'Bấm vào ô bên dưới để đánh cờ' })
    .setTimestamp();
}

function getNoiTuLeader(scores) {
  const top = Object.entries(scores ?? {}).sort((a, b) => b[1] - a[1])[0];
  return top ? `<@${top[0]}> (${top[1]} lượt)` : 'Chưa có';
}

function buildNoiTuEmbed(game, title = '🔗 Nối từ') {
  const target = getLastSyllable(game.currentWord);
  return new EmbedBuilder()
    .setTitle(title)
    .setColor(COLORS.info)
    .setDescription(
      `🎯 Từ hiện tại: **${game.currentWord}**\n` +
      `➡️ Từ tiếp theo phải bắt đầu bằng: **${target}**\n` +
      `🔥 Tổng cụm đã nối: **${game.used.size}**\n` +
      `👑 Người dẫn đầu: ${getNoiTuLeader(game.scores)}\n\n` +
      'Gửi đáp án bằng tin nhắn thường. Cụm từ phải có ít nhất 2 tiếng, có nghĩa và không được trùng.'
    )
    .setFooter({ text: 'Lệnh nhanh: /nt | Lệnh quản lý: /noitu' })
    .setTimestamp();
}

function pickVuaTiengVietQuestion(difficulty) {
  const pool = VUA_TIENG_VIET_QUESTIONS.filter(q => !difficulty || q.difficulty === difficulty);
  return randomFrom(pool.length > 0 ? pool : VUA_TIENG_VIET_QUESTIONS);
}

function buildVuaTiengVietEmbed(game, title = '👑 Vua tiếng Việt', reveal = false) {
  const timeLeft = Math.max(0, Math.ceil((game.endsAt - Date.now()) / 1000));
  const lines = [
    `📚 Chủ đề: **${game.category}**`,
    `🎚️ Độ khó: **${game.difficultyLabel}**`,
    `🔀 Chữ cái xáo trộn: **${game.scrambledLetters}**`,
    `🔢 Số chữ cái: **${game.letterCount}** | Số tiếng: **${game.syllableCount}**`,
    reveal ? `✅ Đáp án: **${game.answer}**` : '🧩 Hãy ghép lại thành từ hoặc cụm từ đúng.',
  ];
  if (!reveal) lines.push(`⏳ Thời gian còn lại: **${timeLeft}s**`);
  lines.push('', 'Trả lời bằng tin nhắn thường trong channel này.');
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(lines.join('\n'))
    .setColor(reveal ? COLORS.success : COLORS.primary)
    .setFooter({ text: 'Lệnh nhanh: /vtv | Lệnh quản lý: /vuatiengviet' })
    .setTimestamp();
}

async function handleNoiTuMessage(message) {
  const game = noiTuGames.get(message.channelId);
  if (!game) return false;

  const content = normalizeGameText(message.content);
  if (!content || !isCompoundWord(content)) return false;

  const expected = getLastSyllable(game.currentWord);
  if (getFirstSyllable(content) !== expected) {
    await message.react('❌').catch(() => {});
    return true;
  }

  if (game.used.has(content)) {
    await message.reply(`⚠️ Cụm từ **${content}** đã được dùng rồi.`).then(m => setTimeout(() => m.delete().catch(() => {}), 5000)).catch(() => {});
    return true;
  }

  const isValidPhrase = await validateNoiTuPhrase(content);
  if (!isValidPhrase) {
    await message.react('❌').catch(() => {});
    await message.reply(`⚠️ Cụm từ **${content}** chưa hợp lệ hoặc không tự nhiên trong tiếng Việt.`)
      .then(m => setTimeout(() => m.delete().catch(() => {}), 5000))
      .catch(() => {});
    return true;
  }

  game.currentWord = content;
  game.used.add(content);
  game.scores[message.author.id] = (game.scores[message.author.id] ?? 0) + 1;
  await message.react('✅').catch(() => {});

  if (game.used.size % 10 === 0) {
    await message.channel.send({ embeds: [buildNoiTuEmbed(game, '🔥 Nối từ đang nóng')] }).catch(() => {});
  }
  return true;
}

async function handleVuaTiengVietMessage(message) {
  const game = vuaTiengVietGames.get(message.channelId);
  if (!game) return false;

  const content = normalizeAnswerText(message.content);
  if (!content || content !== game.normalizedAnswer) return false;

  clearTimeout(game.timeout);
  vuaTiengVietGames.delete(message.channelId);
  await message.reply({
    embeds: [
      embed(
        '👑 Có người trả lời đúng!',
        `🎉 <@${message.author.id}> đã thắng trò Vua tiếng Việt.\nĐáp án: **${game.answer}**\nChữ cái ban đầu: **${game.scrambledLetters}**`,
        COLORS.success
      )
    ]
  }).catch(() => {});
  return true;
}

// ══════════════════════════════════════════════════════════
//  CLIENT & MUSIC QUEUE
// ══════════════════════════════════════════════════════════
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ]
});

const musicQueues = new Map();

// ══════════════════════════════════════════════════════════
//  SLASH COMMANDS DEFINITION
// ══════════════════════════════════════════════════════════
const commands = [
  // ── MENU ──
  new SlashCommandBuilder().setName('menu').setDescription('📋 Xem toàn bộ lệnh'),
  new SlashCommandBuilder().setName('help').setDescription('❓ Hướng dẫn sử dụng bot'),

  // ── HƯỚNG DẪN ──
new SlashCommandBuilder()
  .setName('huongdan')
  .setDescription('📖 Hướng dẫn sử dụng các lệnh của bot')
  .addStringOption(o =>
    o.setName('lenh')
      .setDescription('Chọn lệnh cần xem hướng dẫn')
      .setRequired(false)
      .addChoices({ name: '🔓 bypass', value: 'bypass' })
  ),
  // ── AI (11 lệnh) ──
  new SlashCommandBuilder().setName('ask').setDescription('🤖 Hỏi Groq AI')
    .addStringOption(o => o.setName('cauhoi').setDescription('Câu hỏi').setRequired(true)),
  new SlashCommandBuilder().setName('translate').setDescription('🌐 Dịch văn bản')
    .addStringOption(o => o.setName('text').setDescription('Văn bản').setRequired(true))
    .addStringOption(o => o.setName('lang').setDescription('Ngôn ngữ đích').setRequired(true)),
  new SlashCommandBuilder().setName('summarize').setDescription('📝 Tóm tắt văn bản')
    .addStringOption(o => o.setName('text').setDescription('Văn bản dài').setRequired(true)),
  new SlashCommandBuilder().setName('grammar').setDescription('✏️ Sửa lỗi ngữ pháp')
    .addStringOption(o => o.setName('text').setDescription('Văn bản').setRequired(true)),
  new SlashCommandBuilder().setName('explain').setDescription('💻 Giải thích code')
    .addStringOption(o => o.setName('code').setDescription('Đoạn code').setRequired(true)),
  new SlashCommandBuilder().setName('story').setDescription('📖 Tạo truyện ngắn')
    .addStringOption(o => o.setName('prompt').setDescription('Chủ đề').setRequired(true)),
  new SlashCommandBuilder().setName('idea').setDescription('💡 Tạo ý tưởng')
    .addStringOption(o => o.setName('topic').setDescription('Chủ đề').setRequired(true)),
  new SlashCommandBuilder().setName('quiz').setDescription('❓ Câu hỏi quiz')
    .addStringOption(o => o.setName('topic').setDescription('Chủ đề').setRequired(false)),
  new SlashCommandBuilder().setName('define').setDescription('📚 Tra từ điển')
    .addStringOption(o => o.setName('word').setDescription('Từ cần tra').setRequired(true)),
  new SlashCommandBuilder().setName('roast').setDescription('🔥 AI chê bai hài hước')
    .addUserOption(o => o.setName('user').setDescription('Người cần roast').setRequired(false)),
  new SlashCommandBuilder().setName('compliment').setDescription('💐 AI khen ngợi')
    .addUserOption(o => o.setName('user').setDescription('Người cần khen').setRequired(false)),

  // ── INFO (11 lệnh) ──
  new SlashCommandBuilder().setName('ping').setDescription('🏓 Độ trễ bot'),
  new SlashCommandBuilder().setName('userinfo').setDescription('👤 Thông tin thành viên')
    .addUserOption(o => o.setName('user').setDescription('Thành viên').setRequired(false)),
  new SlashCommandBuilder().setName('serverinfo').setDescription('🏠 Thông tin server'),
  new SlashCommandBuilder().setName('avatar').setDescription('🖼️ Avatar thành viên')
    .addUserOption(o => o.setName('user').setDescription('Thành viên').setRequired(false)),
  new SlashCommandBuilder().setName('weather').setDescription('🌦️ Thời tiết')
    .addStringOption(o => o.setName('city').setDescription('Thành phố').setRequired(true)),
  new SlashCommandBuilder().setName('crypto').setDescription('💹 Giá crypto')
    .addStringOption(o => o.setName('coin').setDescription('Tên coin').setRequired(true)),
  new SlashCommandBuilder().setName('calc').setDescription('🧮 Máy tính')
    .addStringOption(o => o.setName('expr').setDescription('Biểu thức').setRequired(true)),
  new SlashCommandBuilder().setName('ipinfo').setDescription('🌐 Tra IP')
    .addStringOption(o => o.setName('ip').setDescription('IP/domain').setRequired(true)),
  new SlashCommandBuilder().setName('ip').setDescription('🌍 Tra nhanh IP hoặc domain')
    .addStringOption(o => o.setName('ip').setDescription('IP/domain').setRequired(true)),
  new SlashCommandBuilder().setName('botstats').setDescription('📊 Thống kê bot'),
  new SlashCommandBuilder().setName('currency').setDescription('💱 Tỷ giá')
    .addStringOption(o => o.setName('from').setDescription('Từ').setRequired(true))
    .addStringOption(o => o.setName('to').setDescription('Sang').setRequired(true))
    .addNumberOption(o => o.setName('amount').setDescription('Số tiền').setRequired(false)),

  // ── MOD (17 lệnh) ──
  new SlashCommandBuilder().setName('kick').setDescription('👢 Kick thành viên')
    .addUserOption(o => o.setName('user').setDescription('Thành viên').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Lý do').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
  new SlashCommandBuilder().setName('ban').setDescription('🔨 Ban thành viên')
    .addUserOption(o => o.setName('user').setDescription('Thành viên').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Lý do').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
  new SlashCommandBuilder().setName('unban').setDescription('🔓 Unban')
    .addStringOption(o => o.setName('userid').setDescription('User ID').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
  new SlashCommandBuilder().setName('mute').setDescription('🔇 Mute')
    .addUserOption(o => o.setName('user').setDescription('Thành viên').setRequired(true))
    .addIntegerOption(o => o.setName('minutes').setDescription('Phút').setMinValue(1).setMaxValue(40320).setRequired(false))
    .addStringOption(o => o.setName('reason').setDescription('Lý do').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder().setName('unmute').setDescription('🔊 Unmute')
    .addUserOption(o => o.setName('user').setDescription('Thành viên').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder().setName('warn').setDescription('⚠️ Cảnh cáo')
    .addUserOption(o => o.setName('user').setDescription('Thành viên').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Lý do').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder().setName('warns').setDescription('📋 Xem cảnh cáo')
    .addUserOption(o => o.setName('user').setDescription('Thành viên').setRequired(false)),
  new SlashCommandBuilder().setName('clearwarns').setDescription('🗑️ Xóa cảnh cáo')
    .addUserOption(o => o.setName('user').setDescription('Thành viên').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder().setName('purge').setDescription('🗑️ Xóa tin nhắn hàng loạt')
    .addIntegerOption(o => o.setName('amount').setDescription('Số lượng 1-100').setMinValue(1).setMaxValue(100).setRequired(true))
    .addUserOption(o => o.setName('user').setDescription('Chỉ xóa của user này').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder().setName('purgebot').setDescription('🤖 Xóa tin nhắn của bot')
    .addIntegerOption(o => o.setName('amount').setDescription('Số lượng cần quét (1-100)').setMinValue(1).setMaxValue(100).setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder().setName('purgelinks').setDescription('🔗 Xóa tin nhắn chứa link')
    .addIntegerOption(o => o.setName('amount').setDescription('Số lượng cần quét (1-100)').setMinValue(1).setMaxValue(100).setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder().setName('purgeimages').setDescription('🖼️ Xóa tin nhắn chứa ảnh/file')
    .addIntegerOption(o => o.setName('amount').setDescription('Số lượng cần quét (1-100)').setMinValue(1).setMaxValue(100).setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder().setName('purgeword').setDescription('🔍 Xóa tin nhắn chứa từ khóa')
    .addStringOption(o => o.setName('keyword').setDescription('Từ khóa cần xóa').setRequired(true))
    .addIntegerOption(o => o.setName('amount').setDescription('Số lượng cần quét (1-100)').setMinValue(1).setMaxValue(100).setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder().setName('slowmode').setDescription('⏱️ Slowmode')
    .addIntegerOption(o => o.setName('seconds').setDescription('Giây 0-21600').setMinValue(0).setMaxValue(21600).setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  new SlashCommandBuilder().setName('lock').setDescription('🔒 Khóa kênh')
    .addStringOption(o => o.setName('reason').setDescription('Lý do').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  new SlashCommandBuilder().setName('unlock').setDescription('🔓 Mở khóa kênh')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  new SlashCommandBuilder().setName('nickname').setDescription('🎭 Đổi biệt danh')
    .addUserOption(o => o.setName('user').setDescription('Thành viên').setRequired(true))
    .addStringOption(o => o.setName('nickname').setDescription('Biệt danh mới').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames),

  // ── MUSIC (7 lệnh) ──
  new SlashCommandBuilder().setName('play').setDescription('🎵 Phát nhạc')
    .addStringOption(o => o.setName('song').setDescription('Tên bài hoặc link').setRequired(true)),
  new SlashCommandBuilder().setName('skip').setDescription('⏭️ Skip bài'),
  new SlashCommandBuilder().setName('stop').setDescription('⏹️ Dừng nhạc'),
  new SlashCommandBuilder().setName('queue').setDescription('📜 Hàng đợi'),
  new SlashCommandBuilder().setName('nowplaying').setDescription('🎵 Bài đang phát'),
  new SlashCommandBuilder().setName('loop').setDescription('🔁 Bật/tắt lặp'),
  new SlashCommandBuilder().setName('shuffle').setDescription('🔀 Xáo trộn'),

  // ── FUN (16 lệnh) ──
  new SlashCommandBuilder().setName('coinflip').setDescription('🪙 Tung đồng xu'),
  new SlashCommandBuilder().setName('roll').setDescription('🎲 Tung xúc xắc')
    .addIntegerOption(o => o.setName('sides').setDescription('Số mặt (mặc định 6)').setMinValue(2).setMaxValue(100).setRequired(false)),
  new SlashCommandBuilder().setName('8ball').setDescription('🔮 Hỏi quả cầu thần')
    .addStringOption(o => o.setName('question').setDescription('Câu hỏi').setRequired(true)),
  new SlashCommandBuilder().setName('joke').setDescription('😂 Kể chuyện cười'),
  new SlashCommandBuilder().setName('meme').setDescription('😂 Ảnh chế ngẫu nhiên'),
  new SlashCommandBuilder().setName('lovecalc').setDescription('💕 Đo độ hợp')
    .addUserOption(o => o.setName('user1').setDescription('Người 1').setRequired(true))
    .addUserOption(o => o.setName('user2').setDescription('Người 2').setRequired(true)),
  new SlashCommandBuilder().setName('rps').setDescription('✊ Kéo búa bao')
    .addStringOption(o => o.setName('choice').setDescription('Lựa chọn').setRequired(true)
      .addChoices({ name: '✊ Búa', value: 'rock' }, { name: '✋ Bao', value: 'paper' }, { name: '✌️ Kéo', value: 'scissors' })),
  new SlashCommandBuilder().setName('slap').setDescription('👋 Tát ai đó')
    .addUserOption(o => o.setName('user').setDescription('Người bị tát').setRequired(true)),
  new SlashCommandBuilder().setName('hug').setDescription('🤗 Ôm ai đó')
    .addUserOption(o => o.setName('user').setDescription('Người được ôm').setRequired(true)),
  new SlashCommandBuilder().setName('kiss').setDescription('😘 Hôn ai đó')
    .addUserOption(o => o.setName('user').setDescription('Người được hôn').setRequired(true)),
  new SlashCommandBuilder().setName('pat').setDescription('🫳 Vỗ đầu')
    .addUserOption(o => o.setName('user').setDescription('Người được vỗ').setRequired(true)),
  new SlashCommandBuilder().setName('trivia').setDescription('🧠 Câu đố vui'),
  new SlashCommandBuilder().setName('dadjoke').setDescription('👨 Dad joke'),
  new SlashCommandBuilder().setName('quote').setDescription('💬 Quote ngẫu nhiên'),
  new SlashCommandBuilder().setName('fact').setDescription('💡 Sự thật thú vị'),
  new SlashCommandBuilder().setName('tiktok').setDescription('🎵 Tìm video TikTok')
    .addStringOption(o => o.setName('query').setDescription('Từ khóa tìm kiếm').setRequired(true)),

  // ── GAME (5 lệnh) ──
  new SlashCommandBuilder().setName('xo').setDescription('❌ Chơi X O với bạn bè')
    .addUserOption(o => o.setName('user').setDescription('Người chơi cùng').setRequired(true)),
  new SlashCommandBuilder().setName('nt').setDescription('🔗 Nối từ nhanh')
    .addStringOption(o => o.setName('word').setDescription('Từ bắt đầu (ít nhất 2 tiếng)').setRequired(false)),
  new SlashCommandBuilder().setName('noitu').setDescription('🔗 Quản lý trò chơi nối từ')
    .addStringOption(o => o.setName('action').setDescription('Hành động').setRequired(true)
      .addChoices(
        { name: 'Bắt đầu', value: 'start' },
        { name: 'Xem trạng thái', value: 'status' },
        { name: 'Dừng game', value: 'stop' }
      ))
    .addStringOption(o => o.setName('word').setDescription('Từ bắt đầu (ít nhất 2 tiếng)').setRequired(false)),
  new SlashCommandBuilder().setName('vtv').setDescription('👑 Vua tiếng Việt nhanh')
    .addStringOption(o => o.setName('difficulty').setDescription('Độ khó').setRequired(false)
      .addChoices(
        { name: 'Dễ', value: 'easy' },
        { name: 'Trung bình', value: 'medium' },
        { name: 'Khó', value: 'hard' }
      )),
  new SlashCommandBuilder().setName('vuatiengviet').setDescription('👑 Quản lý trò chơi Vua tiếng Việt')
    .addStringOption(o => o.setName('action').setDescription('Hành động').setRequired(true)
      .addChoices(
        { name: 'Bắt đầu', value: 'start' },
        { name: 'Xem trạng thái', value: 'status' },
        { name: 'Dừng game', value: 'stop' }
      ))
    .addStringOption(o => o.setName('difficulty').setDescription('Độ khó').setRequired(false)
      .addChoices(
        { name: 'Dễ', value: 'easy' },
        { name: 'Trung bình', value: 'medium' },
        { name: 'Khó', value: 'hard' }
      )),

  // ── UTILITY (12 lệnh) ──
  new SlashCommandBuilder().setName('poll').setDescription('📊 Tạo bình chọn')
    .addStringOption(o => o.setName('question').setDescription('Câu hỏi').setRequired(true))
    .addStringOption(o => o.setName('option1').setDescription('Lựa chọn 1').setRequired(true))
    .addStringOption(o => o.setName('option2').setDescription('Lựa chọn 2').setRequired(true))
    .addStringOption(o => o.setName('option3').setDescription('Lựa chọn 3').setRequired(false))
    .addStringOption(o => o.setName('option4').setDescription('Lựa chọn 4').setRequired(false)),
  new SlashCommandBuilder().setName('remind').setDescription('⏰ Nhắc nhở')
    .addStringOption(o => o.setName('time').setDescription('Thời gian (VD: 10m, 1h, 1d)').setRequired(true))
    .addStringOption(o => o.setName('message').setDescription('Nội dung nhắc').setRequired(true)),
  new SlashCommandBuilder().setName('afk').setDescription('😴 Đặt trạng thái AFK')
    .addStringOption(o => o.setName('reason').setDescription('Lý do').setRequired(false)),
  new SlashCommandBuilder().setName('timer').setDescription('⏲️ Đếm ngược')
    .addIntegerOption(o => o.setName('seconds').setDescription('Số giây').setMinValue(1).setMaxValue(3600).setRequired(true)),
  new SlashCommandBuilder().setName('say').setDescription('💬 Bot nói thay bạn')
    .addStringOption(o => o.setName('message').setDescription('Tin nhắn').setRequired(true)),
  new SlashCommandBuilder().setName('embed').setDescription('📋 Tạo embed')
    .addStringOption(o => o.setName('title').setDescription('Tiêu đề').setRequired(true))
    .addStringOption(o => o.setName('description').setDescription('Nội dung').setRequired(true))
    .addStringOption(o => o.setName('color').setDescription('Màu hex (VD: #FF0000)').setRequired(false)),
  new SlashCommandBuilder().setName('announce').setDescription('📢 Thông báo')
    .addStringOption(o => o.setName('message').setDescription('Nội dung').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder().setName('choose').setDescription('🎯 Chọn ngẫu nhiên')
    .addStringOption(o => o.setName('options').setDescription('Các lựa chọn (ngăn bởi dấu |)').setRequired(true)),
  new SlashCommandBuilder().setName('reverse').setDescription('🔄 Đảo ngược chữ')
    .addStringOption(o => o.setName('text').setDescription('Văn bản').setRequired(true)),
  new SlashCommandBuilder().setName('base64').setDescription('🔐 Mã hóa Base64')
    .addStringOption(o => o.setName('action').setDescription('encode/decode').setRequired(true).addChoices({ name: 'Encode', value: 'encode' }, { name: 'Decode', value: 'decode' }))
    .addStringOption(o => o.setName('text').setDescription('Văn bản').setRequired(true)),
  new SlashCommandBuilder().setName('qrcode').setDescription('📱 Tạo QR code')
    .addStringOption(o => o.setName('text').setDescription('Nội dung').setRequired(true)),
  new SlashCommandBuilder().setName('shorturl').setDescription('🔗 Rút gọn URL')
    .addStringOption(o => o.setName('url').setDescription('Link dài').setRequired(true)),

  // ── LEVEL/XP (5 lệnh) ──
  new SlashCommandBuilder().setName('rank').setDescription('📊 Xem cấp độ')
    .addUserOption(o => o.setName('user').setDescription('Thành viên').setRequired(false)),
  new SlashCommandBuilder().setName('leaderboard').setDescription('🏆 Bảng xếp hạng'),
  new SlashCommandBuilder().setName('checkin').setDescription('📅 Điểm danh hàng ngày'),
  new SlashCommandBuilder().setName('profile').setDescription('👤 Xem profile')
    .addUserOption(o => o.setName('user').setDescription('Thành viên').setRequired(false)),
  new SlashCommandBuilder().setName('badges').setDescription('🏅 Xem huy hiệu')
    .addUserOption(o => o.setName('user').setDescription('Thành viên').setRequired(false)),
];

// ══════════════════════════════════════════════════════════
//  BOT READY
// ══════════════════════════════════════════════════════════
client.once('ready', async () => {
  console.log(`✅ Bot online: ${client.user.tag}`);
  client.user.setActivity('🎵 /menu để xem lệnh', { type: ActivityType.Watching });

  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands.map(c => c.toJSON()) });
    console.log(`✅ Đã đăng ký ${commands.length} lệnh!`);
  } catch (err) {
    console.error('❌ Lỗi đăng ký commands:', err);
  }
});

// ══════════════════════════════════════════════════════════
//  INTERACTION HANDLER
// ══════════════════════════════════════════════════════════
client.on('interactionCreate', async interaction => {
  if (interaction.isButton() && interaction.customId.startsWith('xo:')) {
    const [, channelId, cellIndex] = interaction.customId.split(':');
    const game = xoGames.get(channelId);

    if (!game || game.messageId !== interaction.message.id) {
      return interaction.reply({ content: 'Bàn cờ này đã hết hiệu lực.', ephemeral: true });
    }
    if (interaction.user.id !== game.players.X && interaction.user.id !== game.players.O) {
      return interaction.reply({ content: 'Bạn không phải người chơi trong trận này.', ephemeral: true });
    }
    if (interaction.user.id !== game.players[game.turn]) {
      return interaction.reply({ content: 'Chưa đến lượt bạn.', ephemeral: true });
    }

    const index = Number(cellIndex);
    if (!Number.isInteger(index) || index < 0 || index > 8 || game.board[index]) {
      return interaction.reply({ content: 'Ô này không hợp lệ hoặc đã được đánh rồi.', ephemeral: true });
    }

    game.board[index] = game.turn;
    const winner = getXOWinner(game.board);
    if (winner) game.winner = winner;
    else if (game.board.every(Boolean)) game.winner = 'draw';
    else game.turn = game.turn === 'X' ? 'O' : 'X';

    if (game.winner) xoGames.delete(channelId);
    return interaction.update({ embeds: [buildXOEmbed(game)], components: buildXOButtons(game) });
  }

  if (!interaction.isChatInputCommand()) return;
  const cmd = interaction.commandName;

  try {
    incrementStat(`cmd_${cmd}`);

    // ════════════════════════════════════════════════════════
    //  MENU & HELP
    // ════════════════════════════════════════════════════════
    if (cmd === 'menu' || cmd === 'help') {
      const e = new EmbedBuilder()
        .setTitle('📋 Trung Tâm Lệnh')
        .setColor(COLORS.primary)
        .setThumbnail(client.user.displayAvatarURL())
        .setDescription('Chọn nhóm lệnh bên dưới. Các game nhanh nên dùng `/xo`, `/nt`, `/vtv` và tra IP nhanh bằng `/ip`.')
        .addFields(
          { name: '🤖 AI (11)', value: '`/ask` `/translate` `/summarize` `/grammar` `/explain` `/story` `/idea` `/quiz` `/define` `/roast` `/compliment`' },
          { name: 'ℹ️ Info (11)', value: '`/ping` `/userinfo` `/serverinfo` `/avatar` `/weather` `/crypto` `/calc` `/ipinfo` `/ip` `/botstats` `/currency`' },
          { name: '🛡️ Mod (17)', value: '`/kick` `/ban` `/unban` `/mute` `/unmute` `/warn` `/warns` `/clearwarns` `/purge` `/purgebot` `/purgelinks` `/purgeimages` `/purgeword` `/slowmode` `/lock` `/unlock` `/nickname`' },
          { name: '🗑️ Xóa Chat', value: '`/purge` — theo user\n`/purgebot` — xóa tin bot\n`/purgelinks` — xóa tin chứa link\n`/purgeimages` — xóa tin chứa ảnh/file\n`/purgeword` — xóa theo từ khóa' },
          { name: '🎵 Music (7)', value: '`/play` `/skip` `/stop` `/queue` `/nowplaying` `/loop` `/shuffle`' },
          { name: '🎮 Fun (16)', value: '`/coinflip` `/roll` `/8ball` `/joke` `/meme` `/lovecalc` `/rps` `/slap` `/hug` `/kiss` `/pat` `/trivia` `/dadjoke` `/quote` `/fact` `/tiktok`' },
          { name: '🕹️ Game (5)', value: '`/xo` `/nt` `/vtv` `/noitu` `/vuatiengviet`' },
          { name: '🔧 Utility (12)', value: '`/poll` `/remind` `/afk` `/timer` `/say` `/embed` `/announce` `/choose` `/reverse` `/base64` `/qrcode` `/shorturl`' },
          { name: '📊 Level/XP (5)', value: '`/rank` `/leaderboard` `/checkin` `/profile` `/badges`' },
          { name: '📖 Hướng dẫn (1)', value: '`/huongdan` — Hướng dẫn sử dụng lệnh `/bypass`' }
        )
        .setFooter({ text: `Tổng ${commands.length} lệnh | Dùng /huongdan để xem hướng dẫn bypass` })
        .setTimestamp();
      return interaction.reply({ embeds: [e] });
    }

    // ════════════════════════════════════════════════════════
    //  PING
    // ════════════════════════════════════════════════════════
    if (cmd === 'ping') {
      const latency = Date.now() - interaction.createdTimestamp;
      return interaction.reply({ embeds: [embed('🏓 Pong!', `⏱️ ${latency}ms | 💓 ${client.ws.ping}ms`, COLORS.success)] });
    }

    // ════════════════════════════════════════════════════════
    //  HƯỚNG DẪN BYPASS  ← LỆNH MỚI THÊM VÀO
    // ════════════════════════════════════════════════════════
   if (cmd === 'huongdan') {
  const lenh = interaction.options.getString('lenh') ?? 'bypass';

  if (lenh === 'bypass') {
    const e = new EmbedBuilder()
      .setTitle('📖 Hướng dẫn sử dụng lệnh /bypass')
      .setColor(COLORS.info)
      .setDescription(
        '### 📌 Các bước thực hiện\n\n' +
        '**Bước 1️⃣** — Vào thanh chat, gõ lệnh `/bypass`\n\n' +
        '**Bước 2️⃣** — Sau khi lệnh hiện ra như này:\n' +
        '> `/bypass` `url` `|`\n\n' +
        '**Bước 3️⃣** — Điền đường link cần bypass vào chỗ **url**\n\n' +
        '**Bước 4️⃣** — Bấm **Enter** hoặc **Gửi**, rồi chờ khoảng **5–10 giây**\n\n' +
        '**Bước 5️⃣** — Bot trả kết quả → **Copy và dán** vào là xong! ✅\n\n' +
        '---\n' +
        '### ⚠️ Lưu ý quan trọng\n' +
        '> • Bot **không** bypass được các link dạng `link4...` và một số loại link đặc biệt khác\n' +
        '> • Phải nhập **đúng đường dẫn** (khuyến khích có `https://`) thì bot mới xử lý được\n' +
        '> • Nếu sau **10 giây** không có kết quả, hãy kiểm tra lại link và thử lại'
      )
      .setFooter({ text: 'Chúc bạn bypass thành công! 🎉' })
      .setTimestamp();
    return interaction.reply({ embeds: [e] });
  }

  // fallback nếu thêm lệnh khác sau này
  return interaction.reply({ embeds: [errorEmbed('Không tìm thấy', `Chưa có hướng dẫn cho lệnh **${lenh}**`)] });
}

    // ════════════════════════════════════════════════════════
    //  AI COMMANDS
    // ════════════════════════════════════════════════════════
    if (['ask', 'translate', 'summarize', 'grammar', 'explain', 'story', 'idea', 'quiz', 'define', 'roast', 'compliment'].includes(cmd)) {
      await interaction.deferReply();
      let result;

      if (cmd === 'ask') {
        const q = interaction.options.getString('cauhoi');
        result = await askGroq(q, 'Trả lời ngắn gọn, rõ ràng bằng tiếng Việt.');
        return interaction.editReply({ embeds: [embed('🤖 Groq AI', `**❓ Câu hỏi:** ${truncate(q, 200)}\n\n**💬 Trả lời:**\n${truncate(result, 3500)}`, COLORS.groq)] });
      }
      if (cmd === 'translate') {
        const text = interaction.options.getString('text');
        const lang = interaction.options.getString('lang');
        result = await askGroq(`Dịch sang ${lang}, CHỈ trả về bản dịch:\n${text}`);
        return interaction.editReply({ embeds: [embed('🌐 Dịch thuật', `📝 **Gốc:** ${truncate(text, 400)}\n\n🔄 **${lang}:** ${truncate(result, 1500)}`, COLORS.info)] });
      }
      if (cmd === 'summarize') {
        const text = interaction.options.getString('text');
        result = await askGroq(`Tóm tắt ngắn gọn:\n${text}`);
        return interaction.editReply({ embeds: [embed('📝 Tóm tắt', truncate(result, 2000), COLORS.primary)] });
      }
      if (cmd === 'grammar') {
        const text = interaction.options.getString('text');
        result = await askGroq(`Sửa lỗi ngữ pháp:\n${text}`);
        return interaction.editReply({ embeds: [embed('✏️ Đã sửa', truncate(result, 2000), COLORS.success)] });
      }
      if (cmd === 'explain') {
        const code = interaction.options.getString('code');
        result = await askGroq(`Giải thích code:\n\`\`\`\n${code}\n\`\`\``);
        return interaction.editReply({ embeds: [embed('💻 Giải thích Code', truncate(result, 2000), COLORS.info)] });
      }
      if (cmd === 'story') {
        const prompt = interaction.options.getString('prompt');
        result = await askGroq(`Viết truyện ngắn 200-300 từ về: ${prompt}`, null, 800);
        return interaction.editReply({ embeds: [embed('📖 Truyện ngắn', truncate(result, 3800), COLORS.primary)] });
      }
      if (cmd === 'idea') {
        const topic = interaction.options.getString('topic');
        result = await askGroq(`Tạo 5 ý tưởng sáng tạo về: ${topic}`, null, 600);
        return interaction.editReply({ embeds: [embed(`💡 Ý tưởng: ${topic}`, truncate(result, 2000), COLORS.warning)] });
      }
      if (cmd === 'quiz') {
        const topic = interaction.options.getString('topic') ?? 'kiến thức tổng quát';
        result = await askGroq(`Tạo câu hỏi trắc nghiệm về ${topic} có 4 đáp án A/B/C/D và đáp án đúng`, null, 400);
        return interaction.editReply({ embeds: [embed(`❓ Quiz — ${topic}`, truncate(result, 2000), COLORS.primary)] });
      }
      if (cmd === 'define') {
        const word = interaction.options.getString('word');
        result = await askGroq(`Tra từ điển: "${word}". Nghĩa, ví dụ, từ đồng nghĩa.`, null, 400);
        return interaction.editReply({ embeds: [embed(`📚 Từ điển: ${word}`, truncate(result, 2000), COLORS.info)] });
      }
      if (cmd === 'roast') {
        const target = interaction.options.getUser('user') ?? interaction.user;
        result = await askGroq(`Chê bai hài hước (roast) người tên "${target.username}", 2-3 câu, KHÔNG xúc phạm thật`, null, 200);
        return interaction.editReply({ embeds: [embed(`🔥 Roast: ${target.username}`, result, COLORS.danger).setThumbnail(target.displayAvatarURL())] });
      }
      if (cmd === 'compliment') {
        const target = interaction.options.getUser('user') ?? interaction.user;
        result = await askGroq(`Khen ngợi chân thành người tên "${target.username}", 2-3 câu`, null, 200);
        return interaction.editReply({ embeds: [embed(`💐 Khen: ${target.username}`, result, COLORS.success).setThumbnail(target.displayAvatarURL())] });
      }
    }

    // ════════════════════════════════════════════════════════
    //  INFO COMMANDS
    // ════════════════════════════════════════════════════════
    if (cmd === 'userinfo') {
      const target = interaction.options.getUser('user') ?? interaction.user;
      const member = interaction.guild?.members.cache.get(target.id);
      const e = new EmbedBuilder()
        .setTitle(`👤 ${target.tag}`)
        .setThumbnail(target.displayAvatarURL({ size: 256 }))
        .setColor(member?.displayColor || COLORS.primary)
        .addFields(
          { name: '🆔 ID', value: `\`${target.id}\``, inline: true },
          { name: '🤖 Bot?', value: target.bot ? '✅' : '❌', inline: true },
          { name: '📅 Tạo tài khoản', value: `<t:${Math.floor(target.createdTimestamp / 1000)}:D>`, inline: true }
        );
      if (member) {
        e.addFields(
          { name: '📥 Tham gia', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:D>`, inline: true },
          { name: '🎭 Biệt danh', value: member.nickname ?? 'Không', inline: true },
          { name: '🏷️ Roles', value: member.roles.cache.size > 1 ? member.roles.cache.filter(r => r.id !== interaction.guild.id).map(r => r.toString()).slice(0, 5).join(' ') : 'Không có' }
        );
      }
      return interaction.reply({ embeds: [e] });
    }

    if (cmd === 'serverinfo') {
      if (!interaction.guild) return interaction.reply({ content: '❌ Chỉ dùng trong server!', ephemeral: true });
      const g = interaction.guild;
      const e = new EmbedBuilder()
        .setTitle(`🏠 ${g.name}`)
        .setThumbnail(g.iconURL({ size: 256 }))
        .setColor(COLORS.primary)
        .addFields(
          { name: '🆔 ID', value: `\`${g.id}\``, inline: true },
          { name: '👑 Chủ', value: `<@${g.ownerId}>`, inline: true },
          { name: '📅 Tạo', value: `<t:${Math.floor(g.createdTimestamp / 1000)}:D>`, inline: true },
          { name: '👥 Thành viên', value: `${g.memberCount}`, inline: true },
          { name: '📢 Kênh', value: `${g.channels.cache.size}`, inline: true },
          { name: '🎭 Roles', value: `${g.roles.cache.size}`, inline: true },
          { name: '💎 Boost', value: `Level ${g.premiumTier} · ${g.premiumSubscriptionCount} boosts`, inline: true }
        )
        .setTimestamp();
      return interaction.reply({ embeds: [e] });
    }

    if (cmd === 'avatar') {
      const target = interaction.options.getUser('user') ?? interaction.user;
      const e = new EmbedBuilder()
        .setTitle(`🖼️ Avatar — ${target.tag}`)
        .setColor(COLORS.primary)
        .setImage(target.displayAvatarURL({ size: 1024 }))
        .addFields({ name: '🔗 Link', value: `[PNG](${target.displayAvatarURL({ size: 1024, format: 'png' })})` });
      return interaction.reply({ embeds: [e] });
    }

    if (cmd === 'weather') {
      await interaction.deferReply();
      const city = interaction.options.getString('city');
      try {
        if (WEATHER_KEY) {
          const res = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${WEATHER_KEY}&units=metric&lang=vi`);
          const w = await res.json();
          if (w.cod !== 200) return interaction.editReply({ embeds: [errorEmbed('Không tìm thấy', `Thành phố **${city}** không tồn tại!`)] });
          const e = new EmbedBuilder()
            .setTitle(`🌦️ ${w.name}, ${w.sys.country}`)
            .setColor(COLORS.info)
            .setThumbnail(`https://openweathermap.org/img/wn/${w.weather[0].icon}@2x.png`)
            .addFields(
              { name: '🌡️ Nhiệt độ', value: `${w.main.temp}°C`, inline: true },
              { name: '💧 Độ ẩm', value: `${w.main.humidity}%`, inline: true },
              { name: '💨 Gió', value: `${w.wind.speed} m/s`, inline: true },
              { name: '☁️ Trạng thái', value: w.weather[0].description }
            );
          return interaction.editReply({ embeds: [e] });
        } else {
          const res = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=j1`);
          const w = await res.json();
          const cur = w.current_condition[0];
          return interaction.editReply({ embeds: [embed(`🌦️ ${city}`, `🌡️ ${cur.temp_C}°C · 💧 ${cur.humidity}% · 💨 ${cur.windspeedKmph}km/h\n☁️ ${cur.weatherDesc[0].value}`, COLORS.info)] });
        }
      } catch { return interaction.editReply({ embeds: [errorEmbed('Lỗi', 'Không lấy được thời tiết!')] }); }
    }

    if (cmd === 'crypto') {
      await interaction.deferReply();
      const coin = interaction.options.getString('coin').toLowerCase();
      try {
        const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${coin}&vs_currencies=usd,vnd&include_24hr_change=true`);
        const data = await res.json();
        if (!data[coin]) return interaction.editReply({ embeds: [errorEmbed('Không tìm thấy', `Coin **${coin}** không tồn tại!`)] });
        const c = data[coin];
        const change = c.usd_24h_change?.toFixed(2) ?? 'N/A';
        return interaction.editReply({ embeds: [embed(`💹 ${coin.toUpperCase()}`, `💵 $${c.usd?.toLocaleString()}\n🇻🇳 ₫${c.vnd?.toLocaleString()}\n📈 24h: ${change}%`, parseFloat(change) >= 0 ? COLORS.success : COLORS.danger)] });
      } catch { return interaction.editReply({ embeds: [errorEmbed('Lỗi', 'Không lấy được giá!')] }); }
    }

    if (cmd === 'calc') {
      const expr = interaction.options.getString('expr');
      try {
        const safe = expr.replace(/[^0-9+\-*/().,^sqrt\s]/g, '').replace(/\^/g, '**').replace(/sqrt\(([^)]+)\)/g, (_, n) => `Math.sqrt(${n})`);
        const result = Function(`"use strict"; return (${safe})`)();
        return interaction.reply({ embeds: [embed('🧮 Máy tính', `📝 \`${expr}\` = **${result}**`, COLORS.primary)] });
      } catch { return interaction.reply({ embeds: [errorEmbed('Lỗi', `Biểu thức không hợp lệ: \`${expr}\``)] }); }
    }

    if (cmd === 'ipinfo' || cmd === 'ip') {
      await interaction.deferReply();
      const input = interaction.options.getString('ip');
      try {
        const data = await lookupIpData(input);
        const location = [data.city, data.region, data.country].filter(Boolean).join(', ');
        const coordinates = (data.latitude != null && data.longitude != null)
          ? `${data.latitude}, ${data.longitude}`
          : 'Không rõ';

        const e = new EmbedBuilder()
          .setTitle(`${data.flag} Tra Cứu IP / Domain`)
          .setColor(COLORS.info)
          .setDescription(`🔎 Đầu vào: \`${data.query}\`\n🧭 IP thực: \`${data.ip}\`${data.hostname ? `\n🌐 Domain: \`${data.hostname}\`` : ''}`)
          .addFields(
            { name: '📍 Vị trí', value: location || 'Không rõ' },
            { name: '📡 ISP', value: data.isp || 'Không rõ', inline: true },
            { name: '🧬 Tổ chức', value: data.org || 'Không rõ', inline: true },
            { name: '🛰️ Loại', value: data.type || 'Không rõ', inline: true },
            { name: '🕐 Múi giờ', value: data.timezone || 'Không rõ', inline: true },
            { name: '🗺️ Tọa độ', value: coordinates, inline: true }
          )
          .setFooter({ text: 'Hỗ trợ cả IP, domain và URL' })
          .setTimestamp();

        return interaction.editReply({ embeds: [e] });
      } catch {
        return interaction.editReply({
          embeds: [
            errorEmbed(
              'Không tra được IP',
              'Hãy nhập IP hoặc domain hợp lệ.\nVí dụ: `8.8.8.8`, `1.1.1.1`, `google.com`, `https://openai.com`'
            )
          ]
        });
      }
    }

    if (cmd === 'botstats') {
      const stats = loadDB('stats');
      const uptime = process.uptime();
      const h = Math.floor(uptime / 3600);
      const m = Math.floor((uptime % 3600) / 60);
      const totalCmds = Object.entries(stats).filter(([k]) => k.startsWith('cmd_')).reduce((sum, [, v]) => sum + v, 0);
      return interaction.reply({ embeds: [embed('📊 Thống kê Bot', `⏱️ Uptime: ${h}h ${m}p\n🏠 Servers: ${client.guilds.cache.size}\n👥 Users: ${client.guilds.cache.reduce((a, g) => a + g.memberCount, 0)}\n📝 Lệnh đã dùng: ${totalCmds}`, COLORS.primary).setThumbnail(client.user.displayAvatarURL())] });
    }

    if (cmd === 'currency') {
      await interaction.deferReply();
      const from = interaction.options.getString('from').toUpperCase();
      const to = interaction.options.getString('to').toUpperCase();
      const amount = interaction.options.getNumber('amount') ?? 1;
      try {
        const res = await fetch(`https://api.frankfurter.app/latest?from=${from}&to=${to}`);
        const data = await res.json();
        if (!data.rates?.[to]) return interaction.editReply({ embeds: [errorEmbed('Lỗi', `Không hỗ trợ ${from}/${to}!`)] });
        const rate = data.rates[to];
        const result = (amount * rate).toFixed(4);
        return interaction.editReply({ embeds: [embed('💱 Tỷ giá', `${amount} ${from} = **${result} ${to}**\n📈 1 ${from} = ${rate} ${to}`, COLORS.success)] });
      } catch { return interaction.editReply({ embeds: [errorEmbed('Lỗi', 'Không lấy được tỷ giá!')] }); }
    }

    // ════════════════════════════════════════════════════════
    //  MOD COMMANDS
    // ════════════════════════════════════════════════════════
    if (cmd === 'kick') {
      const target = interaction.options.getMember('user');
      const reason = interaction.options.getString('reason') ?? 'Không có lý do';
      if (!target) return interaction.reply({ embeds: [errorEmbed('Lỗi', 'Không tìm thấy!')], ephemeral: true });
      if (!target.kickable) return interaction.reply({ embeds: [errorEmbed('Lỗi', 'Bot không thể kick!')], ephemeral: true });
      await target.kick(reason);
      return interaction.reply({ embeds: [embed('👢 Đã Kick', `🎯 ${target.user.tag}\n📝 ${reason}`, COLORS.danger)] });
    }

    if (cmd === 'ban') {
      const target = interaction.options.getMember('user');
      const reason = interaction.options.getString('reason') ?? 'Không có lý do';
      if (!target) return interaction.reply({ embeds: [errorEmbed('Lỗi', 'Không tìm thấy!')], ephemeral: true });
      if (!target.bannable) return interaction.reply({ embeds: [errorEmbed('Lỗi', 'Bot không thể ban!')], ephemeral: true });
      await target.ban({ reason });
      return interaction.reply({ embeds: [embed('🔨 Đã Ban', `🎯 ${target.user.tag}\n📝 ${reason}`, COLORS.danger)] });
    }

    if (cmd === 'unban') {
      await interaction.deferReply();
      const userId = interaction.options.getString('userid');
      try {
        const banned = await interaction.guild.bans.fetch(userId);
        await interaction.guild.members.unban(userId);
        return interaction.editReply({ embeds: [successEmbed('🔓 Đã Unban', banned.user.tag)] });
      } catch { return interaction.editReply({ embeds: [errorEmbed('Lỗi', 'Không tìm thấy user bị ban!')] }); }
    }

    if (cmd === 'mute') {
      const target = interaction.options.getMember('user');
      const minutes = interaction.options.getInteger('minutes') ?? 10;
      const reason = interaction.options.getString('reason') ?? 'Không có lý do';
      if (!target) return interaction.reply({ embeds: [errorEmbed('Lỗi', 'Không tìm thấy!')], ephemeral: true });
      if (!target.moderatable) return interaction.reply({ embeds: [errorEmbed('Lỗi', 'Bot không thể mute!')], ephemeral: true });
      await target.timeout(minutes * 60 * 1000, reason);
      return interaction.reply({ embeds: [embed('🔇 Đã Mute', `🎯 ${target.user.tag}\n⏱️ ${minutes} phút\n📝 ${reason}`, COLORS.warning)] });
    }

    if (cmd === 'unmute') {
      const target = interaction.options.getMember('user');
      if (!target) return interaction.reply({ embeds: [errorEmbed('Lỗi', 'Không tìm thấy!')], ephemeral: true });
      await target.timeout(null);
      return interaction.reply({ embeds: [successEmbed('🔊 Đã Unmute', target.user.tag)] });
    }

    if (cmd === 'warn') {
      const target = interaction.options.getMember('user');
      const reason = interaction.options.getString('reason');
      if (!target) return interaction.reply({ embeds: [errorEmbed('Lỗi', 'Không tìm thấy!')], ephemeral: true });
      const warns = addWarn(interaction.guildId, target.id, reason, interaction.user.id);
      return interaction.reply({ embeds: [embed('⚠️ Đã Cảnh cáo', `🎯 ${target.user.tag}\n📝 ${reason}\n📊 Tổng: ${warns.length} cảnh cáo`, COLORS.warning)] });
    }

    if (cmd === 'warns') {
      const target = interaction.options.getUser('user') ?? interaction.user;
      const warns = getWarns(interaction.guildId, target.id);
      if (warns.length === 0) return interaction.reply({ embeds: [successEmbed('Không có cảnh cáo', `${target.tag} sạch sẽ!`)] });
      const list = warns.slice(-5).map((w, i) => `**#${i + 1}** ${w.reason} — <@${w.modId}>`).join('\n');
      return interaction.reply({ embeds: [embed(`📋 Cảnh cáo — ${target.tag}`, `${list}\n\n📊 Tổng: ${warns.length}`, COLORS.warning)] });
    }

    if (cmd === 'clearwarns') {
      const target = interaction.options.getUser('user');
      clearWarns(interaction.guildId, target.id);
      return interaction.reply({ embeds: [successEmbed('Đã xóa', `Xóa cảnh cáo của ${target.tag}`)] });
    }

    // ════════════════════════════════════════════════════════
    //  PURGE COMMANDS
    // ════════════════════════════════════════════════════════
    const FOURTEEN_DAYS = 14 * 24 * 60 * 60 * 1000;

    if (cmd === 'purge') {
      const amount = interaction.options.getInteger('amount');
      const user = interaction.options.getUser('user');
      await interaction.deferReply({ ephemeral: true });

      let messages = await interaction.channel.messages.fetch({ limit: 100 });
      if (user) messages = messages.filter(m => m.author.id === user.id);

      const tooOld = [...messages.values()].filter(m => Date.now() - m.createdTimestamp >= FOURTEEN_DAYS);
      messages = messages.filter(m => Date.now() - m.createdTimestamp < FOURTEEN_DAYS);
      messages = [...messages.values()].slice(0, amount);

      if (messages.length === 0) {
        return interaction.editReply({
          embeds: [errorEmbed('Không có gì để xóa',
            tooOld.length > 0
              ? `⚠️ ${tooOld.length} tin nhắn quá **14 ngày** — Discord không cho phép xóa hàng loạt!`
              : 'Không tìm thấy tin nhắn phù hợp!'
          )]
        });
      }

      const deleted = await interaction.channel.bulkDelete(messages, true);
      console.log(`[PURGE] #${interaction.channel.name} | ${interaction.user.tag} xóa ${deleted.size} tin${user ? ` của ${user.tag}` : ''}`);

      return interaction.editReply({
        embeds: [successEmbed('🗑️ Đã xóa tin nhắn',
          `✅ Xóa **${deleted.size}** tin nhắn${user ? ` của **${user.tag}**` : ''}\n📍 Kênh: ${interaction.channel}\n👮 Mod: ${interaction.user.tag}${tooOld.length > 0 ? `\n⚠️ Bỏ qua **${tooOld.length}** tin quá 14 ngày` : ''}`
        )]
      });
    }

    if (cmd === 'purgebot') {
      const amount = interaction.options.getInteger('amount');
      await interaction.deferReply({ ephemeral: true });

      let messages = await interaction.channel.messages.fetch({ limit: 100 });
      messages = [...messages.values()]
        .filter(m => m.author.bot && Date.now() - m.createdTimestamp < FOURTEEN_DAYS)
        .slice(0, amount);

      if (messages.length === 0) {
        return interaction.editReply({ embeds: [errorEmbed('Không tìm thấy', 'Không có tin nhắn bot nào trong phạm vi cho phép!')] });
      }

      const deleted = await interaction.channel.bulkDelete(messages, true);
      console.log(`[PURGEBOT] #${interaction.channel.name} | ${interaction.user.tag} xóa ${deleted.size} tin bot`);

      return interaction.editReply({
        embeds: [successEmbed('🤖 Đã xóa tin nhắn Bot',
          `✅ Xóa **${deleted.size}** tin nhắn của bot\n📍 Kênh: ${interaction.channel}\n👮 Mod: ${interaction.user.tag}`
        )]
      });
    }

    if (cmd === 'purgelinks') {
      const amount = interaction.options.getInteger('amount');
      await interaction.deferReply({ ephemeral: true });

      const linkRegex = /https?:\/\/\S+/i;
      let messages = await interaction.channel.messages.fetch({ limit: 100 });
      messages = [...messages.values()]
        .filter(m => linkRegex.test(m.content) && Date.now() - m.createdTimestamp < FOURTEEN_DAYS)
        .slice(0, amount);

      if (messages.length === 0) {
        return interaction.editReply({ embeds: [errorEmbed('Không tìm thấy', 'Không có tin nhắn nào chứa link trong phạm vi!')] });
      }

      const deleted = await interaction.channel.bulkDelete(messages, true);
      console.log(`[PURGELINKS] #${interaction.channel.name} | ${interaction.user.tag} xóa ${deleted.size} tin chứa link`);

      return interaction.editReply({
        embeds: [successEmbed('🔗 Đã xóa tin nhắn chứa Link',
          `✅ Xóa **${deleted.size}** tin nhắn chứa link\n📍 Kênh: ${interaction.channel}\n👮 Mod: ${interaction.user.tag}`
        )]
      });
    }

    if (cmd === 'purgeimages') {
      const amount = interaction.options.getInteger('amount');
      await interaction.deferReply({ ephemeral: true });

      let messages = await interaction.channel.messages.fetch({ limit: 100 });
      messages = [...messages.values()]
        .filter(m =>
          (m.attachments.size > 0 || m.embeds.some(e => e.image || e.thumbnail)) &&
          Date.now() - m.createdTimestamp < FOURTEEN_DAYS
        )
        .slice(0, amount);

      if (messages.length === 0) {
        return interaction.editReply({ embeds: [errorEmbed('Không tìm thấy', 'Không có tin nhắn nào chứa ảnh/file trong phạm vi!')] });
      }

      const deleted = await interaction.channel.bulkDelete(messages, true);
      console.log(`[PURGEIMAGES] #${interaction.channel.name} | ${interaction.user.tag} xóa ${deleted.size} tin chứa ảnh/file`);

      return interaction.editReply({
        embeds: [successEmbed('🖼️ Đã xóa tin nhắn chứa Ảnh/File',
          `✅ Xóa **${deleted.size}** tin nhắn chứa ảnh/file\n📍 Kênh: ${interaction.channel}\n👮 Mod: ${interaction.user.tag}`
        )]
      });
    }

    if (cmd === 'purgeword') {
      const keyword = interaction.options.getString('keyword').toLowerCase();
      const amount = interaction.options.getInteger('amount') ?? 50;
      await interaction.deferReply({ ephemeral: true });

      let messages = await interaction.channel.messages.fetch({ limit: 100 });
      messages = [...messages.values()]
        .filter(m => m.content.toLowerCase().includes(keyword) && Date.now() - m.createdTimestamp < FOURTEEN_DAYS)
        .slice(0, amount);

      if (messages.length === 0) {
        return interaction.editReply({ embeds: [errorEmbed('Không tìm thấy', `Không có tin nhắn nào chứa từ khóa **"${keyword}"** trong phạm vi!`)] });
      }

      const deleted = await interaction.channel.bulkDelete(messages, true);
      console.log(`[PURGEWORD] #${interaction.channel.name} | keyword="${keyword}" | ${interaction.user.tag} xóa ${deleted.size} tin`);

      return interaction.editReply({
        embeds: [successEmbed('🔍 Đã xóa tin nhắn theo từ khóa',
          `✅ Xóa **${deleted.size}** tin nhắn chứa **"${keyword}"**\n📍 Kênh: ${interaction.channel}\n👮 Mod: ${interaction.user.tag}`
        )]
      });
    }

    if (cmd === 'slowmode') {
      const seconds = interaction.options.getInteger('seconds');
      await interaction.channel.setRateLimitPerUser(seconds);
      return interaction.reply({ embeds: [successEmbed('Slowmode', seconds === 0 ? 'Đã tắt' : `Đặt ${seconds}s`)] });
    }

    if (cmd === 'lock') {
      const reason = interaction.options.getString('reason') ?? 'Không có lý do';
      await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: false });
      return interaction.reply({ embeds: [embed('🔒 Đã khóa kênh', `📝 ${reason}`, COLORS.danger)] });
    }

    if (cmd === 'unlock') {
      await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: null });
      return interaction.reply({ embeds: [successEmbed('🔓 Đã mở khóa', 'Kênh đã được mở')] });
    }

    if (cmd === 'nickname') {
      const target = interaction.options.getMember('user');
      const nickname = interaction.options.getString('nickname');
      if (!target) return interaction.reply({ embeds: [errorEmbed('Lỗi', 'Không tìm thấy!')], ephemeral: true });
      await target.setNickname(nickname);
      return interaction.reply({ embeds: [successEmbed('🎭 Đã đổi biệt danh', `${target.user.tag} → **${nickname}**`)] });
    }

    // ════════════════════════════════════════════════════════
    //  MUSIC COMMANDS
    // ════════════════════════════════════════════════════════
    if (!musicQueues.has(interaction.guildId)) musicQueues.set(interaction.guildId, { songs: [], loop: false, current: 0 });
    const queue = musicQueues.get(interaction.guildId);

    if (cmd === 'play') {
      await interaction.deferReply();
      const song = interaction.options.getString('song');
      try {
        const result = await searchYouTube(song);
        if (!result) return interaction.editReply({ embeds: [errorEmbed('Không tìm thấy', `Không tìm thấy: **${song}**`)] });
        queue.songs.push(result);
        const e = new EmbedBuilder()
          .setTitle('🎵 Đã thêm vào hàng đợi')
          .setColor(COLORS.music)
          .setThumbnail(result.thumbnail)
          .addFields(
            { name: '🎶 Bài hát', value: `[${result.title}](${result.url})` },
            { name: '👤 Kênh', value: result.channel || 'N/A', inline: true },
            { name: '⏱️ Thời lượng', value: result.duration || 'N/A', inline: true },
            { name: '📍 Vị trí', value: `#${queue.songs.length}`, inline: true }
          )
          .setDescription(`▶️ **[Nghe trên YouTube](${result.url})**`)
          .setFooter({ text: `Thêm bởi ${interaction.user.tag}` });
        return interaction.editReply({ embeds: [e] });
      } catch { return interaction.editReply({ embeds: [errorEmbed('Lỗi', 'Không tìm được bài!')] }); }
    }

    if (cmd === 'queue') {
      if (queue.songs.length === 0) return interaction.reply({ embeds: [errorEmbed('Hàng đợi trống', 'Chưa có bài nào!')] });
      const list = queue.songs.slice(0, 10).map((s, i) => `${i === queue.current ? '▶️ ' : ''}**${i + 1}.** [${s.title}](${s.url})`).join('\n');
      return interaction.reply({ embeds: [embed('📜 Hàng đợi', `${list}\n\n📊 Tổng: ${queue.songs.length} | 🔁 ${queue.loop ? 'Bật' : 'Tắt'}`, COLORS.music)] });
    }

    if (cmd === 'nowplaying') {
      if (queue.songs.length === 0) return interaction.reply({ embeds: [errorEmbed('Không có bài nào', 'Hàng đợi trống!')] });
      const now = queue.songs[queue.current];
      return interaction.reply({ embeds: [embed('🎵 Đang phát', `[${now.title}](${now.url})\n👤 ${now.channel} | ⏱️ ${now.duration}`, COLORS.music).setThumbnail(now.thumbnail)] });
    }

    if (cmd === 'skip') {
      if (queue.songs.length === 0) return interaction.reply({ embeds: [errorEmbed('Không có gì để skip', 'Hàng đợi trống!')] });
      const skipped = queue.songs[queue.current];
      queue.current = (queue.current + 1) % queue.songs.length;
      const next = queue.songs[queue.current];
      return interaction.reply({ embeds: [embed('⏭️ Đã Skip', `⏭️ ${skipped.title}\n🎵 Tiếp theo: [${next.title}](${next.url})`, COLORS.music)] });
    }

    if (cmd === 'stop') {
      if (queue.songs.length === 0) return interaction.reply({ embeds: [errorEmbed('Không có gì để dừng', 'Hàng đợi trống!')] });
      const count = queue.songs.length;
      musicQueues.delete(interaction.guildId);
      return interaction.reply({ embeds: [successEmbed('⏹️ Đã dừng', `Xóa ${count} bài`)] });
    }

    if (cmd === 'loop') {
      queue.loop = !queue.loop;
      return interaction.reply({ embeds: [embed('🔁 Chế độ lặp', queue.loop ? '✅ Đã bật' : '❌ Đã tắt', queue.loop ? COLORS.success : COLORS.warning)] });
    }

    if (cmd === 'shuffle') {
      if (queue.songs.length < 2) return interaction.reply({ embeds: [errorEmbed('Không đủ bài', 'Cần ít nhất 2 bài!')] });
      for (let i = queue.songs.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [queue.songs[i], queue.songs[j]] = [queue.songs[j], queue.songs[i]];
      }
      queue.current = 0;
      return interaction.reply({ embeds: [successEmbed('🔀 Đã xáo trộn', `${queue.songs.length} bài`)] });
    }

    // ════════════════════════════════════════════════════════
    //  FUN COMMANDS
    // ════════════════════════════════════════════════════════
    if (cmd === 'coinflip') {
      const result = randomFrom(['🌕 Mặt Ngửa', '🌑 Mặt Sấp']);
      const win = result.includes('Ngửa');
      return interaction.reply({ embeds: [embed('🪙 Tung đồng xu', `Kết quả: **${result}**`, win ? COLORS.success : COLORS.warning)] });
    }

    if (cmd === 'roll') {
      const sides = interaction.options.getInteger('sides') ?? 6;
      const result = Math.floor(Math.random() * sides) + 1;
      const isMax = result === sides;
      return interaction.reply({ embeds: [embed(`🎲 Tung xúc xắc ${sides} mặt`, `Kết quả: **${result}**${isMax ? ' 🎉 Điểm tối đa!' : ''}`, isMax ? COLORS.success : COLORS.primary)] });
    }

    if (cmd === '8ball') {
      const q = interaction.options.getString('question');
      const answers = [
        'Chắc chắn rồi! 🎯', 'Có thể lắm đó! 😊', 'Theo dự đoán của tôi là CÓ! ✅',
        'Khả năng rất cao! 📈', 'Không nghi ngờ gì nữa! 💯',
        'Nhìn không khả quan lắm... 😬', 'Câu trả lời rất mờ nhạt, hỏi lại sau đi! 🌫️',
        'Tốt hơn là đừng nên kỳ vọng! 😅', 'Không có gì chắc chắn cả! 🤷',
        'Câu trả lời là KHÔNG! ❌', 'Đừng mơ nhé bạn ơi! 😂', 'Tuyệt đối không! 🚫',
        'Hỏi tôi sau khi bạn cúng ông địa đã! 🕯️', 'Vũ trụ nói rằng... Có lẽ không! 🌌',
        'Bạn biết câu trả lời rồi đấy, cần tôi xác nhận không? 😏',
      ];
      return interaction.reply({ embeds: [embed('🔮 Quả cầu thần', `**❓ ${q}**\n\n**💬 ${randomFrom(answers)}**`, COLORS.primary)] });
    }

    if (cmd === 'joke') {
      await interaction.deferReply();
      try {
        const joke = await askGroq('Kể một câu chuyện cười ngắn bằng tiếng Việt, hài hước và vui nhộn. Chỉ kể chuyện cười thôi, không giải thích gì thêm.', null, 300);
        return interaction.editReply({ embeds: [embed('😂 Chuyện cười', joke, COLORS.warning)] });
      } catch { return interaction.editReply({ embeds: [errorEmbed('Lỗi', 'Không lấy được joke!')] }); }
    }

    if (cmd === 'meme') {
      await interaction.deferReply();
      try {
        const result = await askGroq(
          'Tạo một meme text hài hước bằng tiếng Việt theo format:\n🖼️ **[Tên meme/tình huống]**\n\n*Trên:* [chữ trên ảnh]\n*Dưới:* [chữ dưới ảnh]\n\n[Giải thích ngắn tại sao buồn cười]',
          null, 300
        );
        return interaction.editReply({ embeds: [embed('😂 Meme hôm nay', result, COLORS.primary)] });
      } catch { return interaction.editReply({ embeds: [errorEmbed('Lỗi', 'Không lấy được meme!')] }); }
    }

    if (cmd === 'lovecalc') {
      const u1 = interaction.options.getUser('user1');
      const u2 = interaction.options.getUser('user2');
      const percent = Math.floor(Math.random() * 101);
      const hearts = '❤️'.repeat(Math.floor(percent / 10)) + '🤍'.repeat(10 - Math.floor(percent / 10));
      let comment;
      if (percent >= 90) comment = '💞 Trời sinh một cặp! Cưới thôi!';
      else if (percent >= 70) comment = '😍 Rất hợp nhau, tương lai xán lạn!';
      else if (percent >= 50) comment = '😊 Khá hợp, cần thêm thời gian tìm hiểu!';
      else if (percent >= 30) comment = '🤔 Hơi khó, nhưng tình yêu vượt qua tất cả!';
      else comment = '😬 Ôi trời... Có lẽ chỉ là bạn thôi nhỉ?';
      return interaction.reply({ embeds: [embed('💕 Đo độ hợp', `💑 **${u1.username}** × **${u2.username}**\n\n${hearts}\n\n**${percent}%** hợp nhau!\n${comment}`, COLORS.primary)] });
    }

    if (cmd === 'rps') {
      const choice = interaction.options.getString('choice');
      const choices = ['rock', 'paper', 'scissors'];
      const botChoice = randomFrom(choices);
      const emojis = { rock: '✊ Búa', paper: '✋ Bao', scissors: '✌️ Kéo' };
      let result, color;
      if (choice === botChoice) { result = '🤝 Hòa! Thử lại nào!'; color = COLORS.warning; }
      else if (
        (choice === 'rock' && botChoice === 'scissors') ||
        (choice === 'paper' && botChoice === 'rock') ||
        (choice === 'scissors' && botChoice === 'paper')
      ) { result = '🎉 Bạn thắng! Giỏi quá!'; color = COLORS.success; }
      else { result = '😢 Bạn thua rồi! Chơi lại không?'; color = COLORS.danger; }
      return interaction.reply({ embeds: [embed('✊ Kéo Búa Bao', `👤 Bạn: **${emojis[choice]}**\n🤖 Bot: **${emojis[botChoice]}**\n\n**${result}**`, color)] });
    }

    if (cmd === 'slap') {
      const target = interaction.options.getUser('user');
      const msgs = [
        `${interaction.user.username} tát **${target.username}** một cái đau điếng! 👋💥`,
        `**${target.username}** vừa ăn một cái tát trời giáng từ ${interaction.user.username}! 😵`,
        `${interaction.user.username} vả **${target.username}** không trượt phát nào! 🤌👋`,
      ];
      return interaction.reply({ embeds: [embed('👋 Tát!', randomFrom(msgs), COLORS.danger)] });
    }

    if (cmd === 'hug') {
      const target = interaction.options.getUser('user');
      const msgs = [
        `${interaction.user.username} ôm **${target.username}** thật chặt! 🤗💕`,
        `**${target.username}** được ${interaction.user.username} ôm ấm áp quá! 🥰`,
        `${interaction.user.username} và **${target.username}** ôm nhau, cảnh tượng thật dễ thương! 🤗✨`,
      ];
      return interaction.reply({ embeds: [embed('🤗 Ôm!', randomFrom(msgs), COLORS.success)] });
    }

    if (cmd === 'kiss') {
      const target = interaction.options.getUser('user');
      const msgs = [
        `${interaction.user.username} hôn **${target.username}** nhẹ lên má! 😘💋`,
        `**${target.username}** đỏ mặt vì bị ${interaction.user.username} hôn bất ngờ! 😳💋`,
        `${interaction.user.username} gửi nụ hôn đến **${target.username}**! 😘❤️`,
      ];
      return interaction.reply({ embeds: [embed('😘 Hôn!', randomFrom(msgs), COLORS.primary)] });
    }

    if (cmd === 'pat') {
      const target = interaction.options.getUser('user');
      const msgs = [
        `${interaction.user.username} vỗ đầu **${target.username}** nhẹ nhàng! 🫳✨`,
        `**${target.username}** được ${interaction.user.username} xoa đầu khen ngoan! 🥹`,
        `${interaction.user.username} vỗ đầu **${target.username}**: "Ngoan lắm!" 🫳😄`,
      ];
      return interaction.reply({ embeds: [embed('🫳 Vỗ đầu!', randomFrom(msgs), COLORS.info)] });
    }

    if (cmd === 'trivia') {
      await interaction.deferReply();
      try {
        const result = await askGroq(
          'Tạo 1 câu hỏi trắc nghiệm vui bằng tiếng Việt với 4 đáp án A/B/C/D. Format bắt buộc:\n❓ [câu hỏi]\n\nA) [đáp án]\nB) [đáp án]\nC) [đáp án]\nD) [đáp án]\n\n||✅ Đáp án đúng: [chữ cái]||',
          null, 400
        );
        return interaction.editReply({ embeds: [embed('🧠 Câu đố vui', result, COLORS.primary)] });
      } catch { return interaction.editReply({ embeds: [errorEmbed('Lỗi', 'Không lấy được câu hỏi!')] }); }
    }

    if (cmd === 'dadjoke') {
      await interaction.deferReply();
      try {
        const joke = await askGroq('Kể một câu "dad joke" kiểu chơi chữ hài hước bằng tiếng Việt, theo phong cách bố kể chuyện cười nhạt mà tự cười. Chỉ kể joke thôi.', null, 200);
        return interaction.editReply({ embeds: [embed('👨 Dad Joke', joke, COLORS.warning)] });
      } catch { return interaction.editReply({ embeds: [errorEmbed('Lỗi', 'Không lấy được joke!')] }); }
    }

    if (cmd === 'quote') {
      await interaction.deferReply();
      try {
        const result = await askGroq(
          'Tạo một câu danh ngôn hoặc triết lý sống hay bằng tiếng Việt. Format:\n"[câu danh ngôn]"\n— [Tác giả hoặc "Khuyết danh"]',
          null, 200
        );
        return interaction.editReply({ embeds: [embed('💬 Danh ngôn', result, COLORS.info)] });
      } catch { return interaction.editReply({ embeds: [errorEmbed('Lỗi', 'Không lấy được quote!')] }); }
    }

    if (cmd === 'fact') {
      await interaction.deferReply();
      try {
        const result = await askGroq(
          'Chia sẻ một sự thật thú vị, kỳ lạ hoặc ít người biết bằng tiếng Việt. Phải là thông tin thật, thú vị và ngắn gọn (2-4 câu). Bắt đầu bằng "💡 Bạn có biết..."',
          null, 300
        );
        return interaction.editReply({ embeds: [embed('💡 Sự thật thú vị', result, COLORS.primary)] });
      } catch { return interaction.editReply({ embeds: [errorEmbed('Lỗi', 'Không lấy được fact!')] }); }
    }

    if (cmd === 'tiktok') {
      await interaction.deferReply();
      const query = interaction.options.getString('query');
      try {
        const result = await searchTikTok(query);
        if (!result) return interaction.editReply({ embeds: [errorEmbed('Không tìm thấy', `Không có kết quả TikTok cho: **${query}**`)] });

        const e = new EmbedBuilder()
          .setTitle('🎵 Kết quả TikTok')
          .setColor(COLORS.info)
          .setDescription(`🔎 Từ khóa: **${query}**\n🎬 Tiêu đề: **${truncate(result.title, 200)}**\n▶️ [Mở trên TikTok](${result.url})`)
          .addFields(
            { name: '👤 Nguồn', value: result.creator || 'TikTok', inline: true },
            { name: '🌐 Loại', value: result.isSearchPage ? 'Trang kết quả' : 'Video trực tiếp', inline: true }
          )
          .setFooter({ text: `Yêu cầu bởi ${interaction.user.tag}` });
        return interaction.editReply({ embeds: [e] });
      } catch {
        return interaction.editReply({ embeds: [errorEmbed('Lỗi', 'Không tìm được video TikTok!')] });
      }
    }

    // ════════════════════════════════════════════════════════
    //  GAME COMMANDS
    // ════════════════════════════════════════════════════════
    if (cmd === 'xo') {
      const target = interaction.options.getUser('user');
      if (target.bot) return interaction.reply({ embeds: [errorEmbed('Lỗi', 'Không thể chơi X O với bot!')], ephemeral: true });
      if (target.id === interaction.user.id) return interaction.reply({ embeds: [errorEmbed('Lỗi', 'Bạn không thể tự đấu với chính mình!')], ephemeral: true });

      const activeGame = xoGames.get(interaction.channelId);
      if (activeGame && Date.now() - activeGame.createdAt < 15 * 60 * 1000) {
        return interaction.reply({ embeds: [errorEmbed('Đang có trận đấu', 'Channel này đang có một ván X O chưa kết thúc.')], ephemeral: true });
      }
      if (activeGame) xoGames.delete(interaction.channelId);

      const game = {
        channelId: interaction.channelId,
        players: { X: interaction.user.id, O: target.id },
        board: Array(9).fill(null),
        turn: 'X',
        winner: null,
        createdAt: Date.now(),
      };

      xoGames.set(interaction.channelId, game);
      const message = await interaction.reply({
        embeds: [buildXOEmbed(game)],
        components: buildXOButtons(game),
        fetchReply: true,
      });
      game.messageId = message.id;
      return;
    }

    if (cmd === 'noitu' || cmd === 'nt') {
      const action = cmd === 'nt' ? 'start' : interaction.options.getString('action');

      if (action === 'start') {
        if (noiTuGames.has(interaction.channelId)) {
          return interaction.reply({ embeds: [errorEmbed('Đang chạy', 'Channel này đã có một game Nối từ rồi.')], ephemeral: true });
        }
        if (vuaTiengVietGames.has(interaction.channelId)) {
          return interaction.reply({ embeds: [errorEmbed('Bận channel', 'Channel này đang có game Vua tiếng Việt. Hãy dừng game đó trước.')], ephemeral: true });
        }

        const rawWord = interaction.options.getString('word') ?? randomFrom(NOI_TU_WORD_BANK);
        const startWord = normalizeGameText(rawWord);
        if (!isCompoundWord(startWord)) {
          return interaction.reply({ embeds: [errorEmbed('Lỗi', 'Từ bắt đầu phải có ít nhất 2 tiếng.')], ephemeral: true });
        }

        const game = {
          hostId: interaction.user.id,
          currentWord: startWord,
          used: new Set([startWord]),
          scores: {},
          startedAt: Date.now(),
        };
        noiTuGames.set(interaction.channelId, game);

        const e = buildNoiTuEmbed(game, '🔗 Bắt đầu Nối từ')
          .setFooter({ text: `Khởi tạo bởi ${interaction.user.tag}` });
        return interaction.reply({ embeds: [e] });
      }

      const game = noiTuGames.get(interaction.channelId);
      if (!game) {
        return interaction.reply({ embeds: [errorEmbed('Không có game', 'Channel này chưa có game Nối từ nào đang chạy.')], ephemeral: true });
      }

      if (action === 'status') {
        return interaction.reply({ embeds: [buildNoiTuEmbed(game, '🔎 Trạng thái Nối từ')] });
      }

      if (!canManageChannelGame(interaction, game.hostId)) {
        return interaction.reply({ embeds: [errorEmbed('Không đủ quyền', 'Chỉ người tạo game hoặc mod mới có thể dừng game này.')], ephemeral: true });
      }

      noiTuGames.delete(interaction.channelId);
      const summary = buildNoiTuEmbed(game, '🛑 Đã dừng Nối từ')
        .setFooter({ text: `Kết thúc bởi ${interaction.user.tag}` });
      return interaction.reply({ embeds: [summary] });
    }

    if (cmd === 'vuatiengviet' || cmd === 'vtv') {
      const action = cmd === 'vtv' ? 'start' : interaction.options.getString('action');

      if (action === 'start') {
        if (vuaTiengVietGames.has(interaction.channelId)) {
          return interaction.reply({ embeds: [errorEmbed('Đang chạy', 'Channel này đã có một game Vua tiếng Việt rồi.')], ephemeral: true });
        }
        if (noiTuGames.has(interaction.channelId)) {
          return interaction.reply({ embeds: [errorEmbed('Bận channel', 'Channel này đang có game Nối từ. Hãy dừng game đó trước.')], ephemeral: true });
        }

        const difficulty = interaction.options.getString('difficulty') ?? 'medium';
        const difficultyLabel = { easy: 'Dễ', medium: 'Trung bình', hard: 'Khó' }[difficulty] ?? 'Trung bình';
        const durationMs = { easy: 90000, medium: 75000, hard: 60000 }[difficulty] ?? 75000;
        const question = pickVuaTiengVietQuestion(difficulty);
        const gameId = `${Date.now()}_${interaction.channelId}`;
        const game = {
          id: gameId,
          hostId: interaction.user.id,
          answer: question.answer,
          normalizedAnswer: normalizeAnswerText(question.answer),
          category: question.category,
          difficultyLabel,
          scrambledLetters: scrambleLetters(question.answer),
          syllableCount: getSyllables(question.answer).length,
          letterCount: normalizeGameText(question.answer).replace(/\s+/g, '').length,
          startedAt: Date.now(),
          endsAt: Date.now() + durationMs,
        };

        game.timeout = setTimeout(() => {
          const active = vuaTiengVietGames.get(interaction.channelId);
          if (!active || active.id !== gameId) return;
          vuaTiengVietGames.delete(interaction.channelId);
          interaction.channel.send({ embeds: [buildVuaTiengVietEmbed(active, '⏰ Hết giờ Vua tiếng Việt', true)] }).catch(() => {});
        }, durationMs);

        vuaTiengVietGames.set(interaction.channelId, game);
        const e = buildVuaTiengVietEmbed(game, '👑 Bắt đầu Vua tiếng Việt')
          .setFooter({ text: `Khởi tạo bởi ${interaction.user.tag}` });
        return interaction.reply({ embeds: [e] });
      }

      const game = vuaTiengVietGames.get(interaction.channelId);
      if (!game) {
        return interaction.reply({ embeds: [errorEmbed('Không có game', 'Channel này chưa có game Vua tiếng Việt nào đang chạy.')], ephemeral: true });
      }

      if (action === 'status') {
        return interaction.reply({ embeds: [buildVuaTiengVietEmbed(game, '🔎 Trạng thái Vua tiếng Việt')] });
      }

      if (!canManageChannelGame(interaction, game.hostId)) {
        return interaction.reply({ embeds: [errorEmbed('Không đủ quyền', 'Chỉ người tạo game hoặc mod mới có thể dừng game này.')], ephemeral: true });
      }

      clearTimeout(game.timeout);
      vuaTiengVietGames.delete(interaction.channelId);
      const e = buildVuaTiengVietEmbed(game, '🛑 Đã dừng Vua tiếng Việt', true)
        .setFooter({ text: `Kết thúc bởi ${interaction.user.tag}` });
      return interaction.reply({ embeds: [e] });
    }

    // ════════════════════════════════════════════════════════
    //  UTILITY COMMANDS
    // ════════════════════════════════════════════════════════
    if (cmd === 'poll') {
      const q = interaction.options.getString('question');
      const opts = [
        interaction.options.getString('option1'),
        interaction.options.getString('option2'),
        interaction.options.getString('option3'),
        interaction.options.getString('option4'),
      ].filter(Boolean);
      const emojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣'];
      const desc = opts.map((o, i) => `${emojis[i]} ${o}`).join('\n');
      const e = new EmbedBuilder().setTitle(`📊 Poll: ${q}`).setDescription(desc).setColor(COLORS.primary).setFooter({ text: `Tạo bởi ${interaction.user.tag}` });
      const msg = await interaction.reply({ embeds: [e], fetchReply: true });
      for (let i = 0; i < opts.length; i++) await msg.react(emojis[i]);
    }

    if (cmd === 'remind') {
      const time = interaction.options.getString('time');
      const message = interaction.options.getString('message');
      const match = time.match(/^(\d+)([mhd])$/);
      if (!match) return interaction.reply({ embeds: [errorEmbed('Lỗi', 'Format: 10m, 1h, 1d')], ephemeral: true });
      const [, amount, unit] = match;
      const ms = { m: 60000, h: 3600000, d: 86400000 }[unit] * parseInt(amount);
      setTimeout(() => {
        interaction.user.send(`⏰ **Nhắc nhở:** ${message}`).catch(() => {});
      }, ms);
      return interaction.reply({ embeds: [successEmbed('⏰ Đã đặt nhắc nhở', `Sẽ nhắc sau ${time}: "${message}"`)] });
    }

    if (cmd === 'afk') {
      const reason = interaction.options.getString('reason') ?? 'AFK';
      const db = loadDB('afk');
      db[interaction.user.id] = { reason, since: Date.now() };
      saveDB('afk', db);
      return interaction.reply({ embeds: [embed('😴 AFK', `Đã đặt trạng thái AFK: ${reason}`, COLORS.info)] });
    }

    if (cmd === 'timer') {
      const seconds = interaction.options.getInteger('seconds');
      await interaction.reply({ embeds: [embed('⏲️ Timer', `Đếm ngược ${seconds}s...`, COLORS.warning)] });
      setTimeout(() => {
        interaction.followUp({ content: `⏰ <@${interaction.user.id}> Hết giờ! (${seconds}s)` });
      }, seconds * 1000);
    }

    if (cmd === 'say') {
      const msg = interaction.options.getString('message');
      await interaction.channel.send(msg);
      return interaction.reply({ content: '✅ Đã gửi!', ephemeral: true });
    }

    if (cmd === 'embed') {
      const title = interaction.options.getString('title');
      const desc = interaction.options.getString('description');
      const color = interaction.options.getString('color')?.replace('#', '');
      const e = new EmbedBuilder().setTitle(title).setDescription(desc).setColor(color ? parseInt(color, 16) : COLORS.primary);
      await interaction.channel.send({ embeds: [e] });
      return interaction.reply({ content: '✅ Đã tạo embed!', ephemeral: true });
    }

    if (cmd === 'announce') {
      const msg = interaction.options.getString('message');
      const e = new EmbedBuilder().setTitle('📢 Thông báo').setDescription(msg).setColor(COLORS.primary).setFooter({ text: `Bởi ${interaction.user.tag}` });
      await interaction.channel.send({ embeds: [e] });
      return interaction.reply({ content: '✅ Đã thông báo!', ephemeral: true });
    }

    if (cmd === 'choose') {
      const opts = interaction.options.getString('options').split('|').map(s => s.trim()).filter(Boolean);
      if (opts.length < 2) return interaction.reply({ embeds: [errorEmbed('Lỗi', 'Cần ít nhất 2 lựa chọn!')], ephemeral: true });
      const choice = randomFrom(opts);
      return interaction.reply({ embeds: [embed('🎯 Chọn ngẫu nhiên', `Tôi chọn: **${choice}**`, COLORS.primary)] });
    }

    if (cmd === 'reverse') {
      const text = interaction.options.getString('text');
      return interaction.reply({ embeds: [embed('🔄 Đảo ngược', text.split('').reverse().join(''), COLORS.primary)] });
    }

    if (cmd === 'base64') {
      const action = interaction.options.getString('action');
      const text = interaction.options.getString('text');
      try {
        const result = action === 'encode' ? Buffer.from(text).toString('base64') : Buffer.from(text, 'base64').toString('utf8');
        return interaction.reply({ embeds: [embed(`🔐 Base64 ${action === 'encode' ? 'Encode' : 'Decode'}`, `\`\`\`${result}\`\`\``, COLORS.info)] });
      } catch { return interaction.reply({ embeds: [errorEmbed('Lỗi', 'Không thể decode!')] }); }
    }

    if (cmd === 'qrcode') {
      const text = interaction.options.getString('text');
      const url = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(text)}`;
      return interaction.reply({ embeds: [embed('📱 QR Code', text, COLORS.primary).setImage(url)] });
    }

    if (cmd === 'shorturl') {
      await interaction.deferReply();
      const url = interaction.options.getString('url');
      try {
        const res = await fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`);
        const short = await res.text();
        return interaction.editReply({ embeds: [embed('🔗 URL rút gọn', `📎 Gốc: ${url}\n✂️ Rút gọn: ${short}`, COLORS.success)] });
      } catch { return interaction.editReply({ embeds: [errorEmbed('Lỗi', 'Không rút gọn được!')] }); }
    }

    // ════════════════════════════════════════════════════════
    //  LEVEL/XP COMMANDS
    // ════════════════════════════════════════════════════════
    if (cmd === 'rank') {
      const target = interaction.options.getUser('user') ?? interaction.user;
      const data = getXP(interaction.guildId, target.id);
      const nextLevel = (data.level + 1) * 100 + 100;
      return interaction.reply({ embeds: [embed(`📊 Rank — ${target.tag}`, `🏅 Level: **${data.level}**\n⭐ XP: **${data.xp}**/${nextLevel}\n📈 Tiến độ: ${Math.floor(data.xp / nextLevel * 100)}%`, COLORS.primary).setThumbnail(target.displayAvatarURL())] });
    }

    if (cmd === 'leaderboard') {
      const top = getLeaderboard(interaction.guildId, 10);
      if (top.length === 0) return interaction.reply({ embeds: [errorEmbed('Chưa có dữ liệu', 'Chưa ai có XP!')] });
      const list = top.map((u, i) => `**${i + 1}.** <@${u.userId}> — Level ${u.level} (${u.xp} XP)`).join('\n');
      return interaction.reply({ embeds: [embed('🏆 Bảng xếp hạng', list, COLORS.warning)] });
    }

    if (cmd === 'checkin') {
      const result = checkIn(interaction.guildId, interaction.user.id);
      if (result.alreadyDone) return interaction.reply({ embeds: [embed('📅 Đã điểm danh hôm nay', `🔥 Streak: ${result.streak} ngày\n📊 Tổng: ${result.total} lần`, COLORS.info)] });
      return interaction.reply({ embeds: [successEmbed('📅 Điểm danh thành công', `🔥 Streak: ${result.streak} ngày\n📊 Tổng: ${result.total} lần\n+10 XP`)] });
    }

    if (cmd === 'profile') {
      const target = interaction.options.getUser('user') ?? interaction.user;
      const xp = getXP(interaction.guildId, target.id);
      const checkinData = loadDB('checkin')[interaction.guildId]?.[target.id] ?? {};
      return interaction.reply({
        embeds: [embed(`👤 Profile — ${target.tag}`, `🏅 Level: ${xp.level}\n⭐ XP: ${xp.xp}\n📅 Điểm danh streak: ${checkinData.streak ?? 0}\n📊 Tổng điểm danh: ${checkinData.total ?? 0}`, COLORS.primary).setThumbnail(target.displayAvatarURL())]
      });
    }

    if (cmd === 'badges') {
      const target = interaction.options.getUser('user') ?? interaction.user;
      const xp = getXP(interaction.guildId, target.id);
      const badges = [];
      if (xp.level >= 10) badges.push('🥉 Level 10');
      if (xp.level >= 25) badges.push('🥈 Level 25');
      if (xp.level >= 50) badges.push('🥇 Level 50');
      if (xp.level >= 100) badges.push('💎 Level 100');
      const checkinData = loadDB('checkin')[interaction.guildId]?.[target.id];
      if (checkinData?.streak >= 7) badges.push('📅 Điểm danh 7 ngày');
      if (checkinData?.streak >= 30) badges.push('🔥 Điểm danh 30 ngày');
      return interaction.reply({ embeds: [embed(`🏅 Huy hiệu — ${target.tag}`, badges.length > 0 ? badges.join('\n') : 'Chưa có huy hiệu nào!', COLORS.warning)] });
    }

  } catch (err) {
    console.error(`[ERROR] ${cmd}:`, err);
    const msg = '❌ Có lỗi xảy ra! Thử lại sau.';
    if (interaction.deferred) await interaction.editReply(msg).catch(() => {});
    else await interaction.reply({ content: msg, ephemeral: true }).catch(() => {});
  }
});

// ══════════════════════════════════════════════════════════
//  MESSAGE XP SYSTEM
// ══════════════════════════════════════════════════════════
client.on('messageCreate', async message => {
  if (message.author.bot || !message.guild) return;

  if (noiTuGames.has(message.channelId)) {
    await handleNoiTuMessage(message);
  } else if (vuaTiengVietGames.has(message.channelId)) {
    await handleVuaTiengVietMessage(message);
  }

  // XP cooldown: 60s
  const user = getXP(message.guildId, message.author.id);
  if (Date.now() - user.lastMsg >= 60000) {
    const xpGain = Math.floor(Math.random() * 10) + 5;
    const result = addXP(message.guildId, message.author.id, xpGain);

    if (result.leveledUp) {
      message.channel.send(`🎉 <@${message.author.id}> đã lên **Level ${result.level}**! Chúc mừng! 🎊`).then(m => setTimeout(() => m.delete().catch(() => {}), 10000));
    }
  }

  // AFK check
  const afkDB = loadDB('afk');
  if (afkDB[message.author.id]) {
    delete afkDB[message.author.id];
    saveDB('afk', afkDB);
    message.reply('👋 Welcome back! Đã gỡ trạng thái AFK.').then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
  }

  // Check mentions AFK
  message.mentions.users.forEach(user => {
    if (afkDB[user.id]) {
      message.reply(`😴 ${user.username} đang AFK: ${afkDB[user.id].reason}`).then(m => setTimeout(() => m.delete().catch(() => {}), 8000));
    }
  });
});

// ══════════════════════════════════════════════════════════
//  LOGIN
// ══════════════════════════════════════════════════════════
client.login(TOKEN);
