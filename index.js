// ============================================================
//  ThinhbeuBot v3.0 — Discord Bot Full-Featured
//  Mod • Utility • Fun • Music • Economy • AI • System
//  Deploy-ready for Railway
// ============================================================

const {
  Client, GatewayIntentBits, REST, Routes,
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, PermissionFlagsBits,
  ActivityType, Collection, ChannelType,
  StringSelectMenuBuilder, ComponentType,
  ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const fetch = require('node-fetch');
const db    = require('./utils/db');
const {
  formatCoins, errEmbed, okEmbed, randomInt,
  msToTime, genCaptcha, containsBadWord, addXP, XP_PER_MESSAGE,
} = require('./utils/helpers');

// ── Env ───────────────────────────────────────────────────────
const TOKEN       = process.env.TOKEN;
const GROQ_KEY    = process.env.GROQ_API_KEY;
const WEATHER_KEY = process.env.WEATHER_API_KEY;
const VERIFY_ROLE = process.env.VERIFY_ROLE_ID;

if (!TOKEN) { console.error('❌ Thiếu TOKEN'); process.exit(1); }

// ── State ─────────────────────────────────────────────────────
const musicQueues    = new Collection(); // guildId -> { queue, loop, playing }
const antiSpam       = new Collection(); // userId  -> { count, timer }
const captchaPending = new Collection(); // userId  -> { code, channelId }
const giveaways      = new Collection(); // msgId   -> { entrants, end, prize, channelId }
const triviaGames    = new Collection(); // channelId -> { answer, timer }

// ── Client ────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
  ],
});

