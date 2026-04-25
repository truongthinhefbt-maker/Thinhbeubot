# 🤖 ThinhbeuBot — Discord Bot Full-Featured v4.1

Bot Discord đầy đủ tính năng: Moderation, Utility, Fun, Music, Economy, AI — deploy sẵn cho Railway.

---

## 🚀 Deploy lên Railway

1. Fork hoặc push repo này lên GitHub.
2. Vào [railway.app](https://railway.app) → New Project → Deploy from GitHub.
3. Chọn repo → Railway tự nhận `package.json`.
4. Vào tab **Variables** và thêm các biến môi trường bên dưới.
5. Deploy → Bot online!

---

## ⚙️ Biến môi trường (Railway Variables)

| Biến | Bắt buộc | Mô tả |
|------|----------|-------|
| `TOKEN` | ✅ | Discord Bot Token (https://discord.com/developers) |
| `GROQ_API_KEY` | ✅ | Groq AI key miễn phí (https://console.groq.com) |
| `WEATHER_API_KEY` | ❌ | OpenWeatherMap key (https://openweathermap.org/api) |
| `LOG_CHANNEL_ID` | ❌ | ID kênh để log mod actions |
| `WELCOME_CHANNEL_ID` | ❌ | ID kênh chào mừng thành viên mới |
| `AUTO_ROLE_ID` | ❌ | ID role tự cấp cho thành viên mới |
| `VERIFY_ROLE_ID` | ❌ | ID role sau khi verify CAPTCHA |

---

## 📋 Danh sách lệnh

### 🛡️ Moderation (Quản trị)
| Lệnh | Mô tả |
|------|-------|
| `/ban` | Ban thành viên vi phạm |
| `/kick` | Kick thành viên |
| `/mute` | Timeout thành viên |
| `/unmute` | Gỡ timeout |
| `/warn` | Cảnh cáo (3 lần = tự kick) |
| `/warnings` | Xem lịch sử cảnh cáo |
| `/clearwarnings` | Xoá cảnh cáo |
| `/clear` | Xoá hàng loạt tin nhắn |
| `/slowmode` | Chỉnh slowmode kênh |
| `/lock` | Khoá kênh |
| `/unlock` | Mở khoá kênh |
| `/unban` | Gỡ ban |
| `/nickname` | Đổi biệt danh |

### 🔧 Utility (Tiện ích)
| Lệnh | Mô tả |
|------|-------|
| `/userinfo` | Thông tin người dùng |
| `/serverinfo` | Thông tin server |
| `/avatar` | Lấy ảnh đại diện |
| `/weather` | Thời tiết theo thành phố |
| `/translate` | Dịch văn bản |
| `/remind` | Hẹn giờ nhắc nhở |
| `/poll` | Tạo bình chọn |
| `/calc` | Máy tính |
| `/ping` | Kiểm tra độ trễ |
| `/giveaway` | Tổ chức giveaway |

### 🎮 Fun (Giải trí)
| Lệnh | Mô tả |
|------|-------|
| `/roll` | Tung xúc xắc |
| `/flip` | Tung đồng xu |
| `/8ball` | Bói toán |
| `/joke` | Kể chuyện cười |
| `/lovecalc` | Đo độ hợp nhau |
| `/rps` | Kéo búa bao |
| `/slap` | Tát ai đó |
| `/hug` | Ôm ai đó |
| `/meme` | Ảnh chế |
| `/trivia` | Câu hỏi đố vui |

### 🎵 Music (Âm nhạc)
| Lệnh | Mô tả |
|------|-------|
| `/play` | Phát nhạc / thêm vào queue |
| `/skip` | Bỏ qua bài |
| `/stop` | Dừng nhạc |
| `/queue` | Xem hàng đợi |
| `/nowplaying` | Bài đang phát |
| `/loop` | Bật/tắt lặp |
| `/shuffle` | Xáo trộn hàng đợi |

### 💰 Economy (Kinh tế)
| Lệnh | Mô tả |
|------|-------|
| `/daily` | Nhận tiền hàng ngày |
| `/balance` | Xem số dư |
| `/work` | Đi làm kiếm tiền |
| `/rank` | Xem cấp độ |
| `/leaderboard` | Bảng xếp hạng |
| `/transfer` | Chuyển tiền |
| `/gamble` | Cá cược tài xỉu |
| `/slots` | Máy đánh bạc |
| `/baucua` | Bầu cua tôm cá |

### 🤖 AI & Hệ thống
| Lệnh | Mô tả |
|------|-------|
| `/ask` | Hỏi Groq AI |
| `/menu` | Xem tất cả lệnh |
| `/ticket` | Tạo ticket hỗ trợ |
| `/verify` | Xác minh CAPTCHA |
| `/addcmd` | Tạo lệnh tuỳ chỉnh |

---

## 📁 Cấu trúc dự án

```
ThinhbeuBot/
├── index.js              # File chính
├── package.json
├── data/                 # Dữ liệu lưu cục bộ (JSON)
├── commands/
│   ├── mod/              # Lệnh moderation
│   ├── utility/          # Lệnh tiện ích
│   ├── fun/              # Lệnh giải trí
│   ├── music/            # Lệnh nhạc
│   ├── economy/          # Lệnh kinh tế
│   └── system/           # Lệnh hệ thống
└── utils/
    ├── db.js             # Database helper (JSON)
    └── helpers.js        # Helper functions
```
