const TelegramBot = require('node-telegram-bot-api');
const jwt = require('jsonwebtoken');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const JWT_SECRET = process.env.JWT_SECRET;
const SITE_URL = process.env.SITE_URL;

if (!TOKEN || !JWT_SECRET || !SITE_URL) {
    console.error("Lütfen .env dosyanızdaki TELEGRAM_BOT_TOKEN, JWT_SECRET ve SITE_URL değişkenlerini ayarlayın!");
    process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });

console.log("Telegram Botu çalışmaya başladı...");

const professionalMessage = "Ephemeral Mart'a hoş geldiniz.\n\nSize özel, 1 saat geçerli olacak geçici mağaza erişim linkiniz aşağıdadır. Süre sonunda linkiniz otomatik olarak geçersiz kılınacaktır.\n\nİyi alışverişler dileriz.";
const guidanceMessage = "Geçici mağaza erişim linki oluşturmak için lütfen 'Giriş' yazınız.";

bot.onText(/^Giriş$/i, (msg) => {
    const chatId = msg.chat.id;
    try {
        const token = jwt.sign({ user: chatId }, JWT_SECRET, { expiresIn: '1h' });
        const link = `${SITE_URL}/shop?token=${token}`;
        bot.sendMessage(chatId, `${professionalMessage}\n\n${link}`);
    } catch (err) {
        console.error("Token oluşturulurken hata:", err);
        bot.sendMessage(chatId, "Üzgünüm, erişim linki oluşturulurken teknik bir sorun oluştu.");
    }
});

bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    if (!/^Giriş$/i.test(text)) {
        bot.sendMessage(chatId, guidanceMessage);
    }
});

bot.on("polling_error", (error) => {
    console.error("Bot Polling Hatası:", error.code);
});

// module.exports = bot; // Eğer admin panelinden mesaj gönderme eklenecekse bu satır açılır