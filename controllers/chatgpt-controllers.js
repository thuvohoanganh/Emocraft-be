const HttpError = require('../models/http-error');
const OpenAI = require("openai")
const dotenv = require("dotenv")
const { EMOTION_LIST } = require("../constant")
dotenv.config()
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const emotionsRecognize = async (req, res, next) => {
    const diary = req.body.diary
    const dialog = req.body.dialog
    // console.log("diary", diary)

    let response = await generateResponse(diary, dialog, "")
    if (response === "") {
        const error = new HttpError(
            'chat fail',
            500
        );
        return next(error);
    }

    res.status(200).json({
        data: response
    });
}

const generateResponse = async (diary, dialog, phase = "") => {
    let response = ""
    const messages = [
        { role: "system", content: `You are an emotion analyzing assistant, capable of understanding the sentiment within text. You are trying to understand my emotion from my diary. Only use emotions in this list: ${EMOTION_LIST}. You give me an analysis and I give you my feedback. 
            If user give you diary, list out user's emotion with reasonning.
            If user are unsatisfied with your opinion, ask more question about experience relating to user emotion and the cause of those emotions.
            If user give you more information about their emotion, tell them the other analysis based on their responses and ask their agreement.
            If user agree with you analysis, summarize the emotions they really have based on their responses. Then tell them to click like button to finish section. 
            My diary: ${diary}
        `},
    ]
    if (dialog?.length > 0) {
        messages.concat(dialog)
    }

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

const predictContextualInfor = async (req, res, next) => {
    const diary = req.body.diary
    const prompts = `You are an experienced diary study researcher. You are conducting a diary study right now, and when you receive my diary, you need to help the me to record some contextual information. These contextual information will be used as the cues for me to recall the event. Please predict the following contextual information based on the aforementioned information: 
Location: predict three possible point of interest locations, you could use the point of interest location categories in Google Maps or some other location-based service apps. 
People: select only one from these five categories, Alone, Families, Friends, Colleagues and Acquaintances, please keep the same spelling.
Activity: give six descriptions of the six possible activities in this scenario (each description should be less than 50 characters). 
Finally output these information in English in valid JSON format. And the value for the Location and Activity should be a list of three and six elements respectively. EXAMPLE: {"Location": [Library, Workspace, Meeting room], "People": Colleague, "Activity": [Working on laptop and taking notes, Studying or doing research, Planning or organizing tasks for the day, Preparing a meeting, Watching a academic seminar, Discussing the current project]}”
My diary: ${diary}`

    let response
    try {
        const chatCompletions = await openai.chat.completions.create({
            messages: [{ role: "user", content: prompts }],
            model: "gpt-3.5-turbo",
        });

        response = chatCompletions?.choices?.[0]?.message?.content
        if (!prompts || !response) {
            throw ("no response from ChatGPT")
        }
        response = JSON.parse(response)
    } catch (err) {
        const error = new HttpError(
            'chat fail',
            500
        );
        return next(error);
    }


    res.status(200).json({
        data: response
    });
}

const generateImage = async (req, res, next) => {
    const diary = req.body.diary
    let image_url = ""
    try {
        const response = await openai.images.generate({
            model: "dall-e-3",
            prompt: diary,
            size: "1024x1024",
            quality: "standard",
            n: 1,
        })
          
        image_url = response.data[0].url
        console.log(image_url)
        if (!image_url) {
            throw ("no response from ChatGPT")
        }
    } catch (err) {
        console.log(err)
        const error = new HttpError(
            'chat fail',
            500
        );
        return next(error);
    }
    res.status(200).json({
        data: image_url
    });
}

module.exports = {
    predictContextualInfor,
    emotionsRecognize,
    generateImage
}