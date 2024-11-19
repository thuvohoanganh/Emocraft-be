const OpenAI = require("openai")
const HttpError = require('../models/http-error');
const Diary = require('../models/diary');
const User = require('../models/user');
const Summary = require('../models/summary');
const {
    checkCriteriaExplorePhase,
    askMissingInfor,
    generateFeedbackPhase,
    confirmEmotions,
    generateAnalysis,
    retrieveRelevantDiaryByContext
} = require('./phase-controllers');
const { PHASE_LABEL } = require('../constant')
const { validationResult } = require('express-validator');
const { EMOTION_LIST } = require("../constant");
const Statistic = require('../models/statistic');

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

    const {userid, diaryid, diary, dialog, phase: currentPhase, analysis } = req.body
    let response = {
        phase: "",
        content: "",
        analysis: null,
    }
    let error = null
    let nextPhase = currentPhase
    let summary = null

    /* START: Check criteria in current phase */
    if (currentPhase === PHASE_LABEL.BEGINNING) {
        const result = await checkCriteriaExplorePhase(diary, dialog)
        nextPhase = result.next_phase
        error = result.error
        summary = result.summary
    } 
    else if (currentPhase === PHASE_LABEL.FULLFILL) {
        nextPhase = PHASE_LABEL.FEEDBACK
    } 

    if (!!error) {
        console.error(error)
        const _error = new HttpError(
            'chat fail',
            500
        );
        return next(_error);
    }
    /* END: Check criteria in current phase */

    console.log("nextPhase", nextPhase)

    /* START: Generate response */
    if (nextPhase === PHASE_LABEL.BEGINNING) {
        const result = await askMissingInfor(diary, dialog, summary)
        error = result.error
        response.phase = result.phase
        response.content = result.content
    } 
    else if (nextPhase === PHASE_LABEL.FULLFILL) {
        const result = await confirmEmotions(diary, userid)
        retrieveRelevantDiaryByContext(userid, diaryid, diary, dialog)
        error = result.error
        response.phase = result.phase
        response.content = result.content
        response.analysis = result.analysis
    } 
    else if (nextPhase === PHASE_LABEL.FEEDBACK) {
        const result = await generateFeedbackPhase(diary, dialog, userid)
        error = result.error
        response.phase = result.phase
        response.content = result.content
        response.analysis = result.analysis
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

    // Get the range of date for the week
    let today = new Date();
    let lastMonday, lastSunday;

    lastMonday = new Date(today);
    lastSunday = new Date(today);
    
    if (today.getDay() === 0) {
        lastMonday.setDate(today.getDate() - 7 - 6);
        // lastMonday.setDate(today.getDate() - 7);
    } else {
        lastMonday.setDate(today.getDate() - today.getDay() - 6);
        // lastMonday.setDate(today.getDate() - today.getDay());
    }

    lastMonday.setHours(0, 0, 0, 0);
    lastSunday.setDate(lastMonday.getDate() + 6);
    lastSunday.setHours(23, 59, 59, 999);    

    // Get the diary entries for the week
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
            //TO-DO: REPRESENT EMOTIONS THAT SHOWS USING BAR CHART?
            emotionPercentages: {},
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
    //TOOD: ADJUST THE EMOTION REPRESENTATION
    const dailyTopEmotions = {};
    // const emotionList = await getEmotionList(uid);
    const totalEmotions = {}

    // console.log("Getting emotions summary...\n");
    diaries.forEach(diary => {
        const day = dayMap[new Date(diary.timestamp).getDay()];
        // console.log(`day: ${day}\n`);
        const emotions = diary.emotions; // Directly use the `emotions` array from the diary structure.
    
        if (!Array.isArray(emotions)) {
            console.error(`Invalid emotions format for diary entry on ${diary.timestamp}`);
            return; // Skip this diary entry if `emotions` is not an array.
        }

        dailyTopEmotions[day] = emotions;
    
        // Add the emotions to the daily and total emotion counts
        emotions.forEach(emotion => {
            if (totalEmotions[emotion]) {
                totalEmotions[emotion] += 1;
            } else {
                totalEmotions[emotion] = 1;
            }
        });
    });
    
    // Log total emotions
    // console.log('totalEmotions:', totalEmotions);
    // console.log('dailyTopEmotions:', dailyTopEmotions);


    // Calculate percentage for each emotion
    const totalIntensity = Object.values(totalEmotions).reduce((sum, val) => sum + val, 0);
    const emotionPercentages = {};
    
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
        const date = new Date(diary.timestamp).toLocaleString(); 
        return `On ${date}: ${diary.content}`;
    }).join("\n\n");

    let summary;
    const user = await User.findById(uid);   
    if (!user) {
        throw new Error('User not found');
    }

    let existingSummary;
    try {
        existingSummary = await Summary.findOne({
            userid: uid,
            startdate: { $gte: lastMonday },
            enddate: { $lte: lastSunday },
            diaryEntries: contentToSummarize.trim() // Check if the same contentToSummarize exists
        });
    } catch (err) {
        console.error(err);
        return next(new HttpError('Fetching existing summary failed, please try again later.', 500));
    }

    if (existingSummary) {
        // console.log("Existing summary found with matching content:", existingSummary);
        return res.status(200).json(existingSummary);
    }

    // console.log("user:", user);

    try {
        const response = await openai.chat.completions.create({
            messages: [{
                role: "user",
                content: 
                `
                    - You are a helpful assistant that analyzes the content of diary entries.
                    - Given the diary entries for the past week, summarizes the experiences and emotions into a coherent paragraph.
                    - Start with a general but speific observation about the week's overall trend. Be concise in your summary.
                    - Use a third person view to for the summary and avoid including dates and times. Mention the user's name: ${user.name}.
                    - Here are the diary entries: ${contentToSummarize}
                `
            }],
            model: "gpt-3.5-turbo",
            temperature: 0,
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
        weeklyEmotions: Object.keys(totalEmotions),
        diaryEntries: contentToSummarize,
    });

    try {
        await newSummary.save();
    } catch (err) {
        console.error(err)
        return next(new HttpError('Saving summary failed, please try again later.', 500));
    }

    res.status(200).json(newSummary);
};

const getEmotionList = async (userid) => {
    const emotions = await Statistic.distinct( "subcategory", { category: "emotion", userid: userid } )    
    const presetEmotions = [...EMOTION_LIST.split(", ")]
    const mergeList = presetEmotions.concat(emotions)
    return [...new Set(mergeList)];
}

module.exports = {
    chatbotConversation,
    generateWeeklySummary,
}

