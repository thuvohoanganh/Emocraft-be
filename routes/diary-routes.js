const express = require('express');
const router = express.Router();
const { check } = require('express-validator');
const diaryController = require('../controllers/diary-controllers');
const { createDiary, retrieveDiary, getDiaries } = diaryController;

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
        check('emotions')
            .isArray(),
        check('people')
            .isArray(),
        // check('dialog')
        //     .optional()
        //     .isObject(),
        check('images')
            .optional()
            .isArray()
    ],
    createDiary
);

router.get('/:pid', retrieveDiary);

router.get('/', getDiaries);

module.exports = router;