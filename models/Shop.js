const mongoose = require('mongoose');

const shopSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    city: { // Artık City modeline referans
        type: mongoose.Schema.Types.ObjectId,
        ref: 'City',
        required: true
    },
    imageUrl: {
        type: String,
        required: false,
        default: '' // Resim yoksa boş string olsun
    }
});

module.exports = mongoose.models.Shop || mongoose.model('Shop', shopSchema);