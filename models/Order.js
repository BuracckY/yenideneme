// models/Order.js
const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    orderNumber: { type: String, required: true, unique: true },
    productName: { type: String, required: true },
    quantity: { type: Number, required: true },
    paymentInfo: { type: String, required: true },
    // ****** YENİ ALAN ******
    transactionId: { type: String, trim: true, default: '' }, // TxID alanı eklendi
    // ****** /YENİ ALAN ******
    status: {
        type: String,
        required: true,
        default: 'Beklemede',
        enum: ['Beklemede', 'Tamamlandı', 'İptal']
    },
    messages: [
        {
            sender: { type: String, enum: ['user', 'admin'], required: true },
            text: { type: String, required: true },
            timestamp: { type: Date, default: Date.now }
        }
    ],
    isArchived: { type: Boolean, default: false, index: true },
    hasUnreadUserMessage: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.models.Order || mongoose.model('Order', orderSchema);