const OpenAI = require("openai")
const dotenv = require("dotenv")
dotenv.config()

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const emotionRecognize = async (req, res, next) => {
    const diary = req.body.diary
    const prompts = `You are an emotion analyzer capable of understanding the sentiment within text. Consider the emotions expressed from my diary: “${diary}”. Only use emotions in this list: happy, sad, angry, fear, surprised, disgusted, neutral. Tell me about my emotion like a friend and explain your reasoning. Response in a valid JSON object to be consumed by an application, following this pattern: {“items”: [{ “emotion”, “analysis”}]}. Here are 2 examples:
Example 1:
My diary: I gave a presentation in front of many people today. My heart was pounding and my face was hot, so I couldn't proceed with the presentation properly. Someone interrupted me in the middle of the conversation to ask a question, and I felt bad because I thought it was rude.

Response: {“items”: [{ “emotion”: “anxious”, “analysis”: “You seem anxious today. You mention your heart pounding and your face feeling hot, which are physical symptoms of anxiety. This indicates that you were feeling quite nervous about giving the presentation.”},{ “emotion”: “embarrassed”, “analysis”: “The fact that you couldn't proceed with the presentation properly suggests you felt uncomfortable and possibly embarrassed by the situation.”},{“emotion”: “frustrated”, “analysis”: “When someone interrupted you with a question, you felt bad and perceived it as rude, indicating feelings of annoyance or frustration.”}]}

Example 2:
My diary: My family was the most salient part of my day, since most days the care of my 2 children occupies the majority of my time. They are 2 years old and 7 months and I love them, but they also require so much attention that my anxiety is higher than ever. I am often overwhelmed by the care the require, but at the same, I am so excited to see them hit developmental and social milestones.

Response: {“items”: [{ “emotion”: “loved”, “analysis”: “as you explicitly state, "I love them," which underscores your deep affection and commitment to your children.”},{ “emotion”: “Anxious”, “analysis”: “You mention that your anxiety is "higher than ever," indicating that the responsibility of caring for a 2-year-old and a 7-month-old is a major source of stress.”},{“emotion”: “excited”, “analysis”: “I am so excited to see them hit developmental and social milestones," reflects the joy you feel in witnessing their growth and progress.”}]}`

    let response
    try {
        const chatCompletions = await openai.chat.completions.create({
            messages: [{ role: "user", content: prompts }],
            model: "gpt-3.5-turbo",
        });
    
        response = chatCompletions?.choices?.[0]?.message?.content
        if (!prompts || !response ) {
           throw("no response from ChatGPT")
        }
        response = JSON.parse(response)
    } catch(err) {
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

module.exports = {
    emotionRecognize,
}