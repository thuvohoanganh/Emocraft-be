const OpenAI = require("openai")
const HttpError = require('../models/http-error');
const Diary = require('../models/diary');
const User = require('../models/user');
const Summary = require('../models/summary');
const {
    checkMissingContext,
    checkEmotionExpressed,
    checkReasonClear
} = require('./phase-controllers');
const {
    askMissingInfor,
    recognizeEmotion,
    reflectNegativeEmotion,
    generateGoodbye,
    reflectPositiveEmotion,
} = require('./response-controllers');
const { PHASE_LABEL, GPT } = require('../constant')
const { validationResult } = require('express-validator');
const chalk = require('chalk');
const {
    recognizeEmotionNoMem,
    reflectNegativeEmotionNoMem,
    reflectPositiveEmotionNoMem,
} = require('./response-no-memory-controllers')

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const chatbotConversation = async (req, res, next) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        console.error("chatbotConversation err:", errors)
        return next(
            new HttpError(JSON.stringify(errors), 422)
        );
    }

    const { userid, diaryid, diary, dialog, phase: currentPhase, emotions } = req.body
    let response = {
        phase: "",
        content: "",
        analysis: null,
    }
    let error = null
    let nextPhase = currentPhase
    let summary = null

    /* START: Check criteria in current phase, define the next phase */
    if (currentPhase === PHASE_LABEL.PHASE_1) {
        const result = await checkMissingContext(diary, dialog, diaryid)
        nextPhase = result.next_phase
        error = result.error
        summary = result.summary
    }
    else if (currentPhase === PHASE_LABEL.PHASE_2 || currentPhase === PHASE_LABEL.PHASE_3) {
        const result = await checkEmotionExpressed(diary, dialog, diaryid)
        nextPhase = result.next_phase
        error = result.error
    }
    else if (currentPhase === PHASE_LABEL.PHASE_4) {
        const result = await checkReasonClear(diary, dialog, currentPhase, diaryid)
        nextPhase = result.next_phase
        error = result.error
    }
    else if (currentPhase === PHASE_LABEL.PHASE_5) {
        const result = await checkReasonClear(diary, dialog, currentPhase, diaryid)
        nextPhase = result.next_phase
        error = result.error
    }

    if (!!error) {
        console.error(error)
        const _error = new HttpError(
            'chat fail',
            500
        );
        return next(_error);
    }
    /* END: Check criteria in current phase, define the next phase */

    // console.log("nextPhase", nextPhase)

    /* START: Generate response */
    if (nextPhase === PHASE_LABEL.PHASE_1) {
        const result = await askMissingInfor(diary, dialog, summary)
        error = result.error
        response.phase = result.phase
        response.content = result.content
    }
    else if (nextPhase === PHASE_LABEL.PHASE_2) {
        const result = await recognizeEmotion(diaryid, diary, userid, dialog)
        error = result.error
        response.phase = result.phase
        response.content = result.content
    }
    else if (nextPhase === PHASE_LABEL.PHASE_4) {
        const result = await reflectNegativeEmotion(userid, diaryid, diary, dialog, emotions)
        error = result.error
        response.phase = result.phase
        response.content = result.content
    }
    else if (nextPhase === PHASE_LABEL.PHASE_5) {
        const result = await reflectPositiveEmotion(userid, diaryid, diary, dialog, emotions)
        error = result.error
        response.phase = result.phase
        response.content = result.content
        response.analysis = result.analysis
    }
    else if (nextPhase === PHASE_LABEL.PHASE_6) {
        const result = await generateGoodbye(diary, dialog)
        error = result.error
        response.phase = result.phase
        response.content = result.content
    }
    /* START: generate response */

    if (error) {
        console.error("chatbotConversation error: ", error)
        const errorResponse = new HttpError(
            'chat fail',
            500
        );
        return next(errorResponse);
    }

    if (response.content?.[0] === "") {
        response.content = response.content.replace(/^\"+|\"+$/gm, '')
    }

    res.status(200).json({
        data: response
    });
    return
}

