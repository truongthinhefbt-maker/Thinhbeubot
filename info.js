const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fetch = require('node-fetch');
const { COLORS, infoEmbed, errorEmbed, getStats } = require('../utils/helpers');
const { getStats: dbStats, incrementStat } = require('../utils/database');

module.exports = {
  data: [
    new SlashCommandBuilder().setName('ping').setDescription('🏓 Kiểm tra độ trễ bot'),

    new SlashCommandBuilder()
      .setName('userinfo')
      .setDescription('👤 Xem thông tin thành viên')
      .addUserOption(o => o.setName('user').setDescription('Thành viên (bỏ trống = bản thân)').setRequired(false)),

    new SlashCommandBuilder().setName('serverinfo').setDescription('🏠 Xem thông tin server'),

    new SlashCommandBuilder()
      .setName('avatar')
      .setDescription('🖼️ Xem avatar thành viên')
      .addUserOption(o => o.setName('user').setDescription('Thành viên').setRequired(false)),

    new SlashCommandBuilder()
      .setName('weather')
      .setDescription('🌦️ Xem thời tiết')
      .addStringOption(o => o.setName('city').setDescription('Tên thành phố').setRequired(true)),

    new SlashCommandBuilder()
      .setName('crypto')
      .setDescription('💹 Xem giá tiền mã hóa')
      .addStringOption(o => o.setName('coin').setDescription('Tên coin (VD: bitcoin, ethereum, solana)').setRequired(true)),

    new SlashCommandBuilder()
      .setName('calc')
      .setDescription('🧮 Tính toán biểu thức')
      .addStringOption(o => o.setName('expr').setDescription('Biểu thức (VD: 2+2, sqrt(16), 5^3)').setRequired(true)),

    new SlashCommandBuilder()
      .setName('ipinfo')
      .setDescription('🌐 Tra cứu thông tin IP/domain')
      .addStringOption(o => o.setName('ip').setDescription('Địa chỉ IP hoặc domain').setRequired(true)),

    new SlashCommandBuilder()
      .setName('botstats')
      .setDescription('📊 Thống kê bot (uptime, lệnh đã dùng)'),

    new SlashCommandBuilder()
      .setName('currency')
      .setDescription('💱 Xem tỷ giá tiền tệ')
      .addStringOption(o => o.setName('from').setDescription('Từ tiền tệ (VD: USD)').setRequired(true))
      .addStringOption(o => o.setName('to').setDescription('Sang tiền tệ (VD: VND)').setRequired(true))
      .addNumberOption(o => o.setName('amount').setDescription('Số tiền (mặc định 1)').setRequired(false)),
  ],

  async execute(interaction, client) {
    const cmd = interaction.commandName;
    incrementStat(`cmd_${cmd}`);

    // ── /ping ─────────────────────────────────────────────────
    if (cmd === 'ping') {
      const latency = Date.now() - interaction.createdTimestamp;
      const embed = new EmbedBuilder()
        .setTitle('🏓 Pong!')
        .setColor(latency < 100 ? COLORS.success : latency < 300 ? COLORS.warning : COLORS.danger)
        .addFields(
          { name: '⏱️ Độ trễ Bot', value: `\`${latency}ms\``, inline: true },
          { name: '💓 API Latency', value: `\`${client.ws.ping}ms\``, inline: true },
          { name: '📡 Status', value: latency < 200 ? '🟢 Tốt' : '🟡 Trung bình', inline: true }
        )
        .setTimestamp();
      return interaction.reply({ embeds: [embed] });
    }

    // ── /userinfo ─────────────────────────────────────────────
    if (cmd === 'userinfo') {
      const target = interaction.options.getUser('user') ?? interaction.user;
      const member = interaction.guild
        ? await interaction.guild.members.fetch(target.id).catch(() => null)
        : null;

      const flags = target.flags?.toArray() ?? [];
      const badges = {
        ActiveDeveloper: '👨‍💻', Staff: '🛡️', Partner: '🤝',
        HypeSquadOnlineHouse1: '🏠', HypeSquadOnlineHouse2: '🏡', HypeSquadOnlineHouse3: '🏘️',
        PremiumEarlySupporter: '⭐', BugHunterLevel1: '🐛', BugHunterLevel2: '🐛🐛',
        VerifiedBotDeveloper: '✅'
      };
      const userBadges = flags.map(f => badges[f]).filter(Boolean).join(' ') || 'Không có';

      const embed = new EmbedBuilder()
        .setTitle(`👤 ${target.tag}`)
        .setThumbnail(target.displayAvatarURL({ size: 256, dynamic: true }))
        .setColor(member?.displayColor || COLORS.primary)
        .addFields(
          { name: '🆔 User ID', value: `\`${target.id}\``, inline: true },
          { name: '🤖 Bot?', value: target.bot ? '✅ Có' : '❌ Không', inline: true },
          { name: '🏅 Badges', value: userBadges, inline: true },
          { name: '📅 Tạo tài khoản', value: `<t:${Math.floor(target.createdTimestamp / 1000)}:D>\n(<t:${Math.floor(target.createdTimestamp / 1000)}:R>)`, inline: true },
        );

      if (member) {
        embed.addFields(
          { name: '📥 Tham gia server', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:D>\n(<t:${Math.floor(member.joinedTimestamp / 1000)}:R>)`, inline: true },
          { name: '🎭 Biệt danh', value: member.nickname ?? 'Không có', inline: true },
          {
            name: `🏷️ Roles (${member.roles.cache.size - 1})`,
            value: member.roles.cache.size > 1
              ? member.roles.cache.filter(r => r.id !== interaction.guild.id).map(r => r.toString()).slice(0, 10).join(' ')
              : 'Không có role',
          },
          { name: '🔝 Role cao nhất', value: member.roles.highest.toString(), inline: true },
          { name: '⏰ Boost từ', value: member.premiumSince ? `<t:${Math.floor(member.premiumSinceTimestamp / 1000)}:D>` : 'Chưa boost', inline: true }
        );
      }

      embed.setTimestamp();
      return interaction.reply({ embeds: [embed] });
    }

    // ── /serverinfo ───────────────────────────────────────────
    if (cmd === 'serverinfo') {
      if (!interaction.guild) return interaction.reply({ content: '❌ Chỉ dùng trong server!', ephemeral: true });
      const guild = interaction.guild;
      await guild.members.fetch().catch(() => {});

      const bots   = guild.members.cache.filter(m => m.user.bot).size;
      const humans = guild.memberCount - bots;
      const online = guild.members.cache.filter(m => m.presence?.status !== 'offline' && !m.user.bot).size;

      const verificationLevels = ['Không', 'Thấp', 'Trung bình', 'Cao', 'Rất cao'];
      const boostLevels = ['Không có', 'Level 1', 'Level 2', 'Level 3'];

      const embed = new EmbedBuilder()
        .setTitle(`🏠 ${guild.name}`)
        .setThumbnail(guild.iconURL({ size: 256, dynamic: true }))
        .setColor(COLORS.pink)
        .addFields(
          { name: '🆔 Server ID', value: `\`${guild.id}\``, inline: true },
          { name: '👑 Chủ server', value: `<@${guild.ownerId}>`, inline: true },
          { name: '📅 Ngày tạo', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`, inline: true },
          { name: '👥 Thành viên', value: `👤 ${humans} người\n🤖 ${bots} bot\n🟢 ${online} online`, inline: true },
          { name: '📢 Kênh', value: `📝 ${guild.channels.cache.filter(c => c.type === 0).size} text\n🔊 ${guild.channels.cache.filter(c => c.type === 2).size} voice`, inline: true },
          { name: '🎭 Roles', value: `${guild.roles.cache.size}`, inline: true },
          { name: '😀 Emoji', value: `${guild.emojis.cache.size}`, inline: true },
          { name: '💎 Boost', value: `${boostLevels[guild.premiumTier] ?? 'Không'}\n${guild.premiumSubscriptionCount} boosts`, inline: true },
          { name: '🔒 Xác minh', value: verificationLevels[guild.verificationLevel] ?? 'Không rõ', inline: true },
          { name: '🌐 Khu vực', value: guild.preferredLocale, inline: true },
        )
        .setTimestamp();

      if (guild.bannerURL()) embed.setImage(guild.bannerURL({ size: 1024 }));
      return interaction.reply({ embeds: [embed] });
    }

    // ── /avatar ───────────────────────────────────────────────
    if (cmd === 'avatar') {
      const target = interaction.options.getUser('user') ?? interaction.user;
      const member = interaction.guild?.members.cache.get(target.id);

      const embed = new EmbedBuilder()
        .setTitle(`🖼️ Avatar — ${target.tag}`)
        .setColor(COLORS.primary)
        .setImage(target.displayAvatarURL({ size: 1024, dynamic: true }))
        .addFields(
          { name: '🔗 Link PNG', value: `[Nhấn vào đây](${target.displayAvatarURL({ size: 1024, format: 'png' })})`, inline: true },
          { name: '🔗 Link GIF', value: target.avatar?.startsWith('a_')
            ? `[Nhấn vào đây](${target.displayAvatarURL({ size: 1024, dynamic: true })})`
            : 'Không có GIF', inline: true }
        )
        .setTimestamp();

      if (member?.avatar) {
        embed.addFields({ name: '🖼️ Avatar server', value: `[Xem](${member.displayAvatarURL({ size: 1024, dynamic: true })})`, inline: true });
      }

      return interaction.reply({ embeds: [embed] });
    }

    // ── /weather ──────────────────────────────────────────────
    if (cmd === 'weather') {
      await interaction.deferReply();
      const city = interaction.options.getString('city');
      const WEATHER_KEY = process.env.WEATHER_API_KEY;

      try {
        let embed;
        if (WEATHER_KEY) {
          const res = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${WEATHER_KEY}&units=metric&lang=vi`);
          const w = await res.json();
          if (w.cod !== 200) return interaction.editReply({ embeds: [errorEmbed('Không tìm thấy', `Thành phố **${city}** không tồn tại!`)] });

          const icons = { Clear: '☀️', Clouds: '☁️', Rain: '🌧️', Drizzle: '🌦️', Thunderstorm: '⛈️', Snow: '❄️', Mist: '🌫️', Fog: '🌫️' };
          const icon = icons[w.weather[0].main] ?? '🌡️';
          embed = new EmbedBuilder()
            .setTitle(`${icon} Thời tiết tại ${w.name}, ${w.sys.country}`)
            .setColor(COLORS.info)
            .setThumbnail(`https://openweathermap.org/img/wn/${w.weather[0].icon}@2x.png`)
            .addFields(
              { name: '🌡️ Nhiệt độ', value: `${w.main.temp}°C (cảm giác ${w.main.feels_like}°C)`, inline: true },
              { name: '💧 Độ ẩm', value: `${w.main.humidity}%`, inline: true },
              { name: '💨 Gió', value: `${w.wind.speed} m/s`, inline: true },
              { name: '☁️ Trạng thái', value: w.weather[0].description, inline: true },
              { name: '👁️ Tầm nhìn', value: `${(w.visibility / 1000).toFixed(1)} km`, inline: true },
              { name: '🔆 Mây', value: `${w.clouds.all}%`, inline: true },
              { name: '🌅 Bình minh', value: `<t:${w.sys.sunrise}:t>`, inline: true },
              { name: '🌇 Hoàng hôn', value: `<t:${w.sys.sunset}:t>`, inline: true },
            )
            .setFooter({ text: 'Nguồn: OpenWeatherMap' })
            .setTimestamp();
        } else {
          const res = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=j1`);
          const w = await res.json();
          const cur = w.current_condition[0];
          embed = new EmbedBuilder()
            .setTitle(`🌦️ Thời tiết tại ${city}`)
            .setColor(COLORS.info)
            .addFields(
              { name: '🌡️ Nhiệt độ', value: `${cur.temp_C}°C (cảm giác ${cur.FeelsLikeC}°C)`, inline: true },
              { name: '💧 Độ ẩm', value: `${cur.humidity}%`, inline: true },
              { name: '💨 Gió', value: `${cur.windspeedKmph} km/h`, inline: true },
              { name: '☁️ Trạng thái', value: cur.weatherDesc[0].value, inline: true },
            )
            .setFooter({ text: 'Nguồn: wttr.in' })
            .setTimestamp();
        }
        return interaction.editReply({ embeds: [embed] });
      } catch (e) {
        return interaction.editReply({ embeds: [errorEmbed('Lỗi', 'Không thể lấy thời tiết!')] });
      }
    }

    // ── /crypto ───────────────────────────────────────────────
    if (cmd === 'crypto') {
      await interaction.deferReply();
      const coin = interaction.options.getString('coin').toLowerCase();
      try {
        const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${coin}&vs_currencies=usd,vnd&include_24hr_change=true&include_market_cap=true`);
        const data = await res.json();
        if (!data[coin]) return interaction.editReply({ embeds: [errorEmbed('Không tìm thấy', `Coin **${coin}** không tồn tại! Thử: bitcoin, ethereum, solana`)] });

        const c = data[coin];
        const change = c.usd_24h_change?.toFixed(2) ?? 'N/A';
        const changeEmoji = parseFloat(change) >= 0 ? '📈' : '📉';

        const embed = new EmbedBuilder()
          .setTitle(`💹 ${coin.toUpperCase()} — Giá crypto`)
          .setColor(parseFloat(change) >= 0 ? COLORS.success : COLORS.danger)
          .addFields(
            { name: '💵 Giá USD', value: `$${c.usd?.toLocaleString() ?? 'N/A'}`, inline: true },
            { name: '🇻🇳 Giá VND', value: `₫${c.vnd?.toLocaleString() ?? 'N/A'}`, inline: true },
            { name: `${changeEmoji} 24h`, value: `${change}%`, inline: true },
            { name: '💰 Market Cap', value: `$${(c.usd_market_cap / 1e9).toFixed(2)}B`, inline: true },
          )
          .setFooter({ text: 'Nguồn: CoinGecko' })
          .setTimestamp();
        return interaction.editReply({ embeds: [embed] });
      } catch (e) {
        return interaction.editReply({ embeds: [errorEmbed('Lỗi', 'Không thể lấy giá coin!')] });
      }
    }

    // ── /calc ─────────────────────────────────────────────────
    if (cmd === 'calc') {
      const expr = interaction.options.getString('expr');
      try {
        // Safe eval chỉ cho phép toán học
        const safe = expr.replace(/[^0-9+\-*/().,^sqrt\s]/g, '');
        const processed = safe
          .replace(/\^/g, '**')
          .replace(/sqrt\(([^)]+)\)/g, (_, n) => `Math.sqrt(${n})`);

        // eslint-disable-next-line no-new-func
        const result = Function(`"use strict"; return (${processed})`)();

        const embed = new EmbedBuilder()
          .setTitle('🧮 Máy tính')
          .setColor(COLORS.primary)
          .addFields(
            { name: '📝 Biểu thức', value: `\`${expr}\``, inline: true },
            { name: '✅ Kết quả', value: `\`${result}\``, inline: true },
          )
          .setTimestamp();
        return interaction.reply({ embeds: [embed] });
      } catch {
        return interaction.reply({ embeds: [errorEmbed('Lỗi tính toán', `Biểu thức không hợp lệ: \`${expr}\``)] });
      }
    }

    // ── /ipinfo ───────────────────────────────────────────────
    if (cmd === 'ipinfo') {
      await interaction.deferReply();
      const ip = interaction.options.getString('ip');
      try {
        const res = await fetch(`https://ipapi.co/${ip}/json/`);
        const data = await res.json();
        if (data.error) return interaction.editReply({ embeds: [errorEmbed('Không tìm thấy', `IP/domain **${ip}** không hợp lệ!`)] });

        const embed = new EmbedBuilder()
          .setTitle(`🌐 Thông tin IP: ${ip}`)
          .setColor(COLORS.purple)
          .addFields(
            { name: '📍 IP', value: data.ip ?? 'N/A', inline: true },
            { name: '🌍 Quốc gia', value: `${data.country_name ?? 'N/A'} ${data.country ?? ''}`, inline: true },
            { name: '🏙️ Thành phố', value: data.city ?? 'N/A', inline: true },
            { name: '📡 ISP', value: data.org ?? 'N/A', inline: true },
            { name: '🕐 Timezone', value: data.timezone ?? 'N/A', inline: true },
            { name: '💱 Tiền tệ', value: data.currency ?? 'N/A', inline: true },
          )
          .setFooter({ text: 'Nguồn: ipapi.co' })
          .setTimestamp();
        return interaction.editReply({ embeds: [embed] });
      } catch (e) {
        return interaction.editReply({ embeds: [errorEmbed('Lỗi', 'Không thể tra cứu IP!')] });
      }
    }

    // ── /botstats ─────────────────────────────────────────────
    if (cmd === 'botstats') {
      const stats = dbStats();
      const uptime = process.uptime();
      const h = Math.floor(uptime / 3600);
      const m = Math.floor((uptime % 3600) / 60);
      const s = Math.floor(uptime % 60);

      const totalCmds = Object.entries(stats)
        .filter(([k]) => k.startsWith('cmd_'))
        .reduce((sum, [, v]) => sum + v, 0);

      const embed = new EmbedBuilder()
        .setTitle('📊 Thống kê Bot')
        .setColor(COLORS.primary)
        .setThumbnail(client.user.displayAvatarURL())
        .addFields(
          { name: '⏱️ Uptime', value: `${h}h ${m}p ${s}s`, inline: true },
          { name: '📡 Ping', value: `${client.ws.ping}ms`, inline: true },
          { name: '🏠 Số server', value: `${client.guilds.cache.size}`, inline: true },
          { name: '👥 Tổng thành viên', value: `${client.guilds.cache.reduce((a, g) => a + g.memberCount, 0)}`, inline: true },
          { name: '📝 Tổng lệnh đã dùng', value: `${totalCmds}`, inline: true },
          { name: '🤖 Node.js', value: process.version, inline: true },
        )
        .setTimestamp();
      return interaction.reply({ embeds: [embed] });
    }

    // ── /currency ─────────────────────────────────────────────
    if (cmd === 'currency') {
      await interaction.deferReply();
      const from   = interaction.options.getString('from').toUpperCase();
      const to     = interaction.options.getString('to').toUpperCase();
      const amount = interaction.options.getNumber('amount') ?? 1;

      try {
        const res = await fetch(`https://api.frankfurter.app/latest?from=${from}&to=${to}`);
        const data = await res.json();
        if (!data.rates?.[to]) return interaction.editReply({ embeds: [errorEmbed('Không tìm thấy', `Không hỗ trợ cặp ${from}/${to}!`)] });

        const rate   = data.rates[to];
        const result = (amount * rate).toFixed(4);

        const embed = new EmbedBuilder()
          .setTitle('💱 Tỷ giá tiền tệ')
          .setColor(COLORS.success)
          .addFields(
            { name: '💵 Từ', value: `${amount} **${from}**`, inline: true },
            { name: '💴 Sang', value: `${result} **${to}**`, inline: true },
            { name: '📈 Tỷ giá', value: `1 ${from} = ${rate} ${to}`, inline: true },
          )
          .setFooter({ text: 'Nguồn: Frankfurter API' })
          .setTimestamp();
        return interaction.editReply({ embeds: [embed] });
      } catch (e) {
        return interaction.editReply({ embeds: [errorEmbed('Lỗi', 'Không thể lấy tỷ giá!')] });
      }
    }
  }
};
