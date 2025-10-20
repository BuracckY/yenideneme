// models/Crypto.js
const mongoose = require('mongoose');

const cryptoSchema = new mongoose.Schema({
    walletName: {
        type: String,
        required: true,
        unique: true, // Ad benzersiz olmalı
        trim: true
    },
    symbol: {
        type: String,
        required: true
    },
    api_id: { // CoinGecko API ID
        type: String,
        required: true
        // unique: true <-- KALDIRILDI
    },
    walletAddress: {
        type: String,
        required: true
    }
});

module.exports = mongoose.models.Crypto || mongoose.model('Crypto', cryptoSchema);