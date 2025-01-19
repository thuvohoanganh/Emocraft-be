const OpenAI = require("openai")
const dotenv = require("dotenv")
const { EMOTION_DIMENSION } = require("../constant");
const { PHASE_LABEL, GPT } = require('../constant')
const Diary = require('../models/diary');
const Statistic = require('../models/statistic');
const { minmaxScaling } = require('../utils');
const { getEmotionList, generateAnalysis } = require("./phase-controllers");

dotenv.config()
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const GENERAL_SPEAKING_RULES = `
- Don't include double quotes \" at the start and the end of the response.
- Don't include any "tip:", "question:" etc and do not use hashtags. 
- Don't start the response with any special characters (e.g !"#$%&'()*+,-./:;<=>? )
`

const askMissingInfor = async (diary, dialog, summary) => {
    const response = {
        error: "",
        phase: PHASE_LABEL.BEGINNING,
        content: "",
    }
    const instruction = `- Given user's dairy and a dialogue summary of what is missing in the memory event.
    - Follow up what user mentioned in the diary.
    - Summary: ${JSON.stringify(summary)}
    ${!summary.event ? (
            `- Ask user what happend to them.`
        ) : !summary.people ? (
            `- Ask user who was involved in the event and contribute to user's emotion.`
        ) : !summary.location ? (
            `- Ask user where did the event occurred.`
        ) : !summary.time_of_day ? (
            `- Guess the key event happened at what time of day (e.g morning, noon, evening, night) and ask user if it is right.`
        ) : ""}
    - Response should be less than 50 words.
    - Ask only one question.
    ${GENERAL_SPEAKING_RULES}`
    const res = await generateResponse(diary, dialog, instruction)
    if (!res) {
        response.error = "ChatGPT failed"
        return response
    }

    response.content = res.replace(/^\"+|\"+$/gm, '')
    return response
}

const inferEmotion = async (diary, userid, dialog) => {
    const retrievedDiaries = await retrieveRelevantDiaryByContext(userid, "", diary, dialog)
    const emotionList = await getEmotionList(userid)
    let task_instruction = `You are user's close friend and know their history emotions. You always want to infer user's emotions in their diary.
Do step by step to infer user emotion:
- Describe the context of the diary. `

    if (retrievedDiaries.length) {
        task_instruction += ` 
- Read diaries in similar context to understand how user usually feel. Probably, user have same emotions to the past. These are previous diaries and emotions: 
${JSON.stringify(retrievedDiaries)}`
    }

    task_instruction += `
- Identify user’s emotions in current diary. Only identify 2 or 1 emotion labels. Assign labels to property emotions (e.g "emotions": ["joy", "anxiety"]).
Consider emotion in this list: ${emotionList}. 
Don't include any emotion outside of the list.
- Consider how to say about user's emotions in empathy. Only mention the emotion that you indentify and it must be included the provided emotion list. Response should be shorter tha 50 words.
Example: Sorry to hear that, I guess you feeling are sad about it.
You must feel joy or anxiety in that situation.

Return in JSON format, structured as follows:
Response must be JSON format:
{
    "emotions": [string],
    "response": string,
    "rationale": string
}
property "emotions": array of emotions
Property "response": your response to user. 
Property "rationale": explain how you generate your response follow instruction.
`
    const response = {
        error: "",
        phase: PHASE_LABEL.EMOTION_LABEL,
        content: "",
        analysis: null,
        rationale: ""
    }

    const _res = await generateResponse(diary, dialog, task_instruction)

    try {
        const res = JSON.parse(_res)
        if (!res.response) {
            throw("Don't return in JSON format")
        }
        response.content = res.response
        response.analysis = res.emotions
        console.log("inferEmotion", res)
    } catch {
        console.error(_res)
        response.content = _res
    }

    response.content = response.content?.replace(/^\"+|\"+$/gm, '')

    return response
}

const reviseEmotionInference = async (diary, userid, dialog) => {
    const emotionList = await getEmotionList(userid)
    let task_instruction = `You are user's close friend and know their history emotions. You always want to infer user's emotions in their diary.
You infered user's emotion from their diary. USer express more about their emotions.
Do step by step to infer user emotion:
- Identify what are the emotion of user.
- If user express some emotions not included in given emotion list, try to find emotion in the list that is closely associated with what user mentioned. (e.g relief, joy -> calmness, joy)
Emotion list: ${emotionList}.
Don't include any emotion outside of the list.
- Assign emotion labels to property emotions (e.g "emotions": ["calmness", "joy"])
- Response to user how you understand their emotions.
Example: Ah I see. you have a feeling of relief after the meeting. The emotion of relief can be closely associated with calmness. Now I understand you better.