const generateWeeklySummary = async (uid, startDate, endDate) => {
    // print params, recheck if the params are correct
    // console.log('generateWeeklySummary params:', startDate, endDate);

    const diaries = await getWeeklyEntries(uid, startDate, endDate);
    if (!diaries || diaries.length < 3) {
        return null;
    }

    const dailyTopEmotions = [];
    const totalEmotions = {};
    let totalIntensity = 0
    const emotionPercentages = [];

    diaries.forEach(diary => {
        const emotions = diary.emotions;

        if (!Array.isArray(emotions)) {
            console.error(`Invalid emotions format for diary entry on ${diary.timestamp}`);
            return;
        }

        const item = {
            timestamp: diary.timestamp,
            emotions: diary.emotions,
            content: diary.content,
            diaryId: diary._id
        }
        dailyTopEmotions.push(item)

        if (emotions) {
            emotions.forEach(emotion => {
                if (emotion != "[]") {
                    if (totalEmotions[emotion]) {
                        totalEmotions[emotion] += 1;
                    } else {
                        totalEmotions[emotion] = 1;
                    }
                    totalIntensity += 1
                }
            });
        }
    });

    if (totalIntensity > 0) {
        for (const emotion in totalEmotions) {
            const value = totalEmotions[emotion];
            if (!isNaN(value) && value >= 0) {
                emotionPercentages.push({
                    emotion: emotion,
                    percentage: ((value / totalIntensity) * 100).toFixed(1)
                })
            }
        }
    }

    emotionPercentages.sort((a, b) => b.percentage - a.percentage)

    const contentToSummarize = diaries.map(diary => {
        const date = new Date(diary.timestamp).toLocaleString();
        return `On ${date}: ${diary.content}`;
    }).join("\n\n");

    let summary;
    const user = await User.findById(uid);
    if (!user) {
        throw new Error('User not found');
    }

    // SANITY CHECK FOR GENERATING SUMMARY
    // console.log(`Summarizing entries from ${startDate} to ${endDate}`);
    // console.log('Diary entries:', contentToSummarize);
    // console.log(`Generating summary......\n`);

    try {
        const response = await openai.chat.completions.create({
            messages: [{
                role: "system",
                content: `
                    - You are a helpful assistant that analyzes the content of diary entries.
                    - Given the diary entries for the past week, summarizes the experiences and emotions into a coherent paragraph.
                    - Start with a general but specific observation about the week's overall trend. Be concise in your summary.
                    - Use a third person view for the summary and avoid including dates and times. Mention the user's name: ${user.name}. User's gender is ${user.gender}. 
                    - Diaries owner can use English or Korean, generate response in the language that is the same as diary entries.
                    - Here are the diary entries: ${contentToSummarize}
                `
            }],
            model: GPT.MODEL,
            temperature: 0,
        });
        summary = response.choices[0].message.content.trim();
    } catch (err) {
        console.error(err);
        throw new Error('Summarizing diaries failed, please try again later.');
    }

    const newSummary = new Summary({
        userid: uid,
        content: summary,
        startdate: startDate,
        enddate: endDate,
        dailyEmotions: JSON.stringify(dailyTopEmotions),
        emotionPercentages: JSON.stringify(emotionPercentages),
        weeklyEmotions: emotionPercentages.map(e => e.emotion),
    });

    // console.log("newSummary", newSummary)
    try {
        await newSummary.save();
        // console.log('Successfully saved new weekly summary');
    } catch (err) {
        console.error(err);
        throw new Error('Saving summary failed, please try again later.');
    }

    return newSummary;
}


