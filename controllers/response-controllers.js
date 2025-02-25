const OpenAI = require("openai")
const dotenv = require("dotenv")
const { TIMES_OF_DAY, PREDEFINED_PEOPLE, PREDEFINED_LOCATION, PREDEFINED_ACTIVITY, EMOTION_LABEL } = require("../constant");
const { PHASE_LABEL, GPT } = require('../constant')
const Diary = require('../models/diary');
const Statistic = require('../models/statistic');
const { generateAnalysis } = require("./phase-controllers");

dotenv.config()
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const askMissingInfor = async (diary, dialog, summary) => {
    const response = {
        error: "",
        phase: PHASE_LABEL.PHASE_1,
        content: "",
    }
    const instruction = `- Given user's dairy and a dialogue summary of what is missing in the memory event.
    ${!summary.event ? (
            `- Ask user what happend to them.`
        ) : !summary.people ? (
            `- Ask user who was involved in the event and contribute to user's emotion.`
        ) : !summary.location ? (
            `- Ask user where did the event occurred.`
        ) : !summary.time_of_day ? (
            `- Guess the key event happened at what time of day (e.g ${JSON.stringify(Object.values(TIMES_OF_DAY))}) and ask user if it is right.`
        ) : ""}
    - Response should be less than 50 words.
    - Ask only one question.
    - Response in Korean.

    Diary: ${diary}`

    const res = await generateResponse(dialog, instruction)

    if (!res) {
        response.error = "ChatGPT failed"
        return response
    }

    response.content = res.replace(/^\"+|\"+$/gm, '')
    return response
}

const recognizeEmotion = async (diary, userid, dialog) => {
    const retrievedDiaries = await retrieveRelevantDiaryByContext(userid, "", diary, dialog)
    const emotionList = await getEmotionList(userid)
    let task_instruction = ""
    
    if (retrievedDiaries.length) {
        task_instruction = `You are a therapeutic helping user explore and understand their feelings more deeply. 
Do the following tasks. Response should be shorter than 100 words in Korean.
1. Recognizes the feelings expressed by the user. When recognizing their emotions, you should care about their past diaries. User may have the similar emotions in the past. Consider these emotions: ${emotionList}
2. Reflects these emotions back to the user, acting as an emotional mirror.
3. Validate the client's feelings, making them feel understood and listened to.

Past diaries:
${JSON.stringify(retrievedDiaries)}

Current diary: ${diary}

Return in JSON format, structured as follows:
{
    "response": string,
    "rationale": string,
}
Property "response": your response to user. 
Property "rationale": explain how you generate your response follow instruction.
`
    } else {
        task_instruction = `You are a therapeutic helping user explore and understand their feelings more deeply. 
Do the following tasks. Response should be shorter than 100 words in Korean.
1. Recognizes the feelings expressed by the user. Consider these emotions: ${emotionList}
2. Reflects these emotions back to the user, acting as an emotional mirror.
3. Validate the client's feelings, making them feel understood and listened to.

Current diary: ${diary}

Return in JSON format, structured as follows:
{
    "response": string,
    "rationale": string,
    "emotions": [string]
}
Property "response": your response to user. 
Property "rationale": explain how you generate your response follow instruction.
Property "emotions": no more than 2 emotions.`
    }

    const response = {
        error: "",
        phase: PHASE_LABEL.PHASE_2,
        content: "",
        analysis: null,
        rationale: ""
    }

    const _res = await generateResponse(dialog, task_instruction)

    try {
        const res = JSON.parse(_res)
        if (!res.response) {
            throw ("Don't return in JSON format")
        }
        response.content = res.response
        response.analysis = res.emotions
        console.log("recognizeEmotion", res)
    } catch {
        console.error(_res)
        response.content = _res
    }

    response.content = response.content?.replace(/^\"+|\"+$/gm, '')

    return response
}

const reflectNegativeEmotion = async (userid, diaryid, diary, dialog, emotions) => {
    const response = {
        error: "",
        phase: PHASE_LABEL.PHASE_4,
        content: "",
    }
    let task_instruction = ""
    const retrievedDiaries = await retrieveRelevantDiaryByContext(userid, diaryid, diary, dialog)
    
    if (retrievedDiaries.length) {
        task_instruction += `Your task is helping user reflect the reason of their emotions.
Do the following tasks. For each conversation turn, execute one task only. Response in Korean.
1. Describe what maybe the reason of user's emotion and ask for validation from user. If they have similar emotion in the past, recall it in your response.
2. Your task is challenge the negative thought by questioning its validity and looking for evidence
that contradicts it. This can help the individual gain a more balanced perspective and reduce the intensity of their negative emotions.
Analyze their past diaries to know their emotion patterns.
Your response should less than 100 words.
Ask only 1 question at a time.

Past diaries:
${JSON.stringify(retrievedDiaries)}

User's diary: ${diary}

Return in JSON format, structured as follows:
{
    "response": string,
    "rationale": string
}`
    } else {
    task_instruction += `Your task is helping user reflect the reason of their emotions.
Do the following tasks. For each conversation turn, execute one task only. Response in Korean.
1. Describe what maybe the reason of user's emotion and ask for validation from user.
2. Your task is challenge the negative thought by questioning its validity and looking for evidence
that contradicts it. This can help the individual gain a more balanced perspective and reduce the intensity of their negative emotions.
Analyze their past diaries to know their emotion patterns.
Your response should less than 100 words.
Ask only 1 question at a time.

User's diary: ${diary}

