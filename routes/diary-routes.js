const express = require('express');
const router = express.Router();
const { check } = require('express-validator');
const diaryController = require('../controllers/diary-controllers');
const { createDiary, retrieveDiary, getDiaries, updateDiary, deleteDiary, saveAnalysisRationale } = diaryController;

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
            .isEmpty()
    ],
    createDiary
);

router.get('/:uid/:pid', retrieveDiary);

router.get('/:uid', getDiaries);

router.patch('/:uid/:pid', updateDiary);

router.patch('/save-rationale', [
    check('userid')
        .not()
        .isEmpty(),
    check('diaryid')
        .not()
        .isEmpty(),
    check('dialog')
        .not()
        .isEmpty(),
    check('diary')
        .not()
        .isEmpty(),
    check('rationale')
        .not()
        .isEmpty()
], saveAnalysisRationale)

router.delete('/:uid/:pid', deleteDiary)

module.exports = router;