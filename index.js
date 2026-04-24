// ============================================================
//  Discord Bot - Full Featured + Groq AI (Llama 3.3 70B)
//  Các lệnh: /menu /ask /weather /userinfo /serverinfo
//            /kick /ban /mute /unmute /play /stop /skip /queue
// ============================================================

const {
  Client, GatewayIntentBits, REST, Routes,
  SlashCommandBuilder, EmbedBuilder,
  PermissionFlagsBits, ActivityType,
  Collection
} = require('discord.js');

const fetch = require('node-fetch');

// ── Biến môi trường ──────────────────────────────────────────
const TOKEN       = process.env.TOKEN;
const GROQ_KEY    = process.env.GROQ_API_KEY;
const WEATHER_KEY = process.env.WEATHER_API_KEY; // openweathermap (free)

if (!TOKEN) {
  console.error('❌ Thiếu biến môi trường TOKEN');
  process.exit(1);
}

// ── Music queue (per guild) ──────────────────────────────────
const musicQueues = new Collection(); // guildId -> { queue:[], playing:false, ... }

// ── Client ──────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
  ]
});

// ── Slash Commands ───────────────────────────────────────────
const commands = [
  // MENU
  new SlashCommandBuilder()
    .setName('menu')
    .setDescription('📋 Xem toàn bộ lệnh của bot'),

  // AI
  new SlashCommandBuilder()
    .setName('ask')
    .setDescription('🤖 Hỏi Groq AI (Llama 3.3 70B)')
    .addStringOption(o =>
      o.setName('cauhoi').setDescription('Nhập câu hỏi của bạn').setRequired(true)),

  // WEATHER
  new SlashCommandBuilder()
    .setName('weather')
    .setDescription('🌦️ Xem thời tiết')
    .addStringOption(o =>
      o.setName('city').setDescription('Tên thành phố (VD: Hanoi)').setRequired(true)),

  // USERINFO
  new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('👤 Xem thông tin thành viên')
    .addUserOption(o =>
      o.setName('user').setDescription('Chọn thành viên (bỏ trống = bản thân)').setRequired(false)),

  // SERVERINFO
  new SlashCommandBuilder()
    .setName('serverinfo')
    .setDescription('🏠 Xem thông tin server'),

  // KICK
  new SlashCommandBuilder()
    .setName('kick')
    .setDescription('👢 Kick thành viên')
    .addUserOption(o =>
      o.setName('user').setDescription('Thành viên cần kick').setRequired(true))
    .addStringOption(o =>
      o.setName('reason').setDescription('Lý do').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),

  // BAN
  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('🔨 Ban thành viên')
    .addUserOption(o =>
      o.setName('user').setDescription('Thành viên cần ban').setRequired(true))
    .addStringOption(o =>
      o.setName('reason').setDescription('Lý do').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  // MUTE
  new SlashCommandBuilder()
    .setName('mute')
    .setDescription('🔇 Mute thành viên (timeout 10 phút)')
    .addUserOption(o =>
      o.setName('user').setDescription('Thành viên cần mute').setRequired(true))
    .addIntegerOption(o =>
      o.setName('minutes').setDescription('Số phút (mặc định 10)').setMinValue(1).setMaxValue(1440).setRequired(false))
    .addStringOption(o =>
      o.setName('reason').setDescription('Lý do').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  // UNMUTE
  new SlashCommandBuilder()
    .setName('unmute')
    .setDescription('🔊 Unmute thành viên')
    .addUserOption(o =>
      o.setName('user').setDescription('Thành viên cần unmute').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  // PLAY (thông tin bài nhạc, không stream thật vì Railway không có ffmpeg sẵn)
  new SlashCommandBuilder()
    .setName('play')
    .setDescription('🎵 Thêm bài vào hàng đợi nhạc')
    .addStringOption(o =>
      o.setName('song').setDescription('Tên bài hát hoặc link YouTube').setRequired(true)),

  // SKIP
  new SlashCommandBuilder()
    .setName('skip')
    .setDescription('⏭️ Bỏ qua bài hiện tại'),

  // STOP
  new SlashCommandBuilder()
    .setName('stop')
    .setDescription('⏹️ Dừng nhạc và xoá hàng đợi'),

  // QUEUE
  new SlashCommandBuilder()
    .setName('queue')
    .setDescription('📜 Xem hàng đợi nhạc'),

  // PING
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('🏓 Kiểm tra độ trễ bot'),
];

// ── Ready ─────────────────────────────────────────────────────
client.once('ready', async () => {
  console.log(`✅ Bot online: ${client.user.tag}`);

  // Set activity
  client.user.setActivity('🎵 /menu để xem lệnh', { type: ActivityType.Watching });

  // Đăng ký slash commands
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands.map(c => c.toJSON()) }
    );
    console.log('✅ Đã đăng ký tất cả slash commands!');
  } catch (err) {
    console.error('❌ Lỗi đăng ký commands:', err);
  }
});

