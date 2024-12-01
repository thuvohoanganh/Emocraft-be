const OpenAI = require("openai")
const dotenv = require("dotenv")
const { EMOTION_LABEL, EMOTION_DIMENSION } = require("../constant");
const { PHASE_LABEL } = require('../constant')
const Diary = require('../models/diary');
const Statistic = require('../models/statistic');
const { minmaxScaling } = require('../utils');

dotenv.config()
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const GENERAL_SPEAKING_RULES = `
- Don't include double quotes \" at the start and the end of the response.
- Don't include any "tip:", "question:" etc and do not use hashtags. 
- Don't start the response with any special characters (e.g !"#$%&'()*+,-./:;<=>? )
`

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
 ## event: the key event that causes user's emotion.
 ## location: where did user usually have that emotions (e.g. home, office, school). Only extract text written by user, do not predict.
 ## people: who did cause those emotions (e.g. alone, friend family). Only extract text written by user, do not predict.
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
        // else if (res.summary.skip) {
        //     response.next_phase = PHASE_LABEL.EMOTION_LABEL
        // }
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
    - User is a Korean, use Korean to response them.
    - Response should be less than 50 words.
    - Ask only one question.
    ${GENERAL_SPEAKING_RULES}
`
    const res = await generateResponse(diary, dialog, instruction)
    if (!res) {
        response.error = "ChatGPT failed"
        return response
    }

    response.content = res.replace(/^\"+|\"+$/gm, '')
    return response
}

const classifyEmotion = async (diary, userid) => {
    const emotionList = await getEmotionList(userid)
    const task_instruction = ` You are an expert agent specializing in emotion classification and reasoning, designed to analyze diary with a highly analytical and empathetic approach.
You excel at detecting and interpreting a wide range of emotions, considering nuanced language and complex emotional cues.

Return the response in JSON format, structured as follows:
### emotions
Recorgize emotions in the diary to assign 2 or 1 emotion labels. 
Consider emotion in this list: ${emotionList}. Don't include any emotion outside of the list.
Find the most similar emotion in the list to describe emotions in diary.
Array starts with the strongest and listing them in descending order.
Return 2 or 1 strongest emotions in the array.
Check again and make sure that emotions property only includes values in emotion list. 
### rationale
Answer that the emotions you put in emotion property are included in emotion list or not. Reason how you generate emotions property.  
Use English for this property
### content
Explain to user why you think user have emotions that listed in the analysis property. Your response should be shorter than 100 words.
User is a Korean, use Korean to response them.

Response must be JSON format:
{
    "emotions": [string],
    "rationale": string,
    "content": string
}`
    const response = {
        error: "",
        phase: PHASE_LABEL.EMOTION_LABEL,
        content: "",
        analysis: null,
        rationale: ""
    }

    const _res = await generateResponse(diary, [], task_instruction)

    try {
        const res = JSON.parse(_res)
        response.analysis = res.emotions
        response.content = res.content
        console.log("classifyEmotion", res)
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
User is a Korean, use Korean to response them.

Paragraph 1:
Use previous diaries with similar emotion or similar context to current diary. Find if there are common contexts when the user felt a similar emotion to the one in their current diary, or if there are common emotions felt in similar contexts. 
Based on previous diaries, identify whether the user has experienced similar emotions or been in similar contexts, and provide an explanation that allows the user to reflect on their current emotion based on those experiences.
Response should be no longer than 200 words.

${emotions? `
Emotions in current diary: ${JSON.stringify(emotions)}` : ""}
${retrievedDiaries.length > 0? `
Previous diaries have similar context: ${JSON.stringify(retrievedDiaries)}` : ""}
${emotionRelevantDiaries.length > 0? `Previous diaries have similar emotions: ${JSON.stringify(emotionRelevantDiaries)}` : ""}

Paragraph 2:
Since your analysis may not always be accurate, encourage user’s feedback about emotional classification and reasoning. Separate with the paragraph 1 by a line break. The length of this paragraph should be shorter than 100 words.

Respoonse example:
감정이 주를 이루고 있습니다. 이전에도 비슷한 상황에서 연구의 진전이나 친구들과의 즐거운 시간을 보내며 같은 감정을 느꼈던 것으로 보입니다. 특히, 연구에서 새로운 진전이 있을 때나 편안한 환경에서 시간을 보낼 때 '기쁨'과 '평온함'이라는 감정이 동시에 느껴졌습니다. 이런 경험들을 통해 현재의 감정이 어떤 상황에서 오는지, 그리고 어떤 감정이 자주 반복되는지를 파악하실 수 있을 것입니다.\n" +
'\n'
'제 분석이 항상 정확하지는 않을 수 있습니다. 따라서 사용자님의 피드백을 통해 감정 분류와 추론 과정을 더욱 개선해 나갈 수 있도록 도와주시면 감사하겠습니다.'
`

    console.log("task_instruction", task_instruction)

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

        diaries = await Diary.find({ userid: userid, _id: { $ne: diaryid } });
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

