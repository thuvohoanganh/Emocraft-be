const HttpError = require('../models/http-error');
const OpenAI = require("openai")
const dotenv = require("dotenv")
dotenv.config()

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const recognizeEmotion = async (req, res, next) => {
    const diary = req.body.diary
    const prompts = `You are an emotion analyzer capable of understanding the sentiment within text. Consider the emotions expressed from my diary: “${diary}”. Only use emotions in this list: happy, sad, angry, fear, surprised, disgusted, neutral. Tell me about my emotion like a friend and explain your reasoning. Your tone should be friendly and gentle. Response in a valid JSON object to be consumed by an application, following this pattern: {“items”: [{ “emotion”, “analysis”}]}. Here are 2 examples:
Example 1:
My diary: I gave a presentation in front of many people today. My heart was pounding and my face was hot, so I couldn't proceed with the presentation properly. Someone interrupted me in the middle of the conversation to ask a question, and I felt bad because I thought it was rude.

Response: {“items”: [{ “emotion”: “anxious”, “analysis”: “You seem anxious today. You mention your heart pounding and your face feeling hot, which are physical symptoms of anxiety. This indicates that you were feeling quite nervous about giving the presentation.”},{ “emotion”: “embarrassed”, “analysis”: “The fact that you couldn't proceed with the presentation properly suggests you felt uncomfortable and possibly embarrassed by the situation.”},{“emotion”: “frustrated”, “analysis”: “When someone interrupted you with a question, you felt bad and perceived it as rude, indicating feelings of annoyance or frustration.”}]}

Example 2:
My diary: My family was the most salient part of my day, since most days the care of my 2 children occupies the majority of my time. They are 2 years old and 7 months and I love them, but they also require so much attention that my anxiety is higher than ever. I am often overwhelmed by the care the require, but at the same, I am so excited to see them hit developmental and social milestones.

Response: {“items”: [{ “emotion”: “loved”, “analysis”: “as you explicitly state, "I love them," which underscores your deep affection and commitment to your children.”},{ “emotion”: “Anxious”, “analysis”: “You mention that your anxiety is "higher than ever," indicating that the responsibility of caring for a 2-year-old and a 7-month-old is a major source of stress.”},{“emotion”: “excited”, “analysis”: “I am so excited to see them hit developmental and social milestones," reflects the joy you feel in witnessing their growth and progress.”}]}`

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

const feedback = async (req, res, next) => {
    const diary = req.body.diary
    const dialog = req.body.dialog
    const phase = await detectFeedbackPhase(diary, dialog)
    console.log(phase)
    if ( phase === "" ) {
        const error = new HttpError(
            'chat fail',
            500
        );
        return next(error);
    }
    let response = await generateResponse(diary, dialog, phase)
    if ( response === "" ) {
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

const detectFeedbackPhase = async (diary, dialog) => {
    let dialogText = ''
    dialog.forEach(({ role, text }) => dialogText += `${role}: ${text}\n`)
    const prompts = `You are an emotion analyzer capable of understanding the sentiment within text. You give me an analysis and I give you my feedback. Your response depends on my final reply. Consider my final response match which case below and response that case name. EXAMPLE: agree. Do not include any "you:".
Cases:
disagree: I don’t agree with your analysis and don’t explain more.
explained: I tell you more about my emotion and explain why.
supplement: I tell you another emotion beside your analysis and do not explain why.
end: I have nothing to share more.
agree: I agree with your analysis.

My diary: ${diary}
Dialog: ${dialogText}`

    let response = 0
    try {
        const chatCompletions = await openai.chat.completions.create({
            messages: [{ role: "user", content: prompts }],
            model: "gpt-3.5-turbo",
        });

        response = chatCompletions?.choices?.[0]?.message?.content
        if (!prompts || !response) {
            throw ("no response from ChatGPT")
        }
    } catch (err) {
        return ""
    }
    return response
}

const generateResponse = async (diary, dialog, phase) => {
    let dialogText = ''
    dialog.forEach(({ role, text }) => dialogText += `${role}: ${text}\n`)
    let task = ""
    if (phase === "disagree") {
        task = "Ask me why I don't agree with your analysis and aks me about my feelings"
    } else if (phase === "supplement") {
        task = "Ask more about my feeling"
    } else {
        task = "Tell me if I want to finish section, please click like button"
    } 
    const prompts = `You are an emotion analyzer capable of understanding the sentiment within text. You give me an analysis and I give you my feedback. Your response depends on my final reply. ${task}. Your tone should be friendly and gentle. Do not include any prefix "you:".

My diary: ${diary}
Dialog: ${dialogText}`

    let response = 0
    try {
        const chatCompletions = await openai.chat.completions.create({
            messages: [{ role: "user", content: prompts }],
            model: "gpt-3.5-turbo",
        });

        response = chatCompletions?.choices?.[0]?.message?.content
        if (!prompts || !response) {
            throw ("no response from ChatGPT")
        }
    } catch (err) {
        return ""
    }
    return response
}

const predictContextualInfor = async (req, res, next) => {
    const diary = req.body.diary
    const prompts = `You are an experienced diary study researcher. You are conducting a diary study right now, and when you receive my diary, you need to help the me to record some contextual information. These contextual information will be used as the cues for me to recall the event. Please predict the following contextual information based on the aforementioned information: 
Location: predict three possible point of interest locations, you could use the point of interest location categories in Google Maps or some other location-based service apps. 
People: select only one from these five categories, Alone, Families, Friends, Colleagues and Acquaintances, please keep the same spelling.
Activity: give six descriptions of the six possible activities in this scenario (give more details for each activity, but each description should be less than 151 characters). 
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

module.exports = {
    recognizeEmotion,
    predictContextualInfor,
    feedback
}