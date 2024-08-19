const OpenAI = require("openai")
const HttpError = require('../models/http-error');
const Diary = require('../models/diary');
const User = require('../models/user');
const Summary = require('../models/summary');
const {
    checkCriteriaExplorePhase,
    generateResponseExplorePhase,
    generateExplanationPhase,
    generateFeedbackPhase,

} = require('./phase-controller');
const { PHASE_LABEL } = require('../constant')
const { validationResult } = require('express-validator');
const { updateDiarySummary } = require('./diary-controllers');

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

    const {userid, diaryid, diary, dialog, phase: currentPhase } = req.body
    let response = {
        phase: "",
        content: "",
        analysis: null,
    }
    let error = null
    let nextPhase = currentPhase
    let summary = null

    // Check criteria in current phase
    if (currentPhase === PHASE_LABEL.EXPLORE) {
        const result = await checkCriteriaExplorePhase(diary, dialog)
        nextPhase = result.next_phase
        error = result.error
        summary = result.summary
    } else if (currentPhase === PHASE_LABEL.EXPLAIN) {
        nextPhase = PHASE_LABEL.FEEDBACK
    } 

    if (!!error) {
        console.error(error)
        const error = new HttpError(
            'chat fail',
            500
        );
        return next(error);
    }

    console.log("nextPhase", nextPhase)
    console.log("summary", summary)

    // generate response
    if (nextPhase === PHASE_LABEL.EXPLORE) {
        const result = await generateResponseExplorePhase(diary, dialog, summary)
        error = result.error
        response.phase = result.phase
        response.content = result.content
    } else if (nextPhase === PHASE_LABEL.EXPLAIN) {
        const result = await generateExplanationPhase(diary, dialog)
        error = result.error
        response.phase = result.phase
        response.content = result.content
        response.analysis = result.analysis
        response.rationale = result.rationale
    } else if (nextPhase === PHASE_LABEL.FEEDBACK) {
        const result = await generateFeedbackPhase(diary, dialog)
        error = result.error
        response.phase = result.phase
        response.content = result.content
    }
    if (!!error) {
        console.error("chatbotConversation error: ", error)
        const errorResponse = new HttpError(
            'chat fail',
            500
        );
        return next(errorResponse);
    }

    if (currentPhase === PHASE_LABEL.EXPLORE && nextPhase === PHASE_LABEL.EXPLAIN) {
        updateDiarySummary(userid, diaryid, summary)
    }

    console.log("response", response)
    console.log('------------------------------')
    res.status(200).json({
        data: response
    });
    return
}

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

// weekly summary
const generateWeeklySummary = async (req, res, next) => {
    const { uid } = req.params;

    try {
        await checkUserExists(uid);
    } catch (err) {
        return next(err);
    }

    let today = new Date();
    let lastMonday;
    let lastSunday;

    // Calculate the last Monday and last Sunday
    lastMonday = new Date(today);
    lastSunday = new Date(today);
    lastMonday.setDate(today.getDate() - today.getDay() - 6);
    lastMonday.setHours(0, 0, 0, 0);
    lastSunday.setDate(lastMonday.getDate() + 6);
    lastSunday.setHours(23, 59, 59, 999);

    let existingSummary;
    try {
        existingSummary = await Summary.findOne({
            userid: uid,
            startdate: { $gte: lastMonday },
            enddate: { $lte: lastSunday }
        });
    } catch (err) {
        err && console.log(err);
        return next(new HttpError('Fetching summary failed, please try again later.', 500));
    }

    // If summary already exists for the week, return it
    if (existingSummary) {
        return res.status(200).json(existingSummary);
    }


    let diaries;
    try {
        diaries = await Diary.find({
            userid: uid,
            timestamp: { $gte: lastMonday, $lte: lastSunday }
        });
    } catch (err) {
        err && console.log(err);
        const error = new HttpError(
            'Fetching diaries failed, please try again later.',
            500
        );
        return next(error);
    }

    if (!diaries || diaries.length === 0) {
        const error = new HttpError(
            'No diaries found for the last week.', 404
        );
        return next(error);
    }

    const contentToSummarize = diaries.map(diary => {
        const date = new Date(diary.timestamp).toLocaleString(); // Format timestamp to a readable format
        return `On ${date}: ${diary.content}`;
    }).join("\n\n");

    let summary;
    try {
        const response = await openai.chat.completions.create({
            messages: [{
                role: "user",
                content: `I wrote some diary entries for this past week.
                I want to understand my experiences and emotions better based on the diaries I wrote. 
                Please summarize them into a coherent paragraph and tell me what emotions I felt and why.
                Do not include any dates in the summary, try to make it short and easy to understand, and use you as the pronoun instead of I.
                Here are the entries:\n\n${contentToSummarize}`
            }],
            model: "gpt-3.5-turbo"
        });
        summary = response.choices[0].message.content.trim();
    } catch (err) {
        err && console.error(err);
        const error = new HttpError(
            'Summarizing diaries failed, please try again later.',
            500
        );
        return next(error);
    }

    const newSummary = new Summary({
        userid: uid,
        content: summary,
        startdate: lastMonday.toISOString(),
        enddate: lastSunday.toISOString(),
        emotions: ['joy', 'sadness'] // still a dummy
    });

    try {
        await newSummary.save();
    } catch (err) {
        return next(new HttpError('Saving summary failed, please try again later.', 500));
    }

    res.status(200).json(newSummary);
};

module.exports = {
    chatbotConversation,
    generateWeeklySummary
}

