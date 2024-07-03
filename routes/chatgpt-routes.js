const express = require('express');
const router = express.Router();
const chatgptController = require('../controllers/chatgpt-controllers');
const { recognizeEmotion, predictContextualInfor } = chatgptController;
const { checkAuthUser } = require('../middleware/check-auth');

router.post('/emotion-recognition', recognizeEmotion);

router.post('/context-prediction', predictContextualInfor);

module.exports = router;