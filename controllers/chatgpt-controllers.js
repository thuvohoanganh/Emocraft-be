const HttpError = require('../models/http-error');
const {
    checkCriteriaExplorePhase,
    checkCriteriaFeedbackPhase,
    generateResponseExplorePhase,
    generateExplanationPhase

} = require('./phase-controller');
const { PHASE_LABEL } = require('../constant')

const chatbotConversation = async (req, res, next) => {
    const diary = req.body.diary
    const dialog = req.body.dialog
    const currentPhase = req.body.phase
    let response = {
        phase: "",
        content: "",
        analysis: null
    }
    let error = null
    let nextPhase = currentPhase
    let summary = null

    // Check criteria in current phase
    if (currentPhase === PHASE_LABEL.EXPLORE) {
        const result = await checkCriteriaExplorePhase(diary, dialog)
        console.log("checkCriteriaExplorePhase", result)
        nextPhase = result.next_phase
        error = result.error
        summary = result.summary
    } else if (currentPhase === PHASE_LABEL.FEEDBACK) {
        const result = await checkCriteriaFeedbackPhase(diary, dialog)
        nextPhase = result.next_phase
        error = result.error
        summary = result.summary
    }
    if (!!error) {
        const error = new HttpError(
            'chat fail',
            500
        );
        return next(error);
    }

    console.log("nextPhase", nextPhase)
    console.log("summary", summary)

    // generate response
    if (nextPhase === PHASE_LABEL.EXPLORE) {
        const result = await generateResponseExplorePhase(diary, dialog, summary)
        console.log("result", result)
        error = result.error
        response.phase = result.phase
        response.content = result.content
    } else if (nextPhase === PHASE_LABEL.EXPLAIN) {
        const result = await generateExplanationPhase(diary, dialog)
        error = result.error
        response.phase = result.phase
        response.content = result.content
        response.analysis = result.analysis
        response.rationale = result.rationale
    } else if (nextPhase === PHASE_LABEL.FEEDBACK) {

    }
    if (!!error) {
        const error = new HttpError(
            'chat fail',
            500
        );
        return next(error);
    }

    console.log("response", response)
    console.log('------------------------------')
    res.status(200).json({
        data: response
    });
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
    chatbotConversation,
    generateImage
}

