const express = require('express');
const router = express.Router();
const chatgptController = require('../controllers/chatgpt-controllers');
const { recognizeEmotion, predictContextualInfor, feedback } = chatgptController;
const { checkAuthUser } = require('../middleware/check-auth');

router.post('/emotion-recognition', recognizeEmotion);

router.post('/user-feedback', feedback);

router.post('/context-prediction', predictContextualInfor);

module.exports = router;