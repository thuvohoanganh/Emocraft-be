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
        required: true },
    emotions: { 
        type: [String], 
        required: true 
    },
})

module.exports = mongoose.model('Summary', SummarySchema);