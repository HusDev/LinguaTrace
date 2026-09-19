/**
 * A scripted lesson, standing in for the Vonage room until it is wired up.
 *
 * The turns are ordinary teaching, not a demo reel: some lines carry a learning
 * moment and many carry none. A note-taker that fires on every line is not
 * useful, so the filler here is part of the test, not padding.
 */

import type { Turn } from "./types";

export const LEARNER_NAME = "Ana";
export const TUTOR_NAME = "Mark";

const script: Array<[Turn["speaker"], string]> = [
  ["tutor", "Hi Ana, good to see you again. How has your week been?"],
  ["learner", "Hello Mark. It was busy week, a lot of meetings."],
  ["tutor", "A busy week. We say 'a busy week' - with the article 'a' before it."],
  ["learner", "Ah yes. A busy week. Yesterday I go to the office for a big meeting."],
  [
    "tutor",
    "Yesterday I went to the office. When you use 'yesterday', the verb moves to the past, so 'go' becomes 'went'.",
  ],
  ["learner", "Yesterday I went to the office. That is difficult for me."],
  [
    "tutor",
    "It is the most common thing learners slip on, and it will come with practice. Tell me about the meeting.",
  ],
  [
    "learner",
    "My manager asked me to present the numbers. I was very nervous but it finished good.",
  ],
  [
    "tutor",
    "It went well. We use 'well' for how something happened, and 'good' for describing a thing, so a meeting can be good but it goes well.",
  ],
  ["learner", "It went well. Thank you. I want to speak more confident in meetings."],
  [
    "tutor",
    "More confidently. That is a great goal - you want to sound confident presenting to your team in English, so let us aim at that over the next few lessons.",
  ],
  ["learner", "Yes exactly. Sometimes I don't find the correct word and I stop."],
  [
    "tutor",
    "There is a useful expression for that moment: 'to draw a blank'. It means your mind goes empty and you cannot remember the thing you wanted.",
  ],
  ["learner", "To draw a blank. I drew a blank in the meeting yesterday!"],
  ["tutor", "Perfect, and you used the past form correctly there. Well done."],
  ["learner", "I am trying. On Monday I have another presentation, in the morning."],
  [
    "tutor",
    "Good. Another expression you can use when you want time to think is 'let me come back to that'. It buys you a few seconds politely.",
  ],
  ["learner", "Let me come back to that. That is very useful for me."],
  ["learner", "Last month I has three presentations and all of them was stressful."],
  [
    "tutor",
    "Last month I had three presentations and all of them were stressful. After 'I' we use 'had', and 'all of them' is plural so it takes 'were'.",
  ],
  ["learner", "I had three presentations and all of them were stressful."],
  [
    "tutor",
    "We should keep working on past tenses before the next lesson - that is the area where you lose the most marks.",
  ],
  ["learner", "Okay. Can you send me something to practise?"],
  [
    "tutor",
    "I will. Practise describing your week in the past tense out loud, and we will start there next time.",
  ],
];

export function mockLessonTurns(): Turn[] {
  return script.map(([speaker, text], i) => ({
    id: `t${i}`,
    speaker,
    text,
    at: i * 9000,
  }));
}
