const mongoose = require('mongoose');

const StatisticSchema = new mongoose.Schema({
    category: {
        type: String, 
        required: true,
        enum: ['emotion', 'location', 'people', 'activity', 'time_of_day'],
    },
    subcategory: {
        type: String,
        required: true
    },
    quantity: {
        type: Number,
        required: true
    },
    userid: {
        type: String,
        required: true
    },
})

module.exports = mongoose.model('Statistic', StatisticSchema);