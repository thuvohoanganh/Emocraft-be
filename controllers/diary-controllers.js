const Diary = require('../models/diary');
const User = require('../models/user');
const HttpError = require('../models/http-error');
const { validationResult } = require('express-validator');
const { generateRationaleSummary } = require('./phase-controllers');

const createDiary = async (req, res, next) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return next(
            new HttpError(JSON.stringify(errors), 422)
        );
    }

    const { userid, timestamp, content } = req.body;

    let newDiary;
    try {
        newDiary = new Diary({
            userid,
            timestamp,
            content,
        });
        await newDiary.save();
    } catch (err) {
        err && console.error(err);
        const error = new HttpError(
            'Creating diary entry failed, please try again later.',
            500
        );
        return next(error);
    }

    res.status(201).json({ postId: newDiary.id, diary: newDiary });
};

const checkUserExists = async (userId) => {
    let existingUser;
    try {
        existingUser = await User.findOne({ _id: userId }, '-password');
        if (!existingUser) {
            throw new HttpError('User does not exist', 404);
        }
    } catch (err) {
        if (err instanceof HttpError) {
            throw err;
        }
        throw new HttpError('Fetching user failed, please try again later.', 500);
    }
    return existingUser;
};

//GET diary by postid
const retrieveDiary = async (req, res, next) => {
    let existingDiary;

    try {
        await checkUserExists(req.params.uid);
    } catch (err) {
        return next(err);
    }

    try {
        existingDiary = await Diary.findOne({ _id: req.params.pid, userid: req.params.uid })
        if (!existingDiary) {
            return next(new HttpError(
                'Diary does not exist',
                400
            ))
        }
    } catch (err) {
        const error = new HttpError(
            'Retrieving diary entry failed, please try again later.',
            500
        );
        return next(error);
    }

    res.json({ 
        ...existingDiary._doc, 
        emotions: existingDiary.emotions && JSON.parse(existingDiary.emotions),
        dialog: existingDiary.dialog? JSON.parse(existingDiary.dialog) : []
    });
};

const getDiaries = async (req, res, next) => {
    let diaries;
    let totalDiaries;
    let result;
    const { uid } = req.params

    // Uncomment to not let the system get diaries of dummy users (users who's userId is not real)
    // try {
    //     await checkUserExists(uid);
    // } catch (err) {
    //     return next(err);
    // }

    try {
        const page = parseInt(req.query.page);
        const limit = parseInt(req.query.limit);

        if (page < 0 || limit < 0) throw '';
        const startIndex = (page - 1) * limit;

        diaries = await Diary.find({ userid: uid }).skip(startIndex).limit(limit);
        totalDiaries = await Diary.find({ userid: uid }).count();

        result = {
            diaries: diaries.map(diary => {
                const _diary = diary.toObject({ getters: true })
                return {
                    ..._diary,
                    emotions: _diary.emotions && JSON.parse(_diary.emotions)
                }
            }),
            total_page: Math.ceil(totalDiaries / limit),
            current_page: page,
            total_diaries: totalDiaries
        }

    } catch (err) {
        console.log(err);
        const error = new HttpError(
            'Fetching diaries failed, please try again later.',
            500
        );
        return next(error);
    }
    res.json(result);
};

const updateDiary = async (req, res, next) => {
    const { uid, pid } = req.params;
    const { content, emotions, dialog, context } = req.body;

    let existingDiary;

    try {
        await checkUserExists(uid);
    } catch (err) {
        return next(err);
    }

    try {
        existingDiary = await Diary.findOne({ _id: pid, userid: uid });
        if (!existingDiary) next(new HttpError(
            'Diary does not exist',
            400
        ))

        if (content !== undefined) existingDiary.content = content;
        if (emotions !== undefined) existingDiary.emotions = JSON.stringify(emotions);
        if (dialog !== undefined) existingDiary.dialog = JSON.stringify(dialog);
        if (context !== undefined) existingDiary.context = JSON.stringify(context);

        existingDiary.createdAt = new Date();

        await existingDiary.save();

    } catch (err) {
        err && console.error(err);
        const error = new HttpError(
            'Retrieving diary entry failed, please try again later.',
            500
        );
        return next(error);
    }

    res.status(200).json({ message: 'Diary updated', diary: existingDiary });
};

const deleteDiary = async (req, res, next) => {
    const { uid, pid } = req.params;

    let existingDiary;

    try {
        await checkUserExists(uid);
    } catch (err) {
        return next(err);
    }

    try {
        existingDiary = await Diary.findOne({ _id: pid, userid: uid });
        if (!existingDiary) next(new HttpError(
            'Diary does not exist',
            400
        ))

        await existingDiary.remove();

    } catch (err) {
        const error = new HttpError(
            'Retrieving diary entry failed, please try again later.',
            500
        );
        return next(error);
    }

    res.status(200).json({ message: 'Diary deleted', postId: existingDiary.id });
}

const saveAnalysisRationale = async (req, res, next) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        console.error("saveAnalysisRationale:", errors)
        return next(
            new HttpError(JSON.stringify(errors), 422)
        );
    }

    const {userid, diaryid, diary, dialog, rationale } = req.body
    let response = ""

    try {
        response = await generateRationaleSummary(diary, dialog, rationale)
        if (!response) {
            throw("response empty")
        }
    } catch(err) {
        console.error("saveAnalysisRationale:", err)
        const errorResponse = new HttpError(
            'chat fail',
            500
        );
        return next(errorResponse);
    }
    

    try {
        const existingDiary = await Diary.findOne({ _id: diaryid, userid: userid });
        if(existingDiary) {
            existingDiary.rationale = response
            await existingDiary.save();
        }
    } catch (err) {
        console.error("saveAnalysisRationale")
        const errorResponse = new HttpError(
            'chat fail',
            500
        );
        return next(errorResponse);
    }

    res.status(200).json({
        data: response
    });
}


const updateDiarySummary = async (userId, diaryid, summary) => {
    if (!userId || !diaryid || !summary) return
    let existingDiary;

    try {
        existingDiary = await Diary.findOne({ _id: diaryid, userid: userId });
        if(existingDiary) {
            existingDiary.context = JSON.stringify(summary);
            await existingDiary.save();
        }
    } catch (err) {
        console.error("updateDiarySummary: ", err)
        return
    }
}

module.exports = {
    createDiary,
    retrieveDiary,
    getDiaries,
    updateDiary,
    deleteDiary,
    updateDiarySummary,
    saveAnalysisRationale
};