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
    generateGoodbye,
    getEmotionList
} = require('./phase-controllers');
const { PHASE_LABEL } = require('../constant')
const { validationResult } = require('express-validator');
const chalk = require('chalk');


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
const generateWeeklySummary = async (uid, startDate, endDate) => {
    // print params, recheck if the params are correct
    // console.log('generateWeeklySummary params:', startDate, endDate);
    // console.log('\n');

    const diaries = await getWeeklyEntries(uid, startDate, endDate);
    if (!diaries || diaries.length < 3) {
        return null;
    }

    const dayMap = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const dailyTopEmotions = {};
    const totalEmotions = {};
    const emotionList = await getEmotionList(uid);

    diaries.forEach(diary => {
        const day = dayMap[new Date(diary.timestamp).getDay()];
        const emotions = diary.emotions;

        if (!Array.isArray(emotions)) {
            console.error(`Invalid emotions format for diary entry on ${diary.timestamp}`);
            return;
        }

        dailyTopEmotions[day] = emotions?.filter(emotion => emotionList.includes(emotion)) || [];

        if (emotions) {
            emotions.forEach(emotion => {
                if (emotion != "[]") {
                    if (totalEmotions[emotion]) {
                        totalEmotions[emotion] += 1;
                    } else {
                        totalEmotions[emotion] = 1;
                    }
        }});
        }
    });

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
    
    const contentToSummarize = diaries.map(diary => {
        const date = new Date(diary.timestamp).toLocaleString();
        return `On ${date}: ${diary.content}`;
    }).join("\n\n");

    contentIDs = diaries.map(diary => diary._id);

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
                    - Use a third person view for the summary and avoid including dates and times. Mention the user's name: ${user.name}.
                    - Diaries owner can use English or Korean, generate response in the language that is the same as diary entries.
                    - Here are the diary entries: ${contentToSummarize}
                `
            }],
            model: "gpt-4",
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
        dailyEmotions: dailyTopEmotions,
        emotionPercentages: emotionPercentages,
        weeklyEmotions: Object.keys(emotionPercentages),
        diaryEntries: contentIDs,
    });

    try {
        await newSummary.save();
        console.log('Successfully saved new weekly summary');
    } catch (err) {
        console.error(err);
        throw new Error('Saving summary failed, please try again later.');
    }

    return newSummary;
}


const getWeeklyEntries = async ( uid, startDate, endDate ) => {
    let diaries;
    try {
        diaries = await Diary.find({
            userid: uid,
            timestamp: { $gte: startDate, $lte: endDate }
        });
    
        diaries.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
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
        console.log('oldestDiary:', oldestDiary);
        console.log('newestDiary:', newestDiary);
    } catch (err) {
        console.error(err);
        return res.status(200).json([]);
    }

    if (!oldestDiary || !newestDiary) {
        return res.status(200).json([]);
    }

    let curr = new Date(oldestDiary.timestamp);
    const weekMarker = [new Date(curr)];

    while (curr < newestDiary.timestamp) {
        curr.setDate(curr.getDate() + 7);
        if (curr < newestDiary.timestamp) {
            weekMarker.push(new Date(curr));
        }
    }

    console.log('weekMarker:', weekMarker);

    for (let index = 0; index < weekMarker.length - 1; index++) {
        const startDate = new Date(weekMarker[index]);
        startDate.setHours(0, 0, 0, 0);

        const endDate = new Date(weekMarker[index + 1]);
        endDate.setDate(endDate.getDate() - 1);
        endDate.setHours(23, 59, 59, 999);

        let existingSummary;
        try {
            existingSummary = await Summary.findOne({
                userid: uid,
                startdate: { $gte: startDate },
                enddate: { $lte: endDate }
            });
        } catch (err) {
            console.error(err);
            return res.status(200).json([]);
        }

        if (!existingSummary) {
            console.log(chalk.bgRed(`Summary for week ${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()} is missing`));
            
            // Call generateWeeklySummary to generate the summary
            try {
                const result = await generateWeeklySummary(uid, startDate.toISOString(), endDate.toISOString());
                console.log(chalk.green('Generated summary:'), result);
            } catch (error) {
                console.error(error);
                console.log(chalk.red('Error generating summary for week', startDate.toLocaleDateString(), '-', endDate.toLocaleDateString()));
            }
        } else {
            console.log(`${chalk.bgYellow(`Summary for week ${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()} exists:`)} ${existingSummary.content}`);
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
        summaries = await Summary.find({ userid: uid });
    } catch (err) {
        console.error(err);
        return next(new HttpError('Fetching summaries failed, please try again later.', 500));
    }

    res.status(200).json(summaries);
}

const getWeeklySummary = async (req, res, next) => {
    const id = req.params.id;

    // get all summaries
    let summary = null;
    try {
        summary = await Summary.findOne({ _id: id });
    } catch (err) {
        console.error(err);
        return next(new HttpError('Fetching summaries failed, please try again later.', 500));
    }

    res.status(200).json(summary);
}

module.exports = {
    chatbotConversation,
    checkAndFulfillSummary,
    getWeeklySummaries,
    getWeeklySummary
}
