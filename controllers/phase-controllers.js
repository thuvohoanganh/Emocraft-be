const OpenAI = require("openai")
const dotenv = require("dotenv")
const { PHASE_LABEL, GPT, EMOTION_LABEL } = require('../constant')
const Diary = require('../models/diary');
const Statistic = require('../models/statistic');

dotenv.config()
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const checkMissingContext = async (diary, dialog) => {
    const response = {
        error: "",
        summary: {
            "event": "",
            "location": "",
            "people": "",
            "time_of_day": "",
            "rationale": ''
        },
        next_phase: PHASE_LABEL.PHASE_1
    }

    const instruction = `- You are a helpful assistant that analyzes the content of the dialog history.
- Given a dialogue history and user's diary, determine whether user mentioned location and people that are involed in the key episode or not.
 ## event: the key event that causes user's emotion.
 ## location: where did event happen and user have emotions (e.g. home, office, school). Only extract text written by user, do not predict.
 ## people: who is involve in the even and cause user emotions (e.g. alone, friend family). If involved people are not mentioned. Next, think if event is likely to be done alone, return alone. Otherwise, return null.
 ## time_of_day: what time of day did event happen (e.g. morning, noon, night). You don't need to define a particular time of day.
 ## rationale: Describe your rationale on how properties emotions were derived. write less than 50 words.

 Use JSON format with the following properties:
 {
        "event": string | null,
        "location": string | null,
        "people": string | null,
        "time_of_day": string | null,
        "rationale": string,
}
        
User's diary: ${diary}
Dialog: ${JSON.stringify(dialog)}`

    const _res = await generateAnalysis(instruction)
    try {
        const res = JSON.parse(_res)
        if (res.event && res.location && res.people && res.time_of_day) {
            response.next_phase = PHASE_LABEL.PHASE_2
        } else if (dialog.length > 6) {
            response.next_phase = PHASE_LABEL.PHASE_2
        }

        response.summary = res
    } catch {
        if (!_res) {
            response.error = "ChatGPT failed"
            response.summary = null
            return response
        } else {
            response.error = "ChatGPT return wrong format"
            response.summary = null
        }
        console.error(_res)
    }

    // console.log("checkMissingContext", response)
    return response
}

const checkReasonClear = async (diary, dialog, currentPhase, diaryid) => {
    const response = {
        error: "",
        next_phase: currentPhase
    }

    const instruction = `You are a helpful assistant that analyzes the content of the dialog history. 
Return "true" if all following criteria are satisfied:
You discuss about the reason of user emotion at least 2 conversation turns. 
The response of user is short and. User seems to finish the conversation.

Otherwise, return "false".

Return in JSON format, structured as follows:
Response must be JSON format:
{
    "response": "true" | "false",
    "rationale": string
}
Property "response": your response to user. 
Property "rationale": explain how you generate your response follow instruction, less than 50 words..

User's diary: ${diary}
Dialog: ${JSON.stringify(dialog)}`

    const _res = await generateAnalysis(instruction)
    // console.log("checkReasonClear", _res)
    try {
        const res = JSON.parse(_res)
        if (res?.response?.toLowerCase() === "true") {
            response.next_phase = PHASE_LABEL.PHASE_6
            saveReasoning(dialog, diaryid, diary)
        }
    } catch (error) {
        console.error(error)
        response.error = "ChatGPT failed"
        return response
    }

    return response
}

const checkEmotionInferenceAccuracy = async (diary, dialog, diaryid, userid) => {
    const response = {
        error: "",
        next_phase: PHASE_LABEL.PHASE_2
    }

    const instruction = `You are a helpful assistant that analyzes the content of the dialog history. 
Return "${PHASE_LABEL.PHASE_4}" if all following criteria are satisfied:
- User expressed negative emotions.

Return "${PHASE_LABEL.PHASE_5}" if all following criteria are satisfied:
- User expressed positive emotion.

Otherwise return "${PHASE_LABEL.PHASE_2}"

Return in JSON format, structured as follows:
Response must be JSON format:
{
    "response": ${PHASE_LABEL.PHASE_2} | ${PHASE_LABEL.PHASE_4} | ${PHASE_LABEL.PHASE_5},
    "rationale": string
}
Property "response": your response to user. 
Property "rationale": explain how you generate your response follow instruction. less than 50 words.

User's diary: ${diary}
Dialog: ${JSON.stringify(dialog)}`

    const _res = await generateAnalysis(instruction)
    // console.log("checkEmotionInferenceAccuracy", _res)
    try {
        const res = JSON.parse(_res)
        if (res.response === PHASE_LABEL.PHASE_4) {
            response.next_phase = PHASE_LABEL.PHASE_4
            saveEmotion(userid, dialog, diaryid, diary)
        } else if (res.response === PHASE_LABEL.PHASE_5) {
            response.next_phase = PHASE_LABEL.PHASE_5
            saveEmotion(userid, dialog, diaryid, diary)
        }
    } catch {
        console.error(_res)
    }

    return response
}

const generateAnalysis = async (instruction) => {
    let response = ""
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
            temperature: 0.1
        });

        response = chatCompletions?.choices?.[0]?.message?.content
        if (!response) {
            throw ("no response from ChatGPT")
        }
    } catch (err) {
        console.error(err)
        return ""
    }
    response = response.replace(/json|\`\`\`+/gm, '')
    return response
}

const saveEmotion = async (userid, dialog, diaryid, diary) => {
    const emotionList = await getEmotionList(userid)

    let task_instruction = `Look at the diary and dialog, detect user's emotion in the diary. Only detect the emotion mentioned in the dialog. 
Don't use others words. 
Don't list similar emotions.
Don't list more than 2 emotions.
Consider these emotions: ${emotionList.toString()}
Return correct format as an array. 
Example 1: ["기쁨"]
Example 2: ["분노","슬픔"]

Dialog: ${JSON.stringify(dialog)}

Diary: ${diary}
`

    const _res = await generateAnalysis(task_instruction)

    try {
        const emotions = JSON.parse(_res)
        if (!Array.isArray(emotions)) {
            throw ("Emotions is not array")
        }
        const existingDiary = await Diary.findOne({ _id: diaryid });
        existingDiary.emotions = emotions;
        await existingDiary.save();
    } catch (error) {
        console.error("saveEmotion", error)
    }
}

const saveReasoning = async (dialog, diaryid, diary) => {
    let task_instruction = `Look at the diary and dialog, return cause of user's emotion in the diary. Return in Korean, no more than 50 words.
    
    Dialog: ${JSON.stringify(dialog)}
    
    Diary: ${diary}
    `

    const _res = await generateAnalysis(task_instruction)

    let existingDiary;

    try {
        existingDiary = await Diary.findOne({ _id: diaryid });
        if (!existingDiary) {
            throw ("Not found dairy", diaryid)
        }

        existingDiary.reasons = _res

        await existingDiary.save();
    } catch (err) {
        err && console.error(err);
    }
}

const getEmotionList = async (userid) => {
    const presetEmotions = Object.values(EMOTION_LABEL)
    if (!userid) {
        return presetEmotions
    }
    const emotions = await Statistic.distinct("subcategory", { category: "emotion", userid: userid })
    const mergeList = presetEmotions.concat(emotions)
    return [...new Set(mergeList)];
}

module.exports = {
    checkMissingContext,
    checkReasonClear,
    checkEmotionInferenceAccuracy,
    generateAnalysis
}

