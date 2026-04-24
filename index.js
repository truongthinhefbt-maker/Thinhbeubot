const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');
const fetch = require('node-fetch');

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// ================= ĐĂNG KÝ COMMAND =================
const commands = [
  new SlashCommandBuilder().setName('menu').setDescription('Xem menu'),
  new SlashCommandBuilder().setName('ask')
    .setDescription('Hỏi AI')
    .addStringOption(option =>
      option.setName('cauhoi')
        .setDescription('Nhập câu hỏi')
        .setRequired(true)
    ),
  new SlashCommandBuilder().setName('weather')
    .setDescription('Xem thời tiết')
    .addStringOption(option =>
      option.setName('city')
        .setDescription('Tên thành phố')
        .setRequired(true)
    ),
];

client.once('ready', async () => {
  console.log(`Bot online: ${client.user.tag}`);

  const rest = new (require('discord.js').REST)({ version: '10' })
    .setToken(process.env.TOKEN);

  try {
    await rest.put(
      require('discord.js').Routes.applicationCommands(client.user.id),
      { body: commands }
    );
    console.log("✅ Đã đăng ký lệnh /");
  } catch (err) {
    console.error(err);
  }
});

// ================= XỬ LÝ LỆNH =================
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  // ===== MENU =====
  if (interaction.commandName === 'menu') {
    return interaction.reply("📌 Lệnh: /ask /weather");
  }

  // ===== AI =====
  if (interaction.commandName === 'ask') {
    const q = interaction.options.getString('cauhoi');

    // Dùng API AI free (fake ChatGPT)
    const res = await fetch(`https://api.affiliateplus.xyz/api/chatbot?message=${encodeURIComponent(q)}&botname=Bot&ownername=You`);
    const data = await res.json();

    return interaction.reply(`🤖 ${data.message}`);
  }

  // ===== WEATHER =====
  if (interaction.commandName === 'weather') {
    const city = interaction.options.getString('city');

    const res = await fetch(`https://wttr.in/${city}?format=3`);
    const text = await res.text();

    return interaction.reply(`🌦️ ${text}`);
  }
});

client.login(process.env.TOKEN);
