const mongoose = require('mongoose');

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
        type: Map,
        of: [String],
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
    diaryEntries: {
        type: [String],
        required: false
    }
})

module.exports = mongoose.model('Summary', SummarySchema);