Return in JSON format, structured as follows:
{
    "response": string,
    "rationale": string
}
Property "response": your response to user. 
Property "rationale": explain how you generate your response follow instruction.`
    }

    const _res = await generateResponse(dialog, task_instruction)
    console.log("reflectNegativeEmotion", _res)

    try {
        const res = JSON.parse(_res)
        if (!res.response) {
            throw ("Don't return in JSON format")
        }
        response.content = res.response
    } catch {
        console.error(_res)
        response.content = _res
    }

    response.content = response.content?.replace(/^\"+|\"+$/gm, '')

    return response
}

const reflectPositiveEmotion = async (userid, diaryid, diary, dialog, emotions) => {
    const response = {
        error: "",
        phase: PHASE_LABEL.PHASE_5,
        content: "",
    }
    let task_instruction = ""
    const retrievedDiaries = await retrieveRelevantDiaryByContext(userid, diaryid, diary, dialog)
    
    if (retrievedDiaries.length) {
        task_instruction = `If user have similar emotion in the past, recall it and encourage user.
Inquire about details to show your interest in what help them have positive emotions.
Ask only 1 question at a time. Response in Korean.

Past diaries:
${JSON.stringify(retrievedDiaries)}

User's diary: ${diary}

Return in JSON format, structured as follows:
{
    "response": string,
    "rationale": string
}`
    } else {
    task_instruction = `Inquire about details to show your interest in what help them have positive emotions.
Ask only 1 question at a time. Response in Korean.

Current diary: ${diary}

Return in JSON format, structured as follows:
{
    "response": string,
    "rationale": string
}
Property "response": your response to user. 
Property "rationale": explain how you generate your response follow instruction.`
    }

    const _res = await generateResponse(dialog, task_instruction)
    console.log("reflectPositiveEmotion", _res)

    try {
        const res = JSON.parse(_res)
        if (!res.response) {
            throw ("Don't return in JSON format")
        }
        response.content = res.response
    } catch {
        console.error(_res)
        response.content = _res
    }

    response.content = response.content?.replace(/^\"+|\"+$/gm, '')

    return response
}

const retrieveRelevantDiaryByContext = async (userid, diaryid, diary, dialog) => {
    let results = []

    try {
        const context = await categorizeContext(diary, dialog)

        // console.log("retrieveRelevantDiaryByContext", context)
        if (!context?.activity) {
            return results
        }
        const query = diaryid ? { userid: userid, _id: { $ne: diaryid } } : { userid: userid }
        diaries = await Diary.find(query);
        if (!diaries) {
            return results
        }

        const contextRelevantDiary = []
        diaries.forEach(diary => {
            let similarityScore = 0
            if (diary.activity === context.activity) similarityScore += 0.25;
            if (diary.location === context.location) similarityScore += 0.25;
            if (diary.people === context.people) similarityScore += 0.25;
            if (diary.time_of_day === context.time_of_day) similarityScore += 0.25;

            if (similarityScore >= 0.5) {
                contextRelevantDiary.push({
                    content: diary.content,
                    similarity: similarityScore,
                    emotion_retention: diary.emotion_retention,
                    context_retention: diary.context_retention,
                    activity: diary.activity,
                    location: diary.location,
                    people: diary.people,
                    time_of_day: diary.time_of_day,
                    emotions: diary.emotions
                })
            }
        })

        let topThree = []
        if (contextRelevantDiary.length > 0) {
            contextRelevantDiary.sort((a, b) => (b.context_retention + b.similarity) - (a.context_retention + a.similarity))
            topThree = contextRelevantDiary.slice(0, 3)
            results = topThree.map(e => ({
                content: e.content,
                emotions: e.emotions,
                reasons: e.reasons
            }))
        }
        console.log("topThree context", topThree)
    } catch (err) {
        err && console.error(err);
        return results
    }
    return results
}

const generateGoodbye = async (diary, dialog) => {
    const instruction = `You are an expert agent specializing in emotion classification and reasoning, designed to analyze diary with a highly analytical and empathetic approach.
    - Ask if user have anything want to share.
    - If user want to continue the conversation, you should be a active listener, an empathetic friend and response them.
    - If user want to finish conversation say thank and tell them to click Finish button on the top screen to finish section. 
    Response should be less than 20 words. Response in Korean.
    
    Current diary: ${diary}`
    const response = {
        error: "",
        phase: PHASE_LABEL.PHASE_6,
        content: "",
        analysis: [],
        rationale: ""
    }
    const _res = await generateResponse(dialog, instruction)

    try {
        response.content = _res
        response.content = response.content?.replace(/^\"+|\"+$/gm, '')
    } catch (error) {
        console.error(error)
        response.error = "ChatGPT return wrong format"
    }
    return response
}

const generateResponse = async (dialog, instruction) => {
    let response = ""
    try {
        const _dialog = dialog?.map(e => ({
            ...e,
            content: JSON.stringify(e.content)
        })) || []

        const messages = [
            {
                role: "user",
                content: `${instruction}`
            },
            ..._dialog
        ]

        const chatCompletions = await openai.chat.completions.create({
            messages,
            model: GPT.MODEL,
            temperature: 0.7
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
    const emotions = await Statistic.distinct( "subcategory", { category: "emotion", userid: userid } )
    const mergeList = presetEmotions.concat(emotions)
    return [...new Set(mergeList)];
}
module.exports = {
    askMissingInfor,
    recognizeEmotion,
    reflectNegativeEmotion,
    categorizeContext,
    generateGoodbye,
    reflectPositiveEmotion,
    generateResponse,
    getEmotionList
}

