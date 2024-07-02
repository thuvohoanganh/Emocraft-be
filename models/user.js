const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    email: {
        type: String, 
        required: 'Email address is required', 
        unique: true,
        trim: true,
        match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Email is not valid'],
    },
    password: {
        type: String,
        minlength: 6
    },
    name: {
        type: String, 
        required: 'Fisrt name is required', 
        trim: true,
     },
    createdAt: {
        type: Date,
        default: Date.now
    },
})

module.exports = mongoose.model('User', UserSchema);