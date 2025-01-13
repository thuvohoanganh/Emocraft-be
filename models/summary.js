const mongoose = require('mongoose');
const { Schema } = require('mongoose');

const SummarySchema = new mongoose.Schema({
    userid: { 
        type: String, 
        required: true 
    },
    content: { 
        type: String, 
        required: true 
    },
    startdate: { 
        type: Date, 
        required: true 
    },
    enddate: { 
        type: Date, 
        required: true 
    },
    dailyEmotions: { 
        type: String, 
        required: true 
    },
    emotionPercentages: {
        type: String,
        required: true
    },
    weeklyEmotions: {
        type: [String],
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
})

module.exports = mongoose.model('Summary', SummarySchema);