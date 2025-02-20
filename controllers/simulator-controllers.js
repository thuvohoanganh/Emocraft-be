const OpenAI = require("openai")
const HttpError = require('../models/http-error');
const { validationResult } = require('express-validator');
const Diary = require('../models/diary');
const { GPT } = require('../constant');
const fs = require('fs');
const { Parser } = require('json2csv');
const csvParser = require('csv-parser');
const { getEmotionList } = require('./response-controllers');
const { generateResponse } = require('./response-controllers')

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const USER_PERSONA = `Gender: female
Educational background: second year of a master’s program in computer science.
Hobbies: shopping food, clothes, surfing facebook, traveling
Relationship: She have a boyfriend and they meet at dinner everyday. She have a lovely female roommate who she can talk to everyday and express her feelings. She usually work with Phd students named Yugyeong and Guywon - her labmate. They are very supportive. She struggles in doing research and her labmates help her a lot.
Personality traits: She is ISTP. She is an introvert, like cute things. She is easily get tired and overwhelmed when doing a lot of things at the same time.
Daily Schedule (activity, location, people, time):
- In the morning, go to lab and work on research project
- Have lunch with labmates
- In the afternoon, have meeting with PhD students and professor about research project
- Have dinner with her boyfriend
- Study in the room until 11:00 PM
- Surf facebook, watch video for entertainment; bedtime around 12:00 PM
Weekend Activities (activity, location, people, time)
- In the morning, Keep working on research project in the room.
- In afternoon, go to supermarket for food shopping alone or with boyfriend or with roommate.
- In afternoon, go to Chungang market for clothes shopping alone or with boyfriend or with roommate.`

const writeDiary = async (req, res, next) => {
    const { userid } = req.body
    const response = {
        content: ""
    }

    const existingDiary = await Diary.find({ userid });
    const existingDiaryContent = existingDiary ? existingDiary.map(e => e.content) : []

    const instruction = `${USER_PERSONA}
    - Now you are writing your diary of the day.
    - Write about only 1 event. 
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
            model: GPT.MODEL_USER,
            temperature: 0.7
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
    const { dialog, diary, emotion, reasons } = req.body

    const _dialog = dialog.map(e => ({
        role: e.role,
        content: JSON.stringify(e.content)
    }))

    const instruction = `In dialog, your role is user. You are encountering a conversation with a assistant. she is trying to explore your contextual information and your emotions in your diary to understand you better.
Your task is response to her.
If therapist ask about location, people or time, response directly and keep it short.
Follow up the conversation.
Express your emotion in the diary only when assistant try recognize your emotion. 

##General rules##
Response should be less than 50 words. 
Use simple words.
Don't start the response with any special characters (e.g !"#$%&'()*+,-./:;<=>?)

You wrote a diary today: ${diary}.
Your emotion in the diary: ${emotion}.
Reason you feel like that: ${reasons}.

Dialog:
${JSON.stringify(_dialog)}`

    // console.log(instruction)
    const messages = [
        {
            role: "user",
            content: `${instruction}`,
        },
    ]

    try {
        const chatCompletions = await openai.chat.completions.create({
            messages,
            model: GPT.MODEL_USER,
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

            const res = JSON.parse(_res)
            jsonList.push(res)
        } catch (err) {
            console.error(err)
        }
    }

    const fields = ["diary", "date", "activity", "location", "people", "time_of_day"];
    const opts = { fields };

    try {
        const parser = new Parser(opts);
        const csv = parser.parse(jsonList);

        // Write to a CSV file
        fs.writeFileSync('synthesize_data/diaries.csv', csv);
        console.log('CSV file successfully written to output.csv');
    } catch (err) {
        console.error('Error writing CSV:', err);
    }
    return
}

const readCsvFileToArray = async (filePath) => {
    const results = [];

    return new Promise((resolve, reject) => {
        fs.createReadStream(filePath)
            .pipe(csvParser())
            .on('data', (data) => results.push(data))
            .on('end', () => resolve(results))
            .on('error', (err) => reject(err));
    });
}

const emotionClassificationWithoutMemory = async () => {
    console.log("emotionClassificationWithoutMemory")

    let jsonList = []

    try {
        jsonList = await readCsvFileToArray('synthesize_data/output.csv');
    } catch (error) {
        console.error('Error reading CSV file:', error);
    }

    for (let i = 0; i < jsonList.length; i++) {
        let currentDiary = jsonList[i]
        try {
            const emotionList = await getEmotionList("")
            const task_instruction = `You are an expert agent specializing in emotion classification, designed to analyze diary with a highly analytical approach.
You excel at detecting and interpreting a wide range of emotions, considering nuanced language and complex emotional cues.

Return the response in JSON format, structured as follows:
### emotions
Recorgize emotions in the diary to assign 2 or 1 emotion labels. 
Consider emotion in this list: ${emotionList}.
Don't include any emotion outside of the list.
Find the most similar emotion in the list to describe emotions in diary.
Array starts with the strongest and listing them in descending order.
Return 1 or 2 strongest emotions in the array.
Check again and make sure that emotions property only includes values in emotion list. 

### rationale
Answer that the emotions you put in emotion property are included in emotion list or not. Reason how you generate emotions property.  
Use English for this property

Response must be JSON format:
{
    "emotions": [string],
    "rationale": string,
}`
            const _res = await generateResponse([], task_instruction)

            const res = JSON.parse(_res)
            currentDiary.classification = res.emotions
            currentDiary.rationale = res.rationale
        } catch (err) {
            console.error(err)
        }
    }

    const fields = ["diary", "date", "activity", "location", "people", "time_of_day", "annotation", "classification", "rationale"];
    const opts = { fields };

    try {
        const parser = new Parser(opts);
        const csv = parser.parse(jsonList);

        // Write to a CSV file
        fs.writeFileSync('synthesize_data/classification.csv', csv);
        console.log('CSV file successfully written to output.csv');
    } catch (err) {
        console.error('Error writing CSV:', err);
    }
}

module.exports = {
    userSimulatorResponse,
    writeDiary,
    generateDatasetForEvaluation,
    emotionClassificationWithoutMemory
}

