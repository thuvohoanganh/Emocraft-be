const express = require('express');
const router = express.Router();
const chatgptController = require('../controllers/chatgpt-controllers');
const { chatbotConversation, checkAndFulfillSummary, getWeeklySummaries, getWeeklySummary } = chatgptController;
const { check } = require('express-validator');

router.post('/emotions-recognition', [
    check('userid')
        .not()
        .isEmpty(),
    check('diaryid')
        .not()
        .isEmpty(),
], chatbotConversation);

router.get('/weekly-summary/all/:uid', getWeeklySummaries)

router.get('/weekly-summary/:id', getWeeklySummary)

router.post('/weekly-summary/create/:uid', checkAndFulfillSummary)

module.exports = router;