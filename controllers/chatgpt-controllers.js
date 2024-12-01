const OpenAI = require("openai")
const HttpError = require('../models/http-error');
const Diary = require('../models/diary');
const User = require('../models/user');
const Summary = require('../models/summary');
const {
    checkCriteriaExplorePhase,
    checkUserSatisfaction,
    askMissingInfor,
    reviseEmotionClassification,
    reviseEmotionReflection,
    classifyEmotion,
    generateEmotionReflection,
    generateGoodbye
} = require('./phase-controllers');
const { PHASE_LABEL } = require('../constant')
const { validationResult } = require('express-validator');

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

    const {userid, diaryid, diary, dialog, phase: currentPhase, emotions } = req.body
    let response = {
        phase: "",
        content: "",
        analysis: null,
    }
    let error = null
    let nextPhase = currentPhase
    let summary = null

    console.log("currentPhase", currentPhase)
    /* START: Check criteria in current phase, define the next phase */
    if (currentPhase === PHASE_LABEL.BEGINNING) {
        const result = await checkCriteriaExplorePhase(diary, dialog)
        nextPhase = result.next_phase
        error = result.error
        summary = result.summary
    } else if (currentPhase === PHASE_LABEL.EMOTION_LABEL) {
        nextPhase = PHASE_LABEL.REFLECTION
    } else if (currentPhase === PHASE_LABEL.REVISE_EMOTION_LABEL) {
        nextPhase = PHASE_LABEL.REVISE_REFLECTION
    } else if (currentPhase === PHASE_LABEL.REFLECTION) {
        const result = await checkUserSatisfaction(diary, dialog)
        nextPhase = result.next_phase
    } else if (currentPhase === PHASE_LABEL.REVISE_REFLECTION) {
        const result = await checkUserSatisfaction(diary, dialog)
        nextPhase = result.next_phase
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

    console.log("nextPhase", nextPhase)

    /* START: Generate response */
    if (nextPhase === PHASE_LABEL.BEGINNING) {
        const result = await askMissingInfor(diary, dialog, summary)
        error = result.error
        response.phase = result.phase
        response.content = result.content
    } 
    else if (nextPhase === PHASE_LABEL.EMOTION_LABEL) {
        const result = await classifyEmotion(diary, userid)
        error = result.error
        response.phase = result.phase
        response.content = result.content
        response.analysis = result.analysis
    } 
    else if (nextPhase === PHASE_LABEL.REFLECTION) {
        const result = await generateEmotionReflection(userid, diaryid, diary, dialog, emotions)
        error = result.error
        response.phase = result.phase
        response.content = result.content
    } 
    else if (nextPhase === PHASE_LABEL.REVISE_EMOTION_LABEL) {
        const result = await reviseEmotionClassification(diary, dialog, userid)
        error = result.error
        response.phase = result.phase
        response.content = result.content
        response.analysis = result.analysis
    }
    else if (nextPhase === PHASE_LABEL.REVISE_REFLECTION) {
        const result = await reviseEmotionReflection(userid, diaryid, diary, dialog, emotions)
        error = result.error
        response.phase = result.phase
        response.content = result.content
        response.analysis = result.analysis
    }
    else if (nextPhase === PHASE_LABEL.GOODBYE) {
        const result = await generateGoodbye(diary, dialog)
        error = result.error
        response.phase = result.phase
        response.content = result.content
    }
    /* START: generate response */

    if (!!error) {
        console.error("chatbotConversation error: ", error)
        const errorResponse = new HttpError(
            'chat fail',
            500
        );
        return next(errorResponse);
    }

    if (response.content?.[0] === "") {
        response.content = response.content.replace(/^\"+|\"+$/gm,'')
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
    let lastMonday, lastSunday;

    // Calculate the last Monday and last Sunday
    lastMonday = new Date(today);
    lastSunday = new Date(today);
    
    if (today.getDay() === 0) {
        lastMonday.setDate(today.getDate() - 7 - 6);
    } else {
        lastMonday.setDate(today.getDate() - today.getDay() - 6);
    }

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

        diaries.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    } catch (err) {
        err && console.log(err);
        const error = new HttpError(
            'Fetching diaries failed, please try again later.',
            500
        );
        return next(error);
    }

    if (!diaries || diaries.length === 0) {
        const newSummary = new Summary({
            userid: uid,
            content: "You didn't write anything last week",
            startdate: lastMonday.toISOString(),
            enddate: lastSunday.toISOString(),
            dailyEmotions: {},
            emotionPercentages: { joy: 0, sadness: 0, disgust: 0, anger: 0, fear: 0, surprise: 0 },
            weeklyEmotions: []
        });
    
        try {
            await newSummary.save();
        } catch (err) {
            console.error(err)
            return next(new HttpError('Saving summary failed, please try again later.', 500));
        }
    
        return res.status(200).json(newSummary);
    }

    const dayMap = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    // Processing the emotions
    const dailyTopEmotions = {};
    const totalEmotions = { joy: 0, sadness: 0, disgust: 0, anger: 0, fear: 0, surprise: 0 };

    diaries.forEach(diary => {
        const { emotions, timestamp } = diary;
        const day = dayMap[new Date(timestamp).getDay()];

        let parsedEmotions;
        try {
            if (emotions) {
                parsedEmotions = JSON.parse(emotions);
            } else {
                parsedEmotions = {}; 
            }
        } catch (err) {
            console.error(`Failed to parse emotions for diary entry on ${timestamp}:`, err);
            parsedEmotions = {};
        }

        if (!dailyTopEmotions[day]) {
            dailyTopEmotions[day] = { ...parsedEmotions };
        } else {
            // Aggregate emotions for the same day
            for (const emotion in parsedEmotions) {
                dailyTopEmotions[day][emotion] += parsedEmotions[emotion];
            }
        }

        // Accumulate total emotions for the week
        for (const emotion in parsedEmotions) {
            if (!isNaN(totalEmotions[emotion])) {
                totalEmotions[emotion] += parsedEmotions[emotion];
            }
        }
    });

    console.log('totalEmotions:', totalEmotions);

    // Determine top 2 emotions for each day
    for (const day in dailyTopEmotions) {
        const topTwo = Object.entries(dailyTopEmotions[day])
            .filter(([, intensity]) => intensity > 0)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 2)
            .map(([emotion]) => emotion);

        dailyTopEmotions[day] = topTwo;
    }

    // Determine top 2 emotions for the entire week
    const topTwoWeekly = Object.entries(totalEmotions)
        .filter(([, intensity]) => intensity > 0)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 2)
        .map(([emotion]) => emotion);

    // Calculate percentage for each emotion
    const totalIntensity = Object.values(totalEmotions).reduce((sum, val) => sum + val, 0);
    const emotionPercentages = {joy: 0, sadness: 0, disgust: 0, anger: 0, fear: 0, surprise: 0 };
    
    if (totalIntensity > 0) {
        for (const emotion in totalEmotions) {
            const value = totalEmotions[emotion];
            if (!isNaN(value) && value >= 0) {
                emotionPercentages[emotion] = ((value / totalIntensity) * 100).toFixed(1);
            }
        }
    }

    console.log('emotionPercentages:', emotionPercentages);

    // Summarize the diary entries
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
                Please summarize them into a coherent paragraph and tell me what emotions I felt and why in the third view.
                Do not include any dates and time in the summary, try to make it short and easy to understand, and use you as the pronoun instead of I.
                Ex: When work is hectic and Susan has a lot to do, she feels happy and proud, as seen in her recent entry where she described the day as reminiscent of the "good old days." She enjoys the feeling of being overwhelmed and productive, which brings her satisfaction and a sense of accomplishment.
                Here are the entries:\n\n${contentToSummarize}`
            }],
            model: "gpt-3.5-turbo"
        });
        summary = response.choices[0].message.content.trim();
    } catch (err) {
        console.error(err);
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
        dailyEmotions: dailyTopEmotions,
        emotionPercentages: emotionPercentages,
        weeklyEmotions: topTwoWeekly
    });

    try {
        await newSummary.save();
    } catch (err) {
        console.error(err)
        return next(new HttpError('Saving summary failed, please try again later.', 500));
    }

    res.status(200).json(newSummary);
};

module.exports = {
    chatbotConversation,
    generateWeeklySummary,
}
