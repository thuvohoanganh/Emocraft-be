const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    name: {
        type: String, 
        required: 'Fisrt name is required', 
        trim: true,
     },
     gender: {
        type: String,
        enum: ['Male', 'Female', 'Other'],
        required: 'Gender is required',
        trim: true,
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
})

module.exports = mongoose.model('User', UserSchema);