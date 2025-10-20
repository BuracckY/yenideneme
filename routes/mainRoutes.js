// routes/mainRoutes.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const axios = require('axios');
const crypto = require('crypto');
const Shop = require('../models/Shop');
const Product = require('../models/Product');
const Crypto = require('../models/Crypto');
const Order = require('../models/Order');
const adminBot = require('../adminBot');

const verifyToken = (req, res, next) => {
    const token = req.query.token;
    if (!token) { return res.redirect('/'); }
    const secret = process.env.JWT_SECRET;
    if (!secret) { console.error("JWT_SECRET eksik!"); return res.status(500).send("Sunucu hatası."); }
    jwt.verify(token, secret, (err, decoded) => {
        if (err) { console.log("Token hatası:", err.message); return res.redirect('/'); }
        req.user = decoded;
        next();
    });
};

router.get('/', (req, res) => { res.render('index'); });

router.get('/api/prices', verifyToken, async (req, res) => {
    try {
        const cryptos = await Crypto.find().lean();
        if (!cryptos || cryptos.length === 0) { return res.json({}); }
        const apiIds = cryptos.map(c => c.api_id).join(',');
        const response = await axios.get(`https://api.coingecko.com/api/v3/simple/price?ids=${apiIds}&vs_currencies=try`);
        const rates = response.data;
        const priceMap = {};
        cryptos.forEach(crypto => {
            if (rates[crypto.api_id] && rates[crypto.api_id].try) { priceMap[crypto.symbol] = rates[crypto.api_id].try; }
        });
        res.json(priceMap);
    } catch (err) { console.error("!!! /api/prices HATASI:", err.message); res.status(500).json({ error: 'Fiyatlar alınamadı.' }); }
});

router.get('/shop', verifyToken, async (req, res) => {
    try {
        const [allShops, allProducts, allCryptos] = await Promise.all([
            Shop.find().populate('city').lean(),
            Product.find().populate({ path: 'shop', populate: { path: 'city' }}).populate('availableCryptos').lean(),
            Crypto.find().lean()
        ]);
        const expirationTime = req.user.exp;
        const token = req.query.token;
        const availableSymbols = allCryptos.map(c => c.symbol);
        res.render('shop', { shops: allShops || [], products: allProducts || [], availableSymbols: availableSymbols || [], expirationTime, token });
    } catch (err) { console.error("Shop GET hatası:", err); res.status(500).send("Dükkan yüklenirken hata."); }
});

router.get('/checkout', verifyToken, async (req, res) => {
    const token = req.query.token;
    try {
        const { product_id } = req.query;
        if (!product_id || !mongoose.Types.ObjectId.isValid(product_id)) { throw new Error(`Geçersiz ürün ID.`); }
        const product = await Product.findById(product_id).populate('availableCryptos').lean();
        if (!product) { throw new Error("Ürün bulunamadı."); }
        const expirationTime = req.user.exp;
        res.render('checkout', { product: product, availableCryptos: product.availableCryptos || [], expirationTime, token, checkoutError: null });
    } catch (err) {
         console.error("!!! GET /checkout CATCH HATASI:", err);
         res.status(500).render('checkout', { product: null, availableCryptos: [], expirationTime: req.user?.exp || 0, token: token || '', checkoutError: `Beklenmedik hata: ${err.message}` });
    }
});

