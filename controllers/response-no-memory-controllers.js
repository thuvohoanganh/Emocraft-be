const OpenAI = require("openai")
const dotenv = require("dotenv")
const { TIMES_OF_DAY, PREDEFINED_PEOPLE, PREDEFINED_LOCATION, PREDEFINED_ACTIVITY, EMOTION_LABEL } = require("../constant");
const { PHASE_LABEL, GPT } = require('../constant')
const Diary = require('../models/diary');
const Statistic = require('../models/statistic');

dotenv.config()
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const recognizeEmotionNoMem = async (diary, userid, dialog) => {
    const emotionList = await getEmotionList(userid)
    let task_instruction = `You are a therapeutic helping user explore and understand their feelings more deeply. 
Do the following tasks. Response in Korean.
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
Property "rationale": explain how you generate your response follow instruction.`

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
        console.log("recognizeEmotionNoMem", res)
    } catch {
        console.error(_res)
        response.content = _res
    }

    response.content = response.content?.replace(/^\"+|\"+$/gm, '')

    return response
}

const reflectNegativeEmotionNoMem = async (userid, diaryid, diary, dialog, emotions) => {
    const response = {
        error: "",
        phase: PHASE_LABEL.PHASE_4,
        content: "",
    }
    let task_instruction = `Your task is helping user reflect the reason of their emotions.
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

    const _res = await generateResponse(dialog, task_instruction)
    console.log("reflectNegativeEmotionNoMem", _res)

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

const reflectPositiveEmotionNoMem = async (userid, diaryid, diary, dialog, emotions) => {
    const response = {
        error: "",
        phase: PHASE_LABEL.PHASE_5,
        content: "",
    }
    let task_instruction = `Inquire about details to show your interest in what help them have positive emotions.
Ask only 1 question at a time. Response should be shorter than 100 words in Korean.

Current diary: ${diary}

Return in JSON format, structured as follows:
{
    "response": string,
    "rationale": string
}
Property "response": your response to user. 
Property "rationale": explain how you generate your response follow instruction.`

    const _res = await generateResponse(dialog, task_instruction)
    console.log("reflectPositiveEmotionNoMem", _res)

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
    recognizeEmotionNoMem,
    reflectNegativeEmotionNoMem,
    reflectPositiveEmotionNoMem,
}

