const { 
  Client, 
  GatewayIntentBits, 
  PermissionsBitField, 
  EmbedBuilder 
} = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

const prefix = "?";

client.on("ready", () => {
  console.log(`Bot đã online: ${client.user.tag}`);
});

// ================= MESSAGE =================
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  // ================= MENU =================
  if (command === "menu") {
    const embed = new EmbedBuilder()
      .setTitle("🤖 MENU BOT")
      .setColor("Blue")
      .setDescription("Danh sách lệnh của bot")
      .addFields(
        { name: "⚙️ Quản lý", value: "`?kick @user`\n`?ban @user`\n`?rename @user tên`\n`?addrole @user @role`" },
        { name: "🤖 AI", value: "`?ask câu hỏi`" },
        { name: "📌 Khác", value: "`?help`" }
      )
      .setFooter({ text: "Bot by bạn 😎" });

    return message.reply({ embeds: [embed] });
  }

  // ================= HELP =================
  if (command === "help") {
    return message.reply("👉 Dùng `?menu` để xem đầy đủ lệnh");
  }

  // ================= KICK =================
  if (command === "kick") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.KickMembers))
      return message.reply("❌ Không có quyền");

    const user = message.mentions.members.first();
    if (!user) return message.reply("❌ Tag người cần kick");

    await user.kick();
    message.reply(`✅ Đã kick ${user.user.tag}`);
  }

  // ================= BAN =================
  if (command === "ban") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers))
      return message.reply("❌ Không có quyền");

    const user = message.mentions.members.first();
    if (!user) return message.reply("❌ Tag người cần ban");

    await user.ban();
    message.reply(`🚫 Đã ban ${user.user.tag}`);
  }

  // ================= RENAME =================
  if (command === "rename") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageNicknames))
      return message.reply("❌ Không có quyền");

    const user = message.mentions.members.first();
    const newName = args.slice(1).join(" ");

    if (!user || !newName)
      return message.reply("❌ Dùng: ?rename @user tên");

    await user.setNickname(newName);
    message.reply(`✏️ Đã đổi tên thành ${newName}`);
  }

  // ================= ADD ROLE =================
  if (command === "addrole") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageRoles))
      return message.reply("❌ Không có quyền");

    const user = message.mentions.members.first();
    const role = message.mentions.roles.first();

    if (!user || !role)
      return message.reply("❌ Dùng: ?addrole @user @role");

    await user.roles.add(role);
    message.reply(`✅ Đã thêm role cho ${user.user.tag}`);
  }

  // ================= AI (FAKE SMART) =================
  if (command === "ask") {
    const question = args.join(" ").toLowerCase();

    if (!question) return message.reply("❌ Nhập câu hỏi");

    let answer = "🤖 Tôi chưa hiểu câu hỏi này 😅";

    if (question.includes("chào"))
      answer = "👋 Chào bạn, mình là bot AI!";
    else if (question.includes("bạn là ai"))
      answer = "🤖 Tôi là bot AI do chủ server tạo ra!";
    else if (question.includes("admin"))
      answer = "👑 Admin là người quản lý server.";
    else if (question.includes("server"))
      answer = "🌐 Đây là server Discord của bạn.";

    const embed = new EmbedBuilder()
      .setTitle("🤖 AI Trả lời")
      .setColor("Green")
      .addFields(
        { name: "❓ Câu hỏi", value: question },
        { name: "💡 Trả lời", value: answer }
      );

    return message.reply({ embeds: [embed] });
  }

});

client.login(process.env.TOKEN);
