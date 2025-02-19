const OpenAI = require("openai")
const dotenv = require("dotenv")
const { EMOTION_DIMENSION, TIMES_OF_DAY, PREDEFINED_PEOPLE, PREDEFINED_LOCATION, PREDEFINED_ACTIVITY, EMOTION_LABEL } = require("../constant");
const { PHASE_LABEL, GPT } = require('../constant')
const Diary = require('../models/diary');
const Statistic = require('../models/statistic');
const { minmaxScaling } = require('../utils');
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
    - Response in Korean.`
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
    let task_instruction = `##Task##
You are user's close friend and know their history emotions. Your target is recognize user emotions correctly and they should confirm about that.
Do step by step to infer user emotion:`

    if (retrievedDiaries.length) {
        task_instruction += ` 
- Read diaries in similar context to understand how user usually feel. Probably, user have same emotions to the past. These are previous diaries and emotions: 
${JSON.stringify(retrievedDiaries)}`
    }

    task_instruction += `
- Identify the strongest emotion in current diary. 
- Try to find emotion in the list that is closely associated with user'emotions.
Consider emotion in this list: ${emotionList}. Don't include any emotion outside of the list.
- Assign one emotion label to property emotions.
- Ask user if they have the emotions you recognize in property emotions. Response should be shorter than 100 words.

##Example##
Example 1 
emotions: ["슬픔"]
response: 그렇구나, 안타깝다. 많이 슬퍼? 아니면 다른 느낌이야? 편하게 말해줘!

Example 2
emotions: ["기쁨"]
response: 친구랑 편하게 시간 보낼 때 기쁨이 느껴지지? 내가 맞지?

##Output format##
Return in JSON format, structured as follows:
{
    "emotions": [string],
    "response": string,
    "rationale": string
}
property "emotions": array of emotions
Property "response": your response to user in Korean. 
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
    let task_instruction = `##Task##
You are user's close friend and know their history emotions. Your target is recognize user emotions correctly and they should confirm about that.
You infered user's emotion from their diary. User express more about their emotions.
Do step by step to infer user's emotion:
- Identify what is the emotion of user based on their feedback.
- If user express some emotions not included in given emotion list, try to find emotion in the list that is closely associated with what user mentioned. 
Emotion list: ${emotionList}. Don't include any emotion outside of the list.
- Assign emotion label to property emotions.
- Tell to user how you understand their emotions in Korean in response property.
e.g 아, 그렇군요. 회의 후에 안도감을 느끼셨네요. 안도감은 평온함과 깊이 연결될 수 있는 감정이죠. 이제 당신을 더 잘 이해할 수 있을 것 같아요.

##Output format##
Return in JSON format, structured as follows:
{
    "emotions": [string],
    "response": string,
    "rationale": string
}
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
    let task_instruction = ""
    const retrievedDiaries = await retrieveRelevantDiaryByContext(userid, diaryid, diary, dialog)
    if (retrievedDiaries.length) {
        task_instruction += `##Task##
You are user's close friend and know their emotional diaries. You always want to know the causes of user's emotions in their diary.
Do step by step to figure out why user feel that way:
- Describe the context of the diary.  
- Read diaries in similar context to understand how user usually feel. Maybe, user's current feelings caused by the same reasons in the past. These are previous diaries and emotions: 
${JSON.stringify(retrievedDiaries)}
- If the current emotions (${JSON.stringify(emotions)}) is very similar to emotions in the similar context. Infer the reason why user feel that way and ask user if you understand well. Return in response property. 
e.g "일기 보니까 연구 잘 안 되면 슬퍼하는 것 같던데, 오늘 기분도 그거 때문이야?"
- If the currect emotions are different from emotions in the similar context, ask user why this time they feel like this compare to previous scenario. Return in response property. 
e.g "친구들을 만날 때 실망하는 일이 별로 없잖아. 이번에는 왜 그렇게 느꼈는지 좀 더 이야기해 줄 수 있어?"
- Summary the reason why user have those emotions in first view in the property rationale. Should be shorter than 50 words.
e.g "교수님과의 미팅에서 긍정적인 피드백을 받아서 기뻤습니다. 제 연구 방향이 틀리지 않았다는 것을 확인하고 나니 안심이 되었습니다"

##Output format##
Return in JSON format, structured as follows:
{
    "response": string,
    "rationale": string
}`
    } else {
        task_instruction += `##Task##
You are user's close friend and know their emotional diaries. You always want to know the causes of user's emotions in their diary.
- Guess the reason why user feel like that in the current context. Tell it to user and ask them is it right in the property response.
e.g "왜 그렇게 느꼈는지 내가 맞혀볼까? 이번에도 교수님과의 회의에서 새로운 아이디어에 대한 긍정적인 피드백을 받아서 그런 건 아닐까?"
- Summary the reason why user have those emotions in first view in the property rationale. Should be shorter than 50 words.
e.g "교수님과의 미팅에서 긍정적인 피드백을 받아서 기뻤습니다. 제 연구 방향이 틀리지 않았다는 것을 확인하고 나니 안심이 되었습니다"

##Output format##
Return in JSON format, structured as follows:
{
    "response": string,
    "rationale": string
}`
    }

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

    let task_instruction = `##Task##
You are user's close friend and know their history emotions. You always want to know the causes of user's emotions in their diary. You're good ask active listening. You listen attentively to a speaker, understand what they're saying, respond and reflect on what's being said, and retain the information for later.
User emotions: ${JSON.stringify(emotions)}
- Follow up what user said.
- Elaborate the reason why user feel that way in your response.
- Dom't repeat yourself in th conversation.
- Explain how you generate your response follow step by step instruction in the rationale property. Should be shorter than 50 words.

##Output format##
Return in JSON format, structured as follows:
{
    "response": string,
    "rationale": string
}
Property "response": your response to user in Korean. 
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
    Response should be shorter than 50 words in Korean.`
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
    reviseEmotionInference,
    inferEmotion,
    inferReasons,
    categorizeContext,
    generateGoodbye,
    discussReasons,
    generateResponse,
    getEmotionList
}