const getWeeklyEntries = async (uid, startDate, endDate) => {
    let diaries;
    try {
        diaries = await Diary.find({
            userid: uid,
            timestamp: { $gte: startDate, $lte: endDate }
        })
            .sort({ timestamp: -1 });
    } catch (err) {
        console.error('Error fetching diaries:', err);
        throw new HttpError('Fetching diaries failed, please try again later.', 500);
    }

    if (!diaries || diaries.length < 3) {
        return null;
    }

    return diaries;
}

const checkAndFulfillSummary = async (req, res, next) => {
    const uid = req.params.uid;
    let oldestDiary, newestDiary;
    try {
        oldestDiary = await Diary.findOne({ userid: uid }).sort({ timestamp: 1 }).select('timestamp');
        newestDiary = await Diary.findOne({ userid: uid }).sort({ timestamp: -1 }).select('timestamp');
    } catch (err) {
        console.error(err);
        return res.status(200).json([]);
    }

    if (!oldestDiary || !newestDiary) {
        return res.status(200).json([]);
    }

    let from = new Date(oldestDiary.timestamp);
    let to = new Date(newestDiary.timestamp);

    const weekMarker = [];

    while (from <= to) {
        weekMarker.push(new Date(from));
        from.setDate(from.getDate() + 7);
    }

    console.log('weekMarker:', weekMarker);

    for (let index = 0; index < weekMarker.length - 1; index++) {
        const start = new Date(weekMarker[index]);
        const end = new Date(weekMarker[index]);
        start.setDate(start.getDate() - 1);
        end.setDate(start.getDate() + 1);



        let existingSummary = null;
        try {
            existingSummary = await Summary.findOne({
                userid: uid,
                startdate: { $gt: start, $lt: end },
            })

            const startDate = new Date(weekMarker[index]);
            const endDate = new Date(weekMarker[index]);
            endDate.setDate(endDate.getDate() + 6);

            startDate.setHours(0, 0, 0, 0);
            endDate.setHours(23, 59, 59, 999);

            if (!existingSummary) {
                // console.log(chalk.bgRed(`Summary for week ${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()} is missing`));

                // Call generateWeeklySummary to generate the summary
                try {
                    const result = await generateWeeklySummary(uid, startDate.toISOString(), endDate.toISOString());
                    // console.log(chalk.green('Generated summary:'), result);
                } catch (error) {
                    console.error(error);
                    // console.log(chalk.red('Error generating summary for week', startDate.toLocaleDateString(), '-', endDate.toLocaleDateString()));
                }
            } else {
                // console.log(`${chalk.bgYellow(`Summary for week ${startDate.toISOString()} - ${endDate.toISOString()} exists:`)} ${existingSummary._id}`);
            }
        } catch (err) {
            console.error(err);
            return res.status(200).json([]);
        }
    }

    let summaries = [];
    try {
        summaries = await Summary.find({ userid: uid });
    } catch (err) {
        console.error(err);
        return res.status(200).json([]);
    }
    res.status(200).json(summaries);
}

const getWeeklySummaries = async (req, res, next) => {
    const uid = req.params.uid;

    // get all summaries
    let summaries = [];
    try {
        summaries = await Summary.find({ userid: uid }).sort({ startdate: -1 });
        if (summaries.length > 0) {
            summaries = summaries.map(e => ({
                _id: e._id,
                userid: e.userid,
                content: e.content,
                startdate: e.startdate,
                enddate: e.enddate,
                dailyEmotions: JSON.parse(e.dailyEmotions),
                weeklyEmotions: e.weeklyEmotions,
                emotionPercentages: JSON.parse(e.emotionPercentages)
            }))
        }
    } catch (err) {
        console.error(err);
        return next(new HttpError('Fetching summaries failed, please try again later.', 500));
    }

    res.status(200).json(summaries);
}

