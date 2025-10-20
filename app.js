require('dotenv').config(); // .env dosyasını yüklemek için EN BAŞTA olmalı
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const path = require('path');
const flash = require('connect-flash'); // Flash mesajları için

// Rota dosyalarını import et
const adminRoutes = require('./routes/adminRoutes');
const mainRoutes = require('./routes/mainRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// MongoDB Bağlantısı
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("MongoDB bağlantısı başarılı."))
    .catch(err => {
        console.error("MongoDB BAĞLANTI HATASI:", err);
        process.exit(1);
    });

// --- Middleware'ler ---
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Form verilerini (req.body) okumak için
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

if (!process.env.SESSION_SECRET || !process.env.MONGO_URI) {
    console.error("HATA: .env dosyasında SESSION_SECRET veya MONGO_URI eksik!");
    process.exit(1);
}
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.MONGO_URI,
        collectionName: 'sessions',
        ttl: 60 * 60 * 3 // 3 saat
    }),
    cookie: {
        maxAge: 1000 * 60 * 60 * 3, // 3 saat
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production'
    }
}));
app.use(flash());
app.use((req, res, next) => {
    res.locals.successMsg = req.flash('success');
    res.locals.errorMsg = req.flash('error');
    res.locals.isAdmin = req.session.isAdmin || false;
    next();
});

// --- Rotalar ---
app.use('/admin', adminRoutes);
app.use('/', mainRoutes);

// --- Telegram Bot ---
try { require('./bot.js'); }
catch (botError) { console.error("Telegram botu başlatılırken hata:", botError); }

// --- Hata Yakalama Middleware'i ---
app.use((err, req, res, next) => {
    console.error("Beklenmedik Sunucu Hatası:", err.stack);
    res.status(500).send('Sunucuda bir hata oluştu!');
});

// --- Sunucuyu Başlat ---
app.listen(PORT, () => {
    console.log(`Sunucu http://localhost:${PORT} adresinde çalışıyor...`);
});