const Diary = require('../models/diary');
const Statistic = require('../models/statistic');
const User = require('../models/user');
const HttpError = require('../models/http-error');
const { validationResult } = require('express-validator');
const { categorizeContext } = require('./phase-controllers');
const { minmaxScaling } = require('../utils');

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
        emotions: existingDiary.emotions,
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
    const { content, emotions, dialog, context, timestamp } = req.body;

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
        if (timestamp !== undefined) existingDiary.timestamp = timestamp;

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

const encode = async (req, res, next) => {
    const {userid, diaryid, dialog, emotions} = req.body

    let existingDiary;

    try {
        await checkUserExists(userid);
    } catch (err) {
        return next(err);
    }

    try {
        existingDiary = await Diary.findOne({ _id: diaryid, userid: userid });
        if (!existingDiary) next(new HttpError(
            'Diary does not exist',
            400
        ))

        if (emotions !== undefined) existingDiary.emotions = emotions;
        if (dialog !== undefined) existingDiary.dialog = JSON.stringify(dialog);

        await existingDiary.save();

    } catch (err) {
        err && console.error(err);
        const error = new HttpError(
            'Retrieving diary entry failed, please try again later.',
            500
        );
        return next(error);
    }

    try {
        const context = await categorizeContext(existingDiary.content, dialog, userid)

        if (context.location) {
            existingDiary.location = context.location 
            const contextFactor = await Statistic.findOne({ category: "location", subcategory: context.location, userid });
            if (contextFactor) {
                contextFactor.quantity += 1;
                contextFactor.save();
            } else {
                const newSubcategory = new Statistic({
                    category: "location",
                    subcategory: context.location,
                    userid: userid,
                    quantity: 1,
                });
                newSubcategory.save();
            }
        }
        if (context.people) { 
            existingDiary.people = context.people 
            const contextFactor = await Statistic.findOne({ category: "people", subcategory: context.people, userid });
            if (contextFactor) {
                contextFactor.quantity += 1;
                contextFactor.save();
            } else {
                const newSubcategory = new Statistic({
                    category: "people",
                    subcategory: context.people,
                    userid: userid,
                    quantity: 1,
                });
                newSubcategory.save();
            }
        }
        if (context.activity) { 
            existingDiary.activity = context.activity 
            const contextFactor = await Statistic.findOne({ category: "activity", subcategory: context.activity, userid: userid });
            if (contextFactor) {
                contextFactor.quantity += 1;
                contextFactor.save();
            } else {
                const newSubcategory = new Statistic({
                    category: "activity",
                    subcategory: context.activity,
                    userid: userid,
                    quantity: 1,
                });
                newSubcategory.save();
            }
        }
        if (context.time_of_day) { 
            existingDiary.time_of_day = context.time_of_day 
            const contextFactor = await Statistic.findOne({ category: "time_of_day", subcategory: context.time_of_day, userid });
            if (contextFactor) {
                contextFactor.quantity += 1;
                contextFactor.save();
            } else {
                const newSubcategory = new Statistic({
                    category: "time_of_day",
                    subcategory: context.time_of_day,
                    userid: userid,
                    quantity: 1,
                });
                newSubcategory.save();
            }
        }
        if (emotions?.length > 0) {
            emotions.forEach(async (e) => {
                const emotionFactor = await Statistic.findOne({ category: "emotion", subcategory: e, userid });
                if (emotionFactor) {
                    emotionFactor.quantity += 1;
                    emotionFactor.save();
                } else {
                    const newSubcategory = new Statistic({
                        category: "emotion",
                        subcategory: e,
                        userid: userid,
                        quantity: 1,
                    });
                    newSubcategory.save();
                }
            }) 
        }

        await existingDiary.save();

    } catch (err) {
        err && console.error(err);
        const error = new HttpError(
            'Fail to detect context',
            500
        );
        return next(error);
    }
    
    res.status(200).json({ message: 'Diary updated', diary: existingDiary });
} 

