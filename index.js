// ============================================================
//  DISCORD BOT FULL FEATURED - 80+ CHỨC NĂNG
//  Gộp chung 1 file duy nhất - Deploy ngay lên Railway
// ============================================================

const {
  Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder,
  EmbedBuilder, PermissionFlagsBits, ActivityType, Collection
} = require('discord.js');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

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

function randomFrom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function truncate(text, max = 1000) { return text.length > max ? text.slice(0, max) + '...' : text; }

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

const musicQueues = new Map(); // guildId -> { songs: [], loop: false, current: 0 }

// ══════════════════════════════════════════════════════════
//  SLASH COMMANDS DEFINITION (80+ LỆNH)
// ══════════════════════════════════════════════════════════
const commands = [
  // ── MENU ──
  new SlashCommandBuilder().setName('menu').setDescription('📋 Xem toàn bộ lệnh'),
  new SlashCommandBuilder().setName('help').setDescription('❓ Hướng dẫn sử dụng bot'),

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

  // ── INFO (10 lệnh) ──
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
  new SlashCommandBuilder().setName('botstats').setDescription('📊 Thống kê bot'),
  new SlashCommandBuilder().setName('currency').setDescription('💱 Tỷ giá')
    .addStringOption(o => o.setName('from').setDescription('Từ').setRequired(true))
    .addStringOption(o => o.setName('to').setDescription('Sang').setRequired(true))
    .addNumberOption(o => o.setName('amount').setDescription('Số tiền').setRequired(false)),

  // ── MOD (13 lệnh) ──
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

  // ── FUN (15 lệnh) ──
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
//  INTERACTION HANDLER (XỬ LÝ LỆNH)
// ══════════════════════════════════════════════════════════
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const cmd = interaction.commandName;

  try {
    incrementStat(`cmd_${cmd}`);

    // ════════════════════════════════════════════════════════
    //  MENU & HELP
    // ════════════════════════════════════════════════════════
    if (cmd === 'menu' || cmd === 'help') {
      const embed = new EmbedBuilder()
        .setTitle('📋 Danh sách lệnh')
        .setColor(COLORS.primary)
        .setThumbnail(client.user.displayAvatarURL())
        .addFields(
          { name: '🤖 AI (11)', value: '`/ask` `/translate` `/summarize` `/grammar` `/explain` `/story` `/idea` `/quiz` `/define` `/roast` `/compliment`' },
          { name: 'ℹ️ Info (10)', value: '`/ping` `/userinfo` `/serverinfo` `/avatar` `/weather` `/crypto` `/calc` `/ipinfo` `/botstats` `/currency`' },
          { name: '🛡️ Mod (13)', value: '`/kick` `/ban` `/unban` `/mute` `/unmute` `/warn` `/warns` `/clearwarns` `/purge` `/slowmode` `/lock` `/unlock` `/nickname`' },
          { name: '🎵 Music (7)', value: '`/play` `/skip` `/stop` `/queue` `/nowplaying` `/loop` `/shuffle`' },
          { name: '🎮 Fun (15)', value: '`/coinflip` `/roll` `/8ball` `/joke` `/meme` `/lovecalc` `/rps` `/slap` `/hug` `/kiss` `/pat` `/trivia` `/dadjoke` `/quote` `/fact`' },
          { name: '🔧 Utility (12)', value: '`/poll` `/remind` `/afk` `/timer` `/say` `/embed` `/announce` `/choose` `/reverse` `/base64` `/qrcode` `/shorturl`' },
          { name: '📊 Level/XP (5)', value: '`/rank` `/leaderboard` `/checkin` `/profile` `/badges`' }
        )
        .setFooter({ text: `Tổng ${commands.length} lệnh | Powered by Groq AI` })
        .setTimestamp();
      return interaction.reply({ embeds: [embed] });
    }

    // ════════════════════════════════════════════════════════
    //  PING
    // ════════════════════════════════════════════════════════
    if (cmd === 'ping') {
      const latency = Date.now() - interaction.createdTimestamp;
      return interaction.reply({ embeds: [embed('🏓 Pong!', `⏱️ ${latency}ms | 💓 ${client.ws.ping}ms`, COLORS.success)] });
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

    if (cmd === 'ipinfo') {
      await interaction.deferReply();
      const ip = interaction.options.getString('ip');
      try {
        const res = await fetch(`https://ipapi.co/${ip}/json/`);
        const d = await res.json();
        if (d.error) return interaction.editReply({ embeds: [errorEmbed('Lỗi', 'IP không hợp lệ!')] });
        return interaction.editReply({ embeds: [embed(`🌐 IP: ${ip}`, `📍 ${d.city}, ${d.country_name}\n📡 ISP: ${d.org}\n🕐 ${d.timezone}`, COLORS.info)] });
      } catch { return interaction.editReply({ embeds: [errorEmbed('Lỗi', 'Không tra được IP!')] }); }
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

    if (cmd === 'purge') {
      const amount = interaction.options.getInteger('amount');
      const user = interaction.options.getUser('user');
      await interaction.deferReply({ ephemeral: true });
      let messages = await interaction.channel.messages.fetch({ limit: 100 });
      if (user) messages = messages.filter(m => m.author.id === user.id);
      messages = messages.filter(m => Date.now() - m.createdTimestamp < 14 * 24 * 60 * 60 * 1000);
      messages = [...messages.values()].slice(0, amount);
      const deleted = await interaction.channel.bulkDelete(messages, true);
      return interaction.editReply({ embeds: [successEmbed('Đã xóa', `Xóa **${deleted.size}** tin nhắn${user ? ` của ${user.tag}` : ''}`)] });
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
      const result = randomFrom(['Ngửa', 'Sấp']);
      return interaction.reply({ embeds: [embed('🪙 Tung đồng xu', `Kết quả: **${result}**`, COLORS.primary)] });
    }

    if (cmd === 'roll') {
      const sides = interaction.options.getInteger('sides') ?? 6;
      const result = Math.floor(Math.random() * sides) + 1;
      return interaction.reply({ embeds: [embed(`🎲 Tung xúc xắc ${sides} mặt`, `Kết quả: **${result}**`, COLORS.primary)] });
    }

    if (cmd === '8ball') {
      const q = interaction.options.getString('question');
      const answers = ['Chắc chắn rồi!', 'Có thể đấy', 'Không chắc lắm', 'Đừng mơ!', 'Không đâu', 'Hỏi lại sau đi', 'Tất nhiên là có!', 'Không bao giờ!'];
      return interaction.reply({ embeds: [embed('🔮 Quả cầu thần', `**❓ ${q}**\n\n**💬 ${randomFrom(answers)}**`, COLORS.primary)] });
    }

    if (cmd === 'joke') {
      await interaction.deferReply();
      try {
        const res = await fetch('https://v2.jokeapi.dev/joke/Any?lang=en');
        const data = await res.json();
        const joke = data.type === 'single' ? data.joke : `${data.setup}\n\n||${data.delivery}||`;
        return interaction.editReply({ embeds: [embed('😂 Chuyện cười', joke, COLORS.warning)] });
      } catch { return interaction.editReply({ embeds: [errorEmbed('Lỗi', 'Không lấy được joke!')] }); }
    }

    if (cmd === 'meme') {
      await interaction.deferReply();
      try {
        const res = await fetch('https://meme-api.com/gimme');
        const data = await res.json();
        return interaction.editReply({ embeds: [embed(data.title, `👍 ${data.ups} upvotes`, COLORS.primary).setImage(data.url).setFooter({ text: `r/${data.subreddit}` })] });
      } catch { return interaction.editReply({ embeds: [errorEmbed('Lỗi', 'Không lấy được meme!')] }); }
    }

    if (cmd === 'lovecalc') {
      const u1 = interaction.options.getUser('user1');
      const u2 = interaction.options.getUser('user2');
      const percent = Math.floor(Math.random() * 101);
      const hearts = '❤️'.repeat(Math.floor(percent / 10)) + '🤍'.repeat(10 - Math.floor(percent / 10));
      return interaction.reply({ embeds: [embed('💕 Đo độ hợp', `${u1.username} x ${u2.username}\n\n${hearts}\n**${percent}%** hợp nhau!`, COLORS.primary)] });
    }

    if (cmd === 'rps') {
      const choice = interaction.options.getString('choice');
      const choices = ['rock', 'paper', 'scissors'];
      const botChoice = randomFrom(choices);
      const emojis = { rock: '✊', paper: '✋', scissors: '✌️' };
      let result;
      if (choice === botChoice) result = '🤝 Hòa!';
      else if ((choice === 'rock' && botChoice === 'scissors') || (choice === 'paper' && botChoice === 'rock') || (choice === 'scissors' && botChoice === 'paper')) result = '🎉 Bạn thắng!';
      else result = '😢 Bạn thua!';
      return interaction.reply({ embeds: [embed('✊ Kéo Búa Bao', `Bạn: ${emojis[choice]}\nBot: ${emojis[botChoice]}\n\n**${result}**`, COLORS.primary)] });
    }

    if (cmd === 'slap') {
      const target = interaction.options.getUser('user');
      return interaction.reply({ embeds: [embed('👋 Slap', `${interaction.user.username} đã tát ${target.username}! 👋💥`, COLORS.danger)] });
    }

    if (cmd === 'hug') {
      const target = interaction.options.getUser('user');
      return interaction.reply({ embeds: [embed('🤗 Hug', `${interaction.user.username} đã ôm ${target.username}! 🤗💕`, COLORS.success)] });
    }

    if (cmd === 'kiss') {
      const target = interaction.options.getUser('user');
      return interaction.reply({ embeds: [embed('😘 Kiss', `${interaction.user.username} đã hôn ${target.username}! 😘💋`, COLORS.primary)] });
    }

    if (cmd === 'pat') {
      const target = interaction.options.getUser('user');
      return interaction.reply({ embeds: [embed('🫳 Pat', `${interaction.user.username} đã vỗ đầu ${target.username}! 🫳✨`, COLORS.info)] });
    }

    if (cmd === 'trivia') {
      await interaction.deferReply();
      try {
        const res = await fetch('https://opentdb.com/api.php?amount=1&type=multiple');
        const data = await res.json();
        const q = data.results[0];
        const answers = [...q.incorrect_answers, q.correct_answer].sort(() => Math.random() - 0.5);
        return interaction.editReply({ embeds: [embed('🧠 Trivia', `**${q.question}**\n\nA) ${answers[0]}\nB) ${answers[1]}\nC) ${answers[2]}\nD) ${answers[3]}\n\n||Đáp án: ${q.correct_answer}||`, COLORS.primary)] });
      } catch { return interaction.editReply({ embeds: [errorEmbed('Lỗi', 'Không lấy được câu hỏi!')] }); }
    }

    if (cmd === 'dadjoke') {
      await interaction.deferReply();
      try {
        const res = await fetch('https://icanhazdadjoke.com/', { headers: { 'Accept': 'application/json' } });
        const data = await res.json();
        return interaction.editReply({ embeds: [embed('👨 Dad Joke', data.joke, COLORS.warning)] });
      } catch { return interaction.editReply({ embeds: [errorEmbed('Lỗi', 'Không lấy được joke!')] }); }
    }

    if (cmd === 'quote') {
      await interaction.deferReply();
      try {
        const res = await fetch('https://api.quotable.io/random');
        const data = await res.json();
        return interaction.editReply({ embeds: [embed(`💬 Quote — ${data.author}`, `"${data.content}"`, COLORS.info)] });
      } catch { return interaction.editReply({ embeds: [errorEmbed('Lỗi', 'Không lấy được quote!')] }); }
    }

    if (cmd === 'fact') {
      await interaction.deferReply();
      try {
        const res = await fetch('https://uselessfacts.jsph.pl/random.json?language=en');
        const data = await res.json();
        return interaction.editReply({ embeds: [embed('💡 Sự thật thú vị', data.text, COLORS.primary)] });
      } catch { return interaction.editReply({ embeds: [errorEmbed('Lỗi', 'Không lấy được fact!')] }); }
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

  // XP cooldown: 60s
  const user = getXP(message.guildId, message.author.id);
  if (Date.now() - user.lastMsg < 60000) return;

  const xpGain = Math.floor(Math.random() * 10) + 5; // 5-15 XP
  const result = addXP(message.guildId, message.author.id, xpGain);

  if (result.leveledUp) {
    message.channel.send(`🎉 <@${message.author.id}> đã lên **Level ${result.level}**! Chúc mừng! 🎊`).then(m => setTimeout(() => m.delete().catch(() => {}), 10000));
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
