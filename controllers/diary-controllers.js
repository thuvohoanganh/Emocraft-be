const Diary = require('../models/diary');
const HttpError = require('../models/http-error');
const { validationResult } = require('express-validator');

const createDiary = async (req, res, next) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return next(
            new HttpError(JSON.stringify(errors), 422)
        );
    }

    const { userid, timestamp, content, emotions, people, location, dialog, images, createdAt } = req.body;
    
    let newDiary;
    try {
        newDiary = new Diary({
            userid,
            timestamp,
            content,
            emotions,
            people,
            location,
            dialog: JSON.stringify(dialog),
            images,
            createdAt
        });
        await newDiary.save();
    } catch (err) {
        err && console.error(err);
        const error = new HttpError(
            'Creating diary entry failed, please try again.',
            500
        );
        return next(error);
    }

    res.status(201).json({ postId: newDiary.id, diary: newDiary });
};

//GET diary by postid
const retrieveDiary = async (req, res, next) => {
    let existingDiary;
    try {
        existingDiary = await Diary.findOne({ _id: req.params.pid }).populate('userid', '-password');
        if (!existingDiary) next(new HttpError(
            'Diary does not exist',
            400
        ))

    } catch (err) {
        const error = new HttpError(
            'Retrieving diary entry failed, please try again later.',
            500
        );
        return next(error);
    }
    
    res.json({ ...existingDiary._doc });
};

module.exports = {
    createDiary,
    retrieveDiary
};