// ══════════════════════════════════════════════════════════════
//  SLASH COMMANDS DEFINITION
// ══════════════════════════════════════════════════════════════
const commands = [
  // ── MENU ──
  new SlashCommandBuilder().setName('menu').setDescription('📋 Xem toàn bộ lệnh của bot'),

  // ── MOD ──
  new SlashCommandBuilder().setName('ban').setDescription('🔨 Ban thành viên')
    .addUserOption(o => o.setName('user').setDescription('Thành viên').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Lý do'))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  new SlashCommandBuilder().setName('unban').setDescription('🔓 Gỡ ban')
    .addStringOption(o => o.setName('userid').setDescription('User ID cần gỡ ban').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  new SlashCommandBuilder().setName('kick').setDescription('👢 Kick thành viên')
    .addUserOption(o => o.setName('user').setDescription('Thành viên').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Lý do'))
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),

  new SlashCommandBuilder().setName('mute').setDescription('🔇 Timeout thành viên')
    .addUserOption(o => o.setName('user').setDescription('Thành viên').setRequired(true))
    .addIntegerOption(o => o.setName('minutes').setDescription('Số phút (mặc định 10)').setMinValue(1).setMaxValue(40320))
    .addStringOption(o => o.setName('reason').setDescription('Lý do'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  new SlashCommandBuilder().setName('unmute').setDescription('🔊 Gỡ timeout')
    .addUserOption(o => o.setName('user').setDescription('Thành viên').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  new SlashCommandBuilder().setName('warn').setDescription('⚠️ Cảnh cáo thành viên (3 lần = kick)')
    .addUserOption(o => o.setName('user').setDescription('Thành viên').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Lý do').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  new SlashCommandBuilder().setName('warnings').setDescription('📋 Xem danh sách cảnh cáo')
    .addUserOption(o => o.setName('user').setDescription('Thành viên').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  new SlashCommandBuilder().setName('clearwarnings').setDescription('🗑️ Xoá tất cả cảnh cáo')
    .addUserOption(o => o.setName('user').setDescription('Thành viên').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  new SlashCommandBuilder().setName('clear').setDescription('🗑️ Xoá tin nhắn hàng loạt')
    .addIntegerOption(o => o.setName('amount').setDescription('Số lượng (1-100)').setRequired(true).setMinValue(1).setMaxValue(100))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder().setName('slowmode').setDescription('🐢 Chỉnh slowmode kênh hiện tại')
    .addIntegerOption(o => o.setName('seconds').setDescription('Giây (0 = tắt)').setRequired(true).setMinValue(0).setMaxValue(21600))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  new SlashCommandBuilder().setName('lock').setDescription('🔒 Khoá kênh (ngăn chat)')
    .addChannelOption(o => o.setName('channel').setDescription('Kênh cần khoá (mặc định kênh hiện tại)'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  new SlashCommandBuilder().setName('unlock').setDescription('🔓 Mở khoá kênh')
    .addChannelOption(o => o.setName('channel').setDescription('Kênh cần mở khoá'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  new SlashCommandBuilder().setName('nickname').setDescription('✏️ Đổi biệt danh thành viên')
    .addUserOption(o => o.setName('user').setDescription('Thành viên').setRequired(true))
    .addStringOption(o => o.setName('name').setDescription('Biệt danh mới (để trống = reset)'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames),

  // ── UTILITY ──
  new SlashCommandBuilder().setName('userinfo').setDescription('👤 Thông tin thành viên')
    .addUserOption(o => o.setName('user').setDescription('Thành viên (bỏ trống = bản thân)')),

  new SlashCommandBuilder().setName('serverinfo').setDescription('🏠 Thông tin server'),

  new SlashCommandBuilder().setName('avatar').setDescription('🖼️ Lấy ảnh đại diện')
    .addUserOption(o => o.setName('user').setDescription('Thành viên (bỏ trống = bản thân)')),

  new SlashCommandBuilder().setName('weather').setDescription('🌦️ Thời tiết theo thành phố')
    .addStringOption(o => o.setName('city').setDescription('Tên thành phố (VD: Hanoi)').setRequired(true)),

  new SlashCommandBuilder().setName('translate').setDescription('🌐 Dịch văn bản')
    .addStringOption(o => o.setName('text').setDescription('Đoạn văn bản cần dịch').setRequired(true))
    .addStringOption(o => o.setName('lang').setDescription('Ngôn ngữ đích (en/vi/ja/ko/zh/fr/de...) mặc định: en')),

  new SlashCommandBuilder().setName('remind').setDescription('⏰ Đặt nhắc nhở')
    .addStringOption(o => o.setName('time').setDescription('Thời gian (VD: 10m, 2h, 1d)').setRequired(true))
    .addStringOption(o => o.setName('message').setDescription('Nội dung nhắc nhở').setRequired(true)),

  new SlashCommandBuilder().setName('poll').setDescription('📊 Tạo cuộc bình chọn')
    .addStringOption(o => o.setName('question').setDescription('Câu hỏi bình chọn').setRequired(true))
    .addStringOption(o => o.setName('options').setDescription('Các lựa chọn, cách nhau bởi | (VD: A | B | C)').setRequired(true)),

  new SlashCommandBuilder().setName('giveaway').setDescription('🎁 Tổ chức giveaway')
    .addStringOption(o => o.setName('prize').setDescription('Phần thưởng').setRequired(true))
    .addStringOption(o => o.setName('duration').setDescription('Thời gian (VD: 10m, 1h, 1d)').setRequired(true))
    .addIntegerOption(o => o.setName('winners').setDescription('Số người thắng (mặc định 1)').setMinValue(1).setMaxValue(10))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder().setName('calc').setDescription('🧮 Máy tính')
    .addStringOption(o => o.setName('expression').setDescription('Biểu thức (VD: 2+3*4)').setRequired(true)),

  new SlashCommandBuilder().setName('ping').setDescription('🏓 Kiểm tra độ trễ'),

  // ── FUN ──
  new SlashCommandBuilder().setName('roll').setDescription('🎲 Tung xúc xắc')
    .addIntegerOption(o => o.setName('sides').setDescription('Số mặt (mặc định 6)').setMinValue(2).setMaxValue(1000)),

  new SlashCommandBuilder().setName('flip').setDescription('🪙 Tung đồng xu'),

  new SlashCommandBuilder().setName('8ball').setDescription('🎱 Bói toán trả lời Có/Không')
    .addStringOption(o => o.setName('question').setDescription('Câu hỏi của bạn').setRequired(true)),

  new SlashCommandBuilder().setName('joke').setDescription('😂 Kể chuyện cười'),

  new SlashCommandBuilder().setName('meme').setDescription('😹 Ảnh chế ngẫu nhiên'),

  new SlashCommandBuilder().setName('lovecalc').setDescription('💕 Đo độ hợp nhau')
    .addUserOption(o => o.setName('user1').setDescription('Người thứ nhất').setRequired(true))
    .addUserOption(o => o.setName('user2').setDescription('Người thứ hai').setRequired(true)),

  new SlashCommandBuilder().setName('rps').setDescription('✊ Kéo búa bao với bot')
    .addStringOption(o => o.setName('choice').setDescription('Lựa chọn').setRequired(true)
      .addChoices(
        { name: '✊ Búa', value: 'rock' },
        { name: '✋ Bao', value: 'paper' },
        { name: '✌️ Kéo', value: 'scissors' },
      )),

  new SlashCommandBuilder().setName('slap').setDescription('👋 Tát ai đó')
    .addUserOption(o => o.setName('user').setDescription('Mục tiêu').setRequired(true)),

  new SlashCommandBuilder().setName('hug').setDescription('🤗 Ôm ai đó')
    .addUserOption(o => o.setName('user').setDescription('Mục tiêu').setRequired(true)),

  new SlashCommandBuilder().setName('kiss').setDescription('😘 Hôn ai đó')
    .addUserOption(o => o.setName('user').setDescription('Mục tiêu').setRequired(true)),

  new SlashCommandBuilder().setName('trivia').setDescription('🧠 Câu hỏi đố vui'),

  // ── MUSIC ──
  new SlashCommandBuilder().setName('play').setDescription('🎵 Phát nhạc / thêm vào hàng đợi')
    .addStringOption(o => o.setName('song').setDescription('Tên bài hoặc link YouTube').setRequired(true)),

  new SlashCommandBuilder().setName('skip').setDescription('⏭️ Bỏ qua bài hiện tại'),
  new SlashCommandBuilder().setName('stop').setDescription('⏹️ Dừng nhạc & xoá hàng đợi'),
  new SlashCommandBuilder().setName('queue').setDescription('📜 Xem hàng đợi nhạc'),
  new SlashCommandBuilder().setName('nowplaying').setDescription('🎶 Bài đang phát'),

  new SlashCommandBuilder().setName('loop').setDescription('🔁 Bật/tắt chế độ lặp')
    .addStringOption(o => o.setName('mode').setDescription('Chế độ')
      .addChoices(
        { name: '🚫 Tắt', value: 'off' },
        { name: '🔂 Lặp bài hiện tại', value: 'song' },
        { name: '🔁 Lặp cả queue', value: 'queue' },
      )),

  new SlashCommandBuilder().setName('shuffle').setDescription('🔀 Xáo trộn hàng đợi'),

  // ── ECONOMY ──
  new SlashCommandBuilder().setName('daily').setDescription('💰 Nhận tiền thưởng hàng ngày'),
  new SlashCommandBuilder().setName('balance').setDescription('💳 Xem số dư')
    .addUserOption(o => o.setName('user').setDescription('Thành viên (bỏ trống = bản thân)')),

  new SlashCommandBuilder().setName('work').setDescription('💼 Đi làm kiếm tiền'),

  new SlashCommandBuilder().setName('rank').setDescription('🏅 Xem cấp độ')
    .addUserOption(o => o.setName('user').setDescription('Thành viên')),

  new SlashCommandBuilder().setName('leaderboard').setDescription('🏆 Bảng xếp hạng')
    .addStringOption(o => o.setName('type').setDescription('Loại bảng xếp hạng')
      .addChoices(
        { name: '💰 Xu nhiều nhất', value: 'coins' },
        { name: '⭐ Cấp độ cao nhất', value: 'level' },
      )),

  new SlashCommandBuilder().setName('transfer').setDescription('💸 Chuyển tiền cho người khác')
    .addUserOption(o => o.setName('user').setDescription('Người nhận').setRequired(true))
    .addIntegerOption(o => o.setName('amount').setDescription('Số xu').setRequired(true).setMinValue(1)),

  new SlashCommandBuilder().setName('gamble').setDescription('🎰 Cá cược tài xỉu')
    .addIntegerOption(o => o.setName('amount').setDescription('Số xu cược').setRequired(true).setMinValue(10))
    .addStringOption(o => o.setName('bet').setDescription('Tài hay Xỉu?').setRequired(true)
      .addChoices({ name: '🔴 Tài (≥11)', value: 'tai' }, { name: '🔵 Xỉu (≤10)', value: 'xiu' })),

  new SlashCommandBuilder().setName('slots').setDescription('🎰 Máy đánh bạc slot')
    .addIntegerOption(o => o.setName('amount').setDescription('Số xu cược').setRequired(true).setMinValue(10)),

  new SlashCommandBuilder().setName('baucua').setDescription('🦐 Bầu cua tôm cá')
    .addIntegerOption(o => o.setName('amount').setDescription('Số xu cược').setRequired(true).setMinValue(10))
    .addStringOption(o => o.setName('bet').setDescription('Chọn con vật').setRequired(true)
      .addChoices(
        { name: '🦐 Tôm', value: 'tom' },
        { name: '🦀 Cua', value: 'cua' },
        { name: '🐟 Cá', value: 'ca' },
        { name: '🦌 Nai', value: 'nai' },
        { name: '🐓 Gà', value: 'ga' },
        { name: '🎡 Bầu', value: 'bau' },
      )),

  // ── AI / SYSTEM ──
  new SlashCommandBuilder().setName('ask').setDescription('🤖 Hỏi Groq AI (Llama 3.3 70B)')
    .addStringOption(o => o.setName('cauhoi').setDescription('Câu hỏi của bạn').setRequired(true)),

  new SlashCommandBuilder().setName('ticket').setDescription('🎫 Tạo ticket hỗ trợ'),

  new SlashCommandBuilder().setName('verify').setDescription('✅ Xác minh bằng CAPTCHA để nhận role'),

  new SlashCommandBuilder().setName('addcmd').setDescription('⚙️ Tạo lệnh tuỳ chỉnh (prefix !)')
    .addStringOption(o => o.setName('name').setDescription('Tên lệnh (không có !)').setRequired(true))
    .addStringOption(o => o.setName('response').setDescription('Phản hồi của bot').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder().setName('listcmds').setDescription('📜 Xem danh sách lệnh tuỳ chỉnh'),
];

// ══════════════════════════════════════════════════════════════
//  READY
// ══════════════════════════════════════════════════════════════
client.once('ready', async () => {
  console.log(`✅ Bot online: ${client.user.tag}`);
  client.user.setActivity('⚡ /menu để xem lệnh', { type: ActivityType.Watching });

  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands.map(c => c.toJSON()) });
    console.log(`✅ Đã đăng ký ${commands.length} slash commands!`);
  } catch (e) { console.error('❌ Lỗi đăng ký commands:', e); }
});



// ══════════════════════════════════════════════════════════════
//  MESSAGE CREATE — XP, Anti-spam, Auto-mod, Custom cmds
// ══════════════════════════════════════════════════════════════
client.on('messageCreate', async msg => {
  if (msg.author.bot || !msg.guild) return;

  // ── Custom commands (prefix !) ──
  if (msg.content.startsWith('!')) {
    const cmdName = msg.content.slice(1).split(' ')[0].toLowerCase();
    const response = db.getCustomCmd(msg.guild.id, cmdName);
    if (response) return msg.reply(response);
  }

  // ── Auto-mod: từ cấm ──
  if (containsBadWord(msg.content)) {
    await msg.delete().catch(() => {});
    const warn = await msg.channel.send({ embeds: [errEmbed(`${msg.author} vi phạm quy tắc! Tin nhắn đã bị xoá.`)] });
    setTimeout(() => warn.delete().catch(() => {}), 5000);
    return;
  }

  // ── Anti-spam ──
  if (!antiSpam.has(msg.author.id)) {
    antiSpam.set(msg.author.id, { count: 1, timer: setTimeout(() => antiSpam.delete(msg.author.id), 5000) });
  } else {
    const s = antiSpam.get(msg.author.id);
    s.count++;
    if (s.count >= 6) {
      await msg.member.timeout(30_000, 'Spam tin nhắn').catch(() => {});
      msg.channel.send({ embeds: [errEmbed(`${msg.author} đã bị timeout 30 giây vì spam!`)] });
      antiSpam.delete(msg.author.id);
      return;
    }
  }

  // ── Anti-link: chặn invite link ──
  const inviteRegex = /discord(?:\.gg|app\.com\/invite|\.com\/invite)\/\S+/i;
  if (inviteRegex.test(msg.content)) {
    const member = msg.member;
    if (!member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      await msg.delete().catch(() => {});
      const w = await msg.channel.send({ embeds: [errEmbed(`${msg.author} không được gửi link mời server!`)] });
      setTimeout(() => w.delete().catch(() => {}), 5000);
      return;
    }
  }

  // ── XP + Level up ──
  if (Math.random() > 0.5) { // 50% chance per message to avoid spam
    const userData = db.getUser(msg.author.id);
    const { leveled, level } = addXP(userData, XP_PER_MESSAGE);
    db.saveUser(msg.author.id, userData);
    if (leveled) {
      msg.channel.send({
        embeds: [new EmbedBuilder()
          .setColor(0xFFD700)
          .setTitle('🎉 Level Up!')
          .setDescription(`${msg.author} đã lên **Cấp ${level}**! Chúc mừng! 🎊`)
          .setTimestamp()],
      }).catch(() => {});
    }
  }

  // ── Log edited messages ──
  // (handled in messageUpdate)
});



// ══════════════════════════════════════════════════════════════
//  INTERACTION HANDLER
// ══════════════════════════════════════════════════════════════
client.on('interactionCreate', async interaction => {
  // ── Button: Ticket close ──
  if (interaction.isButton()) {
    if (interaction.customId === 'ticket_close') {
      if (!interaction.channel.name.startsWith('ticket-')) return;
      await interaction.reply({ content: '🔒 Đang đóng ticket...', ephemeral: true });
      setTimeout(() => interaction.channel.delete().catch(() => {}), 2000);
      return;
    }
    if (interaction.customId === 'giveaway_enter') {
      const ga = giveaways.get(interaction.message.id);
      if (!ga) return interaction.reply({ content: '❌ Giveaway không tồn tại!', ephemeral: true });
      if (ga.entrants.includes(interaction.user.id)) {
        return interaction.reply({ content: '✅ Bạn đã tham gia giveaway này rồi!', ephemeral: true });
      }
      ga.entrants.push(interaction.user.id);
      return interaction.reply({ content: `🎉 Bạn đã tham gia! Tổng ${ga.entrants.length} người tham gia.`, ephemeral: true });
    }
    return;
  }

  if (interaction.isStringSelectMenu()) return; // handled by collector inside /menu

  if (!interaction.isChatInputCommand()) return;
  const { commandName } = interaction;

  try {
    // ══════════════════ MENU ══════════════════
    if (commandName === 'menu') {
      const menuPages = {
        mod: new EmbedBuilder()
          .setTitle('🛡️ Moderation — 13 lệnh')
          .setColor(0xED4245)
          .setThumbnail(client.user.displayAvatarURL())
          .addFields(
            { name: '🔨 /ban [@user] [lý do]', value: 'Cấm thành viên khỏi server', inline: true },
            { name: '🔓 /unban [user ID]', value: 'Gỡ ban theo ID', inline: true },
            { name: '👢 /kick [@user] [lý do]', value: 'Đuổi thành viên ra khỏi server', inline: true },
            { name: '🔇 /mute [@user] [phút]', value: 'Timeout thành viên (tối đa 28 ngày)', inline: true },
            { name: '🔊 /unmute [@user]', value: 'Gỡ timeout thành viên', inline: true },
            { name: '⚠️ /warn [@user] [lý do]', value: 'Cảnh cáo — 3 lần tự động kick', inline: true },
            { name: '📋 /warnings [@user]', value: 'Xem danh sách cảnh cáo', inline: true },
            { name: '🗑️ /clearwarnings [@user]', value: 'Xoá tất cả cảnh cáo', inline: true },
            { name: '🧹 /clear [số lượng]', value: 'Xoá hàng loạt tin nhắn (1–100)', inline: true },
            { name: '🐢 /slowmode [giây]', value: 'Chỉnh độ trễ giữa các tin nhắn', inline: true },
            { name: '🔒 /lock [kênh]', value: 'Khoá kênh không cho chat', inline: true },
            { name: '🔓 /unlock [kênh]', value: 'Mở khoá kênh đã bị khoá', inline: true },
            { name: '✏️ /nickname [@user] [tên]', value: 'Đổi biệt danh thành viên', inline: true },
            { name: '⚙️ Auto-mod (tự động)', value: 'Chặn từ cấm • Chặn invite link • Anti-spam 30s timeout', inline: false },
          )
          .setFooter({ text: 'ThinhbeuBot v3.0 • Trang 1/6 — Moderation' })
          .setTimestamp(),

        util: new EmbedBuilder()
          .setTitle('🔧 Utility — 10 lệnh')
          .setColor(0x5865F2)
          .setThumbnail(client.user.displayAvatarURL())
          .addFields(
            { name: '👤 /userinfo [@user]', value: 'Thông tin chi tiết thành viên (cảnh báo acc mới)', inline: true },
            { name: '🏠 /serverinfo', value: 'Thông tin đầy đủ về server', inline: true },
            { name: '🖼️ /avatar [@user]', value: 'Lấy link ảnh đại diện độ phân giải cao', inline: true },
            { name: '🌦️ /weather [thành phố]', value: 'Xem thời tiết theo địa điểm', inline: true },
            { name: '🌐 /translate [text] [ngôn ngữ]', value: 'Dịch văn bản (en/vi/ja/ko/zh/fr...)', inline: true },
            { name: '⏰ /remind [thời gian] [nội dung]', value: 'Hẹn giờ nhắc nhở — gửi qua DM', inline: true },
            { name: '📊 /poll [câu hỏi] [lựa chọn]', value: 'Tạo bình chọn với emoji reaction', inline: true },
            { name: '🎁 /giveaway [thưởng] [thời gian]', value: 'Tổ chức giveaway bốc thăm tự động', inline: true },
            { name: '🧮 /calc [biểu thức]', value: 'Máy tính ngay trong Discord', inline: true },
            { name: '🏓 /ping', value: 'Kiểm tra độ trễ bot & API', inline: true },
          )
          .setFooter({ text: 'ThinhbeuBot v3.0 • Trang 2/6 — Utility' })
          .setTimestamp(),

        fun: new EmbedBuilder()
          .setTitle('🎮 Fun & Games — 11 lệnh')
          .setColor(0xFEE75C)
          .setThumbnail(client.user.displayAvatarURL())
          .addFields(
            { name: '🎲 /roll [số mặt]', value: 'Tung xúc xắc (mặc định d6)', inline: true },
            { name: '🪙 /flip', value: 'Tung đồng xu Sấp/Ngửa', inline: true },
            { name: '🎱 /8ball [câu hỏi]', value: 'Bói toán trả lời Có/Không', inline: true },
            { name: '😂 /joke', value: 'Kể chuyện cười ngẫu nhiên', inline: true },
            { name: '😹 /meme', value: 'Ảnh chế ngẫu nhiên từ Reddit', inline: true },
            { name: '💕 /lovecalc [@user1] [@user2]', value: 'Đo độ hợp nhau giữa 2 người', inline: true },
            { name: '✊ /rps [búa/bao/kéo]', value: 'Kéo Búa Bao với bot', inline: true },
            { name: '👋 /slap [@user]', value: 'Tát ai đó (kèm GIF)', inline: true },
            { name: '🤗 /hug [@user]', value: 'Ôm ai đó (kèm GIF)', inline: true },
            { name: '😘 /kiss [@user]', value: 'Hôn ai đó (kèm GIF)', inline: true },
            { name: '🧠 /trivia', value: 'Câu hỏi đố vui — trả lời đúng nhận 50 xu!', inline: true },
          )
          .setFooter({ text: 'ThinhbeuBot v3.0 • Trang 3/6 — Fun & Games' })
          .setTimestamp(),

        music: new EmbedBuilder()
          .setTitle('🎵 Music — 7 lệnh')
          .setColor(0xFF0000)
          .setThumbnail(client.user.displayAvatarURL())
          .addFields(
            { name: '▶️ /play [tên bài / link YouTube]', value: 'Tìm và thêm bài vào hàng đợi', inline: true },
            { name: '⏭️ /skip', value: 'Bỏ qua bài đang phát', inline: true },
            { name: '⏹️ /stop', value: 'Dừng nhạc & xoá toàn bộ hàng đợi', inline: true },
            { name: '📜 /queue', value: 'Xem hàng đợi nhạc (10 bài đầu)', inline: true },
            { name: '🎶 /nowplaying', value: 'Xem thông tin bài đang phát', inline: true },
            { name: '🔁 /loop [off/song/queue]', value: 'Bật/tắt chế độ lặp bài hoặc queue', inline: true },
            { name: '🔀 /shuffle', value: 'Xáo trộn hàng đợi ngẫu nhiên', inline: true },
          )
          .setFooter({ text: 'ThinhbeuBot v3.0 • Trang 4/6 — Music' })
          .setTimestamp(),

        eco: new EmbedBuilder()
          .setTitle('💰 Economy & Leveling — 9 lệnh')
          .setColor(0xFFD700)
          .setThumbnail(client.user.displayAvatarURL())
          .addFields(
            { name: '💰 /daily', value: 'Nhận 100–500 xu mỗi ngày (hồi 24h)', inline: true },
            { name: '💳 /balance [@user]', value: 'Xem số dư xu và cấp độ', inline: true },
            { name: '💼 /work', value: 'Đi làm kiếm tiền (hồi 1 giờ)', inline: true },
            { name: '🏅 /rank [@user]', value: 'Xem cấp độ và thanh tiến trình XP', inline: true },
            { name: '🏆 /leaderboard [xu/cấp]', value: 'Bảng xếp hạng top 10 server', inline: true },
            { name: '💸 /transfer [@user] [số xu]', value: 'Chuyển xu cho thành viên khác', inline: true },
            { name: '🎲 /gamble [xu] [tài/xỉu]', value: 'Cá cược Tài Xỉu với 3 xúc xắc', inline: true },
            { name: '🎰 /slots [xu]', value: 'Máy đánh bạc slot — jackpot x10!', inline: true },
            { name: '🦐 /baucua [xu] [con vật]', value: 'Bầu Cua Tôm Cá truyền thống', inline: true },
            { name: '⭐ Hệ thống XP tự động', value: 'Chat = nhận XP → tích đủ → Level Up tự động!', inline: false },
          )
          .setFooter({ text: 'ThinhbeuBot v3.0 • Trang 5/6 — Economy' })
          .setTimestamp(),

        ai: new EmbedBuilder()
          .setTitle('🤖 AI & Hệ thống — 5 lệnh')
          .setColor(0xF55036)
          .setThumbnail(client.user.displayAvatarURL())
          .addFields(
            { name: '🤖 /ask [câu hỏi]', value: 'Hỏi Groq AI Llama 3.3 70B — miễn phí!', inline: true },
            { name: '🎫 /ticket', value: 'Tạo kênh hỗ trợ riêng tư với admin', inline: true },
            { name: '✅ /verify', value: 'Xác minh CAPTCHA để nhận role thành viên', inline: true },
            { name: '⚙️ /addcmd [tên] [phản hồi]', value: 'Tạo lệnh !tên tuỳ chỉnh (admin)', inline: true },
            { name: '📜 /listcmds', value: 'Xem tất cả lệnh tuỳ chỉnh của server', inline: true },
            { name: '🏓 /ping', value: 'Kiểm tra độ trễ bot và Discord API', inline: true },
          )
          .setFooter({ text: 'ThinhbeuBot v3.0 • Trang 6/6 — AI & System' })
          .setTimestamp(),
      };

      const selectMenu = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('menu_select')
          .setPlaceholder('📂 Chọn danh mục lệnh...')
          .addOptions([
            { label: 'Moderation', description: '13 lệnh quản trị server', value: 'mod', emoji: '🛡️' },
            { label: 'Utility', description: '10 lệnh tiện ích hữu dụng', value: 'util', emoji: '🔧' },
            { label: 'Fun & Games', description: '11 lệnh giải trí vui vẻ', value: 'fun', emoji: '🎮' },
            { label: 'Music', description: '7 lệnh nghe nhạc YouTube', value: 'music', emoji: '🎵' },
            { label: 'Economy & Leveling', description: '9 lệnh kinh tế và cấp độ', value: 'eco', emoji: '💰' },
            { label: 'AI & Hệ thống', description: '5 lệnh AI và hệ thống', value: 'ai', emoji: '🤖' },
          ])
      );

      const overviewEmbed = new EmbedBuilder()
        .setTitle('📋 ThinhbeuBot v3.0 — Danh sách lệnh')
        .setColor(0x5865F2)
        .setThumbnail(client.user.displayAvatarURL())
        .setDescription('Chọn danh mục bên dưới để xem chi tiết từng lệnh ⬇️')
        .addFields(
          { name: '🛡️ Moderation', value: '13 lệnh', inline: true },
          { name: '🔧 Utility', value: '10 lệnh', inline: true },
          { name: '🎮 Fun & Games', value: '11 lệnh', inline: true },
          { name: '🎵 Music', value: '7 lệnh', inline: true },
          { name: '💰 Economy', value: '9 lệnh', inline: true },
          { name: '🤖 AI & System', value: '5 lệnh + /ping /menu', inline: true },
        )
        .setFooter({ text: 'ThinhbeuBot v3.0 • Tổng 55 lệnh' })
        .setTimestamp();

      const msg = await interaction.reply({ embeds: [overviewEmbed], components: [selectMenu], fetchReply: true });

      const collector = msg.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: 120_000 });
      collector.on('collect', async i => {
        if (i.user.id !== interaction.user.id) {
          return i.reply({ content: '❌ Chỉ người dùng lệnh mới được chọn!', ephemeral: true });
        }
        const page = menuPages[i.values[0]];
        await i.update({ embeds: [page], components: [selectMenu] });
      });
      collector.on('end', () => {
        interaction.editReply({ components: [] }).catch(() => {});
      });
      return;
    }

    // ══════════════════ PING ══════════════════
    if (commandName === 'ping') {
      const lat = Date.now() - interaction.createdTimestamp;
      return interaction.reply({
        embeds: [okEmbed('🏓 Pong!').addFields(
          { name: '⏱️ Bot Latency', value: `\`${lat}ms\``, inline: true },
          { name: '💓 API Latency', value: `\`${client.ws.ping}ms\``, inline: true },
        )],
      });
    }

    // ══════════════════════════════════════════
    //  MODERATION
    // ══════════════════════════════════════════

    // BAN
    if (commandName === 'ban') {
      const target = interaction.options.getMember('user');
      const reason = interaction.options.getString('reason') ?? 'Không có lý do';
      if (!target) return interaction.reply({ embeds: [errEmbed('Không tìm thấy thành viên!')], ephemeral: true });
      if (!target.bannable) return interaction.reply({ embeds: [errEmbed('Bot không thể ban thành viên này!')], ephemeral: true });
      await target.ban({ reason });
      logAction(interaction.guild, '🔨 Ban', target.user, interaction.user, reason);
      return interaction.reply({ embeds: [modEmbed('🔨 Đã Ban', target.user, interaction.user, reason, 0xED4245)] });
    }

    // UNBAN
    if (commandName === 'unban') {
      const userId = interaction.options.getString('userid');
      await interaction.guild.bans.remove(userId).catch(() => null);
      return interaction.reply({ embeds: [okEmbed('🔓 Đã gỡ ban').setDescription(`Đã gỡ ban user ID: \`${userId}\``)] });
    }

    // KICK
    if (commandName === 'kick') {
      const target = interaction.options.getMember('user');
      const reason = interaction.options.getString('reason') ?? 'Không có lý do';
      if (!target) return interaction.reply({ embeds: [errEmbed('Không tìm thấy thành viên!')], ephemeral: true });
      if (!target.kickable) return interaction.reply({ embeds: [errEmbed('Bot không thể kick thành viên này!')], ephemeral: true });
      await target.kick(reason);
      logAction(interaction.guild, '👢 Kick', target.user, interaction.user, reason);
      return interaction.reply({ embeds: [modEmbed('👢 Đã Kick', target.user, interaction.user, reason, 0xED4245)] });
    }

    // MUTE
    if (commandName === 'mute') {
      const target = interaction.options.getMember('user');
      const minutes = interaction.options.getInteger('minutes') ?? 10;
      const reason = interaction.options.getString('reason') ?? 'Không có lý do';
      if (!target) return interaction.reply({ embeds: [errEmbed('Không tìm thấy thành viên!')], ephemeral: true });
      if (!target.moderatable) return interaction.reply({ embeds: [errEmbed('Bot không thể mute thành viên này!')], ephemeral: true });
      await target.timeout(minutes * 60_000, reason);
      logAction(interaction.guild, `🔇 Mute ${minutes}p`, target.user, interaction.user, reason);
      return interaction.reply({ embeds: [modEmbed('🔇 Đã Mute', target.user, interaction.user, reason, 0xFEE75C)
        .addFields({ name: '⏱️ Thời gian', value: `${minutes} phút`, inline: true })] });
    }

    // UNMUTE
    if (commandName === 'unmute') {
      const target = interaction.options.getMember('user');
      if (!target) return interaction.reply({ embeds: [errEmbed('Không tìm thấy thành viên!')], ephemeral: true });
      await target.timeout(null);
      return interaction.reply({ embeds: [modEmbed('🔊 Đã Unmute', target.user, interaction.user, null, 0x57F287)] });
    }

    // WARN
    if (commandName === 'warn') {
      const target = interaction.options.getMember('user');
      const reason = interaction.options.getString('reason');
      if (!target) return interaction.reply({ embeds: [errEmbed('Không tìm thấy thành viên!')], ephemeral: true });
      const count = db.addWarn(interaction.guild.id, target.user.id, reason, interaction.user.tag);
      let extra = '';
      if (count >= 3) {
        await target.kick('3 lần cảnh cáo — tự động kick').catch(() => {});
        extra = '\n⚠️ **Thành viên đã bị kick tự động do đạt 3 lần cảnh cáo!**';
      }
      logAction(interaction.guild, `⚠️ Warn (${count}/3)`, target.user, interaction.user, reason);
      return interaction.reply({ embeds: [modEmbed(`⚠️ Đã cảnh cáo (${count}/3)`, target.user, interaction.user, reason + extra, 0xFEA82F)] });
    }

    // WARNINGS
    if (commandName === 'warnings') {
      const target = interaction.options.getUser('user');
      const list = db.getWarnList(interaction.guild.id, target.id);
      if (!list.length) return interaction.reply({ embeds: [okEmbed(`✅ ${target.tag} chưa có cảnh cáo nào`)] });
      const embed = new EmbedBuilder().setTitle(`⚠️ Cảnh cáo của ${target.tag}`).setColor(0xFEA82F)
        .setDescription(list.map((w, i) => `**${i + 1}.** ${w.reason} — bởi *${w.mod}* <t:${Math.floor(w.date / 1000)}:R>`).join('\n'))
        .setTimestamp();
      return interaction.reply({ embeds: [embed] });
    }

    // CLEARWARNINGS
    if (commandName === 'clearwarnings') {
      const target = interaction.options.getUser('user');
      db.clearWarns(interaction.guild.id, target.id);
      return interaction.reply({ embeds: [okEmbed(`✅ Đã xoá tất cả cảnh cáo của ${target.tag}`)] });
    }

    // CLEAR
    if (commandName === 'clear') {
      const amount = interaction.options.getInteger('amount');
      await interaction.deferReply({ ephemeral: true });
      const deleted = await interaction.channel.bulkDelete(amount, true).catch(() => null);
      return interaction.editReply({ embeds: [okEmbed(`🗑️ Đã xoá ${deleted?.size ?? 0} tin nhắn`)] });
    }

    // SLOWMODE
    if (commandName === 'slowmode') {
      const sec = interaction.options.getInteger('seconds');
      await interaction.channel.setRateLimitPerUser(sec);
      return interaction.reply({ embeds: [okEmbed(sec === 0 ? '🐇 Đã tắt slowmode' : `🐢 Slowmode: ${sec} giây`)] });
    }

    // LOCK
    if (commandName === 'lock') {
      const ch = interaction.options.getChannel('channel') ?? interaction.channel;
      await ch.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: false });
      return interaction.reply({ embeds: [okEmbed(`🔒 Đã khoá ${ch}`)] });
    }

    // UNLOCK
    if (commandName === 'unlock') {
      const ch = interaction.options.getChannel('channel') ?? interaction.channel;
      await ch.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: null });
      return interaction.reply({ embeds: [okEmbed(`🔓 Đã mở khoá ${ch}`)] });
    }

    // NICKNAME
    if (commandName === 'nickname') {
      const target = interaction.options.getMember('user');
      const name = interaction.options.getString('name') ?? null;
      if (!target) return interaction.reply({ embeds: [errEmbed('Không tìm thấy thành viên!')], ephemeral: true });
      await target.setNickname(name);
      return interaction.reply({ embeds: [okEmbed(`✏️ Đã ${name ? `đổi biệt danh thành \`${name}\`` : 'reset biệt danh'} cho ${target.user.tag}`)] });
    }

    // ══════════════════════════════════════════
    //  UTILITY
    // ══════════════════════════════════════════

    // USERINFO
    if (commandName === 'userinfo') {
      const target = interaction.options.getUser('user') ?? interaction.user;
      const member = await interaction.guild?.members.fetch(target.id).catch(() => null);
      const accountAge = Date.now() - target.createdTimestamp;
      const newAccountWarning = accountAge < 7 * 24 * 60 * 60 * 1000 ? '\n⚠️ **Tài khoản mới dưới 7 ngày!**' : '';
      const embed = new EmbedBuilder().setTitle(`👤 ${target.tag}`).setColor(member?.displayColor || 0x5865F2)
        .setThumbnail(target.displayAvatarURL({ size: 256 }))
        .addFields(
          { name: '🆔 ID', value: target.id, inline: true },
          { name: '📅 Tạo tài khoản', value: `<t:${Math.floor(target.createdTimestamp / 1000)}:D>${newAccountWarning}`, inline: true },
          { name: '🤖 Bot?', value: target.bot ? 'Có' : 'Không', inline: true },
        ).setTimestamp();
      if (member) {
        embed.addFields(
          { name: '📥 Tham gia server', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:D>`, inline: true },
          { name: '🎭 Biệt danh', value: member.nickname ?? 'Không có', inline: true },
          { name: `🏷️ Roles (${member.roles.cache.size - 1})`, value: member.roles.cache.filter(r => r.id !== interaction.guild.id).map(r => r.toString()).join(' ') || 'Không có' },
        );
      }
      return interaction.reply({ embeds: [embed] });
    }

    // SERVERINFO
    if (commandName === 'serverinfo') {
      const guild = interaction.guild;
      await guild.members.fetch();
      const bots = guild.members.cache.filter(m => m.user.bot).size;
      const embed = new EmbedBuilder().setTitle(`🏠 ${guild.name}`).setColor(0xEB459E)
        .setThumbnail(guild.iconURL({ size: 256 }))
        .addFields(
          { name: '🆔 ID', value: guild.id, inline: true },
          { name: '👑 Chủ server', value: `<@${guild.ownerId}>`, inline: true },
          { name: '📅 Ngày tạo', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`, inline: true },
          { name: '👥 Thành viên', value: `${guild.memberCount - bots} người · ${bots} bot`, inline: true },
          { name: '📢 Kênh', value: `${guild.channels.cache.size}`, inline: true },
          { name: '🎭 Roles', value: `${guild.roles.cache.size}`, inline: true },
          { name: '😀 Emoji', value: `${guild.emojis.cache.size}`, inline: true },
          { name: '💎 Boost', value: `Level ${guild.premiumTier} · ${guild.premiumSubscriptionCount} boost`, inline: true },
          { name: '🔒 Xác minh', value: `Level ${guild.verificationLevel}`, inline: true },
        ).setTimestamp();
      return interaction.reply({ embeds: [embed] });
    }

    // AVATAR
    if (commandName === 'avatar') {
      const target = interaction.options.getUser('user') ?? interaction.user;
      const url = target.displayAvatarURL({ size: 1024 });
      const embed = new EmbedBuilder().setTitle(`🖼️ Avatar của ${target.tag}`).setImage(url).setColor(0x5865F2)
        .addFields({ name: '🔗 Link', value: `[Mở ảnh](${url})` }).setTimestamp();
      return interaction.reply({ embeds: [embed] });
    }

    // WEATHER
    if (commandName === 'weather') {
      await interaction.deferReply();
      const city = interaction.options.getString('city');
      try {
        let embed;
        if (WEATHER_KEY) {
          const res = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${WEATHER_KEY}&units=metric&lang=vi`);
          const w = await res.json();
          if (w.cod !== 200) return interaction.editReply({ embeds: [errEmbed(`Không tìm thấy thành phố: **${city}**`)] });
          const icons = { Clear: '☀️', Clouds: '☁️', Rain: '🌧️', Drizzle: '🌦️', Thunderstorm: '⛈️', Snow: '❄️', Mist: '🌫️', Fog: '🌫️' };
          embed = new EmbedBuilder().setTitle(`${icons[w.weather[0].main] ?? '🌡️'} Thời tiết ${w.name}, ${w.sys.country}`).setColor(0xFEA82F)
            .setThumbnail(`https://openweathermap.org/img/wn/${w.weather[0].icon}@2x.png`)
            .addFields(
              { name: '🌡️ Nhiệt độ', value: `${w.main.temp}°C (cảm giác ${w.main.feels_like}°C)`, inline: true },
              { name: '💧 Độ ẩm', value: `${w.main.humidity}%`, inline: true },
              { name: '💨 Gió', value: `${w.wind.speed} m/s`, inline: true },
              { name: '☁️ Trời', value: w.weather[0].description, inline: true },
              { name: '👁️ Tầm nhìn', value: `${(w.visibility / 1000).toFixed(1)} km`, inline: true },
            ).setFooter({ text: 'OpenWeatherMap' }).setTimestamp();
        } else {
          const res = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=j1`);
          const w = await res.json();
          const cur = w.current_condition[0];
          embed = new EmbedBuilder().setTitle(`🌦️ Thời tiết ${city}`).setColor(0xFEA82F)
            .addFields(
              { name: '🌡️ Nhiệt độ', value: `${cur.temp_C}°C (cảm giác ${cur.FeelsLikeC}°C)`, inline: true },
              { name: '💧 Độ ẩm', value: `${cur.humidity}%`, inline: true },
              { name: '💨 Gió', value: `${cur.windspeedKmph} km/h`, inline: true },
              { name: '☁️ Trời', value: cur.weatherDesc[0].value, inline: true },
            ).setFooter({ text: 'wttr.in' }).setTimestamp();
        }
        return interaction.editReply({ embeds: [embed] });
      } catch (e) { return interaction.editReply({ embeds: [errEmbed('Không thể lấy thời tiết. Kiểm tra tên thành phố!')] }); }
    }

    // TRANSLATE
    if (commandName === 'translate') {
      await interaction.deferReply();
      const text = interaction.options.getString('text');
      const lang = interaction.options.getString('lang') ?? 'en';
      try {
        const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${lang}&dt=t&q=${encodeURIComponent(text)}`);
        const data = await res.json();
        const translated = data[0].map(d => d[0]).join('');
        const detectedLang = data[2];
        const embed = new EmbedBuilder().setTitle('🌐 Dịch thuật').setColor(0x4285F4)
          .addFields(
            { name: `📥 Gốc (${detectedLang})`, value: text.slice(0, 500) },
            { name: `📤 Dịch (${lang})`, value: translated.slice(0, 500) },
          ).setFooter({ text: 'Google Translate' }).setTimestamp();
        return interaction.editReply({ embeds: [embed] });
      } catch { return interaction.editReply({ embeds: [errEmbed('Không thể dịch. Thử lại sau!')] }); }
    }

    // REMIND
    if (commandName === 'remind') {
      const timeStr = interaction.options.getString('time');
      const message = interaction.options.getString('message');
      const ms = parseTime(timeStr);
      if (!ms) return interaction.reply({ embeds: [errEmbed('Định dạng thời gian không hợp lệ! VD: 10m, 2h, 1d')], ephemeral: true });
      const when = Date.now() + ms;
      await interaction.reply({ embeds: [okEmbed('⏰ Đã đặt nhắc nhở!').addFields(
        { name: '📝 Nội dung', value: message },
        { name: '⏰ Nhắc lúc', value: `<t:${Math.floor(when / 1000)}:R>` },
      )] });
      setTimeout(async () => {
        interaction.user.send({ embeds: [new EmbedBuilder().setTitle('⏰ Nhắc nhở!').setColor(0xFEA82F)
          .setDescription(`📝 ${message}\n\nĐặt trong server: **${interaction.guild?.name ?? 'DM'}**`)
          .setTimestamp()] }).catch(() => {
          interaction.channel?.send({ content: `<@${interaction.user.id}>`, embeds: [new EmbedBuilder().setTitle('⏰ Nhắc nhở!').setColor(0xFEA82F).setDescription(message).setTimestamp()] }).catch(() => {});
        });
      }, ms);
    }

    // POLL
    if (commandName === 'poll') {
      const question = interaction.options.getString('question');
      const optionsRaw = interaction.options.getString('options').split('|').map(o => o.trim()).filter(Boolean).slice(0, 10);
      const emojis = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];
      const embed = new EmbedBuilder().setTitle(`📊 ${question}`).setColor(0x5865F2)
        .setDescription(optionsRaw.map((o, i) => `${emojis[i]} ${o}`).join('\n'))
        .setFooter({ text: `Bình chọn bởi ${interaction.user.tag}` }).setTimestamp();
      const msg = await interaction.reply({ embeds: [embed], fetchReply: true });
      for (let i = 0; i < optionsRaw.length; i++) await msg.react(emojis[i]).catch(() => {});
    }

    // GIVEAWAY
    if (commandName === 'giveaway') {
      const prize = interaction.options.getString('prize');
      const duration = interaction.options.getString('duration');
      const winnersCount = interaction.options.getInteger('winners') ?? 1;
      const ms = parseTime(duration);
      if (!ms) return interaction.reply({ embeds: [errEmbed('Thời gian không hợp lệ! VD: 10m, 1h, 1d')], ephemeral: true });
      const end = Date.now() + ms;
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('giveaway_enter').setLabel('🎉 Tham gia').setStyle(ButtonStyle.Success),
      );
      const embed = new EmbedBuilder().setTitle('🎁 GIVEAWAY!').setColor(0xFF73FA)
        .setDescription(`**Phần thưởng:** ${prize}\n**Kết thúc:** <t:${Math.floor(end / 1000)}:R>\n**Số người thắng:** ${winnersCount}\n**Tổ chức bởi:** ${interaction.user}`)
        .setTimestamp(end);
      const msg = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });
      giveaways.set(msg.id, { entrants: [], end, prize, winnersCount, channelId: interaction.channel.id });
      setTimeout(async () => {
        const ga = giveaways.get(msg.id);
        if (!ga) return;
        giveaways.delete(msg.id);
        if (!ga.entrants.length) {
          return interaction.channel.send({ embeds: [errEmbed('Giveaway kết thúc nhưng không có ai tham gia!')] });
        }
        const winners = [];
        const pool = [...ga.entrants];
        for (let i = 0; i < Math.min(ga.winnersCount, pool.length); i++) {
          const idx = Math.floor(Math.random() * pool.length);
          winners.push(pool.splice(idx, 1)[0]);
        }
        interaction.channel.send({
          content: winners.map(id => `<@${id}>`).join(' '),
          embeds: [new EmbedBuilder().setTitle('🎉 Giveaway kết thúc!').setColor(0xFF73FA)
            .setDescription(`**Phần thưởng:** ${ga.prize}\n**Người thắng:** ${winners.map(id => `<@${id}>`).join(', ')}`)
            .setTimestamp()],
        });
      }, ms);
    }

    // CALC
    if (commandName === 'calc') {
      const expr = interaction.options.getString('expression');
      try {
        // Safe eval: only allow numbers and operators
        if (!/^[0-9+\-*/().\s%^]+$/.test(expr)) throw new Error('invalid');
        const result = Function(`"use strict"; return (${expr.replace(/\^/g, '**')})`)();
        return interaction.reply({ embeds: [okEmbed('🧮 Kết quả').addFields(
          { name: '📝 Biểu thức', value: `\`${expr}\``, inline: true },
          { name: '✅ Kết quả', value: `\`${result}\``, inline: true },
        )] });
      } catch {
        return interaction.reply({ embeds: [errEmbed('Biểu thức không hợp lệ!')] });
      }
    }

    // ══════════════════════════════════════════
    //  FUN
    // ══════════════════════════════════════════

    // ROLL
    if (commandName === 'roll') {
      const sides = interaction.options.getInteger('sides') ?? 6;
      const result = randomInt(1, sides);
      return interaction.reply({ embeds: [okEmbed(`🎲 ${result}`, 0xFEA82F).setDescription(`Tung **d${sides}** — Kết quả: **${result}** / ${sides}`)] });
    }

    // FLIP
    if (commandName === 'flip') {
      const result = Math.random() > 0.5 ? '👑 Ngửa' : '🍺 Sấp';
      return interaction.reply({ embeds: [okEmbed(`🪙 ${result}`, 0xFEE75C)] });
    }

    // 8BALL
    if (commandName === '8ball') {
      const question = interaction.options.getString('question');
      const answers = [
        '✅ Chắc chắn rồi!', '✅ Có vẻ vậy.', '✅ Không còn nghi ngờ gì nữa.',
        '✅ Đúng thế đấy!', '✅ Tất nhiên là có.', '🤔 Hỏi lại sau nhé.',
        '🤔 Chưa thể đoán được.', '🤔 Đừng hỏi lại bây giờ.', '🤔 Tập trung rồi hỏi lại.',
        '❌ Không phải đâu.', '❌ Câu trả lời là Không.', '❌ Không có khả năng đó.',
      ];
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🎱 Magic 8-Ball').setColor(0x000000)
        .addFields({ name: '❓ Câu hỏi', value: question }, { name: '💬 Trả lời', value: answers[randomInt(0, answers.length - 1)] })
        .setTimestamp()] });
    }

    // JOKE
    if (commandName === 'joke') {
      const jokes = [
        { setup: 'Tại sao lập trình viên ghét ánh nắng mặt trời?', punchline: 'Vì Windows bị lỗi!' },
        { setup: 'Con gì không có cánh mà vẫn bay được?', punchline: 'Con nợ!' },
        { setup: 'Tại sao con bò lại qua đường?', punchline: 'Để đến phía bên kia!' },
        { setup: 'Con gì chui vào mũi ra ngoài mũi?', punchline: 'Con sâu mũi!' },
        { setup: 'Tại sao điện thoại không bao giờ đói?', punchline: 'Vì có đầy "bộ nhớ"!' },
        { setup: 'Học sinh học môn gì mà vừa học vừa xây?', punchline: 'Kiến trúc!' },
        { setup: 'Tại sao developer thích làm tối?', punchline: 'Vì light attracts bugs!' },
        { setup: 'Con gì có 4 chân đứng, 2 chân ngồi và 3 chân đi?', punchline: 'Ông già chống gậy + ghế!' },
      ];
      const j = jokes[randomInt(0, jokes.length - 1)];
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle('😂 Chuyện cười').setColor(0xFEE75C)
        .addFields({ name: '🎤 Câu hỏi', value: j.setup }, { name: '🎉 Đáp án', value: j.punchline })
        .setTimestamp()] });
    }

    // MEME
    if (commandName === 'meme') {
      await interaction.deferReply();
      try {
        const subs = ['memes', 'dankmemes', 'me_irl', 'funny'];
        const sub = subs[randomInt(0, subs.length - 1)];
        const res = await fetch(`https://meme-api.com/gimme/${sub}`);
        const data = await res.json();
        const embed = new EmbedBuilder().setTitle(data.title.slice(0, 256)).setColor(0xFF4500)
          .setImage(data.url).setFooter({ text: `r/${data.subreddit} · 👍 ${data.ups}` }).setTimestamp();
        return interaction.editReply({ embeds: [embed] });
      } catch { return interaction.editReply({ embeds: [errEmbed('Không thể lấy meme. Thử lại!')] }); }
    }

    // LOVECALC
    if (commandName === 'lovecalc') {
      const u1 = interaction.options.getUser('user1');
      const u2 = interaction.options.getUser('user2');
      const seed = (u1.id + u2.id).split('').reduce((a, c) => a + c.charCodeAt(0), 0);
      const pct = seed % 101;
      const bars = '❤️'.repeat(Math.floor(pct / 10)) + '🖤'.repeat(10 - Math.floor(pct / 10));
      const comment = pct >= 80 ? '💞 Cặp đôi hoàn hảo!' : pct >= 50 ? '💛 Khá hợp nhau!' : '💔 Cần cố gắng thêm!';
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle('💕 Love Calculator').setColor(0xFF69B4)
        .setDescription(`${u1} ❤️ ${u2}\n\n${bars}\n**${pct}% — ${comment}**`)
        .setTimestamp()] });
    }

    // RPS
    if (commandName === 'rps') {
      const choices = ['rock', 'paper', 'scissors'];
      const labels = { rock: '✊ Búa', paper: '✋ Bao', scissors: '✌️ Kéo' };
      const wins = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
      const player = interaction.options.getString('choice');
      const bot = choices[randomInt(0, 2)];
      let result = '🤝 **Hòa!**';
      if (wins[player] === bot) result = '🎉 **Bạn thắng!**';
      else if (wins[bot] === player) result = '😢 **Bot thắng!**';
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle('✊ Kéo Búa Bao').setColor(0x5865F2)
        .addFields(
          { name: '👤 Bạn', value: labels[player], inline: true },
          { name: '🤖 Bot', value: labels[bot], inline: true },
          { name: '🏆 Kết quả', value: result },
        ).setTimestamp()] });
    }

    // SLAP / HUG / KISS
    if (['slap', 'hug', 'kiss'].includes(commandName)) {
      const target = interaction.options.getUser('user');
      const gifs = {
        slap: ['https://media.giphy.com/media/uqSU9IEYEKAbS/giphy.gif', 'https://media.giphy.com/media/xUO4t2gkziBtks3qpy/giphy.gif'],
        hug:  ['https://media.giphy.com/media/od5H3PmEG5EVq/giphy.gif', 'https://media.giphy.com/media/wnsgren9NtITS/giphy.gif'],
        kiss: ['https://media.giphy.com/media/G3va31oEEnIkM/giphy.gif', 'https://media.giphy.com/media/bGm9FaWNnFpi0/giphy.gif'],
      };
      const verbs = { slap: 'đã tát', hug: 'đã ôm', kiss: 'đã hôn' };
      const emojis = { slap: '👋', hug: '🤗', kiss: '😘' };
      const gif = gifs[commandName][randomInt(0, gifs[commandName].length - 1)];
      return interaction.reply({ embeds: [new EmbedBuilder()
        .setTitle(`${emojis[commandName]} ${interaction.user.username} ${verbs[commandName]} ${target.username}!`)
        .setImage(gif).setColor(0xFF69B4).setTimestamp()] });
    }

    // TRIVIA
    if (commandName === 'trivia') {
      if (triviaGames.has(interaction.channel.id)) return interaction.reply({ embeds: [errEmbed('Đã có câu đố đang chạy trong kênh này!')], ephemeral: true });
      await interaction.deferReply();
      try {
        const res = await fetch('https://opentdb.com/api.php?amount=1&type=multiple');
        const data = await res.json();
        const q = data.results[0];
        const correct = decodeHTML(q.correct_answer);
        const wrongAnswers = q.incorrect_answers.map(a => decodeHTML(a));
        const all = [...wrongAnswers, correct].sort(() => Math.random() - 0.5);
        const letters = ['🇦', '🇧', '🇨', '🇩'];
        triviaGames.set(interaction.channel.id, { answer: correct, timer: null });
        const embed = new EmbedBuilder().setTitle('🧠 Câu hỏi đố vui').setColor(0x9B59B6)
          .setDescription(decodeHTML(q.question))
          .addFields({ name: 'Các lựa chọn', value: all.map((a, i) => `${letters[i]} ${a}`).join('\n') })
          .setFooter({ text: `Độ khó: ${q.difficulty} | Danh mục: ${q.category} | Trả lời trong 30 giây!` })
          .setTimestamp();
        await interaction.editReply({ embeds: [embed] });
        const filter = m => !m.author.bot && ['a', 'b', 'c', 'd'].includes(m.content.toLowerCase());
        const collector = interaction.channel.createMessageCollector({ filter, time: 30_000 });
        const game = triviaGames.get(interaction.channel.id);
        game.timer = collector;
        collector.on('collect', m => {
          const idx = ['a','b','c','d'].indexOf(m.content.toLowerCase());
          if (all[idx] === correct) {
            collector.stop('answered');
            // Reward
            const userData = db.getUser(m.author.id);
            userData.coins = (userData.coins || 0) + 50;
            db.saveUser(m.author.id, userData);
            interaction.channel.send({ embeds: [new EmbedBuilder().setColor(0x57F287)
              .setTitle('✅ Chính xác!')
              .setDescription(`${m.author} trả lời đúng! Đáp án: **${correct}**\nBạn nhận được 🪙 **50 xu**!`)
              .setTimestamp()] });
          } else {
            m.react('❌').catch(() => {});
          }
        });
        collector.on('end', (_, reason) => {
          triviaGames.delete(interaction.channel.id);
          if (reason !== 'answered') {
            interaction.channel.send({ embeds: [errEmbed(`Hết giờ! Đáp án đúng là: **${correct}**`)] });
          }
        });
      } catch { return interaction.editReply({ embeds: [errEmbed('Không thể lấy câu hỏi. Thử lại!')] }); }
    }

    // ══════════════════════════════════════════
    //  MUSIC
    // ══════════════════════════════════════════

    if (commandName === 'play') {
      await interaction.deferReply();
      const song = interaction.options.getString('song');
      const guildId = interaction.guildId;
      if (!musicQueues.has(guildId)) musicQueues.set(guildId, { queue: [], loop: 'off', playing: false });
      const q = musicQueues.get(guildId);

      let title = song, youtubeUrl = null, channel = '', thumbnail = null, duration = '';
      try {
        const html = await (await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(song)}`, { headers: { 'User-Agent': 'Mozilla/5.0' } })).text();
        const vid = html.match(/"videoId":"([a-zA-Z0-9_-]{11})"/)?.[1];
        if (vid) {
          youtubeUrl = `https://www.youtube.com/watch?v=${vid}`;
          title     = html.match(/"title":{"runs":\[{"text":"([^"]+)"}/)?.[1] ?? song;
          channel   = html.match(/"ownerText":{"runs":\[{"text":"([^"]+)"}/)?.[1] ?? '';
          duration  = html.match(/"simpleText":"(\d+:\d+(?::\d+)?)"/)?.[1] ?? '';
          thumbnail = `https://img.youtube.com/vi/${vid}/hqdefault.jpg`;
        }
      } catch {}
      if (!youtubeUrl) youtubeUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(song)}`;

      q.queue.push({ title, url: youtubeUrl, channel, thumbnail, duration, requester: interaction.user.tag });
      const embed = new EmbedBuilder().setTitle('🎵 Đã thêm vào hàng đợi').setColor(0xFF0000)
        .setThumbnail(thumbnail)
        .addFields(
          { name: '🎶 Bài hát', value: `[${title}](${youtubeUrl})` },
          { name: '👤 Kênh', value: channel || 'Không rõ', inline: true },
          { name: '⏱️ Thời lượng', value: duration || 'Không rõ', inline: true },
          { name: '📍 Vị trí', value: `#${q.queue.length}`, inline: true },
        )
        .setDescription(`▶️ **[Nghe trên YouTube](${youtubeUrl})**`)
        .setFooter({ text: `Thêm bởi ${interaction.user.tag}` }).setTimestamp();
      return interaction.editReply({ embeds: [embed] });
    }

    if (commandName === 'queue') {
      const q = musicQueues.get(interaction.guildId);
      if (!q?.queue.length) return interaction.reply({ embeds: [errEmbed('Hàng đợi đang trống!')] });
      const list = q.queue.slice(0, 10).map((s, i) => `**${i + 1}.** [${s.title}](${s.url}) \`${s.duration}\` — *${s.requester}*`).join('\n');
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle('📜 Hàng đợi nhạc').setColor(0xFF0000)
        .setDescription(list)
        .addFields({ name: '🔁 Chế độ lặp', value: q.loop, inline: true }, { name: '📊 Tổng', value: `${q.queue.length} bài`, inline: true })
        .setTimestamp()] });
    }

    if (commandName === 'nowplaying') {
      const q = musicQueues.get(interaction.guildId);
      if (!q?.queue.length) return interaction.reply({ embeds: [errEmbed('Không có bài nào đang phát!')] });
      const s = q.queue[0];
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🎶 Đang phát').setColor(0xFF0000)
        .setThumbnail(s.thumbnail)
        .addFields(
          { name: '🎵 Bài hát', value: `[${s.title}](${s.url})` },
          { name: '👤 Kênh', value: s.channel || 'Không rõ', inline: true },
          { name: '⏱️ Thời lượng', value: s.duration || 'Không rõ', inline: true },
          { name: '🙋 Yêu cầu bởi', value: s.requester, inline: true },
        ).setTimestamp()] });
    }

    if (commandName === 'skip') {
      const q = musicQueues.get(interaction.guildId);
      if (!q?.queue.length) return interaction.reply({ embeds: [errEmbed('Hàng đợi trống!')] });
      const skipped = q.queue.shift();
      return interaction.reply({ embeds: [okEmbed(`⏭️ Đã skip: **${skipped.title}**`)
        .addFields({ name: '🎵 Tiếp theo', value: q.queue[0] ? `[${q.queue[0].title}](${q.queue[0].url})` : 'Hết hàng đợi' })] });
    }

    if (commandName === 'stop') {
      musicQueues.delete(interaction.guildId);
      return interaction.reply({ embeds: [okEmbed('⏹️ Đã dừng nhạc và xoá hàng đợi', 0xED4245)] });
    }

    if (commandName === 'loop') {
      const q = musicQueues.get(interaction.guildId);
      if (!q) return interaction.reply({ embeds: [errEmbed('Chưa có nhạc trong hàng đợi!')] });
      const mode = interaction.options.getString('mode') ?? (q.loop === 'off' ? 'song' : 'off');
      q.loop = mode;
      const labels = { off: '🚫 Tắt lặp', song: '🔂 Lặp bài hiện tại', queue: '🔁 Lặp cả queue' };
      return interaction.reply({ embeds: [okEmbed(`${labels[mode]}`)] });
    }

    if (commandName === 'shuffle') {
      const q = musicQueues.get(interaction.guildId);
      if (!q?.queue.length) return interaction.reply({ embeds: [errEmbed('Hàng đợi trống!')] });
      const current = q.queue.shift();
      for (let i = q.queue.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [q.queue[i], q.queue[j]] = [q.queue[j], q.queue[i]];
      }
      q.queue.unshift(current);
      return interaction.reply({ embeds: [okEmbed(`🔀 Đã xáo trộn ${q.queue.length} bài`)] });
    }

    // ══════════════════════════════════════════
    //  ECONOMY
    // ══════════════════════════════════════════

    if (commandName === 'daily') {
      const userData = db.getUser(interaction.user.id);
      const now = Date.now();
      const COOLDOWN = 24 * 60 * 60 * 1000;
      if (now - (userData.lastDaily || 0) < COOLDOWN) {
        const remaining = COOLDOWN - (now - userData.lastDaily);
        return interaction.reply({ embeds: [errEmbed(`Bạn đã nhận hàng ngày rồi! Còn **${msToTime(remaining)}** nữa.`)], ephemeral: true });
      }
      const reward = randomInt(100, 500);
      userData.coins = (userData.coins || 0) + reward;
      userData.lastDaily = now;
      db.saveUser(interaction.user.id, userData);
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle('💰 Nhận tiền hàng ngày!').setColor(0xFFD700)
        .setDescription(`Bạn nhận được ${formatCoins(reward)}!\n\nSố dư: ${formatCoins(userData.coins)}`)
        .setTimestamp()] });
    }

    if (commandName === 'balance') {
      const target = interaction.options.getUser('user') ?? interaction.user;
      const userData = db.getUser(target.id);
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`💳 Số dư của ${target.username}`).setColor(0xFFD700)
        .addFields(
          { name: '🪙 Xu', value: formatCoins(userData.coins || 0), inline: true },
          { name: '⭐ Cấp độ', value: `**${userData.level || 1}**`, inline: true },
          { name: '✨ XP', value: `${userData.xp || 0}`, inline: true },
        ).setThumbnail(target.displayAvatarURL()).setTimestamp()] });
    }

    if (commandName === 'work') {
      const userData = db.getUser(interaction.user.id);
      const now = Date.now();
      const COOLDOWN = 60 * 60 * 1000; // 1 hour
      if (now - (userData.lastWork || 0) < COOLDOWN) {
        const remaining = COOLDOWN - (now - userData.lastWork);
        return interaction.reply({ embeds: [errEmbed(`Bạn cần nghỉ ngơi! Còn **${msToTime(remaining)}** nữa.`)], ephemeral: true });
      }
      const jobs = [
        { job: '👨‍💻 Lập trình viên', reward: randomInt(150, 300) },
        { job: '🚗 Tài xế Grab', reward: randomInt(80, 200) },
        { job: '☕ Pha cà phê', reward: randomInt(50, 150) },
        { job: '🎮 Streamer game', reward: randomInt(200, 400) },
        { job: '📦 Giao hàng', reward: randomInt(100, 250) },
        { job: '🍜 Bán bún bò', reward: randomInt(120, 280) },
        { job: '📱 Bán điện thoại', reward: randomInt(180, 350) },
      ];
      const picked = jobs[randomInt(0, jobs.length - 1)];
      userData.coins = (userData.coins || 0) + picked.reward;
      userData.lastWork = now;
      db.saveUser(interaction.user.id, userData);
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle('💼 Đi làm!').setColor(0x57F287)
        .setDescription(`Bạn làm **${picked.job}** và kiếm được ${formatCoins(picked.reward)}!\n\nSố dư: ${formatCoins(userData.coins)}`)
        .setTimestamp()] });
    }

    if (commandName === 'rank') {
      const target = interaction.options.getUser('user') ?? interaction.user;
      const userData = db.getUser(target.id);
      const level = userData.level || 1;
      const xp = userData.xp || 0;
      const needed = level * 100;
      const progress = Math.min(Math.floor((xp % needed) / needed * 10), 10);
      const bar = '█'.repeat(progress) + '░'.repeat(10 - progress);
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`🏅 Cấp độ của ${target.username}`).setColor(0x9B59B6)
        .setThumbnail(target.displayAvatarURL())
        .addFields(
          { name: '⭐ Cấp độ', value: `**${level}**`, inline: true },
          { name: '✨ XP', value: `${xp % needed} / ${needed}`, inline: true },
          { name: '📊 Thanh tiến trình', value: `\`[${bar}]\`` },
        ).setTimestamp()] });
    }

    if (commandName === 'leaderboard') {
      const type = interaction.options.getString('type') ?? 'coins';
      const eco = require('./utils/db').getUser; // dummy for import
      const allData = (() => {
        const fs = require('fs'), path = require('path');
        const fp = path.join(__dirname, 'data', 'economy.json');
        if (!require('fs').existsSync(fp)) return {};
        return JSON.parse(fs.readFileSync(fp, 'utf8'));
      })();
      const sorted = Object.entries(allData)
        .sort((a, b) => (b[1][type] || 0) - (a[1][type] || 0))
        .slice(0, 10);
      if (!sorted.length) return interaction.reply({ embeds: [errEmbed('Chưa có dữ liệu!')] });
      const medals = ['🥇', '🥈', '🥉'];
      const list = sorted.map(([id, d], i) => `${medals[i] || `**${i + 1}.**`} <@${id}> — ${type === 'coins' ? formatCoins(d.coins || 0) : `⭐ Cấp ${d.level || 1}`}`).join('\n');
      return interaction.reply({ embeds: [new EmbedBuilder()
        .setTitle(type === 'coins' ? '🏆 Top 10 Đại Gia' : '🏆 Top 10 Cao Thủ')
        .setColor(0xFFD700).setDescription(list).setTimestamp()] });
    }

    if (commandName === 'transfer') {
      const target = interaction.options.getUser('user');
      const amount = interaction.options.getInteger('amount');
      if (target.id === interaction.user.id) return interaction.reply({ embeds: [errEmbed('Không thể chuyển cho chính mình!')], ephemeral: true });
      const sender = db.getUser(interaction.user.id);
      if ((sender.coins || 0) < amount) return interaction.reply({ embeds: [errEmbed(`Bạn không đủ xu! Số dư: ${formatCoins(sender.coins || 0)}`)], ephemeral: true });
      const receiver = db.getUser(target.id);
      sender.coins -= amount;
      receiver.coins = (receiver.coins || 0) + amount;
      db.saveUser(interaction.user.id, sender);
      db.saveUser(target.id, receiver);
      return interaction.reply({ embeds: [okEmbed('💸 Chuyển tiền thành công!').setDescription(
        `${interaction.user} → ${target}\n${formatCoins(amount)}\n\nSố dư còn lại: ${formatCoins(sender.coins)}`
      )] });
    }

    if (commandName === 'gamble') {
      const amount = interaction.options.getInteger('amount');
      const bet = interaction.options.getString('bet');
      const userData = db.getUser(interaction.user.id);
      if ((userData.coins || 0) < amount) return interaction.reply({ embeds: [errEmbed(`Không đủ xu! Số dư: ${formatCoins(userData.coins || 0)}`)], ephemeral: true });
      const d1 = randomInt(1, 6), d2 = randomInt(1, 6), d3 = randomInt(1, 6);
      const sum = d1 + d2 + d3;
      const isTai = sum >= 11;
      const won = (bet === 'tai') === isTai;
      userData.coins = (userData.coins || 0) + (won ? amount : -amount);
      db.saveUser(interaction.user.id, userData);
      return interaction.reply({ embeds: [new EmbedBuilder()
        .setTitle(`🎲 Tài Xỉu — ${won ? '🎉 THẮNG!' : '😢 THUA!'}`)
        .setColor(won ? 0x57F287 : 0xED4245)
        .setDescription(`🎲 ${d1} + ${d2} + ${d3} = **${sum}** (${isTai ? '🔴 Tài' : '🔵 Xỉu'})\nBạn cược: **${bet === 'tai' ? '🔴 Tài' : '🔵 Xỉu'}**\n${won ? `+${formatCoins(amount)}` : `-${formatCoins(amount)}`}\nSố dư: ${formatCoins(userData.coins)}`)
        .setTimestamp()] });
    }

    if (commandName === 'slots') {
      const amount = interaction.options.getInteger('amount');
      const userData = db.getUser(interaction.user.id);
      if ((userData.coins || 0) < amount) return interaction.reply({ embeds: [errEmbed(`Không đủ xu! Số dư: ${formatCoins(userData.coins || 0)}`)], ephemeral: true });
      const symbols = ['🍒', '🍋', '🍊', '🍇', '⭐', '💎', '🎰'];
      const s1 = symbols[randomInt(0, symbols.length - 1)];
      const s2 = symbols[randomInt(0, symbols.length - 1)];
      const s3 = symbols[randomInt(0, symbols.length - 1)];
      let multiplier = 0;
      if (s1 === s2 && s2 === s3) multiplier = s1 === '💎' ? 10 : s1 === '⭐' ? 5 : 3;
      else if (s1 === s2 || s2 === s3 || s1 === s3) multiplier = 0; // partial match = break even
      const won = multiplier > 0;
      const profit = won ? amount * (multiplier - 1) : -amount;
      userData.coins = (userData.coins || 0) + profit;
      db.saveUser(interaction.user.id, userData);
      return interaction.reply({ embeds: [new EmbedBuilder()
        .setTitle(`🎰 Slots — ${won ? `🎉 JACKPOT x${multiplier}!` : '😢 Thua!'}`)
        .setColor(won ? 0xFFD700 : 0xED4245)
        .setDescription(`┌─────────┐\n│ ${s1} │ ${s2} │ ${s3} │\n└─────────┘\n${won ? `+${formatCoins(amount * (multiplier - 1))}` : `-${formatCoins(amount)}`}\nSố dư: ${formatCoins(userData.coins)}`)
        .setTimestamp()] });
    }

    if (commandName === 'baucua') {
      const amount = interaction.options.getInteger('amount');
      const bet = interaction.options.getString('bet');
      const userData = db.getUser(interaction.user.id);
      if ((userData.coins || 0) < amount) return interaction.reply({ embeds: [errEmbed(`Không đủ xu!`)], ephemeral: true });
      const items = ['tom', 'cua', 'ca', 'nai', 'ga', 'bau'];
      const emojis = { tom: '🦐', cua: '🦀', ca: '🐟', nai: '🦌', ga: '🐓', bau: '🎡' };
      const d1 = items[randomInt(0, 5)], d2 = items[randomInt(0, 5)], d3 = items[randomInt(0, 5)];
      const matches = [d1, d2, d3].filter(d => d === bet).length;
      const won = matches > 0;
      const profit = won ? amount * matches : -amount;
      userData.coins = (userData.coins || 0) + profit;
      db.saveUser(interaction.user.id, userData);
      return interaction.reply({ embeds: [new EmbedBuilder()
        .setTitle(`🦐 Bầu Cua — ${won ? `🎉 THẮNG x${matches}!` : '😢 Thua!'}`)
        .setColor(won ? 0x57F287 : 0xED4245)
        .setDescription(`🎲 ${emojis[d1]} ${emojis[d2]} ${emojis[d3]}\nBạn cược: **${emojis[bet]}** (${bet})\n${won ? `+${formatCoins(amount * matches)}` : `-${formatCoins(amount)}`}\nSố dư: ${formatCoins(userData.coins)}`)
        .setTimestamp()] });
    }

    // ══════════════════════════════════════════
    //  AI / SYSTEM
    // ══════════════════════════════════════════

    if (commandName === 'ask') {
      await interaction.deferReply();
      const question = interaction.options.getString('cauhoi');
      if (!GROQ_KEY) return interaction.editReply({ embeds: [errEmbed('Chưa cấu hình `GROQ_API_KEY`!\nLấy key miễn phí: https://console.groq.com')] });
      try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_KEY}` },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [
              { role: 'system', content: 'Bạn là trợ lý AI thông minh trong Discord bot. Trả lời ngắn gọn, rõ ràng bằng tiếng Việt. Nếu câu hỏi bằng tiếng Anh thì trả lời tiếng Anh.' },
              { role: 'user', content: question },
            ],
            max_tokens: 1024, temperature: 0.7,
          }),
        });
        const data = await res.json();
        if (data.error) return interaction.editReply({ embeds: [errEmbed(`Groq: ${data.error.message}`)] });
        const answer = data?.choices?.[0]?.message?.content ?? 'Không nhận được phản hồi.';
        const short = answer.length > 3900 ? answer.substring(0, 3900) + '\n*(đã cắt bớt)*' : answer;
        return interaction.editReply({ embeds: [new EmbedBuilder().setTitle('🤖 Groq AI — Llama 3.3 70B').setColor(0xF55036)
          .addFields({ name: '❓ Câu hỏi', value: `\`\`\`${question.slice(0, 200)}\`\`\`` }, { name: '💬 Trả lời', value: short })
          .setFooter({ text: `Hỏi bởi ${interaction.user.tag}` }).setTimestamp()] });
      } catch (e) { return interaction.editReply({ embeds: [errEmbed('Lỗi kết nối Groq API!')] }); }
    }

    // TICKET
    if (commandName === 'ticket') {
      if (!interaction.guild) return;
      const existing = interaction.guild.channels.cache.find(c => c.name === `ticket-${interaction.user.username.toLowerCase().replace(/\s/g, '-')}`);
      if (existing) return interaction.reply({ embeds: [errEmbed(`Bạn đã có ticket rồi: ${existing}`)], ephemeral: true });
      const ch = await interaction.guild.channels.create({
        name: `ticket-${interaction.user.username.toLowerCase().replace(/\s/g, '-')}`,
        type: ChannelType.GuildText,
        permissionOverwrites: [
          { id: interaction.guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
          { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
          { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
        ],
      });
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket_close').setLabel('🔒 Đóng Ticket').setStyle(ButtonStyle.Danger),
      );
      ch.send({
        content: `<@${interaction.user.id}>`,
        embeds: [new EmbedBuilder().setTitle('🎫 Ticket hỗ trợ').setColor(0x5865F2)
          .setDescription(`Chào ${interaction.user}!\nMô tả vấn đề của bạn, admin sẽ hỗ trợ sớm nhất có thể.\n\nNhấn **Đóng Ticket** khi xong.`)
          .setTimestamp()],
        components: [row],
      });
      return interaction.reply({ embeds: [okEmbed(`🎫 Đã tạo ticket: ${ch}`)], ephemeral: true });
    }

    // VERIFY
    if (commandName === 'verify') {
      const code = genCaptcha();
      captchaPending.set(interaction.user.id, { code, channelId: interaction.channel.id });
      await interaction.reply({
        embeds: [new EmbedBuilder().setTitle('🔐 Xác minh CAPTCHA').setColor(0x5865F2)
          .setDescription(`Nhập mã dưới đây vào chat để xác minh:\n\n## \`${code}\`\n\n*(Hết hiệu lực sau 2 phút)*`)
          .setTimestamp()],
        ephemeral: true,
      });
      setTimeout(() => captchaPending.delete(interaction.user.id), 120_000);
    }

    // ADDCMD
    if (commandName === 'addcmd') {
      const name = interaction.options.getString('name').toLowerCase().replace(/\s/g, '_');
      const response = interaction.options.getString('response');
      db.addCustomCmd(interaction.guild.id, name, response);
      return interaction.reply({ embeds: [okEmbed(`✅ Đã thêm lệnh \`!${name}\``).setDescription(`Phản hồi: ${response}`)] });
    }

    // LISTCMDS
    if (commandName === 'listcmds') {
      const cmds = db.getCustomCmds()[interaction.guild.id] ?? {};
      const list = Object.entries(cmds);
      if (!list.length) return interaction.reply({ embeds: [errEmbed('Chưa có lệnh tuỳ chỉnh nào!')] });
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle('📜 Lệnh tuỳ chỉnh').setColor(0x5865F2)
        .setDescription(list.map(([n, r]) => `\`!${n}\` → ${r.slice(0, 80)}`).join('\n'))
        .setTimestamp()] });
    }

  } catch (err) {
    console.error(`❌ Error in /${commandName}:`, err);
    const msg = '❌ Có lỗi xảy ra! Thử lại sau.';
    if (interaction.deferred) await interaction.editReply({ content: msg }).catch(() => {});
    else await interaction.reply({ content: msg, ephemeral: true }).catch(() => {});
  }
});

