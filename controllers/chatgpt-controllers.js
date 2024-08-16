const OpenAI = require("openai")
const HttpError = require('../models/http-error');
const Diary = require('../models/diary');
const User = require('../models/user');
const {
    checkCriteriaExplorePhase,
    checkCriteriaFeedbackPhase,
    generateResponseExplorePhase,
    generateExplanationPhase,
    generateFeedbackPhase

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
        response.phase = result.end ? PHASE_LABEL.END : result.phase
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


const predictContextualInfor = async (req, res, next) => {
    const diary = req.body.diary
    const prompts = `You are an experienced diary study researcher. You are conducting a diary study right now, and when you receive my diary, you need to help the me to record some contextual information. These contextual information will be used as the cues for me to recall the event. Please predict the following contextual information based on the aforementioned information: 
Location: predict three possible point of interest locations, you could use the point of interest location categories in Google Maps or some other location-based service apps. 
People: select only one from these five categories, Alone, Families, Friends, Colleagues and Acquaintances, please keep the same spelling.
Activity: give six descriptions of the six possible activities in this scenario (each description should be less than 50 characters). 
Finally output these information in English in valid JSON format. And the value for the Location and Activity should be a list of three and six elements respectively. EXAMPLE: {"Location": [Library, Workspace, Meeting room], "People": Colleague, "Activity": [Working on laptop and taking notes, Studying or doing research, Planning or organizing tasks for the day, Preparing a meeting, Watching a academic seminar, Discussing the current project]}”
My diary: ${diary}`

    let response
    try {
        const chatCompletions = await openai.chat.completions.create({
            messages: [{ role: "user", content: prompts }],
            model: "gpt-3.5-turbo",
        });

        response = chatCompletions?.choices?.[0]?.message?.content
        if (!prompts || !response) {
            throw ("no response from ChatGPT")
        }
        response = JSON.parse(response)
    } catch (err) {
        const error = new HttpError(
            'chat fail',
            500
        );
        return next(error);
    }


    res.status(200).json({
        data: response
    });
}

const generateImage = async (req, res, next) => {
    const diary = req.body.diary
    let image_url = ""
    try {
        const response = await openai.images.generate({
            model: "dall-e-3",
            prompt: diary,
            size: "1024x1024",
            quality: "standard",
            n: 1,
        })

        image_url = response.data[0].url
        console.log(image_url)
        if (!image_url) {
            throw ("no response from ChatGPT")
        }
    } catch (err) {
        console.log(err)
        const error = new HttpError(
            'chat fail',
            500
        );
        return next(error);
    }
    res.status(200).json({
        data: image_url
    });
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

    let startingDate = new Date();
    startingDate.setDate(startingDate.getDate() - 7);

    let diaries;
    try {
        diaries = await Diary.find({
            userid: uid,
            timestamp: { $gte: startingDate }
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
                Please summarize them into a coherent paragraph in this format: the top emotions I felt and the related experiences.
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

    res.status(200).json({ summary });
};

module.exports = {
    predictContextualInfor,
    chatbotConversation,
    generateImage,
    generateWeeklySummary
}

