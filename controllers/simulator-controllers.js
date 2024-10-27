const OpenAI = require("openai")
const HttpError = require('../models/http-error');
const { validationResult } = require('express-validator');

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const USER_PERSONA = `Name: Alex Parker
Age: 21
Gender: male
Major: Psychology
Year: Third-year student at university
## Personality:
Curious: Alex is always eager to understand the deeper meaning behind things, from human behavior to personal experiences. This curiosity drives a lot of his diary entries.
Organized: Despite a busy university schedule, Alex is disciplined about setting aside time to write in his diary almost every day, often in the evening before bed.
Introspective: Alex enjoys self-reflection and uses the diary as a way to make sense of his feelings, challenges, and personal growth.
Empathetic: He is thoughtful about his relationships, often writing about his interactions with friends, classmates, and professors.
## Background:
Education: Currently majoring in psychology, Alex has a deep interest in how the mind works and often reflects on psychological theories in his personal writing.
Living Situation: Lives in a shared apartment near campus with two roommates. He prefers writing in his room or at the campus library, where it's quieter.
Diary Habit: Started keeping a diary when he entered university as a way to manage stress and record his personal development. The diary also helps him track his academic progress and the ideas he learns in class.
## Diary Writing Style:
Analytical: Alex often connects personal experiences to psychological concepts he’s learning in class. For example, after an argument with a friend, he might analyze the situation using theories on conflict resolution or emotional regulation.
Goal-Oriented: Alex uses his diary to set both academic and personal goals. At the end of each week, he reviews his progress and reflects on what went well and what could be improved.
Reflective: He writes not just about what happens during the day, but also how those events make him feel and what he can learn from them.
Visual and Digital: Though he sometimes doodles in the margins, Alex prefers keeping his diary digitally, using a journaling app on his laptop. This allows him to easily organize and search through his entries when needed.
## Motivation:
Self-Understanding: Alex uses his diary as a tool for self-awareness. By writing daily, he can monitor how his emotions fluctuate, identify patterns in his behavior, and make sense of his academic and social experiences.
Stress Management: University life can be stressful, with exams, assignments, and social pressures. Writing in his diary gives Alex a space to vent his frustrations and clear his mind before tackling the next challenge.
Personal Growth: Alex is very focused on personal development. He tracks his progress, writes about his mistakes, and celebrates his successes, whether they are academic, emotional, or social. `


const writeDiary = async (req, res, next) => {
    const response = {
        content: ""
    }

    const instruction = `${USER_PERSONA}
    - Now you are writing your diary of the day.
    - Write about only 1 episode. 
    - Diary should less than 50 words. 
    - Don't write the date.
    - Use simple words but natural language. Don't list activities.`

    const messages = [
        {
            role: "system",
            content: `${instruction}`
        },
    ]

    try {
        const chatCompletions = await openai.chat.completions.create({
            messages,
            model: "gpt-4",
            temperature: 1
        });

        response.content = chatCompletions?.choices?.[0]?.message?.content
        if (!response.content) {
            throw ("no response from ChatGPT")
        }
    } catch (err) {
        console.error("writeDiary: ", err)
        const errorResponse = new HttpError(
            'chat fail',
            500
        );
        return next(errorResponse);
    }


    response.content = response.content.replace(/^\"+|\"+$/gm,'')

    console.log("user simulator---------------")
    console.log(response)
    console.log('-----------------------------')
    res.status(200).json({
        data: response
    });
    return
}

const userSimulatorResponse = async (req, res, next) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        console.error("userSimulatorResponse err:", errors)
        return next(
            new HttpError(JSON.stringify(errors), 422)
        );
    }

    const response = {
        content: ""
    }
    const { dialog, diary } = req.body

    const _dialog = dialog.map(e => ({
        ...e,
        content: JSON.stringify(e.content)
    }))

    const instruction = `${USER_PERSONA}
    You wrote a diary today: ${diary}.
    You are encountering a conversation with an assistant. An assistant are trying to explore your contextual information and your emotions in your diary to understand you better.
    Your role is the user and your task is responding to the role assistant in the dialog. 
    If assisant provide undersanding about your emotions, you can agree or disagree with what assistant said and feedback to them what is your emotion.
    Response should be less than 30 words. 
    Use simple words.
    Don't start the response with any special characters (e.g !"#$%&'()*+,-./:;<=>? )
    Dialog: ${JSON.stringify(_dialog)}`

    const messages = [
        {
            role: "system",
            content: `${instruction}`
        },
    ]

    try {
        const chatCompletions = await openai.chat.completions.create({
            messages,
            model: "gpt-4",
            temperature: 1
        });

        response.content = chatCompletions?.choices?.[0]?.message?.content
        if (!response.content) {
            throw ("no response from ChatGPT")
        }
    } catch (err) {
        console.error("writeDiary: ", error)
        const errorResponse = new HttpError(
            'chat fail',
            500
        );
        return next(errorResponse);
    }


    response.content = response.content.replace(/^\"+|\"+$/gm,'')

    console.log("user simulator---------------")
    console.log(response)
    console.log('-----------------------------')
    res.status(200).json({
        data: response
    });
    return
}


module.exports = {
    userSimulatorResponse,
    writeDiary
}

