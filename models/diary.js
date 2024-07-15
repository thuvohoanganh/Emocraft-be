const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const DiarySchema = new mongoose.Schema({
    userid: {
        type: String,
        required: true
    },
    timestamp: {
        type: Date,
        required: true
    },
    content: {
        type: String
    },
    emotions: {
        type: [String]
    },
    people: {
        type: [String]
    },
    location: {
        type: String
    },
    dialog: {
        type: String //stringify the JSON dialog
    },
    images: {
        type: [String]
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
})

module.exports = mongoose.model('Diary', DiarySchema);