const express = require('express');
const router = express.Router();
const { check } = require('express-validator');
const diaryController = require('../controllers/diary-controllers');
const { createDiary, retrieveDiary } = diaryController;

router.post('/create',
    [
        check('userid')
            .not()
            .isEmpty(),
        check('timestamp')
            .not()
            .isEmpty(),
        check('content')
            .not()
            .isEmpty(),
        check('emotion')
            .isArray(),
        check('people')
            .isArray(),
        check('dialog')
            .isObject(),
        check('images')
            .isArray()
    ],
    createDiary
);

router.get(':/id', retrieveDiary);

module.exports = router;