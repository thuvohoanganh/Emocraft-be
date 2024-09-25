const OpenAI = require("openai")
const dotenv = require("dotenv")
const { EMOTION_LABEL, EMOTION_LIST } = require("../constant");
const { PHASE_LABEL, instruction_32_emotion, instruction_8_emotion } = require('../constant')

dotenv.config()
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const GENERAL_SPEAKING_RULES = `
- DO NOT include double quotes \" at the start and the end of the response.
- Do not include any "tip:", "question:" etc and do not use hashtags. 
`

const checkCriteriaExplorePhase = async (diary, dialog) => {
    const response = {
        error: "",
        summary: {
            "key_episode": "",
            "user_emotion": "",
            "location": "",
            "people": "",
            "move_to_next": false,
            "rationale": ''
        },
        next_phase: PHASE_LABEL.EXPLORE
    }

    const instruction = `- You are a helpful assistant that analyzes the content of the dialog history.
- Given a dialogue history and user's diary, determine whether it is reasonable to move on to the next conversation phase or not.
- Use JSON format with the following properties:
  (1) key_episode: a key episode that the user described.
  (2) location: where did event happen (e.g. home, office). Only extract text written by user, do not predict.
  (3) people: who were involved in the event (e.g. alone, friend). Only extract text written by user, do not predict.
  (4) move_to_next: When key_episode, location, people are not null or user don't want to answer your questions, you go the next step immediately. Make sure that key_episode, location, people are not null.
  (5) rationale: Describe your rationale on how move_to_next were derived.
  (6) empathized: you have showed your empathy to user or not. yes is true, no is false
    {
        "summary": {
            "key_episode": string | null,
            "location": string | null,
            "people": string | null,
            "move_to_next": boolean,
            "rationale": string,
            "empathized": boolean
        }
    }`

    const _res = await checkCriteria(diary, dialog, instruction)
    try {
        const res = JSON.parse(_res)
        if (res.summary.move_to_next) {
            // response.next_phase = PHASE_LABEL.EXPLAIN
            response.next_phase = PHASE_LABEL.DETECT
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

    return response
}

const generateResponseExplorePhase = async (diary, dialog, summary) => {
    const response = {
        error: "",
        phase: PHASE_LABEL.EXPLORE,
        content: "",
    }

    const instruction = `- Given user's dairy and a dialogue summary of what is missing in the memory event.
    - Follow up what user mentioned in the diary.
    ${!summary.empathized ? (
            `- Empathize the user's emotion by restating how they felt.
    - Separate the empathy and the questions with line break.`
        ) : ""}
    - Ask them missing contextual information that contribute to user's emotion. Choose the first missing information (null) and ask 1 question about that.
    - Response should be less than 50 words.
    ${GENERAL_SPEAKING_RULES}

Dialog summary: 
key_episode: ${summary.key_episode},
people:  ${summary.people},
location: ${summary.location}
rationale: ${summary.rationale}
`
    const res = await generateResponse(diary, dialog, instruction)
    if (!res) {
        response.error = "ChatGPT failed"
        response.phase = PHASE_LABEL.EXPLORE
        return response
    }

    response.content = res.replace(/^\"+|\"+$/gm, '')
    return response
}

const generateExplanationPhase = async (diary, dialog) => {

    const task_instruction = instruction_32_emotion
    const removed = "- Rank the three most prominent emotions in the diary entry according to their intensity, starting with the strongest and listing them in descending order."

    const response = {
        error: "",
        // phase: PHASE_LABEL.EXPLAIN,
        phase: PHASE_LABEL.DETECT,
        content: "",
        analysis: null,
        rationale: ""
    }
    const _res = await generateResponse(diary, dialog, task_instruction)


    try {
        const res = JSON.parse(_res)
        if (res.content && res.analysis) {
            response.content = res.content.replace(/^\"+|\"+$/gm, '')
            response.analysis = res.analysis
        } else {
            throw ("error: wrong response format function generateResponse")
        }
    } catch {
        if (!_res) {
            response.error = "ChatGPT failed"
        } else {
            console.error(_res)
            response.content = _res
        }
    }

    console.log("Response: ", response);
    return response
}
// If user are satisfied with the analysis, return null.

const generateFeedbackPhase = async (diary, dialog) => {
    const instruction = `You are a psychologist. you are good at emotion awareness and you can understand where human emotion come from based on user's diary.
    - Given a dialogue history and user's diary, do they agree or disagree with what you told them?
    - If user are satisfied with the analysis, say thank and tell them to click Finish button on the top screen to finish section.
    - If user give feedback to you, try to make analysis again based on diary and their feedback and 32 emotions of Plutchik's model (${EMOTION_LIST}). If they told you emotion label, try to convert their emotions to Plutchik’s Wheel of Emotions: ${EMOTION_LIST} and explain to user in the content property.
    - Only use 32 emotions of Plutchik's model in analysis. 
    - Use JSON format with the following properties:
    (1) content: your response to user as second person pronoun "YOU". do not use third person pronoun. Never return array of emotions in this properties.
    (2) analysis: based on diary and user's feedback, rank the emotions in the diary entry according to their intensity, starting with the strongest and listing them in descending order. Focus solely on the 32 emotions of Plutchik's model. Do not repeat emotion. Format the analysis as follows: [first intense emotion, second most intense, third most intense]. 
    (3) rationale: reason how you generate content and analysis properties
    Return the response in JSON format:
        {
            "content": string,
            "analysis": [string],
            "rationale": string
        }
    `
    const response = {
        error: "",
        phase: PHASE_LABEL.FEEDBACK,
        content: "",
        analysis: [],
        rationale: ""
    }
    const _res = await generateResponse(diary, dialog, instruction)

    try {
        const res = JSON.parse(_res)
        if (res.content) {
            response.content = res.content.replace(/^\"+|\"+$/gm, '')
            response.analysis = res.analysis
            response.rationale = res.rationale
            console.log("rationale", res.rationale)
        } else {
            response.content = _res
        }
    } catch {
        if (typeof _res === "string") {
            response.content = _res.replace(/^\"+|\"+$/gm, '')
        } else {
            response.error = "ChatGPT return wrong format"
        }
    }
    return response
}

const generateResponse = async (diary, dialog, instruction) => {
    let response = ""
    const _dialog = dialog.map(e => ({
        ...e,
        content: JSON.stringify(e.content)
    }))
    const messages = [
        {
            role: "system",
            content: `${instruction} 
            User's diary: ${diary}`
        },
        ..._dialog
    ]

    try {
        const chatCompletions = await openai.chat.completions.create({
            messages,
            model: "gpt-4",
            temperature: 0.5
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

const checkCriteria = async (diary, dialog, instruction) => {
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
            model: "gpt-4",
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

const generateRationaleSummary = async (diary, dialog, initRationale) => {
    const instruction = `You are and psychologist. you are good at emotion awareness and you can understand where human emotion come from on user's diary. From the dialog, you assess user' emotions from 0 to 5. User gave you feedback about your analysis.
    - From the dialog, determine user agree or disagree with you analysis.
    - If user agree, return exactly your previous rationale. DO NOT include double quotes \" at the start and the end of the response.
    - If user disagree and give feedback, generate another rationale based on their feedback and your previous rationale. 
    ${GENERAL_SPEAKING_RULES}
    This is previous your rationale: ${initRationale}
    Response example: From your diary, there's a sense of tiredness which can be associated with a low level of sadness. There's also a hint of joy from spending time with a friend and visting the cathedral. There's no indication of disgust, anger, fear, or surprise in your writing.
    `
    let updatedRationale = await generateResponse(diary, dialog, instruction)
    updatedRationale = updatedRationale.replace(/^\"+|\"+$/gm, '')

    return updatedRationale
}

module.exports = {
    checkCriteriaExplorePhase,
    generateResponseExplorePhase,
    generateExplanationPhase,
    generateFeedbackPhase,
    generateResponse,
    generateRationaleSummary,
}

