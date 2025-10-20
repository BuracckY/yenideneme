const mongoose = require('mongoose');

const citySchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        trim: true
    }
});

module.exports = mongoose.models.City || mongoose.model('City', citySchema);