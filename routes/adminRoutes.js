// routes/adminRoutes.js

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Gerekli tüm modelleri import ediyoruz
const Shop = require('../models/Shop');
const Product = require('../models/Product');
const Crypto = require('../models/Crypto');
const City = require('../models/City');
const Order = require('../models/Order');

// --- Hata Mesajı Temizleme Yardımcı Fonksiyonu ---
const cleanErrorMessage = (message) => {
    // "cite_start" içeren garip metinleri temizler.
    if (typeof message !== 'string') return 'Bilinmeyen Sunucu Hatası';
    return message.replace(/cite_start\s+is\s+not\s+defined/gi, 'Geçersiz Veri');
};


// --- Admin Giriş Kontrol Middleware ---
const isAuth = (req, res, next) => {
    // Session kontrolü
    if (req.session && req.session.isAdmin) {
        next(); // Giriş yapılmış, devam et
    } else {
        // Giriş yapılmamışsa veya session yoksa
        req.flash('error', 'Bu sayfaya erişim için giriş yapmalısınız.');
        res.redirect('/admin/login');
    }
};

// --- GET Rotaları (Sayfa Gösterimleri) ---

// GET /admin/login - Admin giriş sayfasını göster
router.get('/login', (req, res) => {
    res.locals.errorMsg = req.flash('error');
    res.render('adminLogin');
});

// GET /admin/logout - Admin çıkışı
router.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.log("Çıkış yaparken session hatası:", err);
        }
        console.log('Admin oturumu sonlandırıldı.');
        res.redirect('/admin/login');
    });
});

// GET /admin/dashboard - Yönetici Paneli
router.get('/dashboard', isAuth, async (req, res) => {
    try {
        // Okunmamış mesajı olanları en üste alacak şekilde siparişleri çekelim
        const orders = await Order.find()
            .sort({ hasUnreadUserMessage: -1, createdAt: -1 }) // Okunmamış olanlar en üste, sonra yeniye göre
            .lean();

        // Dashboard'da kullanılacak diğer verileri de çekelim
        const shops = await Shop.find().populate('city').lean();
        const products = await Product.find().populate('shop').lean();
        const cryptos = await Crypto.find().lean();
        const cities = await City.find().lean();

        // Flash mesajlarını al
        const successMsg = req.flash('success');
        const errorMsg = req.flash('error');

        res.render('dashboard', {
            orders, // Tüm siparişler tek listede gönderiliyor, EJS içinde filtrelenecek
            shops,
            products,
            cryptos,
            cities,
            successMsg,
            errorMsg
        });
    } catch (err) {
        console.error('Dashboard yükleme hatası:', err);
        req.flash('error', 'Dashboard yüklenirken bir hata oluştu: ' + err.message);
        res.redirect('/admin/login');
    }
});

// GET /admin/edit-shop/:id - Dükkan düzenleme sayfasını göster
router.get('/edit-shop/:id', isAuth, async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)){
             req.flash('error', 'Geçersiz Dükkan ID.');
             return res.redirect('/admin/dashboard');
        }
        const [shop, cities] = await Promise.all([
            Shop.findById(req.params.id).populate('city').lean(),
            City.find().sort({ name: 1 }).lean()
        ]);
        if (!shop) {
            req.flash('error', 'Dükkan bulunamadı.');
            return res.redirect('/admin/dashboard');
        }
        res.render('edit-shop', { shop, cities });
    } catch (err) {
        req.flash('error', 'Dükkan düzenleme sayfası yüklenemedi: ' + err.message);
        res.redirect('/admin/dashboard');
    }
});