// ── Verify CAPTCHA collector ──────────────────────────────────
client.on('messageCreate', async msg => {
  if (msg.author.bot || !captchaPending.has(msg.author.id)) return;
  const pending = captchaPending.get(msg.author.id);
  if (msg.channel.id !== pending.channelId) return;
  if (msg.content.trim().toUpperCase() === pending.code) {
    captchaPending.delete(msg.author.id);
    if (VERIFY_ROLE && msg.guild) {
      const role = msg.guild.roles.cache.get(VERIFY_ROLE);
      if (role) await msg.member.roles.add(role).catch(() => {});
    }
    msg.reply({ embeds: [okEmbed('✅ Xác minh thành công! Chào mừng bạn đến với server!')] }).catch(() => {});
  }
});

// ══════════════════════════════════════════════════════════════
//  HELPER FUNCTIONS
// ══════════════════════════════════════════════════════════════

function modEmbed(title, target, mod, reason, color) {
  return new EmbedBuilder().setTitle(title).setColor(color)
    .addFields(
      { name: '🎯 Thành viên', value: `${target.tag} (<@${target.id}>)`, inline: true },
      { name: '👮 Mod', value: `${mod.tag}`, inline: true },
      ...(reason ? [{ name: '📝 Lý do', value: reason }] : []),
    ).setTimestamp();
}

function logAction() {} // no-op (log channel removed)

function parseTime(str) {
  const match = str.match(/^(\d+)(s|m|h|d)$/i);
  if (!match) return null;
  const n = parseInt(match[1]);
  const unit = match[2].toLowerCase();
  const mult = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return n * mult[unit];
}

function decodeHTML(str) {
  return str.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;/g, "'");
}

// ── Login ─────────────────────────────────────────────────────
client.login(TOKEN);