Return in JSON format, structured as follows:
Response must be JSON format:
{
    "emotions": [string],
    "response": string,
    "rationale": string
}
property "emotions": array of emotions    
Property "response": your response to user.
Property "rationale": explain how you generate your response follow instruction.
`

    const response = {
        error: "",
        phase: PHASE_LABEL.REVISE_EMOTION_LABEL,
        content: "",
        analysis: null,
        rationale: ""
    }

    const _res = await generateResponse(diary, dialog, task_instruction)

    try {
        const res = JSON.parse(_res)
        response.content = res.response
        response.analysis = res.emotions
        console.log("reviseEmotionInference", res)
    } catch {
        console.error(_res)
        response.content = _res
    }

    response.content = response.content?.replace(/^\"+|\"+$/gm, '')

    return response
}

const generateEmotionReflection = async (userid, diaryid, diary, dialog, emotions) => {
    const response = {
        error: "",
        phase: PHASE_LABEL.REFLECTION,
        content: "",
    }
    const retrievedDiaries = await retrieveRelevantDiaryByContext(userid, diaryid, diary, dialog)
    const emotionRelevantDiaries = await retrieveRelevantDiaryByEmotion(userid, diaryid, emotions)

    if (!retrievedDiaries.length && !emotionRelevantDiaries.length) return response

    let task_instruction = `You are an expert agent specializing in emotion classification and reasoning, designed to analyze diary with a highly analytical and empathetic approach.
You excel at detecting and interpreting a wide range of emotions, considering nuanced language and complex emotional cues.

Use previous diaries with similar emotion or similar context to current diary. Find if there are common contexts when the user felt a similar emotion to the one in their current diary, or if there are common emotions felt in similar contexts. 
Based on previous diaries, identify whether the user has experienced similar emotions or been in similar contexts, and provide an explanation that allows the user to reflect on their current emotion based on those experiences.
Response should be no longer than 200 words.