// GET /admin/edit-product/:id - Ürün düzenleme sayfasını göster
router.get('/edit-product/:id', isAuth, async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            req.flash('error', 'Geçersiz Ürün ID.');
            return res.redirect('/admin/dashboard');
        }

        const [product, shops, allCryptos] = await Promise.all([
            Product.findById(req.params.id).lean(),
            Shop.find().populate('city').lean(),
            Crypto.find().lean() // Tüm kriptoları al
        ]);

        if (!product) {
            req.flash('error', 'Ürün bulunamadı.');
            return res.redirect('/admin/dashboard');
        }

        res.render('edit-product', {
            product: product,
            shops: shops,
            allCryptos: allCryptos // Kripto listesini EJS'ye yolla
        });
    } catch (err) {
        console.error("GET /edit-product hatası:", err);
        req.flash('error', 'Ürün düzenleme sayfası yüklenemedi: ' + err.message);
        res.redirect('/admin/dashboard');
    }
});

// GET /admin/edit-crypto/:id - Kripto cüzdanı düzenleme sayfasını göster
router.get('/edit-crypto/:id', isAuth, async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            req.flash('error', 'Geçersiz Kripto ID.');
            return res.redirect('/admin/dashboard');
        }
        const crypto = await Crypto.findById(req.params.id).lean();
        if (!crypto) {
            req.flash('error', 'Kripto cüzdanı bulunamadı.');
            return res.redirect('/admin/dashboard');
        }
        res.render('edit-crypto', { crypto: crypto });
    } catch (err) {
        req.flash('error', 'Kripto cüzdanı düzenleme sayfası yüklenemedi: ' + err.message);
        res.redirect('/admin/dashboard');
    }
});

// --- POST Rotaları (Form İşlemleri) ---

// POST /admin/login - Admin giriş işlemi
router.post('/login', async (req, res) => {
    try {
        const { password } = req.body;
        // ŞİFRE KONTROLÜ
        if (password && process.env.ADMIN_PASSWORD && password === process.env.ADMIN_PASSWORD) {
            req.session.isAdmin = true;
            req.session.save(err => {
                if (err) { console.error("Session kaydetme hatası:", err); req.flash('error', 'Oturum hatası oluştu.'); return res.redirect('/admin/login'); }
                res.redirect('/admin/dashboard');
            });
        } else {
            req.flash('error', 'Yanlış şifre.');
            res.redirect('/admin/login');
        }
    } catch (err) { console.error("Admin login try-catch hatası:", err); req.flash('error', 'Giriş sırasında bir sunucu hatası oluştu.'); res.redirect('/admin/login'); }
});

// -------------------------------------------------------------------
// *** POST CRUD ROTALARI (Silme/Ekleme/Güncelleme) ***
// -------------------------------------------------------------------

// --- Şehir İşlemleri ---
router.post('/add-city', isAuth, async (req, res) => {
    try {
        const { name } = req.body;
        if (!name || name.trim() === '') throw new Error('Şehir adı boş olamaz.');
        const newCity = new City({ name: name.trim() });
        await newCity.save();
        req.flash('success', `Şehir "${newCity.name}" başarıyla eklendi.`);
    } catch (err) {
        const errorMessage = err.code === 11000 ? 'Bu şehir zaten mevcut.' : cleanErrorMessage(err.message);
        req.flash('error', 'Şehir eklenemedi: ' + errorMessage);
    }
    res.redirect('/admin/dashboard');
});

// ROTA DÜZELTİLDİ: /delete-city -> /delete-city/:id
router.post('/delete-city/:id', isAuth, async (req, res) => {
    try {
        const cityId = req.params.id;
        if (!mongoose.Types.ObjectId.isValid(cityId)) throw new Error('Geçersiz Şehir ID.');

        const shopCount = await Shop.countDocuments({ city: cityId });
        if (shopCount > 0) {
            throw new Error(`Bu şehirde ${shopCount} dükkan kayıtlı. Lütfen önce dükkanları silin veya taşıyın.`);
        }

        const deletedCity = await City.findByIdAndDelete(cityId);
        if (!deletedCity) throw new Error('Silinecek şehir bulunamadı.');
        req.flash('success', `Şehir "${deletedCity.name}" başarıyla silindi.`);
    } catch (err) {
        req.flash('error', 'Şehir silinemedi: ' + cleanErrorMessage(err.message));
    }
    res.redirect('/admin/dashboard');
});


