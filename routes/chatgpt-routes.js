const express = require('express');
const router = express.Router();
const chatgptController = require('../controllers/chatgpt-controllers');
const { predictContextualInfor, chatbotConversation, generateImage } = chatgptController;
const { checkAuthUser } = require('../middleware/check-auth');

router.post('/emotions-recognition', chatbotConversation);

router.post('/context-prediction', predictContextualInfor);

router.post('/image-generation', generateImage);

module.exports = router;