const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const DiarySchema = new mongoose.Schema({
    postid: {
        type: String,
        unique: true,
        required: true
    },
    userid: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    timestamp: {
        type: Date,
        default: Date.now
    },
    content: {
        type: String
    },
    emotions: {
        type: [String]
    },
    location: {
        type: String
    }
})

module.exports = mongoose.model('Diary', DiarySchema);