// --- Dükkan İşlemleri ---
router.post('/add-shop', isAuth, async (req, res) => {
    try {
        const { name, description, city, imageUrl } = req.body;
        if (!name || name.trim() === '') throw new Error('Dükkan adı boş olamaz.');
        if (!mongoose.Types.ObjectId.isValid(city)) throw new Error('Geçersiz Şehir ID.');

        const newShop = new Shop({
            name: name.trim(),
            description: description ? description.trim() : '',
            city: city,
            imageUrl: imageUrl || ''
        });
        await newShop.save();
        req.flash('success', `Dükkan "${newShop.name}" başarıyla eklendi.`);
    } catch (err) {
        req.flash('error', 'Dükkan eklenemedi: ' + cleanErrorMessage(err.message));
    }
    res.redirect('/admin/dashboard');
});

// ROTA DÜZELTİLDİ: /delete-shop -> /delete-shop/:id
router.post('/delete-shop/:id', isAuth, async (req, res) => {
    try {
        const shopId = req.params.id;
        if (!mongoose.Types.ObjectId.isValid(shopId)) throw new Error('Geçersiz Dükkan ID.');

        const productCount = await Product.countDocuments({ shop: shopId });
        if (productCount > 0) {
            throw new Error(`Bu dükkana bağlı ${productCount} ürün var. Lütfen önce ürünleri silin.`);
        }

        const deletedShop = await Shop.findByIdAndDelete(shopId);
        if (!deletedShop) throw new Error('Silinecek dükkan bulunamadı.');
        req.flash('success', `Dükkan "${deletedShop.name}" başarıyla silindi.`);
    } catch (err) {
        req.flash('error', 'Dükkan silinemedi: ' + cleanErrorMessage(err.message));
    }
    res.redirect('/admin/dashboard');
});

router.post('/edit-shop/:id', isAuth, async (req, res) => {
    try {
        const shopId = req.params.id;
        const { name, description, city, imageUrl } = req.body;

        if (!mongoose.Types.ObjectId.isValid(shopId)) throw new Error('Geçersiz Dükkan ID.');
        if (!mongoose.Types.ObjectId.isValid(city)) throw new Error('Geçersiz Şehir ID.');
        if (!name || name.trim() === '') throw new Error('Dükkan adı boş olamaz.');

        const updatedShop = await Shop.findByIdAndUpdate(shopId, {
            name: name.trim(),
            description: description ? description.trim() : '',
            city: city,
            imageUrl: imageUrl || ''
        }, { new: true, runValidators: true });

        if (!updatedShop) throw new Error('Güncellenecek dükkan bulunamadı.');

        req.flash('success', `Dükkan "${updatedShop.name}" başarıyla güncellendi.`);
        res.redirect('/admin/dashboard');
    } catch (err) {
        req.flash('error', 'Dükkan güncellenemedi: ' + cleanErrorMessage(err.message));
        res.redirect(`/admin/edit-shop/${req.params.id}`);
    }
});


// --- Ürün İşlemleri ---
router.post('/add-product', isAuth, async (req, res) => {
    try {
        const { name, description, imageUrl, price_tl, inStock, shopId, availableCryptos } = req.body;

        if (!name || name.trim() === '') throw new Error('Ürün adı boş olamaz.');
        if (!mongoose.Types.ObjectId.isValid(shopId)) throw new Error('Geçersiz Dükkan ID.');
        const price = parseFloat(price_tl);
        if (isNaN(price) || price < 0) throw new Error('Geçerli bir fiyat girin.');

        const cryptoIds = Array.isArray(availableCryptos) ? availableCryptos :
                          (availableCryptos ? [availableCryptos] : []);

        const newProduct = new Product({
            name: name.trim(),
            description: description ? description.trim() : '',
            imageUrl: imageUrl || '',
            price_tl: price,
            inStock: inStock === 'on',
            shop: shopId,
            availableCryptos: cryptoIds
        });
        await newProduct.save();
        req.flash('success', `Ürün "${newProduct.name}" başarıyla eklendi.`);
    } catch (err) {
        console.error("Ürün ekleme hatası:", err);
        req.flash('error', 'Ürün eklenemedi: ' + cleanErrorMessage(err.message));
    }
    res.redirect('/admin/dashboard');
});