const getWeeklySummary = async (req, res, next) => {
    const id = req.params.id;

    let summary = null;
    try {
        summary = await Summary.findOne({ _id: id });

        summary = {
            id: summary._id,
            userid: summary.userid,
            content: summary.content,
            startdate: summary.startdate,
            enddate: summary.enddate,
            dailyEmotions: JSON.parse(summary.dailyEmotions),
            weeklyEmotions: summary.weeklyEmotions,
            emotionPercentages: JSON.parse(summary.emotionPercentages)
        }

    } catch (err) {
        console.error(err);
        return next(new HttpError('Fetching summaries failed, please try again later.', 500));
    }

    res.status(200).json(summary);
}

const chatbotConversationNoMem = async (req, res, next) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        console.error("chatbotConversation err:", errors)
        return next(
            new HttpError(JSON.stringify(errors), 422)
        );
    }

    const { userid, diaryid, diary, dialog, phase: currentPhase, emotions } = req.body
    let response = {
        phase: "",
        content: "",
        analysis: null,
    }
    let error = null
    let nextPhase = currentPhase
    let summary = null

    /* START: Check criteria in current phase, define the next phase */
    if (currentPhase === PHASE_LABEL.PHASE_1) {
        const result = await checkMissingContext(diary, dialog, diaryid)
        nextPhase = result.next_phase
        error = result.error
        summary = result.summary
    }
    else if (currentPhase === PHASE_LABEL.PHASE_2 || currentPhase === PHASE_LABEL.PHASE_3) {
        const result = await checkEmotionExpressed(diary, dialog, diaryid)
        nextPhase = result.next_phase
        error = result.error
    }
    else if (currentPhase === PHASE_LABEL.PHASE_4) {
        const result = await checkReasonClear(diary, dialog, currentPhase, diaryid)
        nextPhase = result.next_phase
        error = result.error
    }
    else if (currentPhase === PHASE_LABEL.PHASE_5) {
        const result = await checkReasonClear(diary, dialog, currentPhase, diaryid)
        nextPhase = result.next_phase
        error = result.error
    }

    if (!!error) {
        console.error(error)
        const _error = new HttpError(
            'chat fail',
            500
        );
        return next(_error);
    }
    /* END: Check criteria in current phase, define the next phase */

    // console.log("nextPhase", nextPhase)

    /* START: Generate response */
    if (nextPhase === PHASE_LABEL.PHASE_1) {
        const result = await askMissingInfor(diary, dialog, summary)
        error = result.error
        response.phase = result.phase
        response.content = result.content
    }
    else if (nextPhase === PHASE_LABEL.PHASE_2) {
        const result = await recognizeEmotionNoMem(diary, userid, dialog)
        error = result.error
        response.phase = result.phase
        response.content = result.content
    }
    else if (nextPhase === PHASE_LABEL.PHASE_4) {
        const result = await reflectNegativeEmotionNoMem(userid, diaryid, diary, dialog, emotions)
        error = result.error
        response.phase = result.phase
        response.content = result.content
    }
    else if (nextPhase === PHASE_LABEL.PHASE_5) {
        const result = await reflectPositiveEmotionNoMem(userid, diaryid, diary, dialog, emotions)
        error = result.error
        response.phase = result.phase
        response.content = result.content
        response.analysis = result.analysis
    }
    else if (nextPhase === PHASE_LABEL.PHASE_6) {
        const result = await generateGoodbye(diary, dialog)
        error = result.error
        response.phase = result.phase
        response.content = result.content
    }
    /* START: generate response */

    if (error) {
        console.error("chatbotConversation error: ", error)
        const errorResponse = new HttpError(
            'chat fail',
            500
        );
        return next(errorResponse);
    }

    if (response.content?.[0] === "") {
        response.content = response.content.replace(/^\"+|\"+$/gm, '')
    }

    // console.log("chatbotConversationNoMem", response)
    // console.log('------------------------------')
    res.status(200).json({
        data: response
    });
    return
}

module.exports = {
    chatbotConversation,
    checkAndFulfillSummary,
    getWeeklySummaries,
    getWeeklySummary,
    chatbotConversationNoMem
}
