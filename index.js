// ╔══════════════════════════════════════════════════════════════╗
// ║  ThinhbeuBot v4.0  —  ~65 chức năng  —  Railway-ready       ║
// ║  Mod • Utility • Fun • Music • Economy • Shop • AI • System  ║
// ╚══════════════════════════════════════════════════════════════╝

const {
  Client, GatewayIntentBits, REST, Routes,
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, PermissionFlagsBits,
  ActivityType, Collection, ChannelType,
  StringSelectMenuBuilder, ComponentType,
} = require('discord.js');
const fetch = require('node-fetch');
const db = require('./utils/db');
const { XP_MSG, addXP, xpForLevel, coins, E, ok, err, rnd, parseMs, msLabel, genCaptcha, hasBad, INVITE } = require('./utils/helpers');

// ── ENV ───────────────────────────────────────────────────────
const TOKEN       = process.env.TOKEN;
const GROQ_KEY    = process.env.GROQ_API_KEY;
const WEATHER_KEY = process.env.WEATHER_API_KEY;   // openweathermap (optional)
const VERIFY_ROLE = process.env.VERIFY_ROLE_ID;    // optional

if (!TOKEN) { console.error('❌ Thiếu TOKEN'); process.exit(1); }

// ── STATE ────────────────────────────────────────────────────
const musicQ      = new Collection(); // guildId -> { queue[], loop }
const antiSpam    = new Collection(); // userId  -> { count, t }
const captcha     = new Collection(); // userId  -> { code, chId }
const giveaways   = new Collection(); // msgId   -> { entrants[], winnersCount, prize }
const triviaSess  = new Collection(); // chId    -> { answer, collector }
const chatSess    = new Collection(); // chId    -> messages[]  (AI chat mode)

// ── CLIENT ───────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMessageReactions,
  ],
});

// ═════════════════════════════════════════════════════════════
//  SLASH COMMANDS
// ═════════════════════════════════════════════════════════════
const P = PermissionFlagsBits;
const str  = (n,d,r=false) => o => o.setName(n).setDescription(d).setRequired(r);
const user = (n,d,r=false) => o => o.setName(n).setDescription(d).setRequired(r);
const int  = (n,d,min,max,r=false) => o => { let x=o.setName(n).setDescription(d).setRequired(r); if(min!==null)x.setMinValue(min); if(max!==null)x.setMaxValue(max); return x; };

const cmd = (name,desc) => new SlashCommandBuilder().setName(name).setDescription(desc);
const modCmd = (name,desc,perm) => cmd(name,desc).setDefaultMemberPermissions(perm);

const commands = [
  // ── SYSTEM ──
  cmd('menu','📋 Xem toàn bộ lệnh bot'),
  cmd('ping','🏓 Kiểm tra độ trễ'),
  cmd('botinfo','ℹ️ Thông tin về bot'),

  // ── MOD ──
  modCmd('ban','🔨 Ban thành viên',P.BanMembers)
    .addUserOption(o=>o.setName('user').setDescription('Thành viên').setRequired(true))
    .addStringOption(o=>o.setName('reason').setDescription('Lý do')),
  modCmd('unban','🔓 Gỡ ban theo User ID',P.BanMembers)
    .addStringOption(o=>o.setName('userid').setDescription('User ID').setRequired(true)),
  modCmd('kick','👢 Kick thành viên',P.KickMembers)
    .addUserOption(o=>o.setName('user').setDescription('Thành viên').setRequired(true))
    .addStringOption(o=>o.setName('reason').setDescription('Lý do')),
  modCmd('mute','🔇 Timeout thành viên',P.ModerateMembers)
    .addUserOption(o=>o.setName('user').setDescription('Thành viên').setRequired(true))
    .addIntegerOption(o=>o.setName('minutes').setDescription('Số phút (mặc định 10)').setMinValue(1).setMaxValue(40320))
    .addStringOption(o=>o.setName('reason').setDescription('Lý do')),
  modCmd('unmute','🔊 Gỡ timeout',P.ModerateMembers)
    .addUserOption(o=>o.setName('user').setDescription('Thành viên').setRequired(true)),
  modCmd('warn','⚠️ Cảnh cáo (3 lần = tự kick)',P.ModerateMembers)
    .addUserOption(o=>o.setName('user').setDescription('Thành viên').setRequired(true))
    .addStringOption(o=>o.setName('reason').setDescription('Lý do').setRequired(true)),
  modCmd('warnings','📋 Xem danh sách cảnh cáo',P.ModerateMembers)
    .addUserOption(o=>o.setName('user').setDescription('Thành viên').setRequired(true)),
  modCmd('clearwarnings','🗑️ Xoá cảnh cáo',P.ModerateMembers)
    .addUserOption(o=>o.setName('user').setDescription('Thành viên').setRequired(true)),
  modCmd('clear','🧹 Xoá hàng loạt tin nhắn',P.ManageMessages)
    .addIntegerOption(o=>o.setName('amount').setDescription('Số lượng 1-100').setRequired(true).setMinValue(1).setMaxValue(100)),
  modCmd('slowmode','🐢 Chỉnh slowmode kênh',P.ManageChannels)
    .addIntegerOption(o=>o.setName('seconds').setDescription('Giây (0=tắt)').setRequired(true).setMinValue(0).setMaxValue(21600)),
  modCmd('lock','🔒 Khoá kênh',P.ManageChannels)
    .addChannelOption(o=>o.setName('channel').setDescription('Kênh (mặc định kênh hiện tại)')),
  modCmd('unlock','🔓 Mở khoá kênh',P.ManageChannels)
    .addChannelOption(o=>o.setName('channel').setDescription('Kênh')),
  modCmd('nickname','✏️ Đổi biệt danh',P.ManageNicknames)
    .addUserOption(o=>o.setName('user').setDescription('Thành viên').setRequired(true))
    .addStringOption(o=>o.setName('name').setDescription('Tên mới (bỏ trống = reset)')),
  modCmd('autorole','⚙️ Cài role tự cấp khi có thành viên mới',P.ManageGuild)
    .addRoleOption(o=>o.setName('role').setDescription('Role (bỏ trống = tắt)')),
  modCmd('setlog','📝 Cài kênh log hành động mod',P.ManageGuild)
    .addChannelOption(o=>o.setName('channel').setDescription('Kênh log')),
  modCmd('setwelcome','👋 Cài kênh chào mừng thành viên mới',P.ManageGuild)
    .addChannelOption(o=>o.setName('channel').setDescription('Kênh welcome (bỏ trống = tắt)')),
  modCmd('purge','🗑️ Xoá tin nhắn của 1 người trong kênh',P.ManageMessages)
    .addUserOption(o=>o.setName('user').setDescription('Thành viên').setRequired(true))
    .addIntegerOption(o=>o.setName('amount').setDescription('Số lượng (mặc định 20)').setMinValue(1).setMaxValue(100)),

  // ── UTILITY ──
  cmd('userinfo','👤 Thông tin thành viên')
    .addUserOption(o=>o.setName('user').setDescription('Thành viên (bỏ trống = bản thân)')),
  cmd('serverinfo','🏠 Thông tin server'),
  cmd('avatar','🖼️ Lấy ảnh đại diện')
    .addUserOption(o=>o.setName('user').setDescription('Thành viên')),
  cmd('weather','🌦️ Thời tiết')
    .addStringOption(o=>o.setName('city').setDescription('Tên thành phố (VD: Hanoi)').setRequired(true)),
  cmd('translate','🌐 Dịch văn bản')
    .addStringOption(o=>o.setName('text').setDescription('Văn bản').setRequired(true))
    .addStringOption(o=>o.setName('lang').setDescription('Ngôn ngữ đích (en/vi/ja/ko...) mặc định en')),
  cmd('remind','⏰ Đặt nhắc nhở')
    .addStringOption(o=>o.setName('time').setDescription('Thời gian (VD: 10m 2h 1d)').setRequired(true))
    .addStringOption(o=>o.setName('message').setDescription('Nội dung').setRequired(true)),
  cmd('poll','📊 Tạo bình chọn')
    .addStringOption(o=>o.setName('question').setDescription('Câu hỏi').setRequired(true))
    .addStringOption(o=>o.setName('options').setDescription('Lựa chọn cách nhau | (VD: A | B | C)').setRequired(true)),
  modCmd('giveaway','🎁 Tổ chức giveaway',P.ManageGuild)
    .addStringOption(o=>o.setName('prize').setDescription('Phần thưởng').setRequired(true))
    .addStringOption(o=>o.setName('duration').setDescription('Thời gian (VD: 10m 1h 1d)').setRequired(true))
    .addIntegerOption(o=>o.setName('winners').setDescription('Số người thắng (mặc định 1)').setMinValue(1).setMaxValue(10)),
  cmd('calc','🧮 Máy tính')
    .addStringOption(o=>o.setName('expression').setDescription('Biểu thức (VD: 2+3*4)').setRequired(true)),
  cmd('qr','📱 Tạo mã QR')
    .addStringOption(o=>o.setName('text').setDescription('Văn bản hoặc link').setRequired(true)),
  cmd('lyrics','🎤 Tìm lời bài hát')
    .addStringOption(o=>o.setName('song').setDescription('Tên bài hát').setRequired(true)),
  cmd('color','🎨 Xem màu theo mã hex')
    .addStringOption(o=>o.setName('hex').setDescription('Mã màu hex (VD: FF5733)').setRequired(true)),
  cmd('urban','📖 Tra từ điển tiếng lóng')
    .addStringOption(o=>o.setName('word').setDescription('Từ cần tra').setRequired(true)),

  // ── FUN ──
  cmd('roll','🎲 Tung xúc xắc')
    .addIntegerOption(o=>o.setName('sides').setDescription('Số mặt (mặc định 6)').setMinValue(2).setMaxValue(1000)),
  cmd('flip','🪙 Tung đồng xu'),
  cmd('8ball','🎱 Bói toán')
    .addStringOption(o=>o.setName('question').setDescription('Câu hỏi').setRequired(true)),
  cmd('joke','😂 Kể chuyện cười'),
  cmd('meme','😹 Ảnh chế ngẫu nhiên'),
  cmd('lovecalc','💕 Đo độ hợp nhau')
    .addUserOption(o=>o.setName('user1').setDescription('Người 1').setRequired(true))
    .addUserOption(o=>o.setName('user2').setDescription('Người 2').setRequired(true)),
  cmd('rps','✊ Kéo búa bao với bot')
    .addStringOption(o=>o.setName('choice').setDescription('Lựa chọn').setRequired(true)
      .addChoices({name:'✊ Búa',value:'rock'},{name:'✋ Bao',value:'paper'},{name:'✌️ Kéo',value:'scissors'})),
  cmd('slap','👋 Tát ai đó').addUserOption(o=>o.setName('user').setDescription('Mục tiêu').setRequired(true)),
  cmd('hug','🤗 Ôm ai đó').addUserOption(o=>o.setName('user').setDescription('Mục tiêu').setRequired(true)),
  cmd('kiss','😘 Hôn ai đó').addUserOption(o=>o.setName('user').setDescription('Mục tiêu').setRequired(true)),
  cmd('pat','👋 Xoa đầu ai đó').addUserOption(o=>o.setName('user').setDescription('Mục tiêu').setRequired(true)),
  cmd('trivia','🧠 Câu hỏi đố vui (thắng = +50 xu)'),
  cmd('roast','🔥 Chọc ghẹo ai đó (vui thôi)')
    .addUserOption(o=>o.setName('user').setDescription('Mục tiêu').setRequired(true)),
  cmd('compliment','🌸 Khen ai đó')
    .addUserOption(o=>o.setName('user').setDescription('Mục tiêu').setRequired(true)),
  cmd('ship','💞 Ship 2 người với nhau')
    .addUserOption(o=>o.setName('user1').setDescription('Người 1').setRequired(true))
    .addUserOption(o=>o.setName('user2').setDescription('Người 2').setRequired(true)),
  cmd('rate','⭐ Bot chấm điểm bất kỳ thứ gì')
    .addStringOption(o=>o.setName('thing').setDescription('Thứ cần chấm điểm').setRequired(true)),
  cmd('choose','🤔 Bot giúp chọn 1 trong nhiều thứ')
    .addStringOption(o=>o.setName('options').setDescription('Các lựa chọn cách nhau | (VD: cơm | bún | phở)').setRequired(true)),

  // ── MUSIC ──
  cmd('play','🎵 Thêm nhạc vào hàng đợi')
    .addStringOption(o=>o.setName('song').setDescription('Tên bài hoặc link YouTube').setRequired(true)),
  cmd('skip','⏭️ Bỏ qua bài hiện tại'),
  cmd('stop','⏹️ Dừng nhạc & xoá hàng đợi'),
  cmd('queue','📜 Xem hàng đợi nhạc'),
  cmd('nowplaying','🎶 Bài đang phát'),
  cmd('loop','🔁 Bật/tắt lặp')
    .addStringOption(o=>o.setName('mode').setDescription('Chế độ')
      .addChoices({name:'🚫 Tắt',value:'off'},{name:'🔂 Lặp bài',value:'song'},{name:'🔁 Lặp queue',value:'queue'})),
  cmd('shuffle','🔀 Xáo trộn hàng đợi'),
  cmd('remove','➖ Xoá bài khỏi hàng đợi')
    .addIntegerOption(o=>o.setName('position').setDescription('Vị trí bài (số thứ tự trong queue)').setRequired(true).setMinValue(1)),
  cmd('radio','📻 Phát radio 24/7')
    .addStringOption(o=>o.setName('station').setDescription('Kênh radio').setRequired(true)
      .addChoices(
        {name:'🎵 Làn Sóng Xanh',value:'lansongxanh'},
        {name:'🎶 VOV Giao Thông',value:'vovgt'},
        {name:'🎸 Lofi Hip Hop',value:'lofi'},
        {name:'🎷 Jazz Chill',value:'jazz'},
        {name:'🎧 Pop Hits',value:'pop'},
      )),

  // ── ECONOMY ──
  cmd('daily','💰 Nhận xu hàng ngày'),
  cmd('balance','💳 Xem số dư').addUserOption(o=>o.setName('user').setDescription('Thành viên')),
  cmd('work','💼 Đi làm kiếm xu (hồi 1 giờ)'),
  cmd('crime','🦹 Phạm tội may rủi (hồi 2 giờ)'),
  cmd('rank','🏅 Xem cấp độ & XP').addUserOption(o=>o.setName('user').setDescription('Thành viên')),
  cmd('leaderboard','🏆 Bảng xếp hạng')
    .addStringOption(o=>o.setName('type').setDescription('Loại')
      .addChoices({name:'💰 Nhiều xu nhất',value:'coins'},{name:'⭐ Cấp độ cao nhất',value:'level'})),
  cmd('transfer','💸 Chuyển xu')
    .addUserOption(o=>o.setName('user').setDescription('Người nhận').setRequired(true))
    .addIntegerOption(o=>o.setName('amount').setDescription('Số xu').setRequired(true).setMinValue(1)),
  cmd('gamble','🎲 Tài Xỉu')
    .addIntegerOption(o=>o.setName('amount').setDescription('Số xu cược').setRequired(true).setMinValue(10))
    .addStringOption(o=>o.setName('bet').setDescription('Tài hay Xỉu?').setRequired(true)
      .addChoices({name:'🔴 Tài (≥11)',value:'tai'},{name:'🔵 Xỉu (≤10)',value:'xiu'})),
  cmd('slots','🎰 Máy slot').addIntegerOption(o=>o.setName('amount').setDescription('Số xu cược').setRequired(true).setMinValue(10)),
  cmd('baucua','🦐 Bầu Cua Tôm Cá')
    .addIntegerOption(o=>o.setName('amount').setDescription('Số xu cược').setRequired(true).setMinValue(10))
    .addStringOption(o=>o.setName('bet').setDescription('Con vật').setRequired(true)
      .addChoices(
        {name:'🦐 Tôm',value:'tom'},{name:'🦀 Cua',value:'cua'},
        {name:'🐟 Cá',value:'ca'},{name:'🦌 Nai',value:'nai'},
        {name:'🐓 Gà',value:'ga'},{name:'🎡 Bầu',value:'bau'},
      )),
  cmd('shop','🛒 Xem cửa hàng'),
  modCmd('additem','➕ Thêm vật phẩm vào shop',P.ManageGuild)
    .addStringOption(o=>o.setName('name').setDescription('Tên vật phẩm').setRequired(true))
    .addIntegerOption(o=>o.setName('price').setDescription('Giá (xu)').setRequired(true).setMinValue(1))
    .addRoleOption(o=>o.setName('role').setDescription('Role được cấp khi mua (tuỳ chọn)')),
  cmd('buy','🛍️ Mua vật phẩm trong shop')
    .addStringOption(o=>o.setName('item').setDescription('Tên vật phẩm').setRequired(true)),
  cmd('inventory','🎒 Xem túi đồ của bạn'),

  // ── AI / SYSTEM ──
  cmd('ask','🤖 Hỏi Groq AI')
    .addStringOption(o=>o.setName('cauhoi').setDescription('Câu hỏi').setRequired(true)),
  cmd('chat','💬 Bật/tắt chế độ chat AI trong kênh này (admin)')
    .setDefaultMemberPermissions(P.ManageGuild),
  cmd('ticket','🎫 Tạo ticket hỗ trợ'),
  cmd('closeticket','❌ Đóng ticket').setDefaultMemberPermissions(P.ManageChannels),
  cmd('verify','✅ Xác minh CAPTCHA để nhận role'),
  cmd('addcmd','⚙️ Tạo lệnh !prefix tuỳ chỉnh')
    .addStringOption(o=>o.setName('name').setDescription('Tên lệnh').setRequired(true))
    .addStringOption(o=>o.setName('response').setDescription('Phản hồi').setRequired(true))
    .setDefaultMemberPermissions(P.ManageGuild),
  cmd('delcmd','🗑️ Xoá lệnh tuỳ chỉnh')
    .addStringOption(o=>o.setName('name').setDescription('Tên lệnh').setRequired(true))
    .setDefaultMemberPermissions(P.ManageGuild),
  cmd('listcmds','📜 Xem lệnh tuỳ chỉnh'),
];