// ROTA DÜZELTİLDİ: /delete-product -> /delete-product/:id
router.post('/delete-product/:id', isAuth, async (req, res) => {
    try {
        const productId = req.params.id;
        if (!mongoose.Types.ObjectId.isValid(productId)) throw new Error('Geçersiz Ürün ID.');

        const deletedProduct = await Product.findByIdAndDelete(productId);
        if (!deletedProduct) throw new Error('Silinecek ürün bulunamadı.');

        req.flash('success', `Ürün "${deletedProduct.name}" başarıyla silindi.`);
    } catch (err) {
        req.flash('error', 'Ürün silinemedi: ' + cleanErrorMessage(err.message));
    }
    res.redirect('/admin/dashboard');
});


router.post('/edit-product/:id', isAuth, async (req, res) => {
    try {
        const productId = req.params.id;
        const { name, description, imageUrl, price_tl, inStock, shopId, availableCryptos } = req.body;

        if (!mongoose.Types.ObjectId.isValid(productId)) throw new Error('Geçersiz Ürün ID.');
        if (!name || name.trim() === '') throw new Error('Ürün adı boş olamaz.');
        if (!mongoose.Types.ObjectId.isValid(shopId)) throw new Error('Geçersiz Dükkan ID.');
        const price = parseFloat(price_tl);
        if (isNaN(price) || price < 0) throw new Error('Geçerli bir fiyat girin.');

        const cryptoIds = Array.isArray(availableCryptos) ? availableCryptos :
                          (availableCryptos ? [availableCryptos] : []);

        const updatedProduct = await Product.findByIdAndUpdate(productId, {
            name: name.trim(),
            description: description ? description.trim() : '',
            imageUrl: imageUrl || '',
            price_tl: price,
            inStock: inStock === 'on',
            shop: shopId,
            availableCryptos: cryptoIds
        }, { new: true, runValidators: true });

        if (!updatedProduct) throw new Error('Güncellenecek ürün bulunamadı.');

        req.flash('success', `Ürün "${updatedProduct.name}" başarıyla güncellendi.`);
        res.redirect('/admin/dashboard');
    } catch (err) {
        console.error("Ürün düzenleme hatası:", err);
        req.flash('error', 'Ürün güncellenemedi: ' + cleanErrorMessage(err.message));
        res.redirect(`/admin/edit-product/${req.params.id}`);
    }
});


// --- Kripto Cüzdan İşlemleri ---
router.post('/add-crypto', isAuth, async (req, res) => {
    try {
        const { walletName, symbol, api_id, walletAddress } = req.body;
        if (!walletName || !symbol || !api_id || !walletAddress) throw new Error('Tüm alanlar zorunludur.');

        const newCrypto = new Crypto({
            walletName: walletName.trim(),
            symbol: symbol.trim().toUpperCase(),
            api_id: api_id.trim(),
            walletAddress: walletAddress.trim()
        });
        await newCrypto.save();
        req.flash('success', `Kripto Cüzdanı "${newCrypto.walletName} (${newCrypto.symbol})" başarıyla eklendi.`);
    } catch (err) {
        const errorMessage = err.code === 11000 ? 'Bu cüzdan adı zaten mevcut.' : cleanErrorMessage(err.message);
        req.flash('error', 'Kripto Cüzdanı eklenemedi: ' + errorMessage);
    }
    res.redirect('/admin/dashboard');
});

