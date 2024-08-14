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
        type: String
    },
    emotions: {
        type: String //stringify Object
    },
    context: {
        type: String
    },
    dialog: {
        type: String //stringify the JSON dialog
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
})

module.exports = mongoose.model('Diary', DiarySchema);