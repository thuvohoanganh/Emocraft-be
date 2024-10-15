const EMOTION_LIST = "calm, joy, delight, acceptance, trust, admiration, anxiety, fear, terror, distraction, surprise, amazement, unhappyness, sadness, heartbroken, tiredness, disgust, horror, annoyance, anger, overwhelmed, interest, anticipation, focus, love, submission, shock, disapproval, guilt, contempt, aggressiveness, optimism";
const EMOTION_LABEL = {
    SERENITY: "calm",
    JOY: "joy",
    ECSTASY: "delight",
    ACCEPTANCE: "acceptance",
    TRUST: "trust",
    ADMIRATION: "admiration",
    APPREHENSION: "anxiety",
    FEAR: "fear",
    TERROR: "terror",
    DISTRACTION: "distraction",
    SURPRISE: "surprise",
    AMAZEMENT: "amazement",
    PENSIVENESS: "unhappyness",
    SADNESS: "sadness",
    GRIEF: "heartbroken",
    BOREDOM: "tiredness",
    DISGUST: "disgust",
    LOATHING: "horror",
    ANNOYANCE: "annoyance",
    ANGER: "anger",
    RAGE: "overwhelmedness",
    INTEREST: "interest",
    ANTICIPATION: "anticipation",
    VIGILANCE: "focus",
    LOVE: "love",
    SUBMISSION: "submission",
    AWE: "shock",
    DISAPPROVAL: "disapproval",
    REMORSE: "guilt",
    CONTEMPT: "contempt",
    AGGRESSIVENESS: "aggressiveness",
    OPTIMISM: "optimism"
};

const PHASE_LABEL = {
    BEGINNING: "beginning",
    MISSING_EMOTION: "missing_emotion",
    MISSING_CONTEXT: "missing_context",
    FULLFILL: "fulfill",
    FEEDBACK: "feedback",
}

const instruction_32_emotion = `
You will analyze diary entries to evaluate their emotional content, focusing on identifying 32 distinct emotions: ${EMOTION_LIST}, as defined below:

8 Primary Emotions
- Sadness: A feeling of unhappiness, sorrow, or disappointment, often related to a sense of loss, heartbroken, or helplessness.
- Joy: A feeling of great pleasure, happiness, or delight, typically stemming from positive events, evoking optimism and satisfaction.
- Anger: An intense emotional response to perceived injustice or frustration, often involving irritation, overwhelmedness, or hostility.
- Fear: An emotional reaction to perceived danger or harm, frequently accompanied by anxiety, unease, or panic.
- Disgust: A strong aversion or revulsion towards something unpleasant, offensive, or repugnant.
- Surprise: A brief emotional response to unexpected events, which can be either positive or negative, typically involving astonishment or wonder.
- Trust: A feeling of confidence and safety, characterized by reliability and comfort in someone or something, fostering a sense of connection.
- Anticipation: A feeling of excitement, eagerness, or anxiety about a future event, often accompanied by expectations of possible outcomes.

16 Emotion Intensity Variations
calm, delight, acceptance, admiration, anxiety, terror, distraction, amazement, unhappyness, heartbroken, tiredness, horror, annoyance, overwhelmedness, interest, focused

Blended Emotions
- Love: Joy + Trust
- Submission: Trust + Fear
- Shock: Fear + Surprise
- Disapproval: Surprise + Sadness
- Guilt: Sadness + Disgust
- Contempt: Disgust + Anger
- Aggressiveness: Anger + Anticipation
- Optimism: Anticipation + Joy


Return the response in JSON format, structured as follows:

### 1. Content
Describe to the user what emotions that you recognize in theri diary and how the Analysis properties were derived. 

### 2. Analysis
- Rank the emotions in the diary entry according to their intensity, starting with the strongest and listing them in descending order.
- Focus solely on the 32 emotions of Plutchik's model: ${EMOTION_LIST}. Do not include other emotions in the ranking.
- Consider the diary entry as a whole rather than focusing on individual sentences or paragraphs, ranking based on the prominence of emotions throughout the entry.
- Maintain an objective stance by focusing only on expressed emotions and not inferring beyond the content of the diary entry.
- Format the rankings as follows: [first intense emotion, second most intense, third most intense]. The array can include one, two or three elements.
- Don't list more than 3 emotions.

Response must be JSON format:
{
    “content”: string,
    “analysis”: [string],
}
`

module.exports = {
    EMOTION_LIST,
    EMOTION_LABEL,
    PHASE_LABEL,
    instruction_32_emotion,
}