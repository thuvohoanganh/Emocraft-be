const OpenAI = require("openai")
const dotenv = require("dotenv")
const { PHASE_LABEL, GPT, EMOTION_LABEL, PREDEFINED_ACTIVITY, PREDEFINED_LOCATION, PREDEFINED_PEOPLE, TIMES_OF_DAY } = require('../constant')
const Diary = require('../models/diary');
const Statistic = require('../models/statistic');

dotenv.config()
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const checkMissingContext = async (diary, dialog, diaryid) => {
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
        if ((res.event && res.location && res.people && res.time_of_day) || dialog.length > 6) {
            response.next_phase = PHASE_LABEL.PHASE_2

            const existingDiary = await Diary.findOne({ _id: diaryid });
            const context = await categorizeContext(existingDiary.content, dialog, existingDiary.userid)

            if (context?.activity) {
                existingDiary.activity = context.activity
                existingDiary.people = context.people
                existingDiary.time_of_day = context.time_of_day
                existingDiary.location = context.location

                await existingDiary.save();
            }
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

const checkEmotionExpressed = async (diary, dialog, diaryid) => {
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

    try {
        const res = JSON.parse(_res)
        if (res.response === PHASE_LABEL.PHASE_4) {
            response.next_phase = PHASE_LABEL.PHASE_4
            saveEmotion(diaryid, dialog)
        } else if (res.response === PHASE_LABEL.PHASE_5) {
            response.next_phase = PHASE_LABEL.PHASE_5
            saveEmotion(diaryid, dialog)
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

const saveEmotion = async (diaryid, dialog) => {
    try {
        const existingDiary = await Diary.findOne({ _id: diaryid });

        if (!existingDiary) return
        const emotionList = await getEmotionList(existingDiary.userid)

        let task_instruction = `Look at the diary and dialog, detect user's emotion in the diary. Only detect the emotion mentioned in the dialog. 
Don't use others words. 
Don't list similar emotions.
Don't list more than 2 emotions.
Consider these emotions: ${emotionList.toString()}
Return correct format as an array. 
Example 1: ["기쁨"]
Example 2: ["분노","슬픔"]

Dialog: ${JSON.stringify(dialog)}

Diary: ${existingDiary.content}
`

        const _res = await generateAnalysis(task_instruction)
        const emotions = JSON.parse(_res)
        if (!Array.isArray(emotions)) {
            throw ("Emotions is not array")
        }

        existingDiary.emotions = emotions;
        existingDiary.dialog = JSON.stringify(dialog)

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
        existingDiary.dialog = JSON.stringify(dialog)

        await existingDiary.save();
    } catch (err) {
        err && console.error(err);
    }
}

const categorizeContext = async (diary, dialog, userid) => {
    const response = {
        activity: "",
        location: "",
        people: "",
        time_of_day: "",
    }

    const existingCategories = {}
    try {
        const location = await Statistic.distinct("subcategory", { category: "location", userid })
        const people = await Statistic.distinct("subcategory", { category: "people", userid })
        const activity = await Statistic.distinct("subcategory", { category: "activity", userid })

        existingCategories["location"] = location
        existingCategories["people"] = people
        existingCategories["activity"] = activity
    } catch (err) {
        console.error(err)
    }

    const { activity, location, people } = existingCategories

    let activitySet = activity.concat(Object.values(PREDEFINED_ACTIVITY))
    activitySet = [...new Set(activitySet)]
    let locationSet = location.concat(Object.values(PREDEFINED_LOCATION))
    locationSet = [...new Set(locationSet)]
    let peopleSet = people.concat(Object.values(PREDEFINED_PEOPLE))
    peopleSet = [...new Set(peopleSet)]

    const instruction = `Based on diary and dialog, classify contextual information into category.
Use JSON format with the following properties:
- activity: detect key activity in the diary and return the category that it belong to. Consider these category: ${JSON.stringify(activitySet)}. If it doesn't belong to any of those, generate suitable category label. Return only one main activity. Don't return "other".
- location: detect where did user usually have that emotions and return the category that it belong to. Consider these category: ${JSON.stringify(locationSet)}. If it doesn't belong to any of those, generate suitable category label. Return only one location label relate to activity. Don't return "other".
- people: detect who did cause those emotions and return the category that it belong to. Consider these category: ${JSON.stringify(peopleSet)}. If it doesn't belong to any of those, generate suitable category label. Return only one people label relate to activity. Don't return "other".
- time_of_day: what time of day did event happen. Only use one of the following: ${JSON.stringify(TIMES_OF_DAY)}. Return only one word.
- rationale: Describe your rationale on how properties were derived.
    {
        "activity": string | null,
        "location": string | null,
        "people": string | null,
        "time_of_day": string | null,
        "rationale": string,
    }

User's diary: ${diary}
Dialog: ${JSON.stringify(dialog)}    `

    const _res = await generateAnalysis(instruction)
    try {
        const res = JSON.parse(_res)
        response.activity = res.activity
        response.location = res.location
        response.people = res.people
        response.time_of_day = res.time_of_day
    } catch (error) {
        console.error("categorizeContext", error)
    }

    return response
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
    checkEmotionExpressed,
    generateAnalysis,
}

