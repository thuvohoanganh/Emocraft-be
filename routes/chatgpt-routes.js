const express = require('express');
const router = express.Router();
const chatgptController = require('../controllers/chatgpt-controllers');
const { chatbotConversation, generateWeeklySummary } = chatgptController;
const { check } = require('express-validator');

router.post('/emotions-recognition', [
    check('userid')
        .not()
        .isEmpty(),
    check('diaryid')
        .not()
        .isEmpty(),
], chatbotConversation);

router.get('/weekly-summary/:uid', generateWeeklySummary)

module.exports = router;