// ═════════════════════════════════════════════════════════════
//  READY
// ═════════════════════════════════════════════════════════════
client.once('ready', async () => {
  console.log(`✅ Bot online: ${client.user.tag}`);
  client.user.setActivity('⚡ /menu để xem lệnh', { type: ActivityType.Watching });
  const rest = new REST({ version:'10' }).setToken(TOKEN);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands.map(c=>c.toJSON()) });
    console.log(`✅ Đã đăng ký ${commands.length} slash commands!`);
  } catch(e) { console.error('❌ Lỗi đăng ký commands:', e); }

  // Khôi phục reminders sau khi bot restart
  restoreReminders();
});

// ═════════════════════════════════════════════════════════════
//  GUILD MEMBER ADD — Welcome + Auto-role
// ═════════════════════════════════════════════════════════════
client.on('guildMemberAdd', async member => {
  const cfg = db.getCfg();
  const gid = member.guild.id;

  // Auto-role
  if (cfg[gid]?.autoRole) {
    const role = member.guild.roles.cache.get(cfg[gid].autoRole);
    if (role) await member.roles.add(role).catch(()=>{});
  }

  // Welcome
  if (cfg[gid]?.welcomeCh) {
    const ch = member.guild.channels.cache.get(cfg[gid].welcomeCh);
    if (!ch) return;
    const isNew = Date.now() - member.user.createdTimestamp < 7*24*60*60*1000;
    ch.send({ embeds: [
      E(0x57F287)
        .setTitle('👋 Chào mừng thành viên mới!')
        .setDescription(`<@${member.id}> đã tham gia **${member.guild.name}**!\n\nBạn là thành viên thứ **${member.guild.memberCount}** 🎉${isNew ? '\n\n⚠️ *Tài khoản mới tạo dưới 7 ngày!*' : ''}`)
        .setThumbnail(member.user.displayAvatarURL({size:256}))
        .setTimestamp()
    ]}).catch(()=>{});
  }
});

// ═════════════════════════════════════════════════════════════
//  MESSAGE CREATE — XP / Anti-spam / Anti-link / Auto-mod / Custom cmds / AI chat
// ═════════════════════════════════════════════════════════════
client.on('messageCreate', async msg => {
  if (msg.author.bot || !msg.guild) return;

  // Custom prefix cmds
  if (msg.content.startsWith('!')) {
    const name = msg.content.slice(1).split(' ')[0].toLowerCase();
    const resp = db.getCC1(msg.guild.id, name);
    if (resp) { msg.reply(resp).catch(()=>{}); return; }
  }

  // Auto-mod: từ cấm
  if (hasBad(msg.content)) {
    await msg.delete().catch(()=>{});
    const w = await msg.channel.send({ embeds:[err(`${msg.author} vi phạm nội quy! Tin nhắn đã bị xoá.`)] });
    setTimeout(()=>w.delete().catch(()=>{}), 5000);
    log(msg.guild, `🚫 Auto-mod xoá tin nhắn từ ${msg.author.tag}`, 0xED4245);
    return;
  }

  // Anti-link (invite)
  if (INVITE.test(msg.content) && !msg.member.permissions.has(P.ManageMessages)) {
    await msg.delete().catch(()=>{});
    const w = await msg.channel.send({ embeds:[err(`${msg.author} không được gửi link mời server!`)] });
    setTimeout(()=>w.delete().catch(()=>{}), 5000);
    return;
  }

  // Anti-spam
  if (!antiSpam.has(msg.author.id)) {
    antiSpam.set(msg.author.id, { count:1, t: setTimeout(()=>antiSpam.delete(msg.author.id), 5000) });
  } else {
    const s = antiSpam.get(msg.author.id);
    if (++s.count >= 7) {
      await msg.member.timeout(30_000, 'Anti-spam').catch(()=>{});
      msg.channel.send({ embeds:[err(`${msg.author} bị timeout 30 giây vì spam!`)] }).catch(()=>{});
      antiSpam.delete(msg.author.id);
      return;
    }
  }

  // AI Chat mode
  const cfg = db.getCfg();
  if (cfg[msg.guild.id]?.aiChatCh === msg.channel.id && GROQ_KEY) {
    if (!chatSess.has(msg.channel.id)) chatSess.set(msg.channel.id, []);
    const hist = chatSess.get(msg.channel.id);
    hist.push({ role:'user', content: `${msg.author.username}: ${msg.content}` });
    if (hist.length > 20) hist.splice(0, hist.length-20);
    try {
      msg.channel.sendTyping();
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':`Bearer ${GROQ_KEY}`},
        body: JSON.stringify({
          model:'llama-3.3-70b-versatile',
          messages:[
            {role:'system',content:'Bạn là bot Discord tên ThinhbeuBot. Trả lời ngắn gọn, vui vẻ bằng tiếng Việt. Đừng dùng Markdown nhiều.'},
            ...hist,
          ],
          max_tokens:512, temperature:0.8,
        }),
      });
      const data = await res.json();
      const reply = data?.choices?.[0]?.message?.content || '...';
      hist.push({ role:'assistant', content: reply });
      msg.reply(reply.slice(0,2000)).catch(()=>{});
    } catch(e) { console.error('AI Chat error:', e); }
    return;
  }

  // XP
  if (Math.random() > 0.6) {
    const u = db.getUser(msg.author.id);
    const leveled = addXP(u, XP_MSG);
    db.saveUser(msg.author.id, u);
    if (leveled) {
      msg.channel.send({ embeds:[
        E(0xFFD700).setTitle('🎉 Level Up!')
          .setDescription(`${msg.author} vừa lên **Cấp ${u.level}**! 🎊\nNhận thêm 🪙 ${u.level*50} xu thưởng!`)
          .setTimestamp()
      ]}).catch(()=>{});
      u.coins = (u.coins||0) + u.level*50;
      db.saveUser(msg.author.id, u);
    }
  }

  // Captcha check
  if (captcha.has(msg.author.id)) {
    const c = captcha.get(msg.author.id);
    if (msg.channel.id === c.chId && msg.content.trim().toUpperCase() === c.code) {
      captcha.delete(msg.author.id);
      if (VERIFY_ROLE && msg.guild) {
        const role = msg.guild.roles.cache.get(VERIFY_ROLE);
        if (role) await msg.member.roles.add(role).catch(()=>{});
      }
      msg.reply({ embeds:[ok('✅ Xác minh thành công! Chào mừng!')] }).catch(()=>{});
    }
  }
});

