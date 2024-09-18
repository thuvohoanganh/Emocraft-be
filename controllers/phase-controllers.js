const OpenAI = require("openai")
const dotenv = require("dotenv")
const { EMOTION_LABEL, EMOTION_LIST } = require("../constant");
const { PHASE_LABEL } = require('../constant')

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
  (2) user_emotion: the emotion of the user mentioned in diary or dialog. Make sure the emotion is connected to (1). Only extract text written by user, do not predict.
  (3) location: where did event happen (e.g. home, office). Only extract text written by user, do not predict.
  (4) people: who were involved in the event and contribute to user's emotion (e.g. alone, friend). Only extract text written by user, do not predict.
  (5) move_to_next: When key_episode, user_emotion, location, people are not null or user don't want to answer your questions or you asked more than 3 questions, you go the next step immediately. Make sure that key_episode, user_emotion, location, people are not null.
  (6) rationale: Describe your rationale on how move_to_next were derived.
  (7) empathized: you have showed your empathy to user or not. yes is true, no is false
    {
        "summary": {
            "key_episode": string | null,
            "user_emotion": string | null, 
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
    ${!summary.empathized? (
    `- Empathize the user's emotion by restating how they felt.
    - Separate the empathy and the questions with line break.`
    ) : ""}
    ${!summary.user_emotion? (
    "- Ask user's emotion relating to key_episode and try to guess their emotion."
    ) : (
    "- Ask them missing contextual information that contribute to user's emotion. Choose the first missing information (null) and ask 1 question about that."
    )}
    - Response should be less than 50 words.
    ${GENERAL_SPEAKING_RULES}

Dialog summary: 
key_episode: ${summary.key_episode},
user_emotion:  ${summary.user_emotion}, 
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

    response.content = res.replace(/^\"+|\"+$/gm,'')
    return response
}

const generateExplanationPhase = async (diary, dialog) => {
    const instruction_6 = `You are a psychologist. you are good at emotion awareness and you can understand where human emotion come from based on user's diary, tell the user how you feel about their emotions and reason why.
    Return response with JSON format with the following properties:
    (1) content: you should show empathy and tell user how you feel about their emotion and reason why. Length should be less then 100 words.
    (2) analysis: assess user's emotions based on 6 basic emotions (${EMOTION_LIST}) from 0 to 5
    (3) rationale: Describe to user your rationale on how the "analysis" properties were derived.
    {
        "content": string,
        "analysis": {
            ${[EMOTION_LABEL.JOY]}: number,
            ${[EMOTION_LABEL.DISGUST]}: number,
            ${[EMOTION_LABEL.ANGER]}: number,
            ${[EMOTION_LABEL.FEAR]}: number,
            ${[EMOTION_LABEL.SADNESS]}: number,
            ${[EMOTION_LABEL.SURPRISE]}: number,
        },
        "rationale": string
    } 
    `
    const instruction_8 = `
        You will analyze diary entries to evaluate their emotional content, focusing on identifying eight primary emotions: ${EMOTION_LIST}, as defined below:

        - **Sadness**: A feeling of unhappiness, sorrow, or disappointment, often associated with a sense of loss, grief, or helplessness.
        - **Joy**: A feeling of great pleasure, happiness, or delight, often experienced as a result of positive or rewarding events, fostering optimism and satisfaction.
        - **Anger**: An intense emotional response to a perceived injustice or frustration, often accompanied by feelings of irritation, rage, or hostility.
        - **Fear**: An emotional response to a perceived threat, danger, or harm, often leading to feelings of anxiety, unease, or panic.
        - **Disgust**: A strong feeling of aversion or revulsion towards something considered unpleasant, offensive, or repugnant.
        - **Surprise**: A sudden emotional reaction to something unexpected, which can be positive or negative, and is usually brief, involving a sense of astonishment or wonder.
        - **Trust**: A sense of reliability and safety, characterized by feelings of confidence, comfort, and acceptance in someone or something, promoting a bond or connection.
        - **Anticipation**: A feeling of excitement, eagerness, or apprehension about a future event, often accompanied by expectations of what might happen.

        Return the response **strictly in JSON format**, structured as follows:

        1. **Content**: Empathize with the user’s emotions along with a brief explanation of why you resonate with their experience. Keep the response under 100 words.

        2. **Ranking**: 
        - Rank the three most prominent emotions in the diary entry according to their intensity, starting with the strongest and listing them in descending order.
        - Focus solely on the eight mentioned emotions: ${EMOTION_LIST}.
        - If fewer than three of the eight emotions are detected, list only the detected emotions. If none of the eight emotions are detected, state 'None'.

        3. **Rationale**: 
        Describe to the user your rationale for how the “Ranking” properties were derived.

        The response **must** be a valid JSON object in the following format:

        {
            "content": "string",
            "analysis": ["emotion1", "emotion2", "emotion3"],
            "rationale": "string"
        }

        Example:

        {
            "content": "It seems like you experienced a lot of joy and trust during your sports competition, especially when you scored two goals.",
            "analysis": ["joy", "trust", "anticipation"],
            "rationale": "The ranking is based on your expression of positive feelings and excitement about the competition and your performance."
        }
    `

    const instruction_32 = `
    You will analyze diary entries to evaluate their emotional content, focusing on identifying 32 distinct emotions: ${EMOTION_LIST}, as defined below:

    1. 8 Primary Emotions
    The 8 primary emotions form the foundational emotional experience. Each is associated with a core feeling:

    - Sadness: A feeling of unhappiness, sorrow, or disappointment, often related to a sense of loss, grief, or helplessness.
    - Joy: A feeling of great pleasure, happiness, or delight, typically stemming from positive events, evoking optimism and satisfaction.
    - Anger: An intense emotional response to perceived injustice or frustration, often involving irritation, rage, or hostility.
    - Fear: An emotional reaction to perceived danger or harm, frequently accompanied by anxiety, unease, or panic.
    - Disgust: A strong aversion or revulsion towards something unpleasant, offensive, or repugnant.
    - Surprise: A brief emotional response to unexpected events, which can be either positive or negative, typically involving astonishment or wonder.
    - Trust: A feeling of confidence and safety, characterized by reliability and comfort in someone or something, fostering a sense of connection.
    - Anticipation: A feeling of excitement, eagerness, or apprehension about a future event, often accompanied by expectations of possible outcomes.

    2. 16 Emotion Intensity Variations
    Each primary emotion has variations in intensity, ranging from mild to strong:

    - Joy: Serenity (mild), Ecstasy (intense)
    - Trust: Acceptance (mild), Admiration (intense)
    - Fear: Apprehension (mild), Terror (intense)
    - Surprise: Distraction (mild), Amazement (intense)
    - Sadness: Pensiveness (mild), Grief (intense)
    - Disgust: Boredom (mild), Loathing (intense)
    - Anger: Annoyance (mild), Rage (intense)
    - Anticipation: Interest (mild), Vigilance (intense)

    3. Blended Emotions (Dyads)
    Blended emotions are combinations of two primary emotions, creating more complex emotional experiences:

    - Love: Joy + Trust
    - Submission: Trust + Fear
    - Awe: Fear + Surprise
    - Disapproval: Surprise + Sadness
    - Remorse: Sadness + Disgust
    - Contempt: Disgust + Anger
    - Aggressiveness: Anger + Anticipation
    - Optimism: Anticipation + Joy


    Return the response in JSON format, structured as follows:

    ### 1. Content
    Empathize with the user’s emotions along with a brief explanation of why you resonate with their experience. Keep the response under 100 words.

    ### 2. Ranking
    - Rank the emotions in the diary entry according to their intensity, starting with the strongest and listing them in descending order.
    - Focus solely on the 32 mentioned emotions: ${EMOTION_LIST}. Do not include other emotions in the ranking.
    - Consider the diary entry as a whole rather than focusing on individual sentences or paragraphs, ranking based on the prominence of emotions throughout the entry.
    - Maintain an objective stance by focusing only on expressed emotions and not inferring beyond the content of the diary entry.
    - Format the rankings as follows: [first intense emotion, second most intense, third most intense, ....]
    - If none of the 32 emotions are detected, state 'None'.

    ### 3. Rationale:
    Describe to the user your rationale for how the “Ranking” properties were derived. 

    Sample response format:
    {
        “content”: string,
        “analysis”: [string],
        “rationale”: string,
    }
    `

    const removed = "- Rank the three most prominent emotions in the diary entry according to their intensity, starting with the strongest and listing them in descending order."

    const response = {
        error: "",
        // phase: PHASE_LABEL.EXPLAIN,
        phase: PHASE_LABEL.DETECT,
        content: "",
        analysis: null,
        rationale: ""
    }
    const _res =  await generateResponse(diary, dialog, instruction_32)


    try {
        const res = JSON.parse(_res)
        if (res.content && res.analysis) {
            response.content = res.content.replace(/^\"+|\"+$/gm,'')
            response.analysis = res.analysis
            response.rationale = res.rationale
        } else {
            throw("error: wrong response format function generateResponse")
        }
    } catch {
        if (!_res) {
            response.error = "ChatGPT failed"
        } else {
            response.error = "ChatGPT return wrong format"
        }
    }

    console.log("Response: ", response);
    return response
}

const generateFeedbackPhase = async (diary, dialog) => {
    const instruction = `You are a psychologist. you are good at emotion awareness and you can understand where human emotion come from based on user's diary.
    - Given a dialogue history and user's diary, do they agree or disagree with what you told them?
    - If user are satisfied with the analysis, say thank and goodbye to them.
    - If user give you feedback, acknowledge and tell them how you understand their feelings after feedback. Then ask them if they have other things to share.
    - If the user has nothing to share or byes, say thank and goodbye to them.
    - Use JSON format with the following properties:
    (1) content: your response to user
    (2) end: you say bye to user or not
        {
            "content": string,
            "end": boolean
        }
    `
    const response = {
        error: "",
        phase: PHASE_LABEL.FEEDBACK,
        content: "",
        end: false
    }
    const _res =  await generateResponse(diary, dialog, instruction)

    try {
        const res = JSON.parse(_res)
        if (res.content) {
            response.content = res.content.replace(/^\"+|\"+$/gm,'')
            response.end = res.end
        } else {
            response.error = "Empty response"
        }
    } catch {
        if (typeof _res === "string") {
            response.content = _res.replace(/^\"+|\"+$/gm,'')
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
    console.log("instruction", instruction)
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
    updatedRationale = updatedRationale.replace(/^\"+|\"+$/gm,'')

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

