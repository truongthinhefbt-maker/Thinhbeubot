const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { COLORS, successEmbed, errorEmbed } = require('../utils/helpers');
const { addWarn, getWarns, clearWarns, removeWarn, getConfig, incrementStat } = require('../utils/database');

module.exports = {
  data: [
    new SlashCommandBuilder()
      .setName('kick').setDescription('👢 Kick thành viên')
      .addUserOption(o => o.setName('user').setDescription('Thành viên').setRequired(true))
      .addStringOption(o => o.setName('reason').setDescription('Lý do').setRequired(false))
      .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),

    new SlashCommandBuilder()
      .setName('ban').setDescription('🔨 Ban thành viên')
      .addUserOption(o => o.setName('user').setDescription('Thành viên').setRequired(true))
      .addStringOption(o => o.setName('reason').setDescription('Lý do').setRequired(false))
      .addIntegerOption(o => o.setName('days').setDescription('Xóa tin nhắn (ngày 0-7)').setMinValue(0).setMaxValue(7).setRequired(false))
      .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

    new SlashCommandBuilder()
      .setName('unban').setDescription('🔓 Unban thành viên')
      .addStringOption(o => o.setName('userid').setDescription('User ID cần unban').setRequired(true))
      .addStringOption(o => o.setName('reason').setDescription('Lý do').setRequired(false))
      .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

    new SlashCommandBuilder()
      .setName('mute').setDescription('🔇 Mute thành viên (timeout)')
      .addUserOption(o => o.setName('user').setDescription('Thành viên').setRequired(true))
      .addIntegerOption(o => o.setName('minutes').setDescription('Số phút (mặc định 10)').setMinValue(1).setMaxValue(40320).setRequired(false))
      .addStringOption(o => o.setName('reason').setDescription('Lý do').setRequired(false))
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    new SlashCommandBuilder()
      .setName('unmute').setDescription('🔊 Unmute thành viên')
      .addUserOption(o => o.setName('user').setDescription('Thành viên').setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    new SlashCommandBuilder()
      .setName('warn').setDescription('⚠️ Cảnh cáo thành viên')
      .addUserOption(o => o.setName('user').setDescription('Thành viên').setRequired(true))
      .addStringOption(o => o.setName('reason').setDescription('Lý do').setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    new SlashCommandBuilder()
      .setName('warns').setDescription('📋 Xem lịch sử cảnh cáo')
      .addUserOption(o => o.setName('user').setDescription('Thành viên (bỏ trống = bản thân)').setRequired(false)),

    new SlashCommandBuilder()
      .setName('clearwarns').setDescription('🗑️ Xóa toàn bộ cảnh cáo')
      .addUserOption(o => o.setName('user').setDescription('Thành viên').setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    new SlashCommandBuilder()
      .setName('removewarn').setDescription('❌ Xóa một cảnh cáo cụ thể')
      .addUserOption(o => o.setName('user').setDescription('Thành viên').setRequired(true))
      .addStringOption(o => o.setName('warnid').setDescription('ID cảnh cáo (xem từ /warns)').setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    new SlashCommandBuilder()
      .setName('purge').setDescription('🗑️ Xóa nhiều tin nhắn cùng lúc')
      .addIntegerOption(o => o.setName('amount').setDescription('Số tin nhắn (1-100)').setMinValue(1).setMaxValue(100).setRequired(true))
      .addUserOption(o => o.setName('user').setDescription('Chỉ xóa tin nhắn của user này').setRequired(false))
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    new SlashCommandBuilder()
      .setName('slowmode').setDescription('⏱️ Đặt chế độ slowmode cho kênh')
      .addIntegerOption(o => o.setName('seconds').setDescription('Giây (0 = tắt, tối đa 21600)').setMinValue(0).setMaxValue(21600).setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    new SlashCommandBuilder()
      .setName('lock').setDescription('🔒 Khóa kênh hiện tại')
      .addStringOption(o => o.setName('reason').setDescription('Lý do').setRequired(false))
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    new SlashCommandBuilder()
      .setName('unlock').setDescription('🔓 Mở khóa kênh hiện tại')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    new SlashCommandBuilder()
      .setName('modlog').setDescription('📜 Xem log hành động mod gần nhất')
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  ],

  async execute(interaction) {
    const cmd = interaction.commandName;
    incrementStat(`cmd_${cmd}`);

    // ── /kick ─────────────────────────────────────────────────
    if (cmd === 'kick') {
      const target = interaction.options.getMember('user');
      const reason = interaction.options.getString('reason') ?? 'Không có lý do';
      if (!target) return interaction.reply({ embeds: [errorEmbed('Lỗi', 'Không tìm thấy thành viên!')], ephemeral: true });
      if (!target.kickable) return interaction.reply({ embeds: [errorEmbed('Lỗi', 'Bot không thể kick thành viên này!')], ephemeral: true });
      if (target.id === interaction.user.id) return interaction.reply({ embeds: [errorEmbed('Lỗi', 'Không thể tự kick bản thân!')], ephemeral: true });

      await sendDM(target.user, `👢 Bạn đã bị **kick** khỏi **${interaction.guild.name}**\n📝 Lý do: ${reason}`).catch(() => {});
      await target.kick(reason);
      await logAction(interaction, 'KICK', target.user, reason);

      return interaction.reply({ embeds: [modEmbed('👢 Đã Kick', target.user, interaction.user, reason, COLORS.danger)] });
    }

    // ── /ban ──────────────────────────────────────────────────
    if (cmd === 'ban') {
      const target = interaction.options.getMember('user');
      const reason = interaction.options.getString('reason') ?? 'Không có lý do';
      const days   = interaction.options.getInteger('days') ?? 0;
      if (!target) return interaction.reply({ embeds: [errorEmbed('Lỗi', 'Không tìm thấy thành viên!')], ephemeral: true });
      if (!target.bannable) return interaction.reply({ embeds: [errorEmbed('Lỗi', 'Bot không thể ban thành viên này!')], ephemeral: true });

      await sendDM(target.user, `🔨 Bạn đã bị **ban** khỏi **${interaction.guild.name}**\n📝 Lý do: ${reason}`).catch(() => {});
      await target.ban({ reason, deleteMessageDays: days });
      await logAction(interaction, 'BAN', target.user, reason);

      return interaction.reply({ embeds: [modEmbed('🔨 Đã Ban', target.user, interaction.user, reason, COLORS.danger)] });
    }

    // ── /unban ────────────────────────────────────────────────
    if (cmd === 'unban') {
      await interaction.deferReply();
      const userId = interaction.options.getString('userid');
      const reason = interaction.options.getString('reason') ?? 'Không có lý do';
      try {
        const banned = await interaction.guild.bans.fetch(userId);
        await interaction.guild.members.unban(userId, reason);
        await logAction(interaction, 'UNBAN', banned.user, reason);
        return interaction.editReply({ embeds: [modEmbed('🔓 Đã Unban', banned.user, interaction.user, reason, COLORS.success)] });
      } catch {
        return interaction.editReply({ embeds: [errorEmbed('Lỗi', `Không tìm thấy user bị ban với ID: \`${userId}\``)] });
      }
    }

    // ── /mute ─────────────────────────────────────────────────
    if (cmd === 'mute') {
      const target  = interaction.options.getMember('user');
      const minutes = interaction.options.getInteger('minutes') ?? 10;
      const reason  = interaction.options.getString('reason') ?? 'Không có lý do';
      if (!target) return interaction.reply({ embeds: [errorEmbed('Lỗi', 'Không tìm thấy thành viên!')], ephemeral: true });
      if (!target.moderatable) return interaction.reply({ embeds: [errorEmbed('Lỗi', 'Bot không thể mute thành viên này!')], ephemeral: true });

      await target.timeout(minutes * 60 * 1000, reason);
      await logAction(interaction, 'MUTE', target.user, `${reason} (${minutes} phút)`);

      const embed = modEmbed('🔇 Đã Mute', target.user, interaction.user, reason, COLORS.warning);
      embed.addFields({ name: '⏱️ Thời gian', value: `${minutes} phút`, inline: true });
      return interaction.reply({ embeds: [embed] });
    }

    // ── /unmute ───────────────────────────────────────────────
    if (cmd === 'unmute') {
      const target = interaction.options.getMember('user');
      if (!target) return interaction.reply({ embeds: [errorEmbed('Lỗi', 'Không tìm thấy thành viên!')], ephemeral: true });
      await target.timeout(null);
      await logAction(interaction, 'UNMUTE', target.user, '-');
      return interaction.reply({ embeds: [modEmbed('🔊 Đã Unmute', target.user, interaction.user, '-', COLORS.success)] });
    }

    // ── /warn ─────────────────────────────────────────────────
    if (cmd === 'warn') {
      const target = interaction.options.getMember('user');
      const reason = interaction.options.getString('reason');
      if (!target) return interaction.reply({ embeds: [errorEmbed('Lỗi', 'Không tìm thấy thành viên!')], ephemeral: true });

      const warns = addWarn(interaction.guildId, target.id, reason, interaction.user.id);
      await sendDM(target.user, `⚠️ Bạn đã nhận **cảnh cáo #${warns.length}** tại **${interaction.guild.name}**\n📝 Lý do: ${reason}`).catch(() => {});
      await logAction(interaction, 'WARN', target.user, reason);

      const embed = modEmbed('⚠️ Đã Cảnh cáo', target.user, interaction.user, reason, COLORS.warning);
      embed.addFields({ name: '📊 Tổng cảnh cáo', value: `${warns.length}`, inline: true });
      return interaction.reply({ embeds: [embed] });
    }

    // ── /warns ────────────────────────────────────────────────
    if (cmd === 'warns') {
      const target = interaction.options.getUser('user') ?? interaction.user;
      const warns  = getWarns(interaction.guildId, target.id);

      const embed = new EmbedBuilder()
        .setTitle(`📋 Cảnh cáo — ${target.tag}`)
        .setColor(warns.length === 0 ? COLORS.success : COLORS.warning)
        .setThumbnail(target.displayAvatarURL())
        .setTimestamp();

      if (warns.length === 0) {
        embed.setDescription('✅ Không có cảnh cáo nào!');
      } else {
        embed.setDescription(warns.slice(-10).map((w, i) =>
          `**#${i + 1}** \`ID: ${w.id}\`\n📝 ${w.reason}\n👮 <@${w.modId}> | 📅 <t:${Math.floor(new Date(w.date).getTime() / 1000)}:d>`
        ).join('\n\n'));
        embed.addFields({ name: '📊 Tổng cộng', value: `${warns.length} cảnh cáo`, inline: true });
      }

      return interaction.reply({ embeds: [embed] });
    }

    // ── /clearwarns ───────────────────────────────────────────
    if (cmd === 'clearwarns') {
      const target = interaction.options.getUser('user');
      clearWarns(interaction.guildId, target.id);
      return interaction.reply({ embeds: [successEmbed('Đã xóa', `Xóa toàn bộ cảnh cáo của ${target.tag}`)] });
    }

    // ── /removewarn ───────────────────────────────────────────
    if (cmd === 'removewarn') {
      const target = interaction.options.getUser('user');
      const warnId = interaction.options.getString('warnid');
      const removed = removeWarn(interaction.guildId, target.id, warnId);
      if (!removed) return interaction.reply({ embeds: [errorEmbed('Lỗi', `Không tìm thấy cảnh cáo ID: \`${warnId}\``)] });
      return interaction.reply({ embeds: [successEmbed('Đã xóa', `Xóa cảnh cáo \`${warnId}\` của ${target.tag}`)] });
    }

    // ── /purge ────────────────────────────────────────────────
    if (cmd === 'purge') {
      const amount = interaction.options.getInteger('amount');
      const user   = interaction.options.getUser('user');
      await interaction.deferReply({ ephemeral: true });

      let messages = await interaction.channel.messages.fetch({ limit: 100 });
      // Lọc theo user nếu có
      if (user) messages = messages.filter(m => m.author.id === user.id);
      // Chỉ lấy tin nhắn < 14 ngày (giới hạn Discord)
      messages = messages.filter(m => Date.now() - m.createdTimestamp < 14 * 24 * 60 * 60 * 1000);
      messages = [...messages.values()].slice(0, amount);

      if (messages.length === 0) return interaction.editReply({ embeds: [errorEmbed('Lỗi', 'Không có tin nhắn nào để xóa!')] });

      const deleted = await interaction.channel.bulkDelete(messages, true);
      return interaction.editReply({ embeds: [successEmbed('Đã xóa', `Xóa **${deleted.size}** tin nhắn${user ? ` của ${user.tag}` : ''}`)] });
    }

    // ── /slowmode ─────────────────────────────────────────────
    if (cmd === 'slowmode') {
      const seconds = interaction.options.getInteger('seconds');
      await interaction.channel.setRateLimitPerUser(seconds);
      const msg = seconds === 0 ? 'Đã tắt slowmode' : `Slowmode đặt thành **${seconds} giây**`;
      return interaction.reply({ embeds: [successEmbed('Slowmode', msg)] });
    }

    // ── /lock ─────────────────────────────────────────────────
    if (cmd === 'lock') {
      const reason = interaction.options.getString('reason') ?? 'Không có lý do';
      await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
        SendMessages: false
      });
      return interaction.reply({ embeds: [
        new EmbedBuilder()
          .setTitle('🔒 Kênh đã bị khóa')
          .setDescription(`📝 Lý do: ${reason}\n👮 Bởi: ${interaction.user.tag}`)
          .setColor(COLORS.danger)
          .setTimestamp()
      ]});
    }

    // ── /unlock ───────────────────────────────────────────────
    if (cmd === 'unlock') {
      await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
        SendMessages: null
      });
      return interaction.reply({ embeds: [
        new EmbedBuilder()
          .setTitle('🔓 Kênh đã được mở khóa')
          .setDescription(`👮 Bởi: ${interaction.user.tag}`)
          .setColor(COLORS.success)
          .setTimestamp()
      ]});
    }

    // ── /modlog ───────────────────────────────────────────────
    if (cmd === 'modlog') {
      const { load } = require('../utils/database');
      const logs = load('modlogs')[interaction.guildId] ?? [];
      const recent = logs.slice(-10).reverse();

      const embed = new EmbedBuilder()
        .setTitle('📜 Log Mod gần nhất')
        .setColor(COLORS.primary)
        .setDescription(recent.length === 0 ? 'Chưa có hành động nào.' :
          recent.map(l =>
            `**${l.action}** | <@${l.targetId}>\n👮 <@${l.modId}> | 📝 ${l.reason} | <t:${Math.floor(new Date(l.date).getTime() / 1000)}:R>`
          ).join('\n\n'))
        .setTimestamp();
      return interaction.reply({ embeds: [embed] });
    }
  }
};

// ── Helpers nội bộ ────────────────────────────────────────────
function modEmbed(title, targetUser, modUser, reason, color) {
  return new EmbedBuilder()
    .setTitle(title)
    .setColor(color)
    .setThumbnail(targetUser.displayAvatarURL())
    .addFields(
      { name: '🎯 Thành viên', value: `${targetUser.tag}\n\`${targetUser.id}\``, inline: true },
      { name: '👮 Mod', value: `${modUser.tag}`, inline: true },
      { name: '📝 Lý do', value: reason },
    )
    .setTimestamp();
}

async function sendDM(user, message) {
  const dm = await user.createDM();
  await dm.send(message);
}

async function logAction(interaction, action, targetUser, reason) {
  const { load, save } = require('../utils/database');
  const db = load('modlogs');
  if (!db[interaction.guildId]) db[interaction.guildId] = [];
  db[interaction.guildId].push({
    action, targetId: targetUser.id, modId: interaction.user.id,
    reason, date: new Date().toISOString()
  });
  // Giữ tối đa 200 log
  if (db[interaction.guildId].length > 200) db[interaction.guildId] = db[interaction.guildId].slice(-200);
  save('modlogs', db);
}
