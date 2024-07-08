const express = require('express');
const router = express.Router();
const chatgptController = require('../controllers/chatgpt-controllers');
const { predictContextualInfor, emotionsRecognize, generateImage } = chatgptController;
const { checkAuthUser } = require('../middleware/check-auth');

router.post('/emotions-recognition', emotionsRecognize);

router.post('/context-prediction', predictContextualInfor);

router.post('/image-generation', generateImage);

module.exports = router;