const reviseEmotionClassification = async (diary, dialog, userid) => {
    const emotionList = await getEmotionList(userid)
    const instruction = `
    - Given a dialogue history and user's diary, do they agree or disagree with what you told them?
    - If user give feedback to you, try to make analysis again based on diary and their feedback.
    - Use JSON format with the following properties:
    - Emotion list: ${emotionList}.
    ## analysis
    Based on diary and dialog, detect which emotions of emotion list in the diary entry according to their intensity, starting with the strongest and listing them in descending order.
    Don't include any emotion outside of the list.
    Find the most similar emotion in the list to describe emotions in diary.
    Do not repeat emotion. 
    Format the analysis as follows: [first intense emotion, second most intense]. 
    Length of array must be less than 4. 
    ## content
    Don't use third person pronoun. 
    Never return array of emotions in this properties.
    Your response should be shorter than 50 words.
    User is a Korean, use Korean to response them.
    ## rationale
    reason how you generate analysis properties. The emotions you put in analysis are included in emotion list or not.
    
    Return the response in JSON format:
        {
            "analysis": [string],
            "content": string,
            "rationale": string
        }
    `

    const response = {
        error: "",
        phase: PHASE_LABEL.REVISE_EMOTION_LABEL,
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
        } else {
            response.content = _res?.replace(/^\"+|\"+$/gm, '')
        }
    } catch(error) {
        console.log(error)
        if (typeof _res === "string") {
            response.content = _res.replace(/^\"+|\"+$/gm, '')
        } else {
            response.error = "ChatGPT return wrong format"
        }
    }
    return response
}

const reviseEmotionReflection = async (userid, diaryid, diary, dialog, emotions) => {
    const response = {
        error: "",
        phase: PHASE_LABEL.REVISE_REFLECTION,
        content: "",
    }
    const retrievedDiaries = await retrieveRelevantDiaryByContext(userid, diaryid, diary, dialog)
    const emotionRelevantDiaries = await retrieveRelevantDiaryByEmotion(userid, diaryid, emotions)

    if (!retrievedDiaries.length && !emotionRelevantDiaries.length) return response

    let task_instruction = `You are an expert agent specializing in emotion classification and reasoning, designed to analyze diary with a highly analytical and empathetic approach.
You excel at detecting and interpreting a wide range of emotions, considering nuanced language and complex emotional cues.
User is a Korean, use Korean to response them.

Use previous diaries with similar emotion or similar context to current diary. Find if there are common contexts when the user felt a similar emotion to the one in their current diary, or if there are common emotions felt in similar contexts. 
Based on previous diaries, identify whether the user has experienced similar emotions or been in similar contexts, and provide an explanation that allows the user to reflect on their current emotion based on those experiences.
Response should be no longer than 200 words.
Your response to user should be as second person pronoun "you".
${emotions? `Emotions in current diary: ${JSON.stringify(emotions)}` : ""}
${retrievedDiaries.length > 0? `Previous diaries have similar context: ${JSON.stringify(retrievedDiaries)}` : ""}
${emotionRelevantDiaries.length > 0? `Previous diaries have similar emotions: ${JSON.stringify(emotionRelevantDiaries)}` : ""}
`

    const _res = await generateResponse(diary, dialog, task_instruction)

    if (_res) {
        response.content = _res
        response.content = response.content?.replace(/^\"+|\"+$/gm, '')
    }

    return response
}


const checkUserSatisfaction = async (diary, dialog) => {
    const response = {
        error: "",
        next_phase: PHASE_LABEL.REVISE_EMOTION_LABEL
    }

    const instruction = `- You are a helpful assistant that analyzes the content of the dialog history. If the last user'response totally agree with your emotion analysis and the emotions you said are the same with what user is feeling, then return true. If they don't, return false.`

    const _res = await generateAnalysis(diary, dialog, instruction)
    console.log("checkUserSatisfaction", _res)
    try {
        if (_res?.toLowerCase() === "true") {
            response.next_phase = PHASE_LABEL.GOODBYE
        }
    } catch(error) {
        console.error(error)
        response.error = "ChatGPT failed"
        return response
    }

    return response
}

const generateGoodbye = async (diary, dialog) => {
    const instruction = `User expressed they are satisfied with your analysis about their emotion. Say thank and tell them to click Finish button on the top screen to finish section. Response should be shorter than 50 words. User is a Korean, use Korean to response them.`
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
    } catch(error) {
        console.error(error)
        response.error = "ChatGPT return wrong format"
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

const getEmotionList = async (userid) => {
    const emotions = await Statistic.distinct("subcategory", { category: "emotion", userid: userid })
    const presetEmotions = Object.values(EMOTION_LABEL)
    const mergeList = presetEmotions
    // .concat(emotions)
    return [...new Set(mergeList)];
}

module.exports = {
    checkCriteriaExplorePhase,
    askMissingInfor,
    reviseEmotionClassification,
    reviseEmotionReflection,
    classifyEmotion,
    generateEmotionReflection,
    categorizeContext,
    checkUserSatisfaction,
    generateGoodbye
}