// ── Interaction Handler ───────────────────────────────────────
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  try {
    // ══════════════════ MENU ══════════════════
    if (commandName === 'menu') {
      const embed = new EmbedBuilder()
        .setTitle('📋 Danh sách lệnh')
        .setColor(0x5865F2)
        .setThumbnail(client.user.displayAvatarURL())
        .addFields(
          {
            name: '🤖 AI & Thông tin',
            value: [
              '`/ask [câu hỏi]` — Hỏi Groq AI (Llama 3.3 70B)',
              '`/weather [thành phố]` — Xem thời tiết',
              '`/userinfo [@user]` — Thông tin thành viên',
              '`/serverinfo` — Thông tin server',
              '`/ping` — Kiểm tra độ trễ',
            ].join('\n'),
          },
          {
            name: '🎵 Âm nhạc',
            value: [
              '`/play [bài hát]` — Thêm bài vào hàng đợi',
              '`/skip` — Bỏ qua bài hiện tại',
              '`/stop` — Dừng nhạc',
              '`/queue` — Xem hàng đợi',
            ].join('\n'),
          },
          {
            name: '🛡️ Quản lý (cần quyền)',
            value: [
              '`/kick [@user] [lý do]` — Kick thành viên',
              '`/ban [@user] [lý do]` — Ban thành viên',
              '`/mute [@user] [phút] [lý do]` — Mute thành viên',
              '`/unmute [@user]` — Unmute thành viên',
            ].join('\n'),
          }
        )
        .setFooter({ text: `Bot by ${interaction.guild?.name ?? 'Server'}`, iconURL: client.user.displayAvatarURL() })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // ══════════════════ PING ══════════════════
    if (commandName === 'ping') {
      const latency = Date.now() - interaction.createdTimestamp;
      const embed = new EmbedBuilder()
        .setTitle('🏓 Pong!')
        .setColor(0x57F287)
        .addFields(
          { name: '⏱️ Độ trễ Bot', value: `\`${latency}ms\``, inline: true },
          { name: '💓 API Latency', value: `\`${client.ws.ping}ms\``, inline: true }
        )
        .setTimestamp();
      return interaction.reply({ embeds: [embed] });
    }

    // ══════════════════ ASK (GROQ AI) ══════════════════
    if (commandName === 'ask') {
      await interaction.deferReply();
      const question = interaction.options.getString('cauhoi');

      if (!GROQ_KEY) {
        return interaction.editReply('❌ Chưa cấu hình `GROQ_API_KEY` trong biến môi trường!\nLấy key miễn phí tại: https://console.groq.com');
      }

      try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${GROQ_KEY}`
          },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [
              {
                role: 'system',
                content: 'Bạn là trợ lý AI thông minh tích hợp trong Discord bot. Trả lời ngắn gọn, rõ ràng bằng tiếng Việt. Nếu câu hỏi bằng tiếng Anh thì trả lời tiếng Anh.'
              },
              { role: 'user', content: question }
            ],
            max_tokens: 1024,
            temperature: 0.7,
          })
        });

        const data = await res.json();

        if (data.error) {
          return interaction.editReply(`❌ Lỗi Groq: ${data.error.message}`);
        }

        const answer = data?.choices?.[0]?.message?.content ?? 'Không nhận được phản hồi.';

        const shortAnswer = answer.length > 3900
          ? answer.substring(0, 3900) + '...\n*(Phản hồi quá dài, đã cắt bớt)*'
          : answer;

        const embed = new EmbedBuilder()
          .setTitle('🤖 Groq AI — Llama 3.3 70B')
          .setColor(0xF55036)
          .addFields(
            { name: '❓ Câu hỏi', value: `\`\`\`${question}\`\`\`` },
            { name: '💬 Trả lời', value: shortAnswer }
          )
          .setFooter({ text: `Hỏi bởi ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
          .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
      } catch (e) {
        console.error('Groq error:', e);
        return interaction.editReply('❌ Lỗi khi kết nối Groq API. Thử lại sau!');
      }
    }

    // ══════════════════ WEATHER ══════════════════
    if (commandName === 'weather') {
      await interaction.deferReply();
      const city = interaction.options.getString('city');

      try {
        let embed;

        if (WEATHER_KEY) {
          // Dùng OpenWeatherMap nếu có key
          const res = await fetch(
            `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${WEATHER_KEY}&units=metric&lang=vi`
          );
          const w = await res.json();

          if (w.cod !== 200) {
            return interaction.editReply(`❌ Không tìm thấy thành phố: **${city}**`);
          }

          const weatherEmojis = {
            Clear: '☀️', Clouds: '☁️', Rain: '🌧️', Drizzle: '🌦️',
            Thunderstorm: '⛈️', Snow: '❄️', Mist: '🌫️', Fog: '🌫️'
          };
          const icon = weatherEmojis[w.weather[0].main] ?? '🌡️';

          embed = new EmbedBuilder()
            .setTitle(`${icon} Thời tiết tại ${w.name}, ${w.sys.country}`)
            .setColor(0xFEA82F)
            .addFields(
              { name: '🌡️ Nhiệt độ', value: `${w.main.temp}°C (cảm giác ${w.main.feels_like}°C)`, inline: true },
              { name: '💧 Độ ẩm', value: `${w.main.humidity}%`, inline: true },
              { name: '💨 Gió', value: `${w.wind.speed} m/s`, inline: true },
              { name: '☁️ Trạng thái', value: `${w.weather[0].description}`, inline: true },
              { name: '👁️ Tầm nhìn', value: `${(w.visibility / 1000).toFixed(1)} km`, inline: true },
              { name: '🔆 UV / Mây', value: `${w.clouds.all}% mây`, inline: true },
            )
            .setThumbnail(`https://openweathermap.org/img/wn/${w.weather[0].icon}@2x.png`)
            .setFooter({ text: 'Dữ liệu từ OpenWeatherMap' })
            .setTimestamp();
        } else {
          // Fallback: wttr.in (không cần key)
          const res = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=j1`);
          const w = await res.json();
          const cur = w.current_condition[0];

          embed = new EmbedBuilder()
            .setTitle(`🌦️ Thời tiết tại ${city}`)
            .setColor(0xFEA82F)
            .addFields(
              { name: '🌡️ Nhiệt độ', value: `${cur.temp_C}°C (cảm giác ${cur.FeelsLikeC}°C)`, inline: true },
              { name: '💧 Độ ẩm', value: `${cur.humidity}%`, inline: true },
              { name: '💨 Gió', value: `${cur.windspeedKmph} km/h`, inline: true },
              { name: '☁️ Trạng thái', value: cur.weatherDesc[0].value, inline: true },
            )
            .setFooter({ text: 'Dữ liệu từ wttr.in (thêm WEATHER_API_KEY để dùng OpenWeatherMap)' })
            .setTimestamp();
        }

        return interaction.editReply({ embeds: [embed] });
      } catch (e) {
        console.error('Weather error:', e);
        return interaction.editReply('❌ Không thể lấy thời tiết. Kiểm tra tên thành phố!');
      }
    }

    // ══════════════════ USERINFO ══════════════════
    if (commandName === 'userinfo') {
      const target = interaction.options.getUser('user') ?? interaction.user;
      const member = interaction.guild
        ? await interaction.guild.members.fetch(target.id).catch(() => null)
        : null;

      const embed = new EmbedBuilder()
        .setTitle(`👤 Thông tin: ${target.tag}`)
        .setThumbnail(target.displayAvatarURL({ size: 256 }))
        .setColor(member?.displayColor || 0x5865F2)
        .addFields(
          { name: '🆔 User ID', value: target.id, inline: true },
          { name: '📅 Tạo tài khoản', value: `<t:${Math.floor(target.createdTimestamp / 1000)}:D>`, inline: true },
          { name: '🤖 Bot?', value: target.bot ? 'Có' : 'Không', inline: true },
        );

      if (member) {
        embed.addFields(
          { name: '📥 Tham gia server', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:D>`, inline: true },
          { name: '🎭 Biệt danh', value: member.nickname ?? 'Không có', inline: true },
          {
            name: `🏷️ Roles (${member.roles.cache.size - 1})`,
            value: member.roles.cache.filter(r => r.id !== interaction.guild.id)
              .map(r => r.toString()).join(', ') || 'Không có role',
          },
        );
      }

      embed.setTimestamp();
      return interaction.reply({ embeds: [embed] });
    }

    // ══════════════════ SERVERINFO ══════════════════
    if (commandName === 'serverinfo') {
      if (!interaction.guild) return interaction.reply('❌ Lệnh này chỉ dùng trong server!');

      const guild = interaction.guild;
      await guild.members.fetch();

      const totalMembers = guild.memberCount;
      const bots = guild.members.cache.filter(m => m.user.bot).size;
      const humans = totalMembers - bots;

      const embed = new EmbedBuilder()
        .setTitle(`🏠 ${guild.name}`)
        .setThumbnail(guild.iconURL({ size: 256 }))
        .setColor(0xEB459E)
        .addFields(
          { name: '🆔 Server ID', value: guild.id, inline: true },
          { name: '👑 Chủ server', value: `<@${guild.ownerId}>`, inline: true },
          { name: '📅 Ngày tạo', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`, inline: true },
          { name: '👥 Thành viên', value: `${humans} người · ${bots} bot`, inline: true },
          { name: '📢 Kênh', value: `${guild.channels.cache.size} kênh`, inline: true },
          { name: '🎭 Roles', value: `${guild.roles.cache.size}`, inline: true },
          { name: '😀 Emoji', value: `${guild.emojis.cache.size}`, inline: true },
          { name: '💎 Boost', value: `Level ${guild.premiumTier} · ${guild.premiumSubscriptionCount} boost`, inline: true },
          { name: '🔒 Xác minh', value: `Level ${guild.verificationLevel}`, inline: true },
        )
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // ══════════════════ KICK ══════════════════
    if (commandName === 'kick') {
      const target = interaction.options.getMember('user');
      const reason = interaction.options.getString('reason') ?? 'Không có lý do';

      if (!target) return interaction.reply({ content: '❌ Không tìm thấy thành viên!', ephemeral: true });
      if (!target.kickable) return interaction.reply({ content: '❌ Bot không thể kick thành viên này!', ephemeral: true });

      await target.kick(reason);

      const embed = new EmbedBuilder()
        .setTitle('👢 Đã Kick')
        .setColor(0xED4245)
        .addFields(
          { name: '🎯 Thành viên', value: `${target.user.tag}`, inline: true },
          { name: '👮 Mod', value: `${interaction.user.tag}`, inline: true },
          { name: '📝 Lý do', value: reason },
        )
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // ══════════════════ BAN ══════════════════
    if (commandName === 'ban') {
      const target = interaction.options.getMember('user');
      const reason = interaction.options.getString('reason') ?? 'Không có lý do';

      if (!target) return interaction.reply({ content: '❌ Không tìm thấy thành viên!', ephemeral: true });
      if (!target.bannable) return interaction.reply({ content: '❌ Bot không thể ban thành viên này!', ephemeral: true });

      await target.ban({ reason });

      const embed = new EmbedBuilder()
        .setTitle('🔨 Đã Ban')
        .setColor(0xED4245)
        .addFields(
          { name: '🎯 Thành viên', value: `${target.user.tag}`, inline: true },
          { name: '👮 Mod', value: `${interaction.user.tag}`, inline: true },
          { name: '📝 Lý do', value: reason },
        )
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // ══════════════════ MUTE ══════════════════
    if (commandName === 'mute') {
      const target = interaction.options.getMember('user');
      const minutes = interaction.options.getInteger('minutes') ?? 10;
      const reason = interaction.options.getString('reason') ?? 'Không có lý do';

      if (!target) return interaction.reply({ content: '❌ Không tìm thấy thành viên!', ephemeral: true });
      if (!target.moderatable) return interaction.reply({ content: '❌ Bot không thể mute thành viên này!', ephemeral: true });

      const duration = minutes * 60 * 1000;
      await target.timeout(duration, reason);

      const embed = new EmbedBuilder()
        .setTitle('🔇 Đã Mute')
        .setColor(0xFEE75C)
        .addFields(
          { name: '🎯 Thành viên', value: `${target.user.tag}`, inline: true },
          { name: '⏱️ Thời gian', value: `${minutes} phút`, inline: true },
          { name: '👮 Mod', value: `${interaction.user.tag}`, inline: true },
          { name: '📝 Lý do', value: reason },
        )
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // ══════════════════ UNMUTE ══════════════════
    if (commandName === 'unmute') {
      const target = interaction.options.getMember('user');

      if (!target) return interaction.reply({ content: '❌ Không tìm thấy thành viên!', ephemeral: true });

      await target.timeout(null);

      const embed = new EmbedBuilder()
        .setTitle('🔊 Đã Unmute')
        .setColor(0x57F287)
        .addFields(
          { name: '🎯 Thành viên', value: `${target.user.tag}`, inline: true },
          { name: '👮 Mod', value: `${interaction.user.tag}`, inline: true },
        )
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // ══════════════════ MUSIC: PLAY ══════════════════
    if (commandName === 'play') {
      await interaction.deferReply();
      const song = interaction.options.getString('song');
      const guildId = interaction.guildId;

      if (!musicQueues.has(guildId)) {
        musicQueues.set(guildId, { queue: [], playing: false });
      }

      const q = musicQueues.get(guildId);

      // Tìm link YouTube qua YouTube Search API (không cần key)
      let youtubeUrl = null;
      let title = song;
      let channel = '';
      let thumbnail = null;
      let duration = '';

      try {
        const searchQuery = encodeURIComponent(song);
        const searchRes = await fetch(
          `https://www.youtube.com/results?search_query=${searchQuery}`,
          { headers: { 'User-Agent': 'Mozilla/5.0' } }
        );
        const html = await searchRes.text();

        // Extract video ID từ HTML
        const match = html.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
        if (match) {
          const videoId = match[1];
          youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;

          // Lấy title
          const titleMatch = html.match(/"title":{"runs":\[{"text":"([^"]+)"}/);
          if (titleMatch) title = titleMatch[1];

          // Lấy channel
          const channelMatch = html.match(/"ownerText":{"runs":\[{"text":"([^"]+)"}/);
          if (channelMatch) channel = channelMatch[1];

          // Lấy duration
          const durMatch = html.match(/"lengthText":{"accessibility":{"accessibilityData":{"label":"[^"]+"},"simpleText":"([^"]+)"}/);
          if (durMatch) duration = durMatch[1];

          thumbnail = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
        }
      } catch (_) { /* fallback bên dưới */ }

      // Fallback: dùng link search trực tiếp
      if (!youtubeUrl) {
        youtubeUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(song)}`;
      }

      q.queue.push({ title, url: youtubeUrl, channel, thumbnail, duration });

      const pos = q.queue.length;
      const embed = new EmbedBuilder()
        .setTitle('🎵 Đã thêm vào hàng đợi')
        .setColor(0xFF0000)
        .setThumbnail(thumbnail)
        .addFields(
          { name: '🎶 Bài hát', value: `[${title}](${youtubeUrl})` },
          { name: '👤 Kênh', value: channel || 'Không rõ', inline: true },
          { name: '⏱️ Thời lượng', value: duration || 'Không rõ', inline: true },
          { name: '📍 Vị trí hàng đợi', value: `#${pos}`, inline: true },
        )
        .setDescription(`▶️ **[Nhấn vào đây để nghe trên YouTube](${youtubeUrl})**`)
        .setFooter({ text: `Thêm bởi ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }

    // ══════════════════ MUSIC: QUEUE ══════════════════
    if (commandName === 'queue') {
      const q = musicQueues.get(interaction.guildId);

      if (!q || q.queue.length === 0) {
        return interaction.reply('📭 Hàng đợi nhạc đang trống!');
      }

      const list = q.queue.slice(0, 10)
        .map((s, i) => {
          const entry = typeof s === 'object' ? s : { title: s, url: null };
          const label = entry.url ? `[${entry.title}](${entry.url})` : entry.title;
          const ch = entry.channel ? ` — ${entry.channel}` : '';
          const dur = entry.duration ? ` \`${entry.duration}\`` : '';
          return `**${i + 1}.** ${label}${ch}${dur}`;
        })
        .join('\n');

      const nowPlaying = q.queue[0];
      const npLabel = typeof nowPlaying === 'object' && nowPlaying.url
        ? `[${nowPlaying.title}](${nowPlaying.url})`
        : (typeof nowPlaying === 'object' ? nowPlaying.title : nowPlaying);

      const embed = new EmbedBuilder()
        .setTitle('📜 Hàng đợi nhạc')
        .setColor(0xFF0000)
        .setDescription(list)
        .addFields(
          { name: '▶️ Đang phát (bài #1)', value: npLabel }
        )
        .setFooter({ text: `Tổng: ${q.queue.length} bài${q.queue.length > 10 ? ' (chỉ hiện 10 bài đầu)' : ''}` })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // ══════════════════ MUSIC: SKIP ══════════════════
    if (commandName === 'skip') {
      const q = musicQueues.get(interaction.guildId);

      if (!q || q.queue.length === 0) {
        return interaction.reply('📭 Hàng đợi trống, không có gì để skip!');
      }

      const skipped = q.queue.shift();
      const skippedLabel = typeof skipped === 'object'
        ? (skipped.url ? `[${skipped.title}](${skipped.url})` : skipped.title)
        : skipped;
      const next = q.queue[0];
      const nextLabel = next
        ? (typeof next === 'object' ? (next.url ? `[${next.title}](${next.url})` : next.title) : next)
        : 'Hết hàng đợi';
      const embed = new EmbedBuilder()
        .setTitle('⏭️ Đã Skip')
        .setColor(0xFF0000)
        .addFields(
          { name: '⏭️ Bỏ qua', value: skippedLabel },
          { name: '🎵 Tiếp theo', value: nextLabel, inline: true },
          { name: '📊 Còn lại', value: `${q.queue.length} bài`, inline: true },
        )
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // ══════════════════ MUSIC: STOP ══════════════════
    if (commandName === 'stop') {
      musicQueues.delete(interaction.guildId);

      const embed = new EmbedBuilder()
        .setTitle('⏹️ Đã dừng nhạc')
        .setColor(0xED4245)
        .setDescription('Hàng đợi đã được xoá.')
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

  } catch (err) {
    console.error(`❌ Lỗi lệnh ${commandName}:`, err);
    const errMsg = '❌ Có lỗi xảy ra! Vui lòng thử lại sau.';
    if (interaction.deferred) {
      await interaction.editReply(errMsg).catch(() => {});
    } else {
      await interaction.reply({ content: errMsg, ephemeral: true }).catch(() => {});
    }
  }
});

// ── Login ─────────────────────────────────────────────────────
client.login(TOKEN);
