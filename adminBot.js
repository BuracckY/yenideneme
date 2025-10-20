// adminBot.js
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');
const Order = require('./models/Order'); // Order modelini import et

const ADMIN_TOKEN = process.env.ADMIN_BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;

// Yanıt beklentisi durumunu tutmak için (Basit Yöntem)
let replyIntent = {}; // { adminChatId: orderNumber }

if (!ADMIN_TOKEN || !ADMIN_CHAT_ID) {
    console.error("Lütfen .env dosyasındaki ADMIN_BOT_TOKEN ve ADMIN_CHAT_ID değişkenlerini ayarlayın!");
}

let bot; // bot değişkenini dışarıda tanımla
if (ADMIN_TOKEN && ADMIN_CHAT_ID) {
    try {
        bot = new TelegramBot(ADMIN_TOKEN, { polling: true });
        console.log("Yönetici Telegram Botu çalışmaya başladı...");
    } catch (error) {
        console.error("Yönetici botu başlatılırken hata:", error.message);
        bot = null; // Başlatılamazsa null yap
    }
} else {
    console.warn("Yönetici botu için ADMIN_BOT_TOKEN veya ADMIN_CHAT_ID eksik, bot başlatılamadı.");
    bot = null;
}

// --- YARDIMCI FONKSİYONLAR ---
const formatMessages = (messages) => {
     if (!messages || messages.length === 0) {
        return "<i>Bu sipariş için henüz mesaj yok.</i>";
    }
    return messages.map(msg => {
        const sender = msg.sender === 'admin' ? '<b>Siz</b>' : '<b>Kullanıcı</b>';
        const date = new Date(msg.timestamp || Date.now()).toLocaleString('tr-TR', {
            day: '2-digit', month: '2-digit', year:'numeric', hour: '2-digit', minute: '2-digit'
        });
        const text = msg.text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return `${sender} (${date}):\n${text}`;
    }).join('\n--------------------\n');
};

const formatDate = (date) => {
    if (!date) return '?';
    return new Date(date).toLocaleString('tr-TR', {
        day: '2-digit', month: '2-digit', year:'numeric', hour: '2-digit', minute: '2-digit'
    });
};

// Sipariş Durumunu Güncelleme Fonksiyonu
const updateOrderStatus = async (chatId, orderNumber, newStatus) => {
    if (!bot) return false;
    try {
        const updatedOrder = await Order.findOneAndUpdate(
            { orderNumber: orderNumber },
            { $set: { status: newStatus } },
            { new: true }
        );
        if (!updatedOrder) {
            bot.sendMessage(chatId, `\`${orderNumber}\` numaralı sipariş bulunamadı.`);
            return false;
        }
        const statusText = newStatus === 'Tamamlandı' ? 'Ödeme Onaylandı' : (newStatus === 'İptal' ? 'İptal Edildi' : newStatus);
        const icon = newStatus === 'Tamamlandı' ? '✅' : (newStatus === 'İptal' ? '❌' : '⏳');
        bot.sendMessage(chatId, `${icon} \`${orderNumber}\` numaralı siparişin durumu *${statusText}* olarak güncellendi.`);
        return true;
    } catch (error) {
        console.error(`Durum güncellenirken hata (${orderNumber}, ${newStatus}):`, error);
        bot.sendMessage(chatId, `Durum güncellenirken bir hata oluştu: ${error.message}`);
        return false;
    }
};

// Sipariş Arşiv Durumunu Güncelleme Fonksiyonu
const updateOrderArchiveStatus = async (chatId, orderNumber, isArchived) => {
     if (!bot) return false;
    try {
        const updatedOrder = await Order.findOneAndUpdate(
            { orderNumber: orderNumber },
            { $set: { isArchived: isArchived } },
            { new: true }
        );
        if (!updatedOrder) {
            bot.sendMessage(chatId, `\`${orderNumber}\` numaralı sipariş bulunamadı.`);
            return false;
        }
        const statusText = isArchived ? 'arşivlendi' : 'arşivden çıkarıldı';
        const icon = isArchived ? '📁' : '📄';
        bot.sendMessage(chatId, `${icon} \`${orderNumber}\` numaralı sipariş başarıyla ${statusText}.`);
        return true;
    } catch (error) {
        console.error(`Arşiv durumu güncellenirken hata (${orderNumber}, ${isArchived}):`, error);
        bot.sendMessage(chatId, `Arşiv durumu güncellenirken bir hata oluştu: ${error.message}`);
        return false;
    }
};


// --- DIŞARIYA AÇILACAK BİLDİRİM FONKSİYONLARI ---

