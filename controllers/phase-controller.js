const OpenAI = require("openai")
const dotenv = require("dotenv")
const { EMOTION_LABEL } = require("../constant");
const { PHASE_LABEL } = require('../constant')

dotenv.config()
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const checkCriteriaExplorePhase = async (diary, dialog) => {
    const response = {
        error: "",
        summary: {
            "key_episode": "",
            "user_emotion": null,
            "contextual_factors": null,
        },
        next_phase: PHASE_LABEL.EXPLORE
    }

    const instruction = `- You are a helpful assistant that analyzes the content of the dialog history.
- Given a dialogue history and user's diary, determine whether it is reasonable to move on to the next conversation phase or not.
- Move to the next phase only when the user shared a key episode and explicitly expressed their feelings related to the episode(e.g. good or bad) and described .
- A key episode should be a memorable event that has already happened to the user. 
- Use JSON format with the following properties:
  (1) key_episode: a key episode that the user described.
  (2) user_emotion: the emotion of the user caused by the key episode. Make sure the emotion is connected to (1)
  (3) location: where did event happen (e.g. home, office).
  (4) people: who were involved in the event and contribute to user's emotion (e.g. alone, friend).
  (5) move_to_next: A boolean whether it is reasonable to move on to the next conversation phase or not, judged based on (1) and (2) and (3) and (4).
    {
        "summary": {
            "key_episode": string | null,
            "user_emotion": string | null, 
            "location": string | null,
            "people": string | null,
            "move_to_next": boolean,
        }
    }`

    const _res = await checkCriteria(diary, dialog, instruction)
    console.log("checkCriteria", _res)
    try {
        const res = JSON.parse(_res)
        if (res.summary.move_to_next) {
            response.next_phase = PHASE_LABEL.EXPLAIN
        } else {
            response.summary = res.summary
        }
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

const checkCriteriaFeedbackPhase = async (diary, dialog) => {
    return {
        error: "",
        summary: {
            location: "",
            people: "",
        },
        next_phase: ""
    }
}

const generateResponseExplorePhase = async (diary, dialog, summary) => {
    const response = {
        error: "",
        phase: PHASE_LABEL.EXPLORE,
        content: "",
    }

    const instruction = `- Given user's dairy and a dialogue summary of what is missing in the memory event, ask them to elaborate more about their emotions and missing contextual information that contribute to user's emotion. Ask only one question at a time.
Dialog summary: 
key_episode: ${summary.key_episode},
user_emotion:  ${summary.user_emotion}, 
people:  ${summary.people},
location: ${summary.people}
`
    const res = await generateResponse(diary, dialog, instruction)
    console.log("res", res)
    if (!res) {
        response.error = "ChatGPT failed"
        response.phase = PHASE_LABEL.EXPLORE
        return response
    }

    response.content = res
    return response
}

const generateExplanationPhase = async (diary, dialog) => {
    const response = {
        error: "",
        phase: PHASE_LABEL.EXPLAIN,
        content: `Looking back at today’s diary, the emotion you felt was 'anxiety'. 
It seems that you felt anxious while preparing for the exam alone at home. 
In fact, this emotion has been repeated in your past diary entries as well. Specifically, you often felt anxious in the context of 'being alone at home'. Does this situation frequently make you anxious? Considering your situation, you might alleviate your anxiety by being in a different place or with other people. How about working in a busy café or being with a close friend? 
Try to identify location that trigger your anxiety and think of ways to address it.
`,
        analysis: {
            [EMOTION_LABEL.JOY]: 5,
            [EMOTION_LABEL.DISGUST]: 5,
            [EMOTION_LABEL.ANGRY]: 5,
            [EMOTION_LABEL.FEAR]: 5,
            [EMOTION_LABEL.SADNESS]: 5,
            [EMOTION_LABEL.SURPRISE]: 5,
        }
    }
    return response
}

const generateResponse = async (diary, dialog, instruction) => {
    let response = ""
    const messages = [
        {
            role: "system",
            content: `${instruction} 
            User's diary: ${diary}`
        },
        ...dialog
    ]
    console.log("messages", messages)
    try {
        const chatCompletions = await openai.chat.completions.create({
            messages,
            model: "gpt-4",
        });

        response = chatCompletions?.choices?.[0]?.message?.content
        if (!response) {
            throw ("no response from ChatGPT")
        }
    } catch (err) {
        console.log(err)
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
    console.log("checkCriteria checkCriteria", dialog)
    try {
        const chatCompletions = await openai.chat.completions.create({
            messages,
            model: "gpt-4",
        });

        response = chatCompletions?.choices?.[0]?.message?.content
        if (!response) {
            throw ("no response from ChatGPT")
        }
    } catch (err) {
        console.log(err)
        return ""
    }
    return response
}


module.exports = {
    checkCriteriaExplorePhase,
    checkCriteriaFeedbackPhase,
    generateResponseExplorePhase,
    generateExplanationPhase
}

