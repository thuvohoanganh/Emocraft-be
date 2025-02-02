const EMOTION_LABEL = {
    SERENITY: "평온",
    JOY: "기쁨",
    ECSTASY: "환희",
    ACCEPTANCE: "수용",
    TRUST: "신뢰",
    ADMIRATION: "감탄",
    APPREHENSION: "우려",
    FEAR: "두려움",
    TERROR: "공포",
    DISTRACTION: "부주의",
    SURPRISE: "놀람",
    AMAZEMENT: "깜짝놀람",
    PENSIVENESS: "수심",
    SADNESS: "슬픔",
    GRIEF: "비탄",
    BOREDOM: "지루함",
    DISGUST: "혐오",
    LOATHING: "증오",
    ANNOYANCE: "짜증",
    ANGER: "분노",
    RAGE: "격노",
    INTEREST: "관심",
    ANTICIPATION: "기대",
    VIGILANCE: "주의",
    // LOVE: "love",
    // SUBMISSION: "submission",
    // AWE: "shock",
    // DISAPPROVAL: "disapproval",
    // REMORSE: "guilt",
    // CONTEMPT: "contempt",
    // AGGRESSIVENESS: "aggressiveness",
    // OPTIMISM: "optimism"
};

const EMOTION_DIMENSION = {
    [EMOTION_LABEL.SERENITY]: 1,
    [EMOTION_LABEL.JOY]: 1,
    [EMOTION_LABEL.ECSTASY]: 1,
    [EMOTION_LABEL.ACCEPTANCE]: 2,
    [EMOTION_LABEL.ADMIRATION]: 2,
    [EMOTION_LABEL.TRUST]: 2,
    [EMOTION_LABEL.FEAR]: 3,
    [EMOTION_LABEL.APPREHENSION]: 3,
    [EMOTION_LABEL.TERROR]: 3,
    [EMOTION_LABEL.AMAZEMENT]: 4,
    [EMOTION_LABEL.SURPRISE]: 4,
    [EMOTION_LABEL.DISTRACTION]: 4,
    [EMOTION_LABEL.PENSIVENESS]: 5,
    [EMOTION_LABEL.SADNESS]: 5,
    [EMOTION_LABEL.GRIEF]: 5,
    [EMOTION_LABEL.BOREDOM]:6,
    [EMOTION_LABEL.DISGUST]: 6,
    [EMOTION_LABEL.LOATHING]: 6,
    [EMOTION_LABEL.ANNOYANCE]: 7,
    [EMOTION_LABEL.ANGER]: 7,
    [EMOTION_LABEL.RAGE]: 7,
    [EMOTION_LABEL.INTEREST]: 8,
    [EMOTION_LABEL.ANTICIPATION]: 8,
    [EMOTION_LABEL.VIGILANCE]: 8,
}

const PHASE_LABEL = {
    PHASE_1: "beginning",
    PHASE_2: "emotion_classify",
    PHASE_3: "revise_emotion_classify",
    PHASE_4: "reasoning",
    PHASE_5: "revise_reasoning",
    PHASE_6: "goodbye",
}

const GPT = {
    MODEL: "gpt-4o-2024-08-06"
}

const PREDEFINED_LOCATION = {
    "Home": "집",
    "Classroom": "강의실",
    "Dormitory": "기숙사",
    "Library": "도서관",
    "Restaurant": "식당",
    "Cafe": "카페",
    "Pub": "술집",
    "Club room": "동아리방",
    "Laboratory": "실험실",
    "Place for exercise": "운동시설",
    "Place for leisure": "여가시설",
    "Outdoor": "야외",
    "Place for part-time job": "알바장소",
    "Public transportation": "교통수단"
}

const PREDEFINED_ACTIVITY = {
    "Class": "수업",
    "Studying": "공부",
    "Research": "연구",
    "Resting": "휴식",
    "Meeting": "회의",
    "Eating": "식사",
    "Drinking": "음주",
    "Part-time work": "알바",
    "Club activity": "동아리활동",
    "Socializing": "사회활동",
    "Leisure activity": "여가활동",
    "Exercise": "운동",
    "Moving": "이동"
}

const PREDEFINED_PEOPLE = {
    "Alone": "혼자",
    "Family": "가족",
    "Boyfriend/Girlfriend": "연인",
    "Roommate": "룸메이트",
    "Friend": "친구",
    "Colleague": "동료",
    "Professor": "교수님"
}

const TIMES_OF_DAY = {
    "morning": "아침",
    "noon": "정오",
    "afternoon": "오후",
    "evening": "저녁",
    "night": "밤",
    "dawn": "새벽",
    "all day": "하루 종일"
}
module.exports = {
    EMOTION_LABEL,
    PHASE_LABEL,
    EMOTION_DIMENSION,
    GPT,
    PREDEFINED_LOCATION,
    PREDEFINED_ACTIVITY,
    PREDEFINED_PEOPLE,
    TIMES_OF_DAY
}