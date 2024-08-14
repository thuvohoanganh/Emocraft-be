const express = require('express');
const router = express.Router();
const chatgptController = require('../controllers/chatgpt-controllers');
const { predictContextualInfor, chatbotConversation, generateImage, generateWeeklySummary } = chatgptController;
const { check } = require('express-validator');

router.post('/emotions-recognition', [
    check('userid')
        .not()
        .isEmpty(),
    check('diaryid')
        .not()
        .isEmpty(),
], chatbotConversation);

router.post('/context-prediction', predictContextualInfor);

router.post('/image-generation', generateImage);

router.get('/weekly-summary/:uid', generateWeeklySummary)

module.exports = router;