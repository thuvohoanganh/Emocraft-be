const OpenAI = require("openai")
const HttpError = require('../models/http-error');
const { validationResult } = require('express-validator');
const Diary = require('../models/diary');

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const USER_PERSONA = `Name: Alex Parker
Role: Graduate Student in Computer Science

## Background and Habits:
Alex is in their second year of a master’s program in computer science, specializing in artificial intelligence and natural language processing. They’re highly introspective and value self-awareness, often using their daily diary as a space to explore and reflect on their emotions. Alex believes that understanding their emotional states helps them manage stress better and enhances their focus on academic projects.

## Personality and Lifestyle:
Alex is analytical and thoughtful, often viewing emotions as data points that can be observed, understood, and learned from. They enjoy writing in the evenings after a long day, either in their cozy study nook or a quiet coffee shop nearby. By regularly journaling about emotions, Alex has gained insight into patterns in their stress, motivation, and personal interactions.

## Favorite Diary Topics:
Challenges and victories in their research
Reflections on academic and personal relationships
Goals for emotional well-being and mental clarity

## Daily Schedule
Wake up, quick stretching, and breakfast
Head to campus or log in for research work; typically involves coding, data analysis, and experimenting with NLP models
Lunch break, often taken with lab mates or a quick solo lunch while reading a research paper
Attend classes or seminars, including any graduate coursework or lab meetings
Take a walk or grab coffee to refresh before tackling more work or attending any study group
Spend time on hobbies or unwind by reading, playing a puzzle game, or catching up with friends online
Read a book or research article; bedtime around 11:00 PM

## Weekend Activities
Alex often spends time at a local coffee shop or library, diving into personal projects or reading a book. They might also catch up on any class assignments that need extra focus.
He enjoy hiking or visiting the botanical gardens to recharge. Occasionally, Alex joins friends for a sports activity, like badminton or a group yoga session.
Weekends are ideal for exploring new restaurants or attending a local event with friends, such as a tech meetup or movie screening.
Alex sets aside time for personal hobbies, like photography, or watches documentaries. In the evening, they spend extra time with their diary, reflecting on both the week’s achievements and emotional moments, and setting intentions for the upcoming week.`




const writeDiary = async (req, res, next) => {
    const { userid } = req.body
    const response = {
        content: ""
    }

    const existingDiary = await Diary.find({ userid });
    // console.log("existingDiary", existingDiary)
    const existingDiaryContent = existingDiary? existingDiary.map(e => e.content) : []

    const instruction = `${USER_PERSONA}
    - Now you are writing your diary of the day in Korean.
    - Write about only 1 episode. 
    - Diary should less than 50 words. 
    - Don't write the date.
    - Use simple words but natural language. Don't list activities.
    
    ${existingDiary.length > 0 ? 
        `These are your previous diaries: ${JSON.stringify(existingDiaryContent)}`
    : ""}
    `

    // console.log("writeDiary", instruction)
    const messages = [
        {
            role: "system",
            content: `${instruction}`
        },
    ]

    try {
        const chatCompletions = await openai.chat.completions.create({
            messages,
            model: "gpt-4",
            temperature: 1
        });

        response.content = chatCompletions?.choices?.[0]?.message?.content
        if (!response.content) {
            throw ("no response from ChatGPT")
        }
    } catch (err) {
        console.error("writeDiary: ", err)
        const errorResponse = new HttpError(
            'chat fail',
            500
        );
        return next(errorResponse);
    }


    response.content = response.content.replace(/^\"+|\"+$/gm,'')

    // console.log(response)
    res.status(200).json({
        data: response
    });
    return
}

const userSimulatorResponse = async (req, res, next) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        console.error("userSimulatorResponse err:", errors)
        return next(
            new HttpError(JSON.stringify(errors), 422)
        );
    }

    const response = {
        content: ""
    }
    const { dialog, diary } = req.body

    const _dialog = dialog.map(e => ({
        ...e,
        content: JSON.stringify(e.content)
    }))

    const instruction = `${USER_PERSONA}
    You wrote a diary today: ${diary}.
    You are encountering a conversation with an assistant. An assistant are trying to explore your contextual information and your emotions in your diary to understand you better.
    Your role is the user and your task is responding to the role assistant in the dialog. 
    If assisant provide undersanding about your emotions, you can agree or disagree with what assistant said and feedback to them what is your emotion.
    You are a Korean, use Korean to response.
    Response should be less than 30 words. 
    Use simple words.
    Don't start the response with any special characters (e.g !"#$%&'()*+,-./:;<=>? )
    Dialog: ${JSON.stringify(_dialog)}`

    const messages = [
        {
            role: "system",
            content: `${instruction}`
        },
    ]

    try {
        const chatCompletions = await openai.chat.completions.create({
            messages,
            model: "gpt-4",
            temperature: 1
        });

        response.content = chatCompletions?.choices?.[0]?.message?.content
        if (!response.content) {
            throw ("no response from ChatGPT")
        }
    } catch (err) {
        console.error("writeDiary: ", err)
        const errorResponse = new HttpError(
            'chat fail',
            500
        );
        return next(errorResponse);
    }


    response.content = response.content.replace(/^\"+|\"+$/gm,'')

    res.status(200).json({
        data: response
    });
    return
}


module.exports = {
    userSimulatorResponse,
    writeDiary
}

