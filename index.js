// ============================================================
//  Discord Bot - Full Featured + Gemini AI
//  Discord Bot - Full Featured + Groq AI (Llama 3.3 70B)
//  Các lệnh: /menu /ask /weather /userinfo /serverinfo
//            /kick /ban /mute /unmute /play /stop /skip /queue
// ============================================================
@@ -15,7 +15,7 @@ const fetch = require('node-fetch');

// ── Biến môi trường ──────────────────────────────────────────
const TOKEN       = process.env.TOKEN;
const GEMINI_KEY  = process.env.GEMINI_API_KEY;
const GROQ_KEY    = process.env.GROQ_API_KEY;
const WEATHER_KEY = process.env.WEATHER_API_KEY; // openweathermap (free)

if (!TOKEN) {
@@ -46,7 +46,7 @@ const commands = [
// AI
new SlashCommandBuilder()
.setName('ask')
    .setDescription('🤖 Hỏi Gemini AI')
    .setDescription('🤖 Hỏi Groq AI (Llama 3.3 70B)')
.addStringOption(o =>
o.setName('cauhoi').setDescription('Nhập câu hỏi của bạn').setRequired(true)),

@@ -174,7 +174,7 @@ client.on('interactionCreate', async interaction => {
{
name: '🤖 AI & Thông tin',
value: [
              '`/ask [câu hỏi]` — Hỏi Gemini AI',
              '`/ask [câu hỏi]` — Hỏi Groq AI (Llama 3.3 70B)',
'`/weather [thành phố]` — Xem thời tiết',
'`/userinfo [@user]` — Thông tin thành viên',
'`/serverinfo` — Thông tin server',
@@ -220,43 +220,51 @@ client.on('interactionCreate', async interaction => {
return interaction.reply({ embeds: [embed] });
}

    // ══════════════════ ASK (GEMINI) ══════════════════
    // ══════════════════ ASK (GROQ AI) ══════════════════
if (commandName === 'ask') {
await interaction.deferReply();
const question = interaction.options.getString('cauhoi');

      if (!GEMINI_KEY) {
        return interaction.editReply('❌ Chưa cấu hình `GEMINI_API_KEY` trong biến môi trường!');
      if (!GROQ_KEY) {
        return interaction.editReply('❌ Chưa cấu hình `GROQ_API_KEY` trong biến môi trường!\nLấy key miễn phí tại: https://console.groq.com');
}

try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: question }] }]
            })
          }
        );
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
          return interaction.editReply(`❌ Lỗi Gemini: ${data.error.message}`);
          return interaction.editReply(`❌ Lỗi Groq: ${data.error.message}`);
}

        const answer = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? 'Không nhận được phản hồi.';
        const answer = data?.choices?.[0]?.message?.content ?? 'Không nhận được phản hồi.';

        // Cắt nếu quá dài (Discord giới hạn 4096 ký tự trong embed)
const shortAnswer = answer.length > 3900
? answer.substring(0, 3900) + '...\n*(Phản hồi quá dài, đã cắt bớt)*'
: answer;

const embed = new EmbedBuilder()
          .setTitle('🤖 Gemini AI')
          .setColor(0x4285F4)
          .setTitle('🤖 Groq AI — Llama 3.3 70B')
          .setColor(0xF55036)
.addFields(
{ name: '❓ Câu hỏi', value: `\`\`\`${question}\`\`\`` },
{ name: '💬 Trả lời', value: shortAnswer }
@@ -266,8 +274,8 @@ client.on('interactionCreate', async interaction => {

return interaction.editReply({ embeds: [embed] });
} catch (e) {
        console.error('Gemini error:', e);
        return interaction.editReply('❌ Lỗi khi kết nối Gemini API. Thử lại sau!');
        console.error('Groq error:', e);
        return interaction.editReply('❌ Lỗi khi kết nối Groq API. Thử lại sau!');
}
}

@@ -504,26 +512,29 @@ client.on('interactionCreate', async interaction => {
const q = musicQueues.get(guildId);
q.queue.push(song);

      // Tìm kiếm thông tin bài bằng Gemini nếu có key
      // Tìm kiếm thông tin bài bằng Groq nếu có key
let songInfo = song;
      if (GEMINI_KEY) {
      if (GROQ_KEY) {
try {
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{
                  parts: [{
                    text: `Cho tôi biết thông tin ngắn về bài hát "${song}": tên chính xác, ca sĩ, thể loại, năm phát hành. Trả lời ngắn gọn 1-2 dòng bằng tiếng Việt.`
                  }]
                }]
              })
            }
          );
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
                  role: 'user',
                  content: `Cho tôi biết thông tin ngắn về bài hát "${song}": tên chính xác, ca sĩ, thể loại, năm phát hành. Trả lời ngắn gọn 1-2 dòng bằng tiếng Việt.`
                }
              ],
              max_tokens: 150,
            })
          });
const data = await res.json();
          songInfo = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? song;
          songInfo = data?.choices?.[0]?.message?.content ?? song;
} catch (_) { /* bỏ qua */ }
}