${emotions ? `
Emotions in current diary: ${JSON.stringify(emotions)}` : ""}
${retrievedDiaries.length > 0 ? `
Previous diaries have similar context: ${JSON.stringify(retrievedDiaries)}` : ""}
${emotionRelevantDiaries.length > 0 ? `Previous diaries have similar emotions: ${JSON.stringify(emotionRelevantDiaries)}` : ""}
`

    // console.log("task_instruction", task_instruction)

    const _res = await generateResponse(diary, [], task_instruction)

    if (_res) {
        response.content = _res
        response.content = response.content?.replace(/^\"+|\"+$/gm, '')
    }

    return response
}

const retrieveRelevantDiaryByContext = async (userid, diaryid, diary, dialog) => {
    let results = []

    try {
        const context = await categorizeContext(diary, dialog)

        console.log("retrieveRelevantDiaryByContext", context)

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

            if (similarityScore > 0.5) {
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
                activity: e.activity,
                location: e.location,
                people: e.people,
                time_of_day: e.time_of_day,
            }))
        }
        console.log("topThree context", topThree)
    } catch (err) {
        err && console.error(err);
        return results
    }
    return results
}

const retrieveRelevantDiaryByEmotion = async (userid, diaryid, emotions) => {
    let results = []
    if (!emotions?.length) {
        return results
    }
    console.log("retrieveRelevantDiaryByEmotion", emotions)
    try {
        diaries = await Diary.find({ userid: userid, _id: { $ne: diaryid } });
        if (!diaries) {
            return results
        }

        const emotionRelevantDiary = []
        let similarities = []
        diaries.forEach(diary => {
            let similarityScore = 0
            emotions && emotions.forEach(emotion => {
                diary?.emotions && diary.emotions.forEach(e => {
                    if (emotion === e) {
                        similarityScore += 1
                    } else if (EMOTION_DIMENSION[emotion] === EMOTION_DIMENSION[e]) {
                        similarityScore += 0.5
                    }
                })
            })

            if (similarityScore > 0) {
                emotionRelevantDiary.push({
                    content: diary.content,
                    similarity: similarityScore,
                    emotion_retention: diary.emotion_retention,
                    activity: diary.activity,
                    location: diary.location,
                    people: diary.people,
                    time_of_day: diary.time_of_day,
                    emotions: diary.emotions
                })
                similarities.push(similarityScore)
            }
        })
        // console.log("emotionRelevantDiary", emotionRelevantDiary)

        similarities = minmaxScaling(similarities)

        similarities.forEach((similarityScore, index) => {
            emotionRelevantDiary[index].similarity = similarityScore
        })

        let topThree = []
        if (emotionRelevantDiary.length > 0) {
            emotionRelevantDiary.sort((a, b) => (b.emotion_retention + b.similarity) - (a.emotion_retention + a.similarity))
            topThree = emotionRelevantDiary.slice(0, 3)
        }
        console.log("topThree emotion", topThree)
        results = topThree.map(e => ({
            content: e.content,
            emotions: e.emotions,
        }))
    } catch (err) {
        err && console.error(err);
        return results
    }
    return results
}

const generateEncourageFeedback = async (diary, dialog) => {
    const task_instruction = `Encourage user’s feedback about emotional classification and reasoning. The length of the response should be shorter than 50 words. Don't analysis user' emotion. Only ask for feedback.
    Example: I hope my analysis aligns with your feelings, but emotions are often complex. If my interpretation resonates with you, or it you feel there are other emotions or reasons at play, I greatly appreciate your feedback. Please let me know how this analysis could be adjusted to better support your reflection!`
    const response = {
        error: "",
        phase: PHASE_LABEL.ENCOURAGE_FEEDBACK,
        content: "",
        rationale: ""
    }

    const _res = await generateResponse(diary, [], task_instruction)

    try {
        response.content = _res
    } catch {
        console.error(_res)
        response.content = _res
    }

    response.content = response.content?.replace(/^\"+|\"+$/gm, '')

    return response
}

const generateGoodbye = async (diary, dialog) => {
    const instruction = `You are an expert agent specializing in emotion classification and reasoning, designed to analyze diary with a highly analytical and empathetic approach.
    If user want to continue the conversation, you should be a active listener, an empathetic friend and response them.
    If user want to finish conversation say thank and tell them to click Finish button on the top screen to finish section. 
    Response should be shorter than 50 words.`
    const response = {
        error: "",
        phase: PHASE_LABEL.GOODBYE,
        content: "",
        analysis: [],
        rationale: ""
    }
    const _res = await generateResponse(diary, dialog, instruction)

    try {
        response.content = _res
        response.content = response.content?.replace(/^\"+|\"+$/gm, '')
    } catch (error) {
        console.error(error)
        response.error = "ChatGPT return wrong format"
    }
    return response
}

const generateResponse = async (diary, dialog, instruction) => {
    let response = ""
    // console.log("messages", messages)
    try {
        const _dialog = dialog?.map(e => ({
            ...e,
            content: JSON.stringify(e.content)
        })) || []

        const messages = [
            {
                role: "system",
                content: `${instruction} 
                User's diary: ${diary}`
            },
            ..._dialog
        ]
        
        const chatCompletions = await openai.chat.completions.create({
            messages,
            model: GPT.MODEL,
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

    response = response.replace(/json|\`+|\`+$/gm, '')
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
    const instruction = `Based on diary and dialog, classify contextual information into category.
Use JSON format with the following properties:
- activity: detect key activity in the diary and return the category that it belong to. Consider these category: ${activity || ""}, studying, research, resting, meeting, eating, socializing, leisure activity, exercise, moving. If it doesn't belong to any of those, generate suitable category label. Return only one main activity. Don't return "other".
- location: detect where did user usually have that emotions and return the category that it belong to. Consider these category: ${location || ""}, home, classroom, library, restaurant, office, laboratory. If it doesn't belong to any of those, generate suitable category label. Return only one location label relate to activity. Don't return "other".
- people: detect who did cause those emotions and return the category that it belong to. Consider these category: ${people || ""}, alone, family, boyfriend, girlfriend, roommate, friend, colleague, professor. If it doesn't belong to any of those, generate suitable category label. Return only one people label relate to activity. Don't return "other".
- time_of_day: what time of day did event happen. Only use one of the following: morning, noon, afternoon, evening, night, all_day. Return only one word.
- rationale: Describe your rationale on how properties were derived.
    {
        "activity": string | null,
        "location": string | null,
        "people": string | null,
        "time_of_day": string | null,
        "rationale": string,
    }`

    const _res = await generateAnalysis(diary, dialog, instruction)
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

module.exports = {
    askMissingInfor,
    reviseEmotionInference,
    inferEmotion,
    generateEmotionReflection,
    categorizeContext,
    generateGoodbye,
    generateEncourageFeedback,
    generateResponse,
}

