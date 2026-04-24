const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { askGroq, COLORS, truncate, errorEmbed } = require('../utils/helpers');
const { incrementStat } = require('../utils/database');

module.exports = {
  data: [
    // /ask
    new SlashCommandBuilder()
      .setName('ask')
      .setDescription('🤖 Hỏi Groq AI (Llama 3.3 70B)')
      .addStringOption(o => o.setName('cauhoi').setDescription('Câu hỏi của bạn').setRequired(true)),

    // /translate
    new SlashCommandBuilder()
      .setName('translate')
      .setDescription('🌐 Dịch văn bản sang ngôn ngữ khác')
      .addStringOption(o => o.setName('text').setDescription('Văn bản cần dịch').setRequired(true))
      .addStringOption(o => o.setName('lang').setDescription('Ngôn ngữ đích (VD: English, 日本語, 한국어)').setRequired(true)),

    // /summarize
    new SlashCommandBuilder()
      .setName('summarize')
      .setDescription('📝 Tóm tắt văn bản dài')
      .addStringOption(o => o.setName('text').setDescription('Văn bản cần tóm tắt').setRequired(true)),

    // /grammar
    new SlashCommandBuilder()
      .setName('grammar')
      .setDescription('✏️ Sửa lỗi ngữ pháp văn bản')
      .addStringOption(o => o.setName('text').setDescription('Văn bản cần sửa').setRequired(true)),

    // /explain
    new SlashCommandBuilder()
      .setName('explain')
      .setDescription('💻 Giải thích đoạn code')
      .addStringOption(o => o.setName('code').setDescription('Paste code vào đây').setRequired(true))
      .addStringOption(o => o.setName('lang').setDescription('Ngôn ngữ lập trình (VD: Python, JS)').setRequired(false)),

    // /story
    new SlashCommandBuilder()
      .setName('story')
      .setDescription('📖 Tạo truyện ngắn sáng tạo')
      .addStringOption(o => o.setName('prompt').setDescription('Chủ đề hoặc nhân vật').setRequired(true))
      .addStringOption(o => o.setName('genre').setDescription('Thể loại (VD: kinh dị, tình cảm, hài)').setRequired(false)),

    // /idea
    new SlashCommandBuilder()
      .setName('idea')
      .setDescription('💡 Tạo ý tưởng sáng tạo')
      .addStringOption(o => o.setName('topic').setDescription('Chủ đề cần ý tưởng').setRequired(true)),

    // /quiz
    new SlashCommandBuilder()
      .setName('quiz')
      .setDescription('❓ Câu hỏi quiz ngẫu nhiên')
      .addStringOption(o => o.setName('topic').setDescription('Chủ đề (VD: lịch sử, khoa học, địa lý)').setRequired(false)),

    // /define
    new SlashCommandBuilder()
      .setName('define')
      .setDescription('📚 Tra từ điển / giải nghĩa từ')
      .addStringOption(o => o.setName('word').setDescription('Từ cần tra').setRequired(true)),

    // /roast
    new SlashCommandBuilder()
      .setName('roast')
      .setDescription('🔥 AI chê bai hài hước (vui thôi!)')
      .addUserOption(o => o.setName('user').setDescription('Người cần roast').setRequired(false)),

    // /compliment
    new SlashCommandBuilder()
      .setName('compliment')
      .setDescription('💐 AI khen ngợi thành viên')
      .addUserOption(o => o.setName('user').setDescription('Người cần khen').setRequired(false)),
  ],

  async execute(interaction) {
    const cmd = interaction.commandName;
    await interaction.deferReply();

    try {
      incrementStat(`cmd_${cmd}`);

      // ── /ask ──────────────────────────────────────────────
      if (cmd === 'ask') {
        const q = interaction.options.getString('cauhoi');
        const answer = await askGroq(q,
          'Bạn là trợ lý AI thông minh trong Discord. Trả lời ngắn gọn, rõ ràng. Dùng tiếng Việt nếu câu hỏi tiếng Việt.'
        );
        const embed = new EmbedBuilder()
          .setTitle('🤖 Groq AI — Llama 3.3 70B')
          .setColor(COLORS.groq)
          .addFields(
            { name: '❓ Câu hỏi', value: `\`\`\`${truncate(q, 200)}\`\`\`` },
            { name: '💬 Trả lời', value: truncate(answer, 3800) }
          )
          .setFooter({ text: `Hỏi bởi ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
          .setTimestamp();
        return interaction.editReply({ embeds: [embed] });
      }

      // ── /translate ───────────────────────────────────────
      if (cmd === 'translate') {
        const text = interaction.options.getString('text');
        const lang = interaction.options.getString('lang');
        const result = await askGroq(
          `Dịch văn bản sau sang ${lang}. CHỈ trả về bản dịch, không giải thích:\n\n${text}`,
          'Bạn là chuyên gia dịch thuật đa ngôn ngữ.'
        );
        const embed = new EmbedBuilder()
          .setTitle('🌐 Dịch thuật')
          .setColor(COLORS.info)
          .addFields(
            { name: '📝 Gốc', value: truncate(text, 500) },
            { name: `🔄 ${lang}`, value: truncate(result, 1000) }
          )
          .setFooter({ text: `Dịch bởi ${interaction.user.tag}` })
          .setTimestamp();
        return interaction.editReply({ embeds: [embed] });
      }

      // ── /summarize ───────────────────────────────────────
      if (cmd === 'summarize') {
        const text = interaction.options.getString('text');
        const summary = await askGroq(
          `Tóm tắt văn bản sau thành 3-5 ý chính, mỗi ý 1-2 câu:\n\n${text}`,
          'Bạn là chuyên gia tóm tắt nội dung.'
        );
        const embed = new EmbedBuilder()
          .setTitle('📝 Tóm tắt')
          .setColor(COLORS.purple)
          .addFields(
            { name: '📄 Nguyên bản (preview)', value: `\`\`\`${truncate(text, 300)}\`\`\`` },
            { name: '✂️ Tóm tắt', value: truncate(summary, 1500) }
          )
          .setTimestamp();
        return interaction.editReply({ embeds: [embed] });
      }

      // ── /grammar ─────────────────────────────────────────
      if (cmd === 'grammar') {
        const text = interaction.options.getString('text');
        const result = await askGroq(
          `Sửa lỗi ngữ pháp, chính tả trong văn bản sau. Trả về: 1) Bản sửa, 2) Danh sách lỗi đã sửa:\n\n${text}`,
          'Bạn là giáo viên ngôn ngữ chuyên sửa lỗi văn bản.'
        );
        const embed = new EmbedBuilder()
          .setTitle('✏️ Sửa lỗi ngữ pháp')
          .setColor(COLORS.success)
          .addFields(
            { name: '📝 Gốc', value: `\`\`\`${truncate(text, 400)}\`\`\`` },
            { name: '✅ Đã sửa', value: truncate(result, 1500) }
          )
          .setTimestamp();
        return interaction.editReply({ embeds: [embed] });
      }

      // ── /explain ─────────────────────────────────────────
      if (cmd === 'explain') {
        const code = interaction.options.getString('code');
        const lang = interaction.options.getString('lang') ?? 'không rõ';
        const result = await askGroq(
          `Giải thích đoạn code ${lang} sau theo từng phần, dễ hiểu bằng tiếng Việt:\n\`\`\`\n${code}\n\`\`\``,
          'Bạn là lập trình viên senior giỏi giải thích code.'
        );
        const embed = new EmbedBuilder()
          .setTitle(`💻 Giải thích Code ${lang}`)
          .setColor(COLORS.orange)
          .addFields(
            { name: '🔍 Code', value: `\`\`\`${lang}\n${truncate(code, 500)}\n\`\`\`` },
            { name: '📖 Giải thích', value: truncate(result, 2000) }
          )
          .setTimestamp();
        return interaction.editReply({ embeds: [embed] });
      }

      // ── /story ───────────────────────────────────────────
      if (cmd === 'story') {
        const prompt = interaction.options.getString('prompt');
        const genre  = interaction.options.getString('genre') ?? 'tự do';
        const story  = await askGroq(
          `Viết một truyện ngắn ${genre} khoảng 200-300 từ về: ${prompt}. Có mở đầu, diễn biến và kết thúc.`,
          'Bạn là nhà văn sáng tạo chuyên viết truyện ngắn hấp dẫn.',
          800
        );
        const embed = new EmbedBuilder()
          .setTitle(`📖 Truyện ngắn — ${genre}`)
          .setDescription(truncate(story, 3800))
          .setColor(COLORS.pink)
          .setFooter({ text: `Chủ đề: ${prompt} | Yêu cầu bởi ${interaction.user.tag}` })
          .setTimestamp();
        return interaction.editReply({ embeds: [embed] });
      }

      // ── /idea ─────────────────────────────────────────────
      if (cmd === 'idea') {
        const topic = interaction.options.getString('topic');
        const ideas = await askGroq(
          `Tạo 5 ý tưởng sáng tạo, độc đáo về chủ đề: "${topic}". Mỗi ý tưởng ngắn gọn 1-3 câu.`,
          'Bạn là chuyên gia brainstorming sáng tạo.',
          600
        );
        const embed = new EmbedBuilder()
          .setTitle(`💡 Ý tưởng: ${topic}`)
          .setDescription(truncate(ideas, 2000))
          .setColor(COLORS.warning)
          .setFooter({ text: `Yêu cầu bởi ${interaction.user.tag}` })
          .setTimestamp();
        return interaction.editReply({ embeds: [embed] });
      }

      // ── /quiz ─────────────────────────────────────────────
      if (cmd === 'quiz') {
        const topic = interaction.options.getString('topic') ?? 'kiến thức tổng quát';
        const result = await askGroq(
          `Tạo 1 câu hỏi trắc nghiệm về "${topic}" có 4 đáp án A/B/C/D. Format:\nCÂU HỎI: ...\nA) ...\nB) ...\nC) ...\nD) ...\nĐÁP ÁN: X\nGIẢI THÍCH: ...`,
          'Bạn là giáo viên tạo câu hỏi quiz thú vị.',
          400
        );
        const embed = new EmbedBuilder()
          .setTitle(`❓ Quiz — ${topic}`)
          .setDescription(truncate(result, 2000))
          .setColor(COLORS.primary)
          .setFooter({ text: '💡 Đọc kỹ trước khi xem đáp án!' })
          .setTimestamp();
        return interaction.editReply({ embeds: [embed] });
      }

      // ── /define ───────────────────────────────────────────
      if (cmd === 'define') {
        const word = interaction.options.getString('word');
        const result = await askGroq(
          `Tra từ điển từ/cụm từ: "${word}"\nTrả về: nghĩa, ví dụ sử dụng, từ đồng nghĩa nếu có. Ngắn gọn.`,
          'Bạn là từ điển đa ngôn ngữ thông minh.',
          400
        );
        const embed = new EmbedBuilder()
          .setTitle(`📚 Từ điển: ${word}`)
          .setDescription(truncate(result, 2000))
          .setColor(COLORS.info)
          .setTimestamp();
        return interaction.editReply({ embeds: [embed] });
      }

      // ── /roast ────────────────────────────────────────────
      if (cmd === 'roast') {
        const target = interaction.options.getUser('user') ?? interaction.user;
        const result = await askGroq(
          `Chê bai hài hước (roast) người dùng Discord tên "${target.username}" theo phong cách hài hước, nhẹ nhàng, KHÔNG xúc phạm thật sự. Khoảng 2-3 câu.`,
          'Bạn là comedian hài hước nhưng lịch sự.',
          200
        );
        const embed = new EmbedBuilder()
          .setTitle(`🔥 Roast: ${target.username}`)
          .setDescription(result)
          .setColor(COLORS.danger)
          .setThumbnail(target.displayAvatarURL())
          .setFooter({ text: '😂 Chỉ vui thôi nhé!' })
          .setTimestamp();
        return interaction.editReply({ embeds: [embed] });
      }

      // ── /compliment ───────────────────────────────────────
      if (cmd === 'compliment') {
        const target = interaction.options.getUser('user') ?? interaction.user;
        const result = await askGroq(
          `Khen ngợi thành thật và sáng tạo người dùng Discord tên "${target.username}". Khoảng 2-3 câu dễ thương.`,
          'Bạn là người hay khen ngợi chân thành và dễ thương.',
          200
        );
        const embed = new EmbedBuilder()
          .setTitle(`💐 Khen: ${target.username}`)
          .setDescription(result)
          .setColor(COLORS.pink)
          .setThumbnail(target.displayAvatarURL())
          .setFooter({ text: '💕 Từ ' + interaction.user.tag })
          .setTimestamp();
        return interaction.editReply({ embeds: [embed] });
      }

    } catch (err) {
      console.error(`[AI] Lỗi ${cmd}:`, err);
      return interaction.editReply({
        embeds: [errorEmbed('Lỗi AI', err.message?.includes('GROQ_API_KEY')
          ? 'Chưa cấu hình `GROQ_API_KEY`! Lấy key free tại https://console.groq.com'
          : 'Có lỗi xảy ra, thử lại sau!'
        )]
      });
    }
  }
};