// ═════════════════════════════════════════════════════════════
//  INTERACTION HANDLER
// ═════════════════════════════════════════════════════════════
client.on('interactionCreate', async interaction => {

  // Buttons
  if (interaction.isButton()) {
    if (interaction.customId === 'ticket_close') {
      if (!interaction.channel.name.startsWith('ticket-')) return;
      await interaction.reply({ content:'🔒 Đang đóng ticket...', ephemeral:true });
      setTimeout(()=>interaction.channel.delete().catch(()=>{}), 2000);
      return;
    }
    if (interaction.customId === 'giveaway_join') {
      const ga = giveaways.get(interaction.message.id);
      if (!ga) return interaction.reply({ content:'❌ Giveaway không còn tồn tại!', ephemeral:true });
      if (ga.entrants.includes(interaction.user.id))
        return interaction.reply({ content:'✅ Bạn đã tham gia rồi!', ephemeral:true });
      ga.entrants.push(interaction.user.id);
      return interaction.reply({ content:`🎉 Đã tham gia! Tổng: **${ga.entrants.length}** người.`, ephemeral:true });
    }
    return;
  }

  // StringSelect (menu pages)
  if (interaction.isStringSelectMenu() && interaction.customId === 'menu_cat') {
    // handled by collector
    return;
  }

  if (!interaction.isChatInputCommand()) return;
  const { commandName: cmd } = interaction;

  try {

    // ══ SYSTEM ══════════════════════════════════════════════

    if (cmd === 'ping') {
      const lat = Date.now() - interaction.createdTimestamp;
      return interaction.reply({ embeds:[ok('🏓 Pong!').addFields(
        {name:'⏱️ Bot',value:`\`${lat}ms\``,inline:true},
        {name:'💓 API',value:`\`${client.ws.ping}ms\``,inline:true},
      )] });
    }

    if (cmd === 'botinfo') {
      const upSec = Math.floor(process.uptime());
      return interaction.reply({ embeds:[
        E(0x5865F2).setTitle('ℹ️ ThinhbeuBot v4.0')
          .setThumbnail(client.user.displayAvatarURL())
          .addFields(
            {name:'📛 Tên',value:client.user.tag,inline:true},
            {name:'🌐 Server',value:`${client.guilds.cache.size}`,inline:true},
            {name:'👥 Users',value:`${client.users.cache.size}`,inline:true},
            {name:'⚡ Lệnh',value:`${commands.length}`,inline:true},
            {name:'⏱️ Uptime',value:msLabel(upSec*1000),inline:true},
            {name:'💾 RAM',value:`${(process.memoryUsage().heapUsed/1024/1024).toFixed(1)} MB`,inline:true},
            {name:'📌 Thư viện',value:'discord.js v14',inline:true},
            {name:'🖥️ Node.js',value:process.version,inline:true},
          ).setTimestamp()
      ]});
    }

    if (cmd === 'menu') {
      const pages = {
        mod: E(0xED4245).setTitle('🛡️ Moderation — 18 lệnh')
          .setThumbnail(client.user.displayAvatarURL())
          .addFields(
            {name:'/ban [@user] [lý do]',value:'Cấm thành viên khỏi server',inline:true},
            {name:'/unban [user ID]',value:'Gỡ ban theo ID',inline:true},
            {name:'/kick [@user] [lý do]',value:'Đuổi thành viên',inline:true},
            {name:'/mute [@user] [phút] [lý do]',value:'Timeout thành viên',inline:true},
            {name:'/unmute [@user]',value:'Gỡ timeout',inline:true},
            {name:'/warn [@user] [lý do]',value:'Cảnh cáo — 3 lần tự kick',inline:true},
            {name:'/warnings [@user]',value:'Xem danh sách cảnh cáo',inline:true},
            {name:'/clearwarnings [@user]',value:'Xoá tất cả cảnh cáo',inline:true},
            {name:'/clear [số lượng]',value:'Xoá hàng loạt tin nhắn',inline:true},
            {name:'/purge [@user] [số]',value:'Xoá tin nhắn của 1 người',inline:true},
            {name:'/slowmode [giây]',value:'Chỉnh slowmode kênh',inline:true},
            {name:'/lock [kênh]',value:'Khoá kênh không cho chat',inline:true},
            {name:'/unlock [kênh]',value:'Mở khoá kênh',inline:true},
            {name:'/nickname [@user] [tên]',value:'Đổi biệt danh',inline:true},
            {name:'/autorole [role]',value:'Cài role tự động cho thành viên mới',inline:true},
            {name:'/setlog [kênh]',value:'Cài kênh log hành động mod',inline:true},
            {name:'/setwelcome [kênh]',value:'Cài kênh chào mừng',inline:true},
            {name:'⚙️ Auto (tự động)',value:'Chặn từ cấm • Chặn invite link • Anti-spam',inline:false},
          ).setFooter({text:'Trang 1/6 — Moderation'}).setTimestamp(),

        util: E(0x5865F2).setTitle('🔧 Utility — 12 lệnh')
          .setThumbnail(client.user.displayAvatarURL())
          .addFields(
            {name:'/userinfo [@user]',value:'Thông tin chi tiết thành viên',inline:true},
            {name:'/serverinfo',value:'Thông tin server',inline:true},
            {name:'/avatar [@user]',value:'Ảnh đại diện độ phân giải cao',inline:true},
            {name:'/weather [thành phố]',value:'Thời tiết theo địa điểm',inline:true},
            {name:'/translate [text] [ngôn ngữ]',value:'Dịch văn bản',inline:true},
            {name:'/remind [thời gian] [nội dung]',value:'Hẹn giờ nhắc nhở qua DM',inline:true},
            {name:'/poll [câu hỏi] [lựa chọn]',value:'Tạo bình chọn emoji',inline:true},
            {name:'/giveaway [thưởng] [thời gian]',value:'Tổ chức giveaway bốc thăm',inline:true},
            {name:'/calc [biểu thức]',value:'Máy tính ngay trong chat',inline:true},
            {name:'/qr [text/link]',value:'Tạo mã QR',inline:true},
            {name:'/lyrics [tên bài]',value:'Tìm lời bài hát',inline:true},
            {name:'/color [hex]',value:'Xem màu theo mã hex',inline:true},
            {name:'/urban [từ]',value:'Tra từ điển tiếng lóng',inline:true},
          ).setFooter({text:'Trang 2/6 — Utility'}).setTimestamp(),

        fun: E(0xFEE75C).setTitle('🎮 Fun & Games — 17 lệnh')
          .setThumbnail(client.user.displayAvatarURL())
          .addFields(
            {name:'/roll [số mặt]',value:'Tung xúc xắc',inline:true},
            {name:'/flip',value:'Tung đồng xu sấp/ngửa',inline:true},
            {name:'/8ball [câu hỏi]',value:'Bói toán',inline:true},
            {name:'/joke',value:'Kể chuyện cười',inline:true},
            {name:'/meme',value:'Ảnh chế từ Reddit',inline:true},
            {name:'/lovecalc [@u1] [@u2]',value:'Đo độ hợp nhau',inline:true},
            {name:'/rps [búa/bao/kéo]',value:'Kéo búa bao với bot',inline:true},
            {name:'/slap/hug/kiss/pat [@user]',value:'Hành động tương tác (kèm GIF)',inline:true},
            {name:'/trivia',value:'Đố vui — thắng nhận 50 xu',inline:true},
            {name:'/roast [@user]',value:'Chọc ghẹo vui vẻ',inline:true},
            {name:'/compliment [@user]',value:'Khen ngợi ai đó',inline:true},
            {name:'/ship [@u1] [@u2]',value:'Ship 2 người',inline:true},
            {name:'/rate [thứ gì đó]',value:'Bot chấm điểm',inline:true},
            {name:'/choose [A | B | C]',value:'Bot giúp chọn 1 trong nhiều thứ',inline:true},
          ).setFooter({text:'Trang 3/6 — Fun & Games'}).setTimestamp(),

        music: E(0xFF0000).setTitle('🎵 Music — 9 lệnh')
          .setThumbnail(client.user.displayAvatarURL())
          .addFields(
            {name:'/play [tên/link]',value:'Tìm & thêm bài vào hàng đợi',inline:true},
            {name:'/skip',value:'Bỏ qua bài hiện tại',inline:true},
            {name:'/stop',value:'Dừng & xoá toàn bộ hàng đợi',inline:true},
            {name:'/queue',value:'Xem hàng đợi nhạc',inline:true},
            {name:'/nowplaying',value:'Bài đang phát',inline:true},
            {name:'/loop [off/song/queue]',value:'Bật/tắt chế độ lặp',inline:true},
            {name:'/shuffle',value:'Xáo trộn hàng đợi',inline:true},
            {name:'/remove [vị trí]',value:'Xoá bài khỏi hàng đợi',inline:true},
            {name:'/radio [kênh]',value:'Phát radio 24/7 (Làn Sóng Xanh, Lofi, Jazz...)',inline:true},
          ).setFooter({text:'Trang 4/6 — Music'}).setTimestamp(),

        eco: E(0xFFD700).setTitle('💰 Economy & Leveling — 13 lệnh')
          .setThumbnail(client.user.displayAvatarURL())
          .addFields(
            {name:'/daily',value:'Nhận 100–500 xu mỗi ngày',inline:true},
            {name:'/work',value:'Đi làm kiếm xu (hồi 1 giờ)',inline:true},
            {name:'/crime',value:'Phạm tội may rủi — thắng nhiều hơn nhưng có thể mất xu (hồi 2 giờ)',inline:true},
            {name:'/balance [@user]',value:'Xem số dư & cấp độ',inline:true},
            {name:'/rank [@user]',value:'Xem cấp độ & thanh XP',inline:true},
            {name:'/leaderboard [xu/cấp]',value:'Bảng xếp hạng top 10',inline:true},
            {name:'/transfer [@user] [xu]',value:'Chuyển xu',inline:true},
            {name:'/gamble [xu] [tài/xỉu]',value:'Cá cược tài xỉu',inline:true},
            {name:'/slots [xu]',value:'Máy slot — jackpot x10',inline:true},
            {name:'/baucua [xu] [con vật]',value:'Bầu Cua Tôm Cá',inline:true},
            {name:'/shop',value:'Xem cửa hàng vật phẩm',inline:true},
            {name:'/buy [vật phẩm]',value:'Mua vật phẩm (có thể nhận role)',inline:true},
            {name:'/inventory',value:'Xem túi đồ của bạn',inline:true},
            {name:'⭐ XP tự động',value:'Chat = nhận XP → đủ XP → Level Up → nhận xu thưởng!',inline:false},
          ).setFooter({text:'Trang 5/6 — Economy'}).setTimestamp(),

        sys: E(0xF55036).setTitle('🤖 AI & Hệ thống — 11 lệnh')
          .setThumbnail(client.user.displayAvatarURL())
          .addFields(
            {name:'/ask [câu hỏi]',value:'Hỏi Groq AI Llama 3.3 70B',inline:true},
            {name:'/chat',value:'Bật/tắt chế độ AI chatbot trong kênh (admin)',inline:true},
            {name:'/ticket',value:'Tạo kênh hỗ trợ riêng tư với admin',inline:true},
            {name:'/closeticket',value:'Đóng và xoá ticket',inline:true},
            {name:'/verify',value:'Xác minh CAPTCHA để nhận role',inline:true},
            {name:'/addcmd [tên] [phản hồi]',value:'Tạo lệnh !tên tuỳ chỉnh (admin)',inline:true},
            {name:'/delcmd [tên]',value:'Xoá lệnh tuỳ chỉnh (admin)',inline:true},
            {name:'/listcmds',value:'Xem tất cả lệnh tuỳ chỉnh',inline:true},
            {name:'/botinfo',value:'Thông tin & thống kê bot',inline:true},
            {name:'/ping',value:'Kiểm tra độ trễ',inline:true},
            {name:'/menu',value:'Xem toàn bộ lệnh này!',inline:true},
          ).setFooter({text:'Trang 6/6 — AI & System'}).setTimestamp(),
      };

      const overview = E(0x5865F2)
        .setTitle('📋 ThinhbeuBot v4.0 — Toàn bộ lệnh')
        .setThumbnail(client.user.displayAvatarURL())
        .setDescription('Chọn danh mục trong dropdown bên dưới để xem chi tiết ⬇️')
        .addFields(
          {name:'🛡️ Moderation',value:'18 lệnh',inline:true},
          {name:'🔧 Utility',value:'13 lệnh',inline:true},
          {name:'🎮 Fun & Games',value:'17 lệnh',inline:true},
          {name:'🎵 Music',value:'9 lệnh',inline:true},
          {name:'💰 Economy',value:'13 lệnh',inline:true},
          {name:'🤖 AI & System',value:'11 lệnh',inline:true},
        )
        .setFooter({text:`ThinhbeuBot v4.0 • Tổng ${commands.length} lệnh`}).setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId('menu_cat').setPlaceholder('📂 Chọn danh mục...')
          .addOptions([
            {label:'Moderation',description:'18 lệnh quản trị',value:'mod',emoji:'🛡️'},
            {label:'Utility',description:'13 lệnh tiện ích',value:'util',emoji:'🔧'},
            {label:'Fun & Games',description:'17 lệnh giải trí',value:'fun',emoji:'🎮'},
            {label:'Music',description:'9 lệnh âm nhạc',value:'music',emoji:'🎵'},
            {label:'Economy & Leveling',description:'13 lệnh kinh tế',value:'eco',emoji:'💰'},
            {label:'AI & Hệ thống',description:'11 lệnh AI/system',value:'sys',emoji:'🤖'},
          ])
      );

      const reply = await interaction.reply({ embeds:[overview], components:[row], fetchReply:true });
      const col = reply.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time:120_000 });
      col.on('collect', async i => {
        if (i.user.id !== interaction.user.id) return i.reply({content:'❌ Chỉ bạn mới được dùng menu này!',ephemeral:true});
        await i.update({ embeds:[pages[i.values[0]]], components:[row] });
      });
      col.on('end', ()=>interaction.editReply({components:[]}).catch(()=>{}));
      return;
    }

    // ══ MOD ════════════════════════════════════════════════

    if (cmd === 'ban') {
      const target=interaction.options.getMember('user'), reason=interaction.options.getString('reason')||'Không có lý do';
      if (!target) return interaction.reply({embeds:[err('Không tìm thấy thành viên!')],ephemeral:true});
      if (!target.bannable) return interaction.reply({embeds:[err('Không thể ban thành viên này!')],ephemeral:true});
      await target.ban({reason});
      log(interaction.guild,`🔨 Ban **${target.user.tag}** bởi ${interaction.user.tag} — ${reason}`, 0xED4245);
      return interaction.reply({embeds:[modE('🔨 Đã Ban',target.user,interaction.user,reason,0xED4245)]});
    }

    if (cmd === 'unban') {
      const uid=interaction.options.getString('userid');
      await interaction.guild.bans.remove(uid).catch(()=>{});
      return interaction.reply({embeds:[ok(`🔓 Đã gỡ ban \`${uid}\``)]});
    }

    if (cmd === 'kick') {
      const target=interaction.options.getMember('user'), reason=interaction.options.getString('reason')||'Không có lý do';
      if (!target) return interaction.reply({embeds:[err('Không tìm thấy thành viên!')],ephemeral:true});
      if (!target.kickable) return interaction.reply({embeds:[err('Không thể kick thành viên này!')],ephemeral:true});
      await target.kick(reason);
      log(interaction.guild,`👢 Kick **${target.user.tag}** bởi ${interaction.user.tag}`, 0xFEA82F);
      return interaction.reply({embeds:[modE('👢 Đã Kick',target.user,interaction.user,reason,0xED4245)]});
    }

    if (cmd === 'mute') {
      const target=interaction.options.getMember('user');
      const mins=interaction.options.getInteger('minutes')||10;
      const reason=interaction.options.getString('reason')||'Không có lý do';
      if (!target?.moderatable) return interaction.reply({embeds:[err('Không thể mute thành viên này!')],ephemeral:true});
      await target.timeout(mins*60000, reason);
      log(interaction.guild,`🔇 Mute ${mins}p **${target.user.tag}** bởi ${interaction.user.tag}`, 0xFEE75C);
      return interaction.reply({embeds:[modE('🔇 Đã Mute',target.user,interaction.user,reason,0xFEE75C)
        .addFields({name:'⏱️ Thời gian',value:`${mins} phút`,inline:true})]});
    }

    if (cmd === 'unmute') {
      const target=interaction.options.getMember('user');
      if (!target) return interaction.reply({embeds:[err('Không tìm thấy thành viên!')],ephemeral:true});
      await target.timeout(null);
      return interaction.reply({embeds:[modE('🔊 Đã Unmute',target.user,interaction.user,null,0x57F287)]});
    }

    if (cmd === 'warn') {
      const target=interaction.options.getMember('user');
      const reason=interaction.options.getString('reason');
      if (!target) return interaction.reply({embeds:[err('Không tìm thấy thành viên!')],ephemeral:true});
      const count=db.addWarn(interaction.guild.id,target.user.id,reason,interaction.user.tag);
      let extra='';
      if (count>=3) {
        await target.kick('3 cảnh cáo — tự động kick').catch(()=>{});
        extra='\n\n⚡ **Đã tự động kick vì đạt 3 cảnh cáo!**';
        log(interaction.guild,`⚡ Auto-kick ${target.user.tag} (3 warns)`, 0xED4245);
      }
      log(interaction.guild,`⚠️ Warn (${count}/3) **${target.user.tag}**`, 0xFEA82F);
      return interaction.reply({embeds:[modE(`⚠️ Cảnh cáo (${count}/3)`,target.user,interaction.user,reason+extra,0xFEA82F)]});
    }

    if (cmd === 'warnings') {
      const target=interaction.options.getUser('user');
      const list=db.getWarnList(interaction.guild.id,target.id);
      if (!list.length) return interaction.reply({embeds:[ok(`✅ ${target.tag} chưa có cảnh cáo nào`)]});
      return interaction.reply({embeds:[E(0xFEA82F).setTitle(`⚠️ Cảnh cáo của ${target.tag}`)
        .setDescription(list.map((w,i)=>`**${i+1}.** ${w.reason} — *${w.mod}* <t:${Math.floor(w.date/1000)}:R>`).join('\n'))
        .setTimestamp()]});
    }

    if (cmd === 'clearwarnings') {
      const target=interaction.options.getUser('user');
      db.clearWarns(interaction.guild.id,target.id);
      return interaction.reply({embeds:[ok(`✅ Đã xoá cảnh cáo của ${target.tag}`)]});
    }

    if (cmd === 'clear') {
      await interaction.deferReply({ephemeral:true});
      const del=await interaction.channel.bulkDelete(interaction.options.getInteger('amount'),true).catch(()=>null);
      return interaction.editReply({embeds:[ok(`🗑️ Đã xoá ${del?.size||0} tin nhắn`)]});
    }

    if (cmd === 'purge') {
      const target=interaction.options.getUser('user');
      const amount=interaction.options.getInteger('amount')||20;
      await interaction.deferReply({ephemeral:true});
      const msgs=await interaction.channel.messages.fetch({limit:100});
      const toDelete=msgs.filter(m=>m.author.id===target.id).first(amount);
      await interaction.channel.bulkDelete(toDelete,true).catch(()=>{});
      return interaction.editReply({embeds:[ok(`🗑️ Đã xoá tin nhắn của ${target.tag}`)]});
    }

    if (cmd === 'slowmode') {
      const sec=interaction.options.getInteger('seconds');
      await interaction.channel.setRateLimitPerUser(sec);
      return interaction.reply({embeds:[ok(sec===0?'🐇 Đã tắt slowmode':`🐢 Slowmode: ${sec} giây`)]});
    }

    if (cmd === 'lock') {
      const ch=interaction.options.getChannel('channel')||interaction.channel;
      await ch.permissionOverwrites.edit(interaction.guild.roles.everyone,{SendMessages:false});
      return interaction.reply({embeds:[ok(`🔒 Đã khoá ${ch}`)]});
    }

    if (cmd === 'unlock') {
      const ch=interaction.options.getChannel('channel')||interaction.channel;
      await ch.permissionOverwrites.edit(interaction.guild.roles.everyone,{SendMessages:null});
      return interaction.reply({embeds:[ok(`🔓 Đã mở khoá ${ch}`)]});
    }

    if (cmd === 'nickname') {
      const target=interaction.options.getMember('user');
      const name=interaction.options.getString('name')||null;
      if (!target) return interaction.reply({embeds:[err('Không tìm thấy thành viên!')],ephemeral:true});
      await target.setNickname(name);
      return interaction.reply({embeds:[ok(`✏️ ${name?`Đổi biệt danh thành \`${name}\``:'Reset biệt danh'} cho ${target.user.tag}`)]});
    }

    if (cmd === 'autorole') {
      const role=interaction.options.getRole('role');
      const cfg=db.getCfg(); if(!cfg[interaction.guild.id])cfg[interaction.guild.id]={};
      cfg[interaction.guild.id].autoRole = role?.id||null;
      db.saveCfg(cfg);
      return interaction.reply({embeds:[ok(role?`✅ Auto-role đã cài: ${role}`:'✅ Đã tắt auto-role')]});
    }

    if (cmd === 'setlog') {
      const ch=interaction.options.getChannel('channel');
      const cfg=db.getCfg(); if(!cfg[interaction.guild.id])cfg[interaction.guild.id]={};
      cfg[interaction.guild.id].logCh = ch?.id||null;
      db.saveCfg(cfg);
      return interaction.reply({embeds:[ok(ch?`✅ Kênh log đã cài: ${ch}`:'✅ Đã tắt log')]});
    }

    if (cmd === 'setwelcome') {
      const ch=interaction.options.getChannel('channel');
      const cfg=db.getCfg(); if(!cfg[interaction.guild.id])cfg[interaction.guild.id]={};
      cfg[interaction.guild.id].welcomeCh = ch?.id||null;
      db.saveCfg(cfg);
      return interaction.reply({embeds:[ok(ch?`✅ Kênh welcome đã cài: ${ch}`:'✅ Đã tắt welcome')]});
    }

    // ══ UTILITY ════════════════════════════════════════════

    if (cmd === 'userinfo') {
      const target=interaction.options.getUser('user')||interaction.user;
      const member=await interaction.guild?.members.fetch(target.id).catch(()=>null);
      const age=Date.now()-target.createdTimestamp;
      const newWarn=age<7*864e5?'\n⚠️ **Tài khoản mới dưới 7 ngày!**':'';
      const embed=E(member?.displayColor||0x5865F2)
        .setTitle(`👤 ${target.tag}`).setThumbnail(target.displayAvatarURL({size:256}))
        .addFields(
          {name:'🆔 ID',value:target.id,inline:true},
          {name:'📅 Tạo tài khoản',value:`<t:${Math.floor(target.createdTimestamp/1000)}:D>${newWarn}`,inline:true},
          {name:'🤖 Bot?',value:target.bot?'Có':'Không',inline:true},
        ).setTimestamp();
      if (member) embed.addFields(
        {name:'📥 Tham gia server',value:`<t:${Math.floor(member.joinedTimestamp/1000)}:D>`,inline:true},
        {name:'🎭 Nickname',value:member.nickname||'Không có',inline:true},
        {name:`🏷️ Roles (${member.roles.cache.size-1})`,value:member.roles.cache.filter(r=>r.id!==interaction.guild.id).map(r=>r.toString()).join(' ')||'Không có'},
      );
      return interaction.reply({embeds:[embed]});
    }

    if (cmd === 'serverinfo') {
      const g=interaction.guild;
      await g.members.fetch();
      const bots=g.members.cache.filter(m=>m.user.bot).size;
      return interaction.reply({embeds:[E(0xEB459E).setTitle(`🏠 ${g.name}`).setThumbnail(g.iconURL({size:256}))
        .addFields(
          {name:'🆔 ID',value:g.id,inline:true},
          {name:'👑 Chủ',value:`<@${g.ownerId}>`,inline:true},
          {name:'📅 Tạo',value:`<t:${Math.floor(g.createdTimestamp/1000)}:D>`,inline:true},
          {name:'👥 Thành viên',value:`${g.memberCount-bots} người · ${bots} bot`,inline:true},
          {name:'📢 Kênh',value:`${g.channels.cache.size}`,inline:true},
          {name:'🎭 Roles',value:`${g.roles.cache.size}`,inline:true},
          {name:'😀 Emoji',value:`${g.emojis.cache.size}`,inline:true},
          {name:'💎 Boost',value:`Lv${g.premiumTier} · ${g.premiumSubscriptionCount} boost`,inline:true},
          {name:'🔒 Xác minh',value:`Lv${g.verificationLevel}`,inline:true},
        ).setTimestamp()]});
    }

    if (cmd === 'avatar') {
      const target=interaction.options.getUser('user')||interaction.user;
      const url=target.displayAvatarURL({size:1024});
      return interaction.reply({embeds:[E(0x5865F2).setTitle(`🖼️ Avatar của ${target.tag}`)
        .setImage(url).addFields({name:'🔗 Link',value:`[Mở ảnh](${url})`}).setTimestamp()]});
    }

    if (cmd === 'weather') {
      await interaction.deferReply();
      const city=interaction.options.getString('city');
      try {
        let embed;
        if (WEATHER_KEY) {
          const r=await(await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${WEATHER_KEY}&units=metric&lang=vi`)).json();
          if(r.cod!==200) return interaction.editReply({embeds:[err(`Không tìm thấy: **${city}**`)]});
          const ico={Clear:'☀️',Clouds:'☁️',Rain:'🌧️',Drizzle:'🌦️',Thunderstorm:'⛈️',Snow:'❄️',Mist:'🌫️',Fog:'🌫️'};
          embed=E(0xFEA82F).setTitle(`${ico[r.weather[0].main]||'🌡️'} ${r.name}, ${r.sys.country}`)
            .setThumbnail(`https://openweathermap.org/img/wn/${r.weather[0].icon}@2x.png`)
            .addFields(
              {name:'🌡️ Nhiệt độ',value:`${r.main.temp}°C (cảm giác ${r.main.feels_like}°C)`,inline:true},
              {name:'💧 Độ ẩm',value:`${r.main.humidity}%`,inline:true},
              {name:'💨 Gió',value:`${r.wind.speed} m/s`,inline:true},
              {name:'☁️ Trời',value:r.weather[0].description,inline:true},
              {name:'👁️ Tầm nhìn',value:`${(r.visibility/1000).toFixed(1)} km`,inline:true},
            ).setFooter({text:'OpenWeatherMap'}).setTimestamp();
        } else {
          const r=await(await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=j1`)).json();
          const c=r.current_condition[0];
          embed=E(0xFEA82F).setTitle(`🌦️ Thời tiết ${city}`)
            .addFields(
              {name:'🌡️ Nhiệt độ',value:`${c.temp_C}°C (cảm giác ${c.FeelsLikeC}°C)`,inline:true},
              {name:'💧 Độ ẩm',value:`${c.humidity}%`,inline:true},
              {name:'💨 Gió',value:`${c.windspeedKmph} km/h`,inline:true},
              {name:'☁️ Trời',value:c.weatherDesc[0].value,inline:true},
            ).setFooter({text:'wttr.in'}).setTimestamp();
        }
        return interaction.editReply({embeds:[embed]});
      } catch { return interaction.editReply({embeds:[err('Không lấy được thời tiết! Kiểm tra tên thành phố.')]}); }
    }

    if (cmd === 'translate') {
      await interaction.deferReply();
      const text=interaction.options.getString('text'), lang=interaction.options.getString('lang')||'en';
      try {
        const r=await(await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${lang}&dt=t&q=${encodeURIComponent(text)}`)).json();
        const out=r[0].map(d=>d[0]).join('');
        return interaction.editReply({embeds:[E(0x4285F4).setTitle('🌐 Dịch thuật')
          .addFields({name:`📥 Gốc (${r[2]})`,value:text.slice(0,500)},{name:`📤 Kết quả (${lang})`,value:out.slice(0,500)})
          .setFooter({text:'Google Translate'}).setTimestamp()]});
      } catch { return interaction.editReply({embeds:[err('Không dịch được! Thử lại.')]}); }
    }

    if (cmd === 'remind') {
      const timeStr=interaction.options.getString('time'), message=interaction.options.getString('message');
      const ms=parseMs(timeStr);
      if (!ms) return interaction.reply({embeds:[err('Định dạng sai! VD: 10m 2h 1d')],ephemeral:true});
      const when=Date.now()+ms;
      await interaction.reply({embeds:[ok('⏰ Đã đặt nhắc nhở!').addFields(
        {name:'📝 Nội dung',value:message},
        {name:'⏰ Lúc',value:`<t:${Math.floor(when/1000)}:R>`},
      )]});
      // Persist
      const reminders=db.getReminders();
      if(!reminders.list) reminders.list=[];
      reminders.list.push({uid:interaction.user.id, chId:interaction.channel.id, message, when});
      db.saveReminders(reminders);
      setTimeout(async ()=>{
        sendReminder(interaction.user.id, interaction.channel.id, message);
        const r=db.getReminders();
        r.list=r.list.filter(x=>!(x.uid===interaction.user.id&&x.message===message&&x.when===when));
        db.saveReminders(r);
      }, ms);
    }

    if (cmd === 'poll') {
      const question=interaction.options.getString('question');
      const opts=interaction.options.getString('options').split('|').map(o=>o.trim()).filter(Boolean).slice(0,10);
      const emojis=['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];
      const embed=E(0x5865F2).setTitle(`📊 ${question}`)
        .setDescription(opts.map((o,i)=>`${emojis[i]} ${o}`).join('\n'))
        .setFooter({text:`Bình chọn bởi ${interaction.user.tag}`}).setTimestamp();
      const msg=await interaction.reply({embeds:[embed],fetchReply:true});
      for(let i=0;i<opts.length;i++) await msg.react(emojis[i]).catch(()=>{});
    }

    if (cmd === 'giveaway') {
      const prize=interaction.options.getString('prize');
      const dur=interaction.options.getString('duration');
      const winnersCount=interaction.options.getInteger('winners')||1;
      const ms=parseMs(dur);
      if(!ms) return interaction.reply({embeds:[err('Thời gian sai! VD: 10m 1h 1d')],ephemeral:true});
      const end=Date.now()+ms;
      const row=new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('giveaway_join').setLabel('🎉 Tham gia').setStyle(ButtonStyle.Success)
      );
      const embed=E(0xFF73FA).setTitle('🎁 GIVEAWAY!')
        .setDescription(`**Phần thưởng:** ${prize}\n**Kết thúc:** <t:${Math.floor(end/1000)}:R>\n**Số người thắng:** ${winnersCount}\n**Tổ chức:** ${interaction.user}`)
        .setTimestamp(end);
      const msg=await interaction.reply({embeds:[embed],components:[row],fetchReply:true});
      giveaways.set(msg.id,{entrants:[],winnersCount,prize,chId:interaction.channel.id});
      setTimeout(async()=>{
        const ga=giveaways.get(msg.id); if(!ga) return;
        giveaways.delete(msg.id);
        if(!ga.entrants.length) return interaction.channel.send({embeds:[err('Giveaway kết thúc — không ai tham gia!')]});
        const pool=[...ga.entrants];
        const winners=[];
        for(let i=0;i<Math.min(ga.winnersCount,pool.length);i++){
          const idx=Math.floor(Math.random()*pool.length);
          winners.push(pool.splice(idx,1)[0]);
        }
        interaction.channel.send({content:winners.map(id=>`<@${id}>`).join(' '),
          embeds:[E(0xFF73FA).setTitle('🎉 Giveaway kết thúc!')
            .setDescription(`**Thưởng:** ${ga.prize}\n**Người thắng:** ${winners.map(id=>`<@${id}>`).join(', ')}`)
            .setTimestamp()]});
      }, ms);
    }

    if (cmd === 'calc') {
      const expr=interaction.options.getString('expression');
      try {
        if(!/^[0-9+\-*/().\s%^]+$/.test(expr)) throw new Error('invalid');
        const result=Function(`"use strict";return(${expr.replace(/\^/g,'**')})`)();
        return interaction.reply({embeds:[ok('🧮 Kết quả').addFields(
          {name:'📝 Biểu thức',value:`\`${expr}\``,inline:true},
          {name:'✅ Kết quả',value:`\`${result}\``,inline:true},
        )]});
      } catch { return interaction.reply({embeds:[err('Biểu thức không hợp lệ!')]}); }
    }

    if (cmd === 'qr') {
      const text=interaction.options.getString('text');
      const url=`https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(text)}&size=300x300`;
      return interaction.reply({embeds:[E(0x000000).setTitle('📱 Mã QR')
        .setImage(url).addFields({name:'📝 Nội dung',value:text.slice(0,200)})
        .setFooter({text:'QR Server API'}).setTimestamp()]});
    }

    if (cmd === 'lyrics') {
      await interaction.deferReply();
      const song=interaction.options.getString('song');
      try {
        const r=await(await fetch(`https://some-random-api.com/lyrics?title=${encodeURIComponent(song)}`)).json();
        if(!r.lyrics) return interaction.editReply({embeds:[err(`Không tìm thấy lời bài: **${song}**`)]});
        const lyr=r.lyrics.length>3000?r.lyrics.slice(0,3000)+'...\n*(Bài quá dài, đã cắt bớt)*':r.lyrics;
        return interaction.editReply({embeds:[E(0x1DB954).setTitle(`🎤 ${r.title} — ${r.author}`)
          .setThumbnail(r.thumbnail?.genius)
          .setDescription(lyr).setFooter({text:'some-random-api.com'}).setTimestamp()]});
      } catch { return interaction.editReply({embeds:[err('Không lấy được lời bài hát! Thử lại.')]}); }
    }

    if (cmd === 'color') {
      const hex=interaction.options.getString('hex').replace('#','');
      if(!/^[0-9a-fA-F]{6}$/.test(hex)) return interaction.reply({embeds:[err('Mã hex không hợp lệ! VD: FF5733')]});
      const int=parseInt(hex,16);
      const r=(int>>16)&255, g=(int>>8)&255, b=int&255;
      return interaction.reply({embeds:[E(int).setTitle(`🎨 #${hex.toUpperCase()}`)
        .setThumbnail(`https://singlecolorimage.com/get/${hex}/100x100`)
        .addFields(
          {name:'HEX',value:`#${hex.toUpperCase()}`,inline:true},
          {name:'RGB',value:`rgb(${r}, ${g}, ${b})`,inline:true},
          {name:'Decimal',value:`${int}`,inline:true},
        ).setTimestamp()]});
    }

    if (cmd === 'urban') {
      await interaction.deferReply();
      const word=interaction.options.getString('word');
      try {
        const r=await(await fetch(`https://api.urbandictionary.com/v0/define?term=${encodeURIComponent(word)}`)).json();
        if(!r.list?.length) return interaction.editReply({embeds:[err(`Không tìm thấy định nghĩa: **${word}**`)]});
        const d=r.list[0];
        const def=d.definition.replace(/\[|\]/g,'').slice(0,800);
        const ex=d.example?.replace(/\[|\]/g,'').slice(0,400)||'Không có ví dụ';
        return interaction.editReply({embeds:[E(0xEFFF00).setTitle(`📖 ${word}`)
          .addFields({name:'Định nghĩa',value:def},{name:'Ví dụ',value:ex})
          .addFields({name:'👍',value:`${d.thumbs_up}`,inline:true},{name:'👎',value:`${d.thumbs_down}`,inline:true})
          .setURL(d.permalink).setFooter({text:'Urban Dictionary'}).setTimestamp()]});
      } catch { return interaction.editReply({embeds:[err('Không lấy được định nghĩa! Thử lại.')]}); }
    }

    // ══ FUN ══════════════════════════════════════════════

    if (cmd === 'roll') {
      const sides=interaction.options.getInteger('sides')||6;
      const res=rnd(1,sides);
      return interaction.reply({embeds:[ok(`🎲 ${res}`,0xFEA82F).setDescription(`Tung **d${sides}** — Kết quả: **${res}**/${sides}`)]});
    }

    if (cmd === 'flip') {
      return interaction.reply({embeds:[ok(`🪙 ${Math.random()>0.5?'👑 Ngửa':'🍺 Sấp'}`,0xFEE75C)]});
    }

    if (cmd === '8ball') {
      const ans=['✅ Chắc chắn rồi!','✅ Có vẻ vậy.','✅ Không còn nghi ngờ gì!','✅ Đúng thế!',
        '🤔 Hỏi lại sau nhé.','🤔 Không chắc lắm.','🤔 Tập trung rồi hỏi lại.',
        '❌ Không phải.','❌ Câu trả lời là Không.','❌ Khả năng rất thấp.'];
      return interaction.reply({embeds:[E(0x000000).setTitle('🎱 Magic 8-Ball')
        .addFields({name:'❓ Câu hỏi',value:interaction.options.getString('question')},{name:'💬 Trả lời',value:ans[rnd(0,ans.length-1)]})
        .setTimestamp()]});
    }

    if (cmd === 'joke') {
      const jokes=[
        {s:'Tại sao lập trình viên không thích ánh nắng?',p:'Vì Windows hay bị lỗi!'},
        {s:'Con gì không có cánh mà vẫn bay?',p:'Con nợ!'},
        {s:'Tại sao điện thoại không bao giờ đói?',p:'Vì có đầy "bộ nhớ"!'},
        {s:'Developer thích làm ban đêm vì sao?',p:'Vì light attracts bugs!'},
        {s:'Tại sao git commit hay bị lỗi?',p:'Vì coder toàn push luck!'},
        {s:'Con gì có 4 chân đứng, 2 chân ngồi, 3 chân đi?',p:'Ông già chống gậy ngồi ghế!'},
        {s:'Học sinh học môn gì vừa học vừa xây?',p:'Kiến trúc!'},
        {s:'Sao AI không bao giờ buồn?',p:'Vì luôn có deep learning!'},
      ];
      const j=jokes[rnd(0,jokes.length-1)];
      return interaction.reply({embeds:[E(0xFEE75C).setTitle('😂 Chuyện cười')
        .addFields({name:'🎤 Câu hỏi',value:j.s},{name:'🎉 Đáp án',value:j.p}).setTimestamp()]});
    }

    if (cmd === 'meme') {
      await interaction.deferReply();
      try {
        const subs=['memes','dankmemes','me_irl','funny','ProgrammerHumor'];
        const r=await(await fetch(`https://meme-api.com/gimme/${subs[rnd(0,subs.length-1)]}`)).json();
        return interaction.editReply({embeds:[E(0xFF4500).setTitle(r.title.slice(0,256))
          .setImage(r.url).setFooter({text:`r/${r.subreddit} · 👍 ${r.ups}`}).setTimestamp()]});
      } catch { return interaction.editReply({embeds:[err('Không lấy được meme! Thử lại.')]}); }
    }

    if (cmd === 'lovecalc') {
      const u1=interaction.options.getUser('user1'), u2=interaction.options.getUser('user2');
      const seed=(u1.id+u2.id).split('').reduce((a,c)=>a+c.charCodeAt(0),0)%101;
      const bars='❤️'.repeat(Math.floor(seed/10))+'🖤'.repeat(10-Math.floor(seed/10));
      const comment=seed>=80?'💞 Cặp đôi hoàn hảo!':seed>=50?'💛 Khá hợp nhau!':'💔 Cần cố gắng thêm!';
      return interaction.reply({embeds:[E(0xFF69B4).setTitle('💕 Love Calculator')
        .setDescription(`${u1} ❤️ ${u2}\n\n${bars}\n**${seed}% — ${comment}**`).setTimestamp()]});
    }

    if (cmd === 'ship') {
      const u1=interaction.options.getUser('user1'), u2=interaction.options.getUser('user2');
      const name=u1.username.slice(0,Math.ceil(u1.username.length/2))+u2.username.slice(Math.floor(u2.username.length/2));
      const seed=(u1.id+u2.id).split('').reduce((a,c)=>a+c.charCodeAt(0),0)%101;
      return interaction.reply({embeds:[E(0xFF69B4).setTitle('💞 Ship!')
        .setDescription(`${u1} 💕 ${u2}\n\n**Ship name:** \`${name}\`\n**Độ hợp:** ${seed}%`).setTimestamp()]});
    }

    if (cmd === 'rps') {
      const choices=['rock','paper','scissors'];
      const labels={rock:'✊ Búa',paper:'✋ Bao',scissors:'✌️ Kéo'};
      const wins={rock:'scissors',paper:'rock',scissors:'paper'};
      const player=interaction.options.getString('choice');
      const bot=choices[rnd(0,2)];
      const res=wins[player]===bot?'🎉 **Bạn thắng!**':wins[bot]===player?'😢 **Bot thắng!**':'🤝 **Hòa!**';
      return interaction.reply({embeds:[E(0x5865F2).setTitle('✊ Kéo Búa Bao')
        .addFields({name:'👤 Bạn',value:labels[player],inline:true},{name:'🤖 Bot',value:labels[bot],inline:true},{name:'🏆 Kết quả',value:res})
        .setTimestamp()]});
    }

    if (['slap','hug','kiss','pat'].includes(cmd)) {
      const target=interaction.options.getUser('user');
      const data={
        slap:{emoji:'👋',verb:'đã tát',color:0xED4245,gifs:['https://media.giphy.com/media/uqSU9IEYEKAbS/giphy.gif']},
        hug:{emoji:'🤗',verb:'đã ôm',color:0xFF69B4,gifs:['https://media.giphy.com/media/od5H3PmEG5EVq/giphy.gif']},
        kiss:{emoji:'😘',verb:'đã hôn',color:0xFF69B4,gifs:['https://media.giphy.com/media/G3va31oEEnIkM/giphy.gif']},
        pat:{emoji:'👋',verb:'đã xoa đầu',color:0xFEE75C,gifs:['https://media.giphy.com/media/5tmRHwTlHAA9WkVxTU/giphy.gif']},
      };
      const d=data[cmd];
      return interaction.reply({embeds:[E(d.color)
        .setTitle(`${d.emoji} ${interaction.user.username} ${d.verb} ${target.username}!`)
        .setImage(d.gifs[0]).setTimestamp()]});
    }

    if (cmd === 'roast') {
      const target=interaction.options.getUser('user');
      const roasts=[
        'trông như chưa ngủ 3 ngày liên tiếp vì đang cày game.',
        'có IQ cao hơn nhiệt độ Hà Nội mùa đông... chút xíu thôi.',
        'là bằng chứng rằng evolution có thể đi ngược chiều.',
        'gõ bàn phím như đang cố đánh chết con gián.',
        'cứ mỗi lần nói chuyện là WiFi nhà tui drop.',
        'profile pic trông như được chụp bởi máy giặt.',
      ];
      return interaction.reply({embeds:[E(0xFF4500).setTitle('🔥 Roast!')
        .setDescription(`${interaction.user} chọc: ${target} ${roasts[rnd(0,roasts.length-1)]}`)
        .setFooter({text:'Vui thôi nha! Đừng serious 😄'}).setTimestamp()]});
    }

    if (cmd === 'compliment') {
      const target=interaction.options.getUser('user');
      const cps=[
        'là người tài năng và đáng tin cậy nhất mà mình từng gặp!',
        'có nụ cười sáng như mặt trời vậy ☀️',
        'làm cho mọi người xung quanh cảm thấy tốt hơn chỉ bằng cách xuất hiện.',
        'thông minh và sáng tạo đến mức bot cũng phải ghen tỵ!',
        'là điểm sáng của server này 🌟',
        'có trái tim tốt bụng như buffet miễn phí 💖',
      ];
      return interaction.reply({embeds:[E(0xFF69B4).setTitle('🌸 Compliment!')
        .setDescription(`${interaction.user} nói: ${target} ${cps[rnd(0,cps.length-1)]}`)
        .setTimestamp()]});
    }

    if (cmd === 'rate') {
      const thing=interaction.options.getString('thing');
      const score=rnd(0,100);
      const bar='█'.repeat(Math.floor(score/10))+'░'.repeat(10-Math.floor(score/10));
      return interaction.reply({embeds:[E(0xFFD700).setTitle('⭐ Chấm điểm')
        .setDescription(`**${thing}**\n\n\`[${bar}]\`\n**${score}/100** — ${score>=80?'🔥 Xuất sắc!':score>=60?'👍 Khá tốt!':score>=40?'😐 Tạm được.':'💀 Thật sự tệ...'}`)
        .setTimestamp()]});
    }

    if (cmd === 'choose') {
      const opts=interaction.options.getString('options').split('|').map(o=>o.trim()).filter(Boolean);
      if(opts.length<2) return interaction.reply({embeds:[err('Cần ít nhất 2 lựa chọn, cách nhau bởi |')]});
      const chosen=opts[rnd(0,opts.length-1)];
      return interaction.reply({embeds:[E(0x5865F2).setTitle('🤔 Bot đã chọn!')
        .setDescription(`Từ **${opts.length}** lựa chọn, bot chọn:\n\n## ✅ ${chosen}`)
        .setTimestamp()]});
    }

    if (cmd === 'trivia') {
      if(triviaSess.has(interaction.channel.id)) return interaction.reply({embeds:[err('Đã có câu đố đang chạy trong kênh này!')],ephemeral:true});
      await interaction.deferReply();
      try {
        const r=await(await fetch('https://opentdb.com/api.php?amount=1&type=multiple')).json();
        const q=r.results[0];
        const correct=dh(q.correct_answer);
        const all=[...q.incorrect_answers.map(dh),correct].sort(()=>Math.random()-0.5);
        const letters=['🇦','🇧','🇨','🇩'];
        triviaSess.set(interaction.channel.id,{answer:correct});
        const embed=E(0x9B59B6).setTitle('🧠 Câu hỏi đố vui')
          .setDescription(dh(q.question))
          .addFields({name:'Các lựa chọn',value:all.map((a,i)=>`${letters[i]} ${a}`).join('\n')})
          .setFooter({text:`Độ khó: ${q.difficulty} | Trả lời a/b/c/d trong 30 giây!`}).setTimestamp();
        await interaction.editReply({embeds:[embed]});
        const col=interaction.channel.createMessageCollector({filter:m=>!m.author.bot&&['a','b','c','d'].includes(m.content.toLowerCase()),time:30000});
        col.on('collect', m=>{
          const idx=['a','b','c','d'].indexOf(m.content.toLowerCase());
          if(all[idx]===correct){
            col.stop('answered');
            const u=db.getUser(m.author.id); u.coins=(u.coins||0)+50; db.saveUser(m.author.id,u);
            interaction.channel.send({embeds:[ok('✅ Chính xác!').setDescription(`${m.author} trả lời đúng!\n**Đáp án:** ${correct}\n🪙 +50 xu!`)]});
          } else m.react('❌').catch(()=>{});
        });
        col.on('end',(_,reason)=>{
          triviaSess.delete(interaction.channel.id);
          if(reason!=='answered') interaction.channel.send({embeds:[err(`Hết giờ! Đáp án: **${correct}**`)]});
        });
      } catch { return interaction.editReply({embeds:[err('Không lấy được câu hỏi! Thử lại.')]}); }
    }

    // ══ MUSIC ════════════════════════════════════════════

    if (cmd === 'play') {
      await interaction.deferReply();
      const song=interaction.options.getString('song');
      const gid=interaction.guildId;
      if(!musicQ.has(gid)) musicQ.set(gid,{queue:[],loop:'off'});
      const q=musicQ.get(gid);
      let title=song,url=null,channel='',thumb=null,dur='';
      try {
        const html=await(await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(song)}`,{headers:{'User-Agent':'Mozilla/5.0'}})).text();
        const vid=html.match(/"videoId":"([a-zA-Z0-9_-]{11})"/)?.[1];
        if(vid){
          url=`https://www.youtube.com/watch?v=${vid}`;
          title=html.match(/"title":{"runs":\[{"text":"([^"]+)"}/)?.[1]||song;
          channel=html.match(/"ownerText":{"runs":\[{"text":"([^"]+)"}/)?.[1]||'';
          dur=html.match(/"simpleText":"(\d+:\d+(?::\d+)?)"/)?.[1]||'';
          thumb=`https://img.youtube.com/vi/${vid}/hqdefault.jpg`;
        }
      } catch {}
      if(!url) url=`https://www.youtube.com/results?search_query=${encodeURIComponent(song)}`;
      q.queue.push({title,url,channel,thumb,dur,req:interaction.user.tag});
      return interaction.editReply({embeds:[E(0xFF0000).setTitle('🎵 Đã thêm vào hàng đợi')
        .setThumbnail(thumb)
        .addFields(
          {name:'🎶 Bài hát',value:`[${title}](${url})`},
          {name:'👤 Kênh',value:channel||'Không rõ',inline:true},
          {name:'⏱️ Thời lượng',value:dur||'Không rõ',inline:true},
          {name:'📍 Vị trí',value:`#${q.queue.length}`,inline:true},
        )
        .setDescription(`▶️ **[Mở YouTube để nghe](${url})**`)
        .setFooter({text:`Thêm bởi ${interaction.user.tag}`}).setTimestamp()]});
    }

    if (cmd === 'queue') {
      const q=musicQ.get(interaction.guildId);
      if(!q?.queue.length) return interaction.reply({embeds:[err('Hàng đợi đang trống!')]});
      const list=q.queue.slice(0,10).map((s,i)=>`**${i+1}.** [${s.title}](${s.url}) \`${s.dur||'?'}\``).join('\n');
      return interaction.reply({embeds:[E(0xFF0000).setTitle('📜 Hàng đợi nhạc')
        .setDescription(list)
        .addFields({name:'🔁 Loop',value:q.loop,inline:true},{name:'📊 Tổng',value:`${q.queue.length} bài`,inline:true})
        .setTimestamp()]});
    }

    if (cmd === 'nowplaying') {
      const q=musicQ.get(interaction.guildId);
      if(!q?.queue.length) return interaction.reply({embeds:[err('Không có bài nào đang phát!')]});
      const s=q.queue[0];
      return interaction.reply({embeds:[E(0xFF0000).setTitle('🎶 Đang phát').setThumbnail(s.thumb)
        .addFields({name:'🎵 Bài hát',value:`[${s.title}](${s.url})`},{name:'👤 Kênh',value:s.channel||'?',inline:true},{name:'⏱️ Thời lượng',value:s.dur||'?',inline:true},{name:'🙋 Yêu cầu',value:s.req,inline:true})
        .setTimestamp()]});
    }

    if (cmd === 'skip') {
      const q=musicQ.get(interaction.guildId);
      if(!q?.queue.length) return interaction.reply({embeds:[err('Hàng đợi trống!')]});
      const sk=q.queue.shift();
      return interaction.reply({embeds:[ok(`⏭️ Đã skip: **${sk.title}**`)
        .addFields({name:'🎵 Tiếp theo',value:q.queue[0]?`[${q.queue[0].title}](${q.queue[0].url})`:'Hết hàng đợi'})]});
    }

    if (cmd === 'stop') {
      musicQ.delete(interaction.guildId);
      return interaction.reply({embeds:[ok('⏹️ Đã dừng nhạc & xoá hàng đợi',0xED4245)]});
    }

    if (cmd === 'loop') {
      const q=musicQ.get(interaction.guildId);
      if(!q) return interaction.reply({embeds:[err('Chưa có nhạc trong hàng đợi!')]});
      const mode=interaction.options.getString('mode')||(q.loop==='off'?'song':'off');
      q.loop=mode;
      return interaction.reply({embeds:[ok({off:'🚫 Tắt lặp',song:'🔂 Lặp bài hiện tại',queue:'🔁 Lặp cả queue'}[mode])]});
    }

    if (cmd === 'shuffle') {
      const q=musicQ.get(interaction.guildId);
      if(!q?.queue.length) return interaction.reply({embeds:[err('Hàng đợi trống!')]});
      const cur=q.queue.shift();
      for(let i=q.queue.length-1;i>0;i--){const j=rnd(0,i);[q.queue[i],q.queue[j]]=[q.queue[j],q.queue[i]];}
      q.queue.unshift(cur);
      return interaction.reply({embeds:[ok(`🔀 Đã xáo trộn ${q.queue.length} bài`)]});
    }

    if (cmd === 'remove') {
      const q=musicQ.get(interaction.guildId);
      const pos=interaction.options.getInteger('position');
      if(!q?.queue.length||pos>q.queue.length) return interaction.reply({embeds:[err('Vị trí không hợp lệ!')]});
      const rm=q.queue.splice(pos-1,1)[0];
      return interaction.reply({embeds:[ok(`➖ Đã xoá bài #${pos}: **${rm.title}**`)]});
    }

    if (cmd === 'radio') {
      const station=interaction.options.getString('station');
      const stations={
        lansongxanh:{name:'Làn Sóng Xanh',url:'http://icecast.vov.vn:8000/vov3.mp3',emoji:'🎵'},
        vovgt:{name:'VOV Giao Thông',url:'http://icecast.vov.vn:8000/vov1.mp3',emoji:'🎶'},
        lofi:{name:'Lofi Hip Hop',url:'https://streams.ilovemusic.de/iloveradio17.mp3',emoji:'🎸'},
        jazz:{name:'Jazz Chill',url:'http://listen.181fm.com/181-jazz_128k.mp3',emoji:'🎷'},
        pop:{name:'Pop Hits',url:'https://streams.ilovemusic.de/iloveradio1.mp3',emoji:'🎧'},
      };
      const s=stations[station];
      const gid=interaction.guildId;
      if(!musicQ.has(gid)) musicQ.set(gid,{queue:[],loop:'off'});
      const q=musicQ.get(gid);
      q.queue.push({title:`📻 Radio: ${s.name}`,url:s.url,channel:'Radio 24/7',thumb:null,dur:'Live 🔴',req:interaction.user.tag});
      return interaction.reply({embeds:[E(0xFF0000).setTitle(`📻 Radio — ${s.emoji} ${s.name}`)
        .setDescription(`Đã thêm kênh radio **${s.name}** vào hàng đợi!\n▶️ **[Mở link để nghe](${s.url})**`)
        .setFooter({text:'Phát 24/7'}).setTimestamp()]});
    }

    // ══ ECONOMY ══════════════════════════════════════════

    if (cmd === 'daily') {
      const u=db.getUser(interaction.user.id), now=Date.now(), CD=864e5;
      if(now-(u.lastDaily||0)<CD) return interaction.reply({embeds:[err(`Hồi lại sau **${msLabel(CD-(now-u.lastDaily))}**!`)],ephemeral:true});
      const reward=rnd(100,500);
      u.coins=(u.coins||0)+reward; u.lastDaily=now;
      db.saveUser(interaction.user.id,u);
      return interaction.reply({embeds:[E(0xFFD700).setTitle('💰 Nhận xu hàng ngày!')
        .setDescription(`Bạn nhận được ${coins(reward)}!\n\nSố dư hiện tại: ${coins(u.coins)}`).setTimestamp()]});
    }

    if (cmd === 'balance') {
      const target=interaction.options.getUser('user')||interaction.user;
      const u=db.getUser(target.id);
      return interaction.reply({embeds:[E(0xFFD700).setTitle(`💳 Số dư — ${target.username}`)
        .setThumbnail(target.displayAvatarURL())
        .addFields(
          {name:'🪙 Xu',value:coins(u.coins||0),inline:true},
          {name:'⭐ Cấp độ',value:`**${u.level||1}**`,inline:true},
          {name:'✨ XP',value:`${u.xp||0}/${xpForLevel(u.level||1)}`,inline:true},
        ).setTimestamp()]});
    }

    if (cmd === 'work') {
      const u=db.getUser(interaction.user.id), now=Date.now(), CD=36e5;
      if(now-(u.lastWork||0)<CD) return interaction.reply({embeds:[err(`Nghỉ ngơi đi! Còn **${msLabel(CD-(now-u.lastWork))}**.`)],ephemeral:true});
      const jobs=[
        {job:'👨‍💻 Lập trình viên',earn:rnd(150,300)},
        {job:'🚗 Tài xế Grab',earn:rnd(80,200)},
        {job:'☕ Pha cà phê',earn:rnd(50,150)},
        {job:'🎮 Streamer',earn:rnd(200,400)},
        {job:'📦 Giao hàng',earn:rnd(100,250)},
        {job:'🍜 Bán bún bò',earn:rnd(120,280)},
        {job:'📱 Bán điện thoại',earn:rnd(180,350)},
        {job:'🎨 Designer',earn:rnd(160,320)},
        {job:'🏫 Gia sư',earn:rnd(140,260)},
      ];
      const j=jobs[rnd(0,jobs.length-1)];
      u.coins=(u.coins||0)+j.earn; u.lastWork=now;
      db.saveUser(interaction.user.id,u);
      return interaction.reply({embeds:[E(0x57F287).setTitle('💼 Đi làm!')
        .setDescription(`Bạn làm **${j.job}** và kiếm được ${coins(j.earn)}!\n\nSố dư: ${coins(u.coins)}`).setTimestamp()]});
    }

    if (cmd === 'crime') {
      const u=db.getUser(interaction.user.id), now=Date.now(), CD=72e5;
      if(now-(u.lastCrime||0)<CD) return interaction.reply({embeds:[err(`Ẩn mình đi! Còn **${msLabel(CD-(now-u.lastCrime))}**.`)],ephemeral:true});
      const win=Math.random()>0.45;
      const amount=rnd(100,600);
      u.coins=Math.max(0,(u.coins||0)+(win?amount:-amount)); u.lastCrime=now;
      db.saveUser(interaction.user.id,u);
      const crimes=['🦹 Móc túi','🕵️ Hack ATM','🎭 Lừa đảo','🏃 Cướp giật','🔓 Bẻ khoá'];
      return interaction.reply({embeds:[E(win?0x57F287:0xED4245).setTitle(`${crimes[rnd(0,crimes.length-1)]} — ${win?'✅ Thành công!':'❌ Bị bắt!'}`)
        .setDescription(`${win?`+${coins(amount)}`:`-${coins(amount)}`}\n\nSố dư: ${coins(u.coins)}`).setTimestamp()]});
    }

    if (cmd === 'rank') {
      const target=interaction.options.getUser('user')||interaction.user;
      const u=db.getUser(target.id);
      const lvl=u.level||1, needed=xpForLevel(lvl), xp=u.xp||0;
      const prog=Math.min(Math.floor(xp/needed*10),10);
      return interaction.reply({embeds:[E(0x9B59B6).setTitle(`🏅 Cấp độ — ${target.username}`)
        .setThumbnail(target.displayAvatarURL())
        .addFields(
          {name:'⭐ Cấp độ',value:`**${lvl}**`,inline:true},
          {name:'✨ XP',value:`${xp}/${needed}`,inline:true},
          {name:'🪙 Xu',value:coins(u.coins||0),inline:true},
          {name:'📊 Tiến trình',value:`\`[${'█'.repeat(prog)}${'░'.repeat(10-prog)}]\``},
        ).setTimestamp()]});
    }

    if (cmd === 'leaderboard') {
      const type=interaction.options.getString('type')||'coins';
      const eco=db.getEco();
      const sorted=Object.entries(eco).sort((a,b)=>(b[1][type]||0)-(a[1][type]||0)).slice(0,10);
      if(!sorted.length) return interaction.reply({embeds:[err('Chưa có dữ liệu!')]});
      const medals=['🥇','🥈','🥉'];
      const list=sorted.map(([id,d],i)=>`${medals[i]||`**${i+1}.**`} <@${id}> — ${type==='coins'?coins(d.coins||0):`⭐ Cấp ${d.level||1}`}`).join('\n');
      return interaction.reply({embeds:[E(0xFFD700).setTitle(type==='coins'?'🏆 Top Đại Gia':'🏆 Top Cao Thủ')
        .setDescription(list).setTimestamp()]});
    }

    if (cmd === 'transfer') {
      const target=interaction.options.getUser('user'), amount=interaction.options.getInteger('amount');
      if(target.id===interaction.user.id) return interaction.reply({embeds:[err('Không chuyển cho chính mình!')],ephemeral:true});
      const sender=db.getUser(interaction.user.id);
      if((sender.coins||0)<amount) return interaction.reply({embeds:[err(`Không đủ xu! Bạn có ${coins(sender.coins||0)}`)],ephemeral:true});
      const recv=db.getUser(target.id);
      sender.coins-=amount; recv.coins=(recv.coins||0)+amount;
      db.saveUser(interaction.user.id,sender); db.saveUser(target.id,recv);
      return interaction.reply({embeds:[ok('💸 Chuyển xu thành công!').setDescription(
        `${interaction.user} → ${target}\n${coins(amount)}\n\nSố dư còn lại: ${coins(sender.coins)}`
      )]});
    }

    if (cmd === 'gamble') {
      const amount=interaction.options.getInteger('amount'), bet=interaction.options.getString('bet');
      const u=db.getUser(interaction.user.id);
      if((u.coins||0)<amount) return interaction.reply({embeds:[err(`Không đủ xu!`)],ephemeral:true});
      const d=[rnd(1,6),rnd(1,6),rnd(1,6)], sum=d.reduce((a,b)=>a+b,0);
      const isTai=sum>=11, won=(bet==='tai')===isTai;
      u.coins=(u.coins||0)+(won?amount:-amount);
      db.saveUser(interaction.user.id,u);
      return interaction.reply({embeds:[E(won?0x57F287:0xED4245).setTitle(`🎲 Tài Xỉu — ${won?'🎉 THẮNG!':'😢 THUA!'}`)
        .setDescription(`🎲 ${d.join(' + ')} = **${sum}** (${isTai?'🔴 Tài':'🔵 Xỉu'})\nBạn cược: **${bet==='tai'?'🔴 Tài':'🔵 Xỉu'}**\n${won?'+':'-'}${coins(amount)}\nSố dư: ${coins(u.coins)}`)
        .setTimestamp()]});
    }

    if (cmd === 'slots') {
      const amount=interaction.options.getInteger('amount');
      const u=db.getUser(interaction.user.id);
      if((u.coins||0)<amount) return interaction.reply({embeds:[err('Không đủ xu!')],ephemeral:true});
      const syms=['🍒','🍋','🍊','🍇','⭐','💎','🎰'];
      const s=[syms[rnd(0,6)],syms[rnd(0,6)],syms[rnd(0,6)]];
      const mult=s[0]===s[1]&&s[1]===s[2]?(s[0]==='💎'?10:s[0]==='⭐'?5:3):0;
      const profit=mult>0?amount*(mult-1):-amount;
      u.coins=Math.max(0,(u.coins||0)+profit);
      db.saveUser(interaction.user.id,u);
      return interaction.reply({embeds:[E(mult>0?0xFFD700:0xED4245).setTitle(`🎰 Slots — ${mult>0?`🎉 JACKPOT x${mult}!`:'😢 Thua!'}`)
        .setDescription(`┌───────────┐\n│ ${s.join(' │ ')} │\n└───────────┘\n${mult>0?`+${coins(amount*(mult-1))}`:`-${coins(amount)}`}\nSố dư: ${coins(u.coins)}`)
        .setTimestamp()]});
    }

    if (cmd === 'baucua') {
      const amount=interaction.options.getInteger('amount'), bet=interaction.options.getString('bet');
      const u=db.getUser(interaction.user.id);
      if((u.coins||0)<amount) return interaction.reply({embeds:[err('Không đủ xu!')],ephemeral:true});
      const items=['tom','cua','ca','nai','ga','bau'];
      const emo={tom:'🦐',cua:'🦀',ca:'🐟',nai:'🦌',ga:'🐓',bau:'🎡'};
      const d=[items[rnd(0,5)],items[rnd(0,5)],items[rnd(0,5)]];
      const matches=d.filter(x=>x===bet).length;
      const profit=matches>0?amount*matches:-amount;
      u.coins=Math.max(0,(u.coins||0)+profit);
      db.saveUser(interaction.user.id,u);
      return interaction.reply({embeds:[E(matches>0?0x57F287:0xED4245).setTitle(`🦐 Bầu Cua — ${matches>0?`🎉 THẮNG x${matches}!`:'😢 Thua!'}`)
        .setDescription(`${d.map(x=>emo[x]).join(' ')} \nBạn cược: **${emo[bet]}**\n${matches>0?`+${coins(amount*matches)}`:`-${coins(amount)}`}\nSố dư: ${coins(u.coins)}`)
        .setTimestamp()]});
    }

    if (cmd === 'shop') {
      const shop=db.getShop();
      const items=Object.values(shop);
      if(!items.length) return interaction.reply({embeds:[E(0xFFD700).setTitle('🛒 Cửa hàng')
        .setDescription('Cửa hàng đang trống!\nAdmin dùng `/additem` để thêm vật phẩm.').setTimestamp()]});
      return interaction.reply({embeds:[E(0xFFD700).setTitle('🛒 Cửa hàng')
        .setDescription(items.map(i=>`**${i.name}** — ${coins(i.price)}${i.roleId?` → Role <@&${i.roleId}>`:''}`)
          .join('\n')).setFooter({text:'Dùng /buy [tên] để mua'}).setTimestamp()]});
    }

    if (cmd === 'additem') {
      const name=interaction.options.getString('name'), price=interaction.options.getInteger('price');
      const role=interaction.options.getRole('role');
      const shop=db.getShop();
      shop[name.toLowerCase()]={name,price,roleId:role?.id||null};
      db.saveShop(shop);
      return interaction.reply({embeds:[ok(`✅ Đã thêm **${name}** vào shop — ${coins(price)}${role?` (kèm role ${role})`:''}`)]);
    }

    if (cmd === 'buy') {
      const name=interaction.options.getString('item').toLowerCase();
      const shop=db.getShop();
      const item=shop[name]||Object.values(shop).find(i=>i.name.toLowerCase()===name);
      if(!item) return interaction.reply({embeds:[err(`Không tìm thấy vật phẩm **${name}** trong shop!`)],ephemeral:true});
      const u=db.getUser(interaction.user.id);
      if((u.coins||0)<item.price) return interaction.reply({embeds:[err(`Không đủ xu! Cần ${coins(item.price)}, bạn có ${coins(u.coins||0)}`)],ephemeral:true});
      u.coins-=item.price;
      if(!u.inventory) u.inventory=[];
      u.inventory.push(item.name);
      db.saveUser(interaction.user.id,u);
      if(item.roleId && interaction.guild) {
        const role=interaction.guild.roles.cache.get(item.roleId);
        if(role) await interaction.member.roles.add(role).catch(()=>{});
      }
      return interaction.reply({embeds:[ok(`✅ Đã mua **${item.name}**!`).setDescription(`-${coins(item.price)}\nSố dư: ${coins(u.coins)}${item.roleId?`\n🎭 Đã nhận role!`:'`'}`)]);
    }

    if (cmd === 'inventory') {
      const u=db.getUser(interaction.user.id);
      const inv=u.inventory||[];
      return interaction.reply({embeds:[E(0xFFD700).setTitle('🎒 Túi đồ')
        .setDescription(inv.length?inv.map((x,i)=>`${i+1}. ${x}`).join('\n'):'Túi đồ trống!')
        .setTimestamp()]});
    }

    // ══ AI / SYSTEM ══════════════════════════════════════

    if (cmd === 'ask') {
      await interaction.deferReply();
      const question=interaction.options.getString('cauhoi');
      if(!GROQ_KEY) return interaction.editReply({embeds:[err('Chưa cài `GROQ_API_KEY`!\nLấy miễn phí tại: https://console.groq.com')]});
      try {
        const res=await fetch('https://api.groq.com/openai/v1/chat/completions',{
          method:'POST',
          headers:{'Content-Type':'application/json','Authorization':`Bearer ${GROQ_KEY}`},
          body:JSON.stringify({
            model:'llama-3.3-70b-versatile',
            messages:[
              {role:'system',content:'Bạn là trợ lý AI thông minh trong Discord bot tên ThinhbeuBot. Trả lời ngắn gọn, rõ ràng bằng tiếng Việt. Nếu hỏi tiếng Anh thì trả lời tiếng Anh.'},
              {role:'user',content:question},
            ],
            max_tokens:1024, temperature:0.7,
          }),
        });
        const data=await res.json();
        if(data.error) return interaction.editReply({embeds:[err(`Groq: ${data.error.message}`)]});
        const ans=data?.choices?.[0]?.message?.content||'Không nhận được phản hồi.';
        return interaction.editReply({embeds:[E(0xF55036).setTitle('🤖 Groq AI — Llama 3.3 70B')
          .addFields({name:'❓ Câu hỏi',value:`\`\`\`${question.slice(0,200)}\`\`\``},{name:'💬 Trả lời',value:ans.slice(0,3900)})
          .setFooter({text:`Hỏi bởi ${interaction.user.tag}`}).setTimestamp()]});
      } catch { return interaction.editReply({embeds:[err('Lỗi kết nối Groq API! Thử lại.')]}); }
    }

    if (cmd === 'chat') {
      const cfg=db.getCfg(); if(!cfg[interaction.guild.id])cfg[interaction.guild.id]={};
      const current=cfg[interaction.guild.id].aiChatCh;
      if(current===interaction.channel.id){
        cfg[interaction.guild.id].aiChatCh=null; db.saveCfg(cfg);
        chatSess.delete(interaction.channel.id);
        return interaction.reply({embeds:[ok('🔕 Đã tắt chế độ AI Chat trong kênh này.')]});
      }
      cfg[interaction.guild.id].aiChatCh=interaction.channel.id; db.saveCfg(cfg);
      return interaction.reply({embeds:[ok('💬 Đã bật chế độ AI Chat!').setDescription(
        `Mọi tin nhắn trong ${interaction.channel} sẽ được bot phản hồi bằng AI.\nDùng **/chat** lần nữa để tắt.`
      )]});
    }

    if (cmd === 'ticket') {
      const existing=interaction.guild.channels.cache.find(c=>c.name===`ticket-${interaction.user.username.toLowerCase().replace(/\s+/g,'-')}`);
      if(existing) return interaction.reply({embeds:[err(`Bạn đã có ticket: ${existing}`)],ephemeral:true});
      const ch=await interaction.guild.channels.create({
        name:`ticket-${interaction.user.username.toLowerCase().replace(/\s+/g,'-')}`,
        type:ChannelType.GuildText,
        permissionOverwrites:[
          {id:interaction.guild.roles.everyone,deny:[P.ViewChannel]},
          {id:interaction.user.id,allow:[P.ViewChannel,P.SendMessages,P.AttachFiles]},
          {id:client.user.id,allow:[P.ViewChannel,P.SendMessages]},
        ],
      });
      const row=new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket_close').setLabel('🔒 Đóng Ticket').setStyle(ButtonStyle.Danger)
      );
      ch.send({content:`<@${interaction.user.id}>`,embeds:[E(0x5865F2).setTitle('🎫 Ticket hỗ trợ')
        .setDescription(`Chào ${interaction.user}!\n\nMô tả vấn đề, admin sẽ hỗ trợ sớm nhất.\n\nNhấn **Đóng Ticket** khi xong.`)
        .setTimestamp()],components:[row]});
      return interaction.reply({embeds:[ok(`🎫 Đã tạo ticket: ${ch}`)],ephemeral:true});
    }

    if (cmd === 'closeticket') {
      if(!interaction.channel.name.startsWith('ticket-')) return interaction.reply({embeds:[err('Không phải kênh ticket!')],ephemeral:true});
      await interaction.reply({content:'🔒 Đang đóng ticket...',ephemeral:true});
      setTimeout(()=>interaction.channel.delete().catch(()=>{}),2000);
    }

    if (cmd === 'verify') {
      const code=genCaptcha();
      captcha.set(interaction.user.id,{code,chId:interaction.channel.id});
      setTimeout(()=>captcha.delete(interaction.user.id),120000);
      return interaction.reply({embeds:[E(0x5865F2).setTitle('🔐 Xác minh CAPTCHA')
        .setDescription(`Nhập mã dưới đây vào chat để xác minh:\n\n## \`${code}\`\n\n*(Hết hiệu lực sau 2 phút)*`)
        .setTimestamp()],ephemeral:true});
    }

    if (cmd === 'addcmd') {
      const name=interaction.options.getString('name').toLowerCase().replace(/\s/g,'_');
      const response=interaction.options.getString('response');
      db.addCC(interaction.guild.id,name,response);
      return interaction.reply({embeds:[ok(`✅ Đã tạo lệnh \`!${name}\``).addFields({name:'Phản hồi',value:response})]});
    }

    if (cmd === 'delcmd') {
      const name=interaction.options.getString('name');
      db.delCC(interaction.guild.id,name);
      return interaction.reply({embeds:[ok(`🗑️ Đã xoá lệnh \`!${name}\``)]});
    }

    if (cmd === 'listcmds') {
      const list=db.listCC(interaction.guild.id);
      const entries=Object.entries(list);
      if(!entries.length) return interaction.reply({embeds:[err('Chưa có lệnh tuỳ chỉnh nào!')]});
      return interaction.reply({embeds:[E(0x5865F2).setTitle('📜 Lệnh tuỳ chỉnh')
        .setDescription(entries.map(([n,r])=>`\`!${n}\` → ${r.slice(0,80)}`).join('\n'))
        .setTimestamp()]});
    }

  } catch(e) {
    console.error(`❌ Error /${cmd}:`, e);
    const msg='❌ Có lỗi xảy ra! Thử lại sau.';
    if(interaction.deferred) await interaction.editReply({content:msg}).catch(()=>{});
    else await interaction.reply({content:msg,ephemeral:true}).catch(()=>{});
  }
});

// ═════════════════════════════════════════════════════════════
//  HELPERS
// ═════════════════════════════════════════════════════════════

function modE(title,target,mod,reason,color){
  return E(color).setTitle(title)
    .addFields(
      {name:'🎯 Thành viên',value:`${target.tag} (<@${target.id}>)`,inline:true},
      {name:'👮 Mod',value:mod.tag,inline:true},
      ...(reason?[{name:'📝 Lý do',value:reason}]:[]),
    ).setTimestamp();
}

async function log(guild, msg, color=0xFEA82F){
  const cfg=db.getCfg();
  const chId=cfg[guild.id]?.logCh; if(!chId) return;
  const ch=guild.channels.cache.get(chId); if(!ch) return;
  ch.send({embeds:[E(color).setDescription(`📋 ${msg}`).setTimestamp()]}).catch(()=>{});
}

async function sendReminder(uid, chId, message){
  try {
    const user=await client.users.fetch(uid);
    await user.send({embeds:[E(0xFEA82F).setTitle('⏰ Nhắc nhở!').setDescription(`📝 ${message}`).setTimestamp()]});
  } catch {
    const ch=client.channels.cache.get(chId);
    if(ch) ch.send({content:`<@${uid}>`,embeds:[E(0xFEA82F).setTitle('⏰ Nhắc nhở!').setDescription(`📝 ${message}`).setTimestamp()]}).catch(()=>{});
  }
}

function restoreReminders(){
  const r=db.getReminders();
  if(!r.list?.length) return;
  const now=Date.now();
  r.list.forEach(item=>{
    const remaining=item.when-now;
    if(remaining<=0){ sendReminder(item.uid,item.chId,item.message); return; }
    setTimeout(()=>sendReminder(item.uid,item.chId,item.message), remaining);
  });
}

function dh(s){ return s.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#039;/g,"'"); }

// ── Login ────────────────────────────────────────────────────
client.login(TOKEN);