// Yeni Sipariş Bildirimi (TxID Dahil)
const sendNewOrderNotification = (order) => {
    if (!bot || !ADMIN_CHAT_ID) return;
    try {
        // ****** TxID GÖSTERİMİ BURADA EKLENDİ ******
        const message = `📦 *Yeni Sipariş Alındı!*\n\n` +
                        `*Sipariş No:* \`${order.orderNumber}\`\n` +
                        `*Ürün:* ${order.productName} (x${order.quantity})\n` +
                        `*Ödeme:* ${order.paymentInfo}\n` +
                        (order.transactionId ? `*TxID:* \`${order.transactionId}\`\n` : '') + // TxID satırı
                        (order.messages && order.messages.length > 0 ? `*Not:* ${order.messages[0].text}\n` : '') +
                        `\n_İşlem yapmak için aşağıdaki butonları kullanın._`;
        // ****** /TxID GÖSTERİMİ ******

        const options = {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '✅ Onayla', callback_data: `confirm:${order.orderNumber}` },
                        { text: '❌ İptal Et', callback_data: `cancel:${order.orderNumber}` }
                    ],
                    [
                         { text: '📄 Mesajları Gör', callback_data: `view:${order.orderNumber}` },
                         { text: '📁 Arşivle', callback_data: `archive:${order.orderNumber}` }
                    ]
                ]
            }
        };

        bot.sendMessage(ADMIN_CHAT_ID, message, options)
           .catch(err => console.error("Admin'e yeni sipariş bildirimi gönderilemedi:", err.message));
    } catch (error) {
        console.error("Yeni sipariş bildirimi oluşturulurken hata:", error);
    }
};

// Yeni Kullanıcı Mesajı Bildirimi
const sendNewUserMessageNotification = (order, userMessageText) => {
    if (!bot || !ADMIN_CHAT_ID) return;
     try {
        const message = `💬 *Yeni Kullanıcı Mesajı!*\n\n` +
                        `*Sipariş No:* \`${order.orderNumber}\`\n` +
                        `*Ürün:* ${order.productName}\n\n` +
                        `*Mesaj:* ${userMessageText}\n\n` +
                        `_İşlem yapmak için aşağıdaki butonları kullanın._`;

         const options = {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '💬 Yanıtla', callback_data: `reply_init:${order.orderNumber}` },
                        { text: '📄 Mesajları Gör', callback_data: `view:${order.orderNumber}` }
                    ],
                    [
                        { text: '✅ Onayla', callback_data: `confirm:${order.orderNumber}` },
                        { text: '❌ İptal Et', callback_data: `cancel:${order.orderNumber}` }
                    ],
                    [
                        { text: '📁 Arşivle', callback_data: `archive:${order.orderNumber}` }
                    ]
                ]
            }
        };

        bot.sendMessage(ADMIN_CHAT_ID, message, options)
            .catch(err => console.error("Admin'e yeni mesaj bildirimi gönderilemedi:", err.message));
    } catch (error) {
        console.error("Yeni mesaj bildirimi oluşturulurken hata:", error);
    }
};