// ****** ROTA GÜNCELLENDİ: Artık ürüne bağlı olsa bile siler ve üründen kaldırır ******
router.post('/delete-crypto/:id', isAuth, async (req, res) => {
    try {
        const cryptoId = req.params.id; // URL parametresinden al
        if (!mongoose.Types.ObjectId.isValid(cryptoId)) {
            throw new Error('Geçersiz Kripto ID.');
        }

        // 1. ADIM: Bu cüzdanı kullanan TÜM ürünlerden cüzdan ID'sini kaldır.
        const updateResult = await Product.updateMany(
            { availableCryptos: cryptoId }, // Kriter: Bu cüzdan ID'sini içeren ürünler
            { $pull: { availableCryptos: cryptoId } } // İşlem: Diziden bu ID'yi çıkar
        );

        console.log(`"${cryptoId}" ID'li cüzdan ${updateResult.modifiedCount} üründen kaldırıldı.`); // Opsiyonel: Loglama

        // 2. ADIM: Cüzdanı sil.
        const deletedCrypto = await Crypto.findByIdAndDelete(cryptoId);

        if (!deletedCrypto) {
            throw new Error('Silinecek kripto cüzdanı bulunamadı.');
        }

        req.flash('success', `Kripto Cüzdanı "${deletedCrypto.walletName} (${deletedCrypto.symbol})" silindi ve ilgili ürünlerden kaldırıldı.`);
    } catch (err) {
        req.flash('error', 'Kripto Cüzdanı silinemedi: ' + cleanErrorMessage(err.message));
    }
    res.redirect('/admin/dashboard');
});
// ****** /GÜNCELLEME SONU ******

router.post('/edit-crypto/:id', isAuth, async (req, res) => {
    try {
        const cryptoId = req.params.id;
        const { walletName, symbol, api_id, walletAddress } = req.body;

        if (!mongoose.Types.ObjectId.isValid(cryptoId)) throw new Error('Geçersiz Kripto ID.');
        if (!walletName || !symbol || !api_id || !walletAddress) throw new Error('Tüm alanlar zorunludur.');

        const updatedCrypto = await Crypto.findByIdAndUpdate(cryptoId, {
            walletName: walletName.trim(),
            symbol: symbol.trim().toUpperCase(),
            api_id: api_id.trim(),
            walletAddress: walletAddress.trim()
        }, { new: true, runValidators: true });

        if (!updatedCrypto) throw new Error('Güncellenecek kripto cüzdanı bulunamadı.');

        req.flash('success', `Kripto Cüzdanı "${updatedCrypto.walletName} (${updatedCrypto.symbol})" başarıyla güncellendi.`);
        res.redirect('/admin/dashboard');
    } catch (err) {
        const errorMessage = err.code === 11000 ? 'Bu cüzdan adı zaten mevcut.' : cleanErrorMessage(err.message);
        req.flash('error', 'Kripto Cüzdanı güncellenemedi: ' + errorMessage);
        res.redirect(`/admin/edit-crypto/${req.params.id}`);
    }
});

// -------------------------------------------------------------------
// *** SİPARİŞ YÖNETİMİ ***
// -------------------------------------------------------------------

// POST /admin/update-order-status - Durum güncelleme
router.post('/update-order-status', isAuth, async (req, res) => {
    try {
        const { orderId, newStatus } = req.body;
        if (!mongoose.Types.ObjectId.isValid(orderId)) throw new Error('Geçersiz Sipariş ID.');
        const validStatuses = ['Beklemede', 'Tamamlandı', 'İptal'];
        if (!validStatuses.includes(newStatus)) throw new Error('Geçersiz durum bilgisi.');

        const updatedOrder = await Order.findByIdAndUpdate(orderId, { status: newStatus }, { new: true });
        if (!updatedOrder) throw new Error('Güncellenecek sipariş bulunamadı.');

        let displayStatus = newStatus;
        if (newStatus === 'Tamamlandı') displayStatus = 'Ödeme Onaylandı';
        else if (newStatus === 'İptal') displayStatus = 'İptal Edildi';

        req.flash('success', `Sipariş #${updatedOrder.orderNumber} durumu "${displayStatus}" olarak güncellendi.`);
    } catch (err) {
        req.flash('error', 'Durum güncellenemedi: ' + cleanErrorMessage(err.message));
    }
    res.redirect('/admin/dashboard');
});

