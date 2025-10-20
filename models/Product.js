const mongoose = require('mongoose');

// ÖNCE ŞEMAYI TANIMLA
const productSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: false
    },
    imageUrl: { // Opsiyonel resim
        type: String,
        required: false,
        default: ''
    },
    price_tl: { // Fiyat TL olarak
        type: Number,
        required: true,
        min: 0
    },
    inStock: { // Stok adedi yerine Stokta Var/Yok
        type: Boolean,
        required: true,
        default: true
    },
    shop: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Shop',
        required: true
    },
    // Bu ürün için geçerli cüzdanların ID'leri
    availableCryptos: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Crypto'
    }]
});

// SONRA MODELİ EXPORT ET (Overwrite hatasını önleyerek)
module.exports = mongoose.models.Product || mongoose.model('Product', productSchema);