// Sadece bot başarılı bir şekilde başlatıldıysa olay dinleyicilerini ekle
if (bot) {
    // --- CALLBACK QUERY HANDLER (BUTON TIKLAMALARI İÇİN LOGLAR EKLENDİ) ---
    bot.on('callback_query', async (callbackQuery) => {
        console.log(">>> Buton tıklandı! Callback Data:", callbackQuery.data); // LOG

        const msg = callbackQuery.message;
        const data = callbackQuery.data;
        const chatId = msg.chat.id;

        if (chatId.toString() !== ADMIN_CHAT_ID) {
            console.log(">>> Yetkisiz tıklama engellendi. Chat ID:", chatId); // LOG
            bot.answerCallbackQuery(callbackQuery.id);
            return;
        }

        const [action, orderNumber] = data.split(':');

        if (!orderNumber) {
            console.warn(">>> Callback Query'de orderNumber eksik:", data); // LOG
            bot.answerCallbackQuery(callbackQuery.id, { text: 'Hata: Sipariş Numarası bulunamadı.' });
            return;
        }

        console.log(`>>> İşlem: ${action}, Sipariş No: ${orderNumber}`); // LOG
        bot.answerCallbackQuery(callbackQuery.id); // Telegram'a butonun işlendiğini bildir

        try {
            switch (action) {
                case 'confirm':
                    console.log(">>> 'confirm' işleniyor..."); // LOG
                    await updateOrderStatus(chatId, orderNumber, 'Tamamlandı');
                    break;
                case 'cancel':
                    console.log(">>> 'cancel' işleniyor..."); // LOG
                    await updateOrderStatus(chatId, orderNumber, 'İptal');
                    break;
                case 'archive':
                    console.log(">>> 'archive' işleniyor..."); // LOG
                    await updateOrderArchiveStatus(chatId, orderNumber, true);
                    break;
                case 'view':
                    console.log(">>> 'view' işleniyor..."); // LOG
                    const order = await Order.findOne({ orderNumber: orderNumber });
                    if (!order) { return bot.sendMessage(chatId, `\`${orderNumber}\` numaralı sipariş bulunamadı.`); }
                    const formattedMessages = formatMessages(order.messages);
                    // ****** TxID GÖSTERİMİ BURADA EKLENDİ ******
                    const response = `<b>Sipariş No:</b> <code>${order.orderNumber}</code>\n` +
                                     `<b>Oluşturulma:</b> ${formatDate(order.createdAt)}\n` +
                                     `<b>Ürün:</b> ${order.productName}\n` +
                                     `<b>Durum:</b> ${order.status}\n` +
                                     `<b>Arşivde:</b> ${order.isArchived ? 'Evet' : 'Hayır'}\n` +
                                     (order.transactionId ? `<b>TxID:</b> <code>${order.transactionId}</code>\n` : '') + // TxID satırı
                                     `\n<b>Mesaj Geçmişi:</b>\n--------------------\n${formattedMessages}`;
                    // ****** /TxID GÖSTERİMİ ******
                    bot.sendMessage(chatId, response, { parse_mode: 'HTML' });
                    break;
                case 'reply_init':
                    console.log(">>> 'reply_init' işleniyor..."); // LOG
                    replyIntent[chatId] = orderNumber;
                    bot.sendMessage(chatId, `💬 \`${orderNumber}\` numaralı siparişe yanıt yazıyorsunuz.\nMesajınızı şimdi gönderin. İptal için /yanitiptal yazın.`);
                    break;
                default:
                    console.warn(">>> Bilinmeyen callback query action:", action); // LOG
                    bot.sendMessage(chatId, "Bilinmeyen bir işlem butonu tıklandı.");
            }
            console.log(`>>> İşlem tamamlandı: ${action} - ${orderNumber}`); // LOG
        } catch (error) {
             console.error(`>>> Callback handler içinde HATA oluştu (${action} - ${orderNumber}):`, error); // LOG
             bot.sendMessage(chatId, `İşlem sırasında bir hata oluştu: ${error.message}`);
        }
    });


    // --- BOT KOMUTLARI ---
    bot.onText(/^\/(baslat|yardim)$/, (msg) => {
        const chatId = msg.chat.id;
        if (chatId.toString() !== ADMIN_CHAT_ID) return;
        const helpMessage = `*Yönetici Botu Komutları:*\n\n*Sipariş İşlemleri:*\n\`/goruntule <SipNo>\`\n\`/onayla <SipNo>\`\n\`/iptal <SipNo>\`\n\`/arsivle <SipNo>\`\n\`/arsivdenkaldir <SipNo>\`\n\`/arsivlisil <SipNo>\`\n\n*Mesajlaşma:*\n\`/yanitla <SipNo> <Mesaj>\`\n\`/mesajgonder <SipNo> <Mesaj>\`\n\`/yanitiptal\`\n\n*Listeleme & Arama:*\n\`/bekleyenler\`\n\`/okunmamislar\`\n\`/son <Sayı>\`\n\`/ara <Metin>\``;
        bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
    });

    // /goruntule (TxID Dahil)
    bot.onText(/^\/goruntule (EM-[A-Z0-9]+)$/i, async (msg, match) => {
        const chatId = msg.chat.id;
        if (chatId.toString() !== ADMIN_CHAT_ID) return;
        const orderNumber = match[1].toUpperCase();
        try {
            const order = await Order.findOne({ orderNumber: orderNumber });
            if (!order) return bot.sendMessage(chatId, `\`${orderNumber}\` bulunamadı.`);
            const formattedMessages = formatMessages(order.messages);
            // ****** TxID GÖSTERİMİ BURADA EKLENDİ ******
            const response = `<b>Sipariş No:</b> <code>${order.orderNumber}</code>\n<b>Oluşturulma:</b> ${formatDate(order.createdAt)}\n<b>Ürün:</b> ${order.productName}\n<b>Durum:</b> ${order.status}\n<b>Arşivde:</b> ${order.isArchived ? 'Evet' : 'Hayır'}\n` + (order.transactionId ? `<b>TxID:</b> <code>${order.transactionId}</code>\n` : '') + `\n<b>Mesaj Geçmişi:</b>\n--------------------\n${formattedMessages}`; // TxID satırı
            // ****** /TxID GÖSTERİMİ ******
            bot.sendMessage(chatId, response, { parse_mode: 'HTML' });
        } catch (error) { console.error(`/goruntule hata (${orderNumber}):`, error); bot.sendMessage(chatId, `Hata: ${error.message}`); }
    });

    bot.onText(/^\/onayla (EM-[A-Z0-9]+)$/i, async (msg, match) => { /* ... (komut aynı) ... */ });
    bot.onText(/^\/iptal (EM-[A-Z0-9]+)$/i, async (msg, match) => { /* ... (komut aynı) ... */ });
    bot.onText(/^\/arsivle (EM-[A-Z0-9]+)$/i, async (msg, match) => { /* ... (komut aynı) ... */ });
    bot.onText(/^\/arsivdenkaldir (EM-[A-Z0-9]+)$/i, async (msg, match) => { /* ... (komut aynı) ... */ });
    bot.onText(/^\/arsivlisil (EM-[A-Z0-9]+)$/i, async (msg, match) => { /* ... (komut aynı) ... */ });
    bot.onText(/^\/yanitla (EM-[A-Z0-9]+) (.+)/s, async (msg, match) => { /* ... (komut aynı) ... */ });
    bot.onText(/^\/mesajgonder (EM-[A-Z0-9]+) (.+)/s, async (msg, match) => { /* ... (komut aynı) ... */ });
    bot.onText(/^\/yanitiptal$/, (msg) => { /* ... (komut aynı) ... */ });
    bot.onText(/^\/bekleyenler$/, async (msg) => { /* ... (komut aynı) ... */ });
    bot.onText(/^\/okunmamislar$/, async (msg) => { /* ... (komut aynı) ... */ });
    bot.onText(/^\/son (\d+)$/, async (msg, match) => { /* ... (komut aynı) ... */ });
    bot.onText(/^\/ara (.+)$/, async (msg, match) => { /* ... (komut aynı) ... */ });

    // Ana Mesaj Dinleyici (Yanıt ve Bilinmeyen Komutlar)
    bot.on('message', async (msg) => {
         const chatId = msg.chat.id;
         const text = msg.text;
        if (chatId.toString() !== ADMIN_CHAT_ID || !text) return;

        // Yanıt beklentisi varsa ve komut değilse
        if (replyIntent[chatId] && !text.startsWith('/')) {
            const orderNumber = replyIntent[chatId];
            const adminReplyText = text.trim();
            delete replyIntent[chatId];
            if (!adminReplyText) return bot.sendMessage(chatId, "Yanıt boş olamaz. İptal edildi.");
            try {
                const order = await Order.findOne({ orderNumber: orderNumber });
                if (!order) return bot.sendMessage(chatId, `Yanıt için \`${orderNumber}\` bulunamadı. İptal edildi.`);
                const message = { sender: 'admin', text: adminReplyText, timestamp: new Date() };
                const updatedOrder = await Order.findByIdAndUpdate(order._id, { $push: { messages: message }, $set: { hasUnreadUserMessage: false } }, { new: true });
                if (!updatedOrder) throw new Error('Sipariş güncellenemedi.');
                bot.sendMessage(chatId, `✅ \`${orderNumber}\` yanıtınız gönderildi.`);
            } catch (error) { console.error(`Yanıt (intent) hata (${orderNumber}):`, error); bot.sendMessage(chatId, `Hata: ${error.message}`); }
        }
        // Bilinen komut değilse VE yanıt beklentisi yoksa
        else if (!/^\/(baslat|yardim|goruntule|yanitla|onayla|iptal|arsivle|arsivdenkaldir|arsivlisil|mesajgonder|yanitiptal|bekleyenler|okunmamislar|son|ara)/i.test(text)) {
             bot.sendMessage(chatId, "Anlaşılmayan komut/mesaj. /yardim yazın.");
        }
    });

    bot.on("polling_error", (error) => {
        console.error("Admin Bot Polling Hatası:", error.code, error.message);
        if (error.code === 'EFATAL') { console.error("!!! KRİTİK POLLING HATASI - Bot durmuş olabilir!"); }
        else if (error.code === 'ETELEGRAM') { console.warn("!!! Telegram API Hatası:", error.message); }
    });
} // if(bot) bloğunun sonu


// Bildirim fonksiyonlarını dışa aktar
module.exports = {
    sendNewOrderNotification,
    sendNewUserMessageNotification
};