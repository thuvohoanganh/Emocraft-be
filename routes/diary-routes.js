const express = require('express');
const router = express.Router();
const { check } = require('express-validator');
const diaryController = require('../controllers/diary-controllers');
const { storeDiary, retrieveDiary } = diaryController;

router.post('/store',
    [
        check('userid')
            .not()
            .isEmpty(),
        check('content')
            .not()
            .isEmpty(),
        check('emotion')
            .isArray()
    ],
    storeDiary
);

router.get(':/id', diaryController.retrieveDiary);

module.exports = router;