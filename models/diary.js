const mongoose = require('mongoose');

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
        type: String,
        required: true
    },
    emotions: {
        type: [String]
    },
    dialog: {
        type: String //stringify the JSON dialog
    },
    people: {
        type: String,
    },
    location: {
        type: String,
    },
    activity: {
        type: String,
    },
    time_of_day: {
        type: String,
    },
    frequency: {
        type: Number,
        default: 0
    },
    emotion_retention: {
        type: Number,
        default: 0
    },
    context_retention: {
        type: Number,
        default: 0
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
})

module.exports = mongoose.model('Diary', DiarySchema);