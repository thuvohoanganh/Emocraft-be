const express = require('express');
const router = express.Router();
const chatgptController = require('../controllers/chatgpt-controllers');
const { emotionRecognize } = chatgptController;
const { checkAuthUser } = require('../middleware/check-auth');

router.post('/emotion-recognition', emotionRecognize);

module.exports = router;