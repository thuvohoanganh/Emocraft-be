const Diary = require('../models/diary');
const HttpError = require('../models/http-error');

const createDiary = async (req, res, next) => {
    const { postid, userid, timestamp, content, emotions, location } = req.body;

    const newDiary = new Diary({
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

    try {
        await newDiary.save();
    } catch (err) {
        const error = new HttpError('Creating diary post failed, please try again.', 500);
        return next(error);
    }

    res.status(201).json({ diary: newDiary });
};

//GET diary by postid
const retrieveDiary = async (req, res, next) => {
    const postID = req.params.id;

    let diary;
    try {
        diary = await Diary.findById(postID).populate('userid', '-password');
    } catch (err) {
        const error = new HttpError('Retrieving diary entry failed, please try again later.', 500);
        return next(error);
    }

    if (!diary) {
        const error = new HttpError('Diary entry not found.', 404);
        return next(error);
    }

    res.json({ diary });
};

module.exports = {
    createDiary,
    retrieveDiary
};