// POST /admin/send-message - Admin'den mesaj gönderme
router.post('/send-message', isAuth, async (req, res) => {
    console.log(`--- Admin Mesaj Gönderme İsteği ---`);
    try {
        const { orderId, adminReply } = req.body;
        if (!orderId || !adminReply || adminReply.trim() === '') throw new Error('Eksik bilgi veya boş mesaj.');

        if (!mongoose.Types.ObjectId.isValid(orderId)) throw new Error('Geçersiz Sipariş ID.');

        const message = { sender: 'admin', text: adminReply.trim(), timestamp: new Date() };

        const updatedOrder = await Order.findByIdAndUpdate(orderId,
            {
                $push: { messages: message },
                $set: { hasUnreadUserMessage: false } // Admin yanıt verince kullanıcı mesajı okundu say
            },
            { new: true }
        );

        if (!updatedOrder) { throw new Error('Mesaj gönderilecek sipariş bulunamadı.'); }

        req.flash('success', `Sipariş #${updatedOrder.orderNumber} için mesaj gönderildi.`);
    } catch (err) {
        console.error('*** ADMIN MESAJ GÖNDERME HATASI BAŞLANGIÇ ***');
        console.error('err.message içeriği:', err.message);
        console.error(err);
        console.error('*** ADMIN MESAJ GÖNDERME HATASI SONU ***');
        req.flash('error', 'Mesaj gönderilemedi: ' + cleanErrorMessage(err.message));
    }
    res.redirect('/admin/dashboard');
});

// ROTA: Siparişi Arşivle
router.post('/archive-order/:id', isAuth, async (req, res) => {
    try {
        const orderId = req.params.id;
        if (!mongoose.Types.ObjectId.isValid(orderId)) throw new Error('Geçersiz Sipariş ID.');

        const updatedOrder = await Order.findByIdAndUpdate(orderId,
            { $set: { isArchived: true } },
            { new: true }
        );

        if (!updatedOrder) throw new Error('Arşivlenecek sipariş bulunamadı.');
        req.flash('success', `Sipariş #${updatedOrder.orderNumber} arşivlendi.`);
    } catch (err) {
        console.error("Arşivleme hatası:", err);
        req.flash('error', 'Sipariş arşivlenemedi: ' + cleanErrorMessage(err.message));
    }
    res.redirect('/admin/dashboard');
});

// ROTA: Arşivlenmiş Siparişi Sil
router.post('/delete-archived-order/:id', isAuth, async (req, res) => {
    try {
        const orderId = req.params.id;
        if (!mongoose.Types.ObjectId.isValid(orderId)) throw new Error('Geçersiz Sipariş ID.');

        const deletedOrder = await Order.findOneAndDelete({ _id: orderId, isArchived: true });

        if (!deletedOrder) throw new Error('Silinecek arşivlenmiş sipariş bulunamadı veya sipariş arşivlenmemiş.');
        req.flash('success', `Arşivlenmiş Sipariş #${deletedOrder.orderNumber} kalıcı olarak silindi.`);
    } catch (err) {
        console.error("Arşivlenmiş sipariş silme hatası:", err);
        req.flash('error', 'Arşivlenmiş sipariş silinemedi: ' + cleanErrorMessage(err.message));
    }
    res.redirect('/admin/dashboard');
});

// Router'ı export et
module.exports = router;