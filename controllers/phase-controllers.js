const OpenAI = require("openai")
const dotenv = require("dotenv")
const { EMOTION_LABEL, EMOTION_DIMENSION } = require("../constant");
const { PHASE_LABEL, GPT } = require('../constant')

dotenv.config()
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const checkCriteriaExplorePhase = async (diary, dialog) => {
    const response = {
        error: "",
        summary: {
            "event": "",
            "location": "",
            "people": "",
            "time_of_day": "",
            "skip": false,
            "rationale": ''
        },
        next_phase: PHASE_LABEL.BEGINNING
    }

    const instruction = `- You are a helpful assistant that analyzes the content of the dialog history.
- Given a dialogue history and user's diary, determine whether user mentioned location and people that are involed in the key episode or not.
- Use JSON format with the following properties:
 ## event: the key event that causes user's emotion. If diary include multiple episodes, identify the last episodes.
 ## location: where did event happen and user have emotions (e.g. home, office, school). Only extract text written by user, do not predict.
 ## people: who is involve in the even and cause user emotions (e.g. alone, friend family). If involved people are not mentioned. Next, think if event is likely to be done alone, return alone. Otherwise, return null.
 ## time_of_day: what time of day did event happen (e.g. morning, noon, night). Only extract text written by user, do not predict. Return only one word.
 ## skip: If user don't want to answer your questions, return true. Otherwise, return false.
 ## rationale: Describe your rationale on how properties emotions were derived. The emotions you put in analysis are included in emotion list or not and why you choose those emotions.
{
        "summary": {
            "event": string | null,
            "location": string | null,
            "people": string | null,
            "time_of_day": string | null,
            "skip": boolean,
            "rationale": string,
        }
    }`

    const _res = await generateAnalysis(diary, dialog, instruction)
    try {
        const res = JSON.parse(_res)
        if (res.summary.event && res.summary.location && res.summary.people && res.summary.time_of_day) {
            response.next_phase = PHASE_LABEL.EMOTION_LABEL
        }
        else {
            response.next_phase = PHASE_LABEL.BEGINNING
        }
        response.summary = res.summary
    } catch {
        if (!_res) {
            response.error = "ChatGPT failed"
            response.summary = null
            return response
        } else {
            response.error = "ChatGPT return wrong format"
            response.summary = null
        }
    }

    // console.log("checkCriteriaExplorePhase", response)
    return response
}

const checkUserSatisfaction = async (diary, dialog) => {
    const response = {
        error: "",
        next_phase: PHASE_LABEL.ENCOURAGE_FEEDBACK
    }

    const instruction = `You are a helpful assistant that analyzes the content of the dialog history. 
Return "true" if all following criteria are satisfied:
the last user'response totally agree with you.
Your understand is the same with what user is feeling.
You don't express others feeling.

Otherwise, return "false".

Return in JSON format, structured as follows:
Response must be JSON format:
{
    "response": "true" | "false",
    "rationale": string
}
Property "response": your response to user. 
Property "rationale": explain how you generate your response follow instruction.`

    const _res = await generateAnalysis(diary, dialog, instruction)
    console.log("checkUserSatisfaction", _res)
    try {
        if (_res?.toLowerCase() === "true") {
            response.next_phase = PHASE_LABEL.GOODBYE
        }
    } catch (error) {
        console.error(error)
        response.error = "ChatGPT failed"
        return response
    }

    return response
}

const checkEmotionInferenceAccuracy = async (diary, dialog) => {
    const response = {
        error: "",
        next_phase: PHASE_LABEL.REVISE_EMOTION_LABEL
    }

    const instruction = `You are a helpful assistant that analyzes the content of the dialog history. 
Return 1 if all following criteria are satisfied:
the last user'response totally agree with you.
Your understand is the same with what user is feeling.
You don't express others feeling.

Otherwise, return "false".

Return in JSON format, structured as follows:
Response must be JSON format:
{
    "response": "true" | "false",
    "rationale": string
}
Property "response": your response to user. 
Property "rationale": explain how you generate your response follow instruction.`

    const _res = await generateAnalysis(diary, dialog, instruction)
    console.log("checkUserSatisfaction", _res)
    try {
        const res = JSON.parse(_res)
        if (res.response.toLowerCase() === "true" ) {
            response.next_phase = PHASE_LABEL.REFLECTION
        }
        console.log("checkEmotionInferenceAccuracy", res)
    } catch {
        console.error(_res)
    }

    return response
}

const generateAnalysis = async (diary, dialog, instruction) => {
    let response = ""
    const messages = [
        {
            role: "system",
            content: `${instruction} 
            User's diary: ${diary}
            Dialog: ${JSON.stringify(dialog)}`
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
    return response
}

const getEmotionList = async (userid = "") => {
    const presetEmotions = Object.values(EMOTION_LABEL)
    const mergeList = presetEmotions
    return [...new Set(mergeList)];
}

module.exports = {
    checkCriteriaExplorePhase,
    checkUserSatisfaction,
    getEmotionList,
    checkEmotionInferenceAccuracy,
    generateAnalysis
}

