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

const askMissingInfor = async (diary, dialog, summary) => {
    const response = {
        error: "",
        phase: PHASE_LABEL.PHASE_1,
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
    - Ask only one question.`
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
- Describe the context of the diary.`

    if (retrievedDiaries.length) {
        task_instruction += ` 
- Read diaries in similar context to understand how user usually feel. Probably, user have same emotions to the past. These are previous diaries and emotions: 
${JSON.stringify(retrievedDiaries)}`
    }

    task_instruction += `
- Identify user’s emotions in current diary. Only identify 2 or 1 emotion labels. 
- Try to find emotions in the list that is closely associated with user'emotions. (e.g relief, joy -> calmness, joy)
Consider emotion in this list: ${emotionList}. Don't include any emotion outside of the list.
- Assign labels to property emotions (e.g "emotions": ["calmness", "joy"]).
- Consider how to say about user's emotions in empathy. Only mention about emotions that you indentified in emotion properties. Response should be shorter than 50 words.
Example: Sorry to hear that, I guess you feeling are sad about it. Am I right?
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
Property "rationale": explain how you generate your response follow step by step instruction.
`
    const response = {
        error: "",
        phase: PHASE_LABEL.PHASE_2,
        content: "",
        analysis: null,
        rationale: ""
    }

    const _res = await generateResponse(diary, dialog, task_instruction)

    try {
        const res = JSON.parse(_res)
        if (!res.response) {
            throw ("Don't return in JSON format")
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
You infered user's emotion from their diary. User express more about their emotions.
Do step by step to infer user's emotion:
- Identify what are the emotions of user.
- If user express some emotions not included in given emotion list, try to find emotion in the list that is closely associated with what user mentioned. (e.g relief, joy -> calmness, joy)
Emotion list: ${emotionList}. Don't include any emotion outside of the list.
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
Property "rationale": explain how you generate your response follow step by step instruction.
`

    const response = {
        error: "",
        phase: PHASE_LABEL.PHASE_3,
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

const inferReasons = async (userid, diaryid, diary, dialog, emotions) => {
    const response = {
        error: "",
        phase: PHASE_LABEL.PHASE_4,
        content: "",
    }
    const retrievedDiaries = await retrieveRelevantDiaryByContext(userid, diaryid, diary, dialog)

    let task_instruction = `You are user's close friend and know their history emotions. You always want to know the causes of user's emotions in their diary.
Do step by step to figure out why user feel that way:
- Describe the context of the diary. `
    if (retrievedDiaries.length) {
        task_instruction += ` 
- Read diaries in similar context to understand how user usually feel. Maybe, user's current feelings caused by the same reasons in the past. These are previous diaries and emotions: 
${JSON.stringify(retrievedDiaries)}
- If the current emotions (${JSON.stringify(emotions)}) is very similar to emotions in the similar context. Infer what is the reason user feel that way and ask user if you understand well. (e.g "I guess you might have felt joyful after jogging because of the sense of accomplishment from achieving your goal. Am I right?")
- If the currect emotions are different from emotions in the similar context, ask user why this time they feel like this compare to previous scenario. (e.g "You don’t often feel disappointed when meeting friends. Could you tell me more about why you felt that way this time?")`
    } else {
        task_instruction += ` 
- Guess the reason why user feel like that in the current context. Tell it to user and ask them is it right in the property response.
(e.g "Let me guess why you might have felt that way. Could it be that you received positive feedback on a new idea during a meeting with your professor this time as well?")`
    }

    task_instruction += `
Return in JSON format, structured as follows:
{
    "response": string,
    "rationale": string
}
Property "response": your response to user.
Property "rationale": explain how you generate your response follow instruction.
`

    const _res = await generateResponse(diary, dialog, task_instruction)
    console.log("inferReasons", _res)

    try {
        const res = JSON.parse(_res)
        if (!res.response) {
            throw ("Don't return in JSON format")
        }
        response.content = res.response
        saveReasoning(res.rationale, diaryid)
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

        console.log("retrieveRelevantDiaryByContext", context)
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
                activity: e.activity,
                location: e.location,
                people: e.people,
                time_of_day: e.time_of_day,
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

const discussReasons = async (userid, diaryid, diary, dialog, emotions) => {
    const response = {
        error: "",
        phase: PHASE_LABEL.PHASE_5,
        content: "",
    }
    const retrievedDiaries = await retrieveRelevantDiaryByContext(userid, diaryid, diary, dialog)

    let task_instruction = `You are user's close friend and know their history emotions. You always want to know the causes of user's emotions in their diary. You're good ask active listening. You listen attentively to a speaker, understand what they're saying, respond and reflect on what's being said, and retain the information for later.
User emotions: ${JSON.stringify(emotions)}`
    if (retrievedDiaries.length) {
        task_instruction += ` 
- These are previous diaries and emotions. It will help you to have user's background: 
${JSON.stringify(retrievedDiaries)}`
    }
    task_instruction += `
- Elaborate the reason why user feel that way in your response.
Return in JSON format, structured as follows:
Response must be JSON format:
{
    "response": string,
    "rationale": string
}
Property "response": your response to user. 
Property "rationale": explain how you generate your response follow instruction.
`


    const _res = await generateResponse(diary, dialog, task_instruction)
    console.log("discussReasons", _res)

    try {
        const res = JSON.parse(_res)
        if (!res.response) {
            throw ("Don't return in JSON format")
        }
        response.content = res.response
        saveReasoning(res.rationale, diaryid)
    } catch {
        console.error(_res)
        response.content = _res
    }

    response.content = response.content?.replace(/^\"+|\"+$/gm, '')

    return response
}

const generateGoodbye = async (diary, dialog) => {
    const instruction = `You are an expert agent specializing in emotion classification and reasoning, designed to analyze diary with a highly analytical and empathetic approach.
    - Ask if user have anything want to share.
    - If user want to continue the conversation, you should be a active listener, an empathetic friend and response them.
    - If user want to finish conversation say thank and tell them to click Finish button on the top screen to finish section. 
    Response should be shorter than 50 words.`
    const response = {
        error: "",
        phase: PHASE_LABEL.PHASE_6,
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

const saveReasoning = async (reasons, diaryid) => {
    if (!reasons || !diaryid) return
    let existingDiary;

    try {
        existingDiary = await Diary.findOne({ _id: diaryid });
        if (!existingDiary) {
            throw ("Not found dairy", diaryid)
        }

        existingDiary.reasons = reasons

        await existingDiary.save();
    } catch (err) {
        err && console.error(err);
    }
}

module.exports = {
    askMissingInfor,
    reviseEmotionInference,
    inferEmotion,
    inferReasons,
    categorizeContext,
    generateGoodbye,
    discussReasons,
    generateResponse,
}