const consolidate = async (req, res, next) => {
    // console.log("consolidate-----------------")
    const {userid} = req.body
    try {
        await checkUserExists(userid);
    } catch (err) {
        return next(err);
    }

    const currentTime = new Date()
    let diaries;
    const statistic = {
        location: {},
        people: {},
        time_of_day: {},
        activity: {},
        emotion: {}
    }
    let timeArray = [];
    let frequencyArray = [];
    let emotionSaliencyArray = [];
    let contextSaliencyArray = [];

    try {
        const categories = await Statistic.find({
            category: {
                $in: ["location", "people", "time_of_day", "activity", "emotion"]
            },
            userid: userid,
        })
        categories.forEach(e => {
            if (statistic[e.category]) {
                statistic[e.category][e.subcategory] = e.quantity
            } else {
                statistic[e.category] = {
                    [e.subcategory]: e.quantity
                }
            }
        })
    } catch(err) {
        console.error("consolidate", err)
    }

    try {
        diaries = await Diary.find({ userid: userid });
        if (!diaries) {
            next(new HttpError(
                'Diary does not exist',
                400
            ))
            return
        } 

        diaries.forEach(diary => {
            const writingTime = new Date(diary.timestamp)
            const timeDistance = currentTime.getTime() - writingTime.getTime()
            const t = Math.round(timeDistance/(1000*3600*24))

            const locationSaliency = statistic['location'][diary.location]? 1/statistic['location'][diary.location] : 0;
            const peopleSaliency = statistic['people'][diary.people]? 1/statistic['people'][diary.people] : 0;
            const activitySaliency = statistic['activity'][diary.activity]? 1/statistic['activity'][diary.activity] : 0;
            const timeOfDaySaliency = statistic['time_of_day'][diary.time_of_day]? 1/statistic['time_of_day'][diary.time_of_day] : 0;

            const context_saliency = locationSaliency + peopleSaliency + activitySaliency + timeOfDaySaliency
            let emotionSaliency = 0
            diary.emotions.forEach(e => {
                emotionSaliency += statistic['emotion'][e]? 1/statistic['emotion'][e] : 0;

            })

            timeArray.push(t)
            frequencyArray.push(diary.frequency)
            contextSaliencyArray.push(context_saliency)
            emotionSaliencyArray.push(emotionSaliency)
            // console.log(diary.location,locationSaliency, diary.people,peopleSaliency, diary.activity, activitySaliency, diary.time_of_day , timeOfDaySaliency, context_saliency, diary.emotions, emotionSaliency)
        })

        let timeArrayMinmax = minmaxScaling(timeArray);
        let frequencyArrayMinmax = minmaxScaling(frequencyArray);
        let emotionSaliencyArrayMinmax = minmaxScaling(emotionSaliencyArray);
        let contextSaliencyArrayMinmax = minmaxScaling(contextSaliencyArray);

        diaries.forEach((diary, index) => {
            const t = timeArrayMinmax[index];
            const f = frequencyArrayMinmax[index];
            const contextSaliency = contextSaliencyArrayMinmax[index];
            const emotionSaliency = emotionSaliencyArrayMinmax[index];
            const contextRetention = f+contextSaliency > 0? Math.exp(-t/(f+contextSaliency)) : 0;
            const emotionRetention = f+emotionSaliency >0 ? Math.exp(-t/(f+emotionSaliency)) : 0;

            // console.log("contextRetention", contextRetention, t, f, contextSaliency)
            diary.context_retention = contextRetention
            diary.emotion_retention = emotionRetention

            diary.save()
        })
    } catch (err) {
        err && console.error(err);
        const error = new HttpError(
            'Calculate retention diary entry failed, please try again later.',
            500
        );
        return next(error);
    }
    
    res.status(200).json({ message: 'Diary updated consolidateion' });
} 

module.exports = {
    createDiary,
    retrieveDiary,
    getDiaries,
    updateDiary,
    deleteDiary,
    encode,
    consolidate,
};