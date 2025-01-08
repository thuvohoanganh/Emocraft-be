const OpenAI = require("openai")
const HttpError = require('../models/http-error');
const { validationResult } = require('express-validator');
const Diary = require('../models/diary');
const { GPT } = require('../constant');
const fs = require('fs');
const { Parser } = require('json2csv');

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const USER_PERSONA = `Name: Thu Vo
Role: Graduate Student in Computer Science

## Background and Habits:
Thu is in their second year of a master’s program in computer science. She's highly introspective and value self-awareness, often using their daily diary as a space to explore and reflect on their emotions. Thu believes that understanding their emotional states helps them manage stress better and enhances their focus on academic projects.

## Hobbies and interests
shopping food clothes, surfing facebook, traveling

## Relationship
She have a boyfriend and they meet at dinner everyday. She have a lovely female roomate who she can talk to everyday and express her feelings. 
She usually work with Phd students named Yugyeong and Guywon - her labmate. They are very supportive. She struggles in doing research and her labmates help her a lot.

## Personality
She is ITTP. She is an introvert, like cute things. She is easily get tired and overwhelmed when doing a lot of things at the same time.

## Daily Schedule
Wake up, go to lab
Work on reseach project
Have lunch with labmates
Have meeting with PhD students and professor about research project
Have dinner with her boyfriend
Study in the room until 11:00 PM
Surf facebook, watch video for entertainment; bedtime around 12:00 PM

## Weekend Activities
Keep working on research project in the room.
Go to supermarket for food shopping
Sometimes, she go to Chungang market for clothes shopping`




const writeDiary = async (req, res, next) => {
    const { userid } = req.body
    const response = {
        content: ""
    }

    const existingDiary = await Diary.find({ userid });
    const existingDiaryContent = existingDiary ? existingDiary.map(e => e.content) : []

    const instruction = `${USER_PERSONA}
    - Now you are writing your diary of the day.
    - Write about only 1 episode. 
    - Diary should less than 50 words. 
    - Don't write the date.
    - Use simple words but natural language. Don't list activities.
    
    ${existingDiary.length > 0 ?
            `These are your previous diaries: ${JSON.stringify(existingDiaryContent)}`
            : ""}
    `

    const messages = [
        {
            role: "system",
            content: `${instruction}`
        },
    ]

    try {
        const chatCompletions = await openai.chat.completions.create({
            messages,
            model: GPT.MODEL,
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


    response.content = response.content.replace(/^\"+|\"+$/gm, '')

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
            model: GPT.MODEL,
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


    response.content = response.content.replace(/^\"+|\"+$/gm, '')

    res.status(200).json({
        data: response
    });
    return
}

const generateDatasetForEvaluation = async () => {
    console.log("generateDatasetForEvaluation")

    let jsonList = []
    for (let i = 0; i < 50; i++) {
        try {
const instruction = `Given a persona, write only one emotional diary.
Persona: ${USER_PERSONA}
Previous diaries: 
${JSON.stringify(jsonList.slice(-4))}
- Diary length should be 3 sentences and less than 50 words. 
- Use simple words but natural language. Don't list activities.
- Use JSON format with the following properties:
    + diary: content of diary.
    + date: the date write diary.
    + activity: detect key activity in the diary and return the category that it belong to. Consider these category: studying, research, resting, meeting, eating, socializing, leisure activity, exercise, moving. If it doesn't belong to any of those, generate suitable category label. Return only one main activity. Don't return "other".
    + location: detect where did user usually have that emotions and return the category that it belong to. Consider these category: home, classroom, library, restaurant, office, laboratory. If it doesn't belong to any of those, generate suitable category label. Return only one location label relate to activity. Don't return "other".
    + people: detect who did cause those emotions and return the category that it belong to. Consider these category: alone, family, boyfriend, girlfriend, roommate, friend, colleague, professor. If it doesn't belong to any of those, generate suitable category label. Return only one people label relate to activity. Don't return "other".
    + time_of_day: what time of day did event happen. Only use one of the following: morning, noon, afternoon, evening, night, all_day. Return only one word.
{
"diary": string,
"date": string,
"activity": string,
"location": string,
"people": string,
"time_of_day": string
}`
            const messages = [
                {
                    role: "system",
                    content: `${instruction}`
                },
            ]
            const chatCompletions = await openai.chat.completions.create({
                messages,
                model: GPT.MODEL,
                temperature: 0.5
            });

            const _res = chatCompletions?.choices?.[0]?.message?.content
            console.log(instruction)

            console.log(i, _res)

            const res = JSON.parse(_res)
            jsonList.push(res)
        } catch (err) {
            console.error(err)
        }
    }

    console.log(2222)
    const fields = ["diary", "date", "activity", "location", "people", "time_of_day"];
    const opts = { fields };

    try {
        const parser = new Parser(opts);
        const csv = parser.parse(jsonList);

        // Write to a CSV file
        fs.writeFileSync('synthesize_data/output.csv', csv);
        console.log('CSV file successfully written to output.csv');
    } catch (err) {
        console.error('Error writing CSV:', err);
    }
    return
}

module.exports = {
    userSimulatorResponse,
    writeDiary,
    generateDatasetForEvaluation
}