router.post('/checkout', verifyToken, async (req, res) => {
    console.log("--- POST /checkout isteği alındı:", req.body);
    try {
        const { productId, quantity, paymentInfo, note, selectedCryptoId, transactionId } = req.body;
        const numQuantity = parseInt(quantity);
        const txIdPattern = /^(0x[a-fA-F0-9]{64}|[a-fA-F0-9]{64})$/; // Regex

        if (!productId || !mongoose.Types.ObjectId.isValid(productId) ||
            !numQuantity || numQuantity <= 0 ||
            !paymentInfo || !selectedCryptoId ||
            !transactionId || transactionId.trim() === '' ||
            !txIdPattern.test(transactionId.trim())) { // Sunucu tarafı format kontrolü
             console.warn("Geçersiz sipariş bilgisi veya TxID formatı:", req.body);
             let errMsg = 'Geçersiz sipariş bilgisi. Tüm alanlar doldurulmalıdır.';
             if (transactionId && !txIdPattern.test(transactionId.trim())) { errMsg = 'Geçersiz Transaction ID formatı.'; }
             return res.status(400).json({ success: false, message: errMsg });
        }

        const product = await Product.findById(productId).populate('availableCryptos');
        if (!product) { return res.status(404).json({ success: false, message: 'Ürün bulunamadı.' }); }
        if (!product.inStock) { return res.status(400).json({ success: false, message: 'Bu ürün stokta yok.' }); }
        const isCryptoAllowed = product.availableCryptos.some(crypto => crypto._id.toString() === selectedCryptoId);
        if (!isCryptoAllowed) { return res.status(400).json({ success: false, message: 'Bu ödeme yöntemi bu ürün için geçerli değil.' }); }

        const initialMessages = [];
        if (note && note.trim() !== '') { initialMessages.push({ sender: 'user', text: note, timestamp: new Date() }); }

        let orderNumber;
        let isUnique = false;
        while (!isUnique) {
            orderNumber = 'EM-' + crypto.randomBytes(4).toString('hex').toUpperCase();
            const existingOrder = await Order.findOne({ orderNumber: orderNumber });
            if (!existingOrder) { isUnique = true; }
        }

        const newOrder = new Order({
            orderNumber: orderNumber,
            productName: product.name,
            quantity: numQuantity,
            paymentInfo: paymentInfo,
            messages: initialMessages,
            status: 'Beklemede',
            isArchived: false,
            hasUnreadUserMessage: initialMessages.length > 0,
            transactionId: transactionId.trim() // TxID kaydediliyor
        });
        const savedOrder = await newOrder.save();
        console.log("    Sipariş kaydedildi. No:", savedOrder.orderNumber);

        try { adminBot.sendNewOrderNotification(savedOrder); }
        catch (botError) { console.error("Admin'e yeni sipariş bildirimi gönderilirken hata oluştu (checkout):", botError); }

        res.json({ success: true, orderNumber: savedOrder.orderNumber });

    } catch (err) {
        console.error("!!! POST /checkout HATASI:", err);
        res.status(500).json({ success: false, message: err.message || 'Sunucu hatası.' });
    }
});

router.get('/api/track-order/:orderNumber', verifyToken, async (req, res) => {
    try {
        const { orderNumber } = req.params;
        if (!orderNumber || !orderNumber.startsWith('EM-')) { throw new Error('Geçersiz sipariş numarası formatı.'); }
        const order = await Order.findOne({ orderNumber: orderNumber.trim().toUpperCase() }).lean();
        if (!order) { return res.status(404).json({ success: false, message: 'Sipariş bulunamadı.' }); }
        res.json({ success: true, order: order });
    } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

router.post('/api/add-message', verifyToken, async (req, res) => {
     try {
        const { orderId, userMessage } = req.body;
        if (!orderId || !userMessage || userMessage.trim() === '') throw new Error('Eksik bilgi veya boş mesaj.');
        if (!mongoose.Types.ObjectId.isValid(orderId)) throw new Error('Geçersiz Sipariş ID.');
        const message = { sender: 'user', text: userMessage.trim(), timestamp: new Date() };
        const updatedOrder = await Order.findByIdAndUpdate(orderId, { $push: { messages: message }, $set: { hasUnreadUserMessage: true } }, { new: true }).lean();
        if (!updatedOrder) { return res.status(404).json({ success: false, message: 'Sipariş bulunamadı.' }); }
        try { adminBot.sendNewUserMessageNotification(updatedOrder, userMessage); }
        catch (botError) { console.error("Admin'e yeni mesaj bildirimi gönderilirken hata oluştu (add-message):", botError); }
        res.json({ success: true, messages: updatedOrder.messages });
    } catch (err) {
         console.error("!!! /api/add-message HATASI:", err);
         res.status(400).json({ success: false, message: `Mesaj gönderilemedi: ${err.message}` });
    }
});

module.exports = router;