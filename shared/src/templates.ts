/**
 * Starter presentations. Choosing one creates an ordinary, fully editable presentation (it goes through the normal
 * import pipeline); there is no link back to the template and nothing to manage.
 */
export interface PresentationTemplate {
  id: string;
  title: string;
  description: string;
  /** What the deck contains, for the picker. */
  summary: string;
  doc: Record<string, unknown>;
}

const opts = (...texts: string[]) => texts.map((text, i) => ({ id: String.fromCharCode(97 + i), text }));

export const TEMPLATES: PresentationTemplate[] = [
  {
    id: 'diagnostic',
    title: 'Quick diagnostic quiz',
    description: 'Find out what the class already knows before you teach.',
    summary: 'Intro slide, four short quiz questions without a timer, a confidence check and a results leaderboard.',
    doc: {
      schemaVersion: 1,
      title: 'Quick diagnostic quiz',
      description: 'Find out what the class already knows before you teach.',
      theme: { palette: 'azure', background: 'soft' },
      slides: [
        { id: 'intro', type: 'content', title: 'What do you already know?', body: 'A few quick questions. It is not a test: wrong answers help me plan the lesson.' },
        { id: 'q1', type: 'quiz', question: 'Replace with your first question', options: opts('Option A', 'Option B', 'Option C', 'Option D'), correctOptionId: 'a', scored: false, concepts: ['Topic 1'] },
        { id: 'q2', type: 'quiz', question: 'Replace with your second question', options: opts('Option A', 'Option B', 'Option C', 'Option D'), correctOptionId: 'b', scored: false, concepts: ['Topic 1'] },
        { id: 'q3', type: 'quiz', kind: 'multiple', question: 'Select every statement that is true', options: opts('Statement 1', 'Statement 2', 'Statement 3'), correctOptionIds: ['a', 'c'], scored: false, concepts: ['Topic 2'] },
        { id: 'q4', type: 'quiz', kind: 'text', question: 'Type the key term for …', acceptedAnswers: ['term'], scored: false, concepts: ['Topic 2'] },
        { id: 'conf', type: 'rating', question: 'How sure were you about your answers?', min: 1, max: 5, minLabel: 'Guessing', maxLabel: 'Certain', confidenceFor: ['q1', 'q2', 'q3', 'q4'] },
      ],
    },
  },
  {
    id: 'icebreaker',
    title: 'Icebreaker and introductions',
    description: 'Warm up a new group and learn who is in the room.',
    summary: 'Welcome slide, a word cloud, a fun poll, an expectations question and a rating.',
    doc: {
      schemaVersion: 1,
      title: 'Icebreaker and introductions',
      description: 'Warm up a new group and learn who is in the room.',
      theme: { palette: 'peach', background: 'soft' },
      slides: [
        { id: 'welcome', type: 'content', title: 'Welcome!', body: 'Grab your phone: we are going to get to know each other.' },
        { id: 'mood', type: 'wordcloud', question: 'One word for how you feel right now', maxWords: 2 },
        { id: 'fun', type: 'poll', question: 'Morning person or night owl?', options: opts('Morning person', 'Night owl', 'It depends') },
        { id: 'hopes', type: 'open', question: 'What do you hope to get out of this course?', moderation: 'premoderate' },
        { id: 'experience', type: 'rating', question: 'How much do you already know about the topic?', min: 1, max: 5, minLabel: 'Nothing yet', maxLabel: 'A lot' },
      ],
    },
  },
  {
    id: 'workshop',
    title: 'Workshop activities',
    description: 'Hands-on session: instructions, group work, then sharing.',
    summary: 'Instruction steps, a timed brainstorm word cloud, an open sharing question, a poll to choose a direction and feedback.',
    doc: {
      schemaVersion: 1,
      title: 'Workshop activities',
      description: 'Hands-on session: instructions, group work, then sharing.',
      theme: { palette: 'mint', background: 'soft' },
      slides: [
        { id: 'task', type: 'content', title: 'Your task', steps: ['Form groups of three or four', 'Read the brief together', 'Agree on one idea to share'], callout: { tone: 'info', text: 'You have 15 minutes. Ask if you are stuck.' } },
        { id: 'brainstorm', type: 'wordcloud', question: 'First ideas: what comes to mind?', maxSubmissions: 3, timeLimitSec: 90 },
        { id: 'share', type: 'open', question: 'Share your group’s idea in one or two sentences', mode: 'paragraph', moderation: 'premoderate' },
        { id: 'vote', type: 'poll', question: 'Which direction should we explore next?', options: opts('Idea 1', 'Idea 2', 'Idea 3') },
        { id: 'feedback', type: 'survey', title: 'Workshop feedback', questions: [{ id: 'q1', kind: 'rating', question: 'How useful was this workshop?', min: 1, max: 5, minLabel: 'Not useful', maxLabel: 'Very useful' }, { id: 'q2', kind: 'text', question: 'One thing to improve', required: false }] },
      ],
    },
  },
  {
    id: 'knowledge-check',
    title: 'Knowledge check and reflection',
    description: 'Scored check with a leaderboard, followed by reflection.',
    summary: 'Timed scored questions of several kinds, a leaderboard moment and a reflection question.',
    doc: {
      schemaVersion: 1,
      title: 'Knowledge check and reflection',
      description: 'Scored check with a leaderboard, followed by reflection.',
      theme: { palette: 'lavender', background: 'soft' },
      slides: [
        { id: 'start', type: 'content', title: 'Knowledge check', body: 'Points for correct answers, and a little extra for speed.' },
        { id: 'k1', type: 'quiz', question: 'Replace with a question', options: opts('Option A', 'Option B', 'Option C', 'Option D'), correctOptionId: 'c', timeLimitSec: 20, speedBonus: true },
        { id: 'k2', type: 'quiz', kind: 'numeric', question: 'Replace with a calculation', numeric: { value: 42, tolerance: 0.5 }, timeLimitSec: 45 },
        { id: 'k3', type: 'quiz', kind: 'order', question: 'Put these steps in order', items: [{ id: 'i1', text: 'First' }, { id: 'i2', text: 'Second' }, { id: 'i3', text: 'Third' }], timeLimitSec: 40 },
        { id: 'reflect', type: 'open', question: 'What is one thing you are still unsure about?', mode: 'paragraph' },
      ],
    },
  },
  {
    id: 'exit-ticket',
    title: 'Exit ticket',
    description: 'Three quick questions at the end of a lesson.',
    summary: 'A confidence rating, one check question and a "still confused about" box.',
    doc: {
      schemaVersion: 1,
      title: 'Exit ticket',
      description: 'Three quick questions at the end of a lesson.',
      theme: { palette: 'slate', background: 'plain' },
      slides: [
        { id: 'conf', type: 'rating', question: 'How well do you understand today’s topic?', min: 1, max: 5, minLabel: 'Lost', maxLabel: 'Could teach it', confidenceFor: ['check'] },
        { id: 'check', type: 'quiz', question: 'Replace with one key question', options: opts('Option A', 'Option B', 'Option C'), correctOptionId: 'a', scored: false },
        { id: 'muddy', type: 'open', question: 'What is still confusing?', mode: 'paragraph' },
      ],
    },
  },
  {
    id: 'before-after',
    title: 'Before/after lesson assessment',
    description: 'Ask the same questions before and after teaching, then compare.',
    summary: 'Pre-check questions, a teaching placeholder, then run the same questions again with “Run again” and compare the results.',
    doc: {
      schemaVersion: 1,
      title: 'Before/after lesson assessment',
      description: 'Ask the same questions before and after teaching, then compare.',
      theme: { palette: 'rose', background: 'soft' },
      slides: [
        { id: 'how', type: 'content', title: 'Before we start', body: 'Answer honestly: we will ask the same questions again at the end and see what changed.', notes: 'After teaching, go back to each question and choose “Run again” (practice, no points). The results page shows before and after side by side.' },
        { id: 'pre1', type: 'quiz', question: 'Replace with a key question', options: opts('Option A', 'Option B', 'Option C', 'Option D'), correctOptionId: 'b', scored: false, concepts: ['Main idea'] },
        { id: 'pre2', type: 'rating', question: 'How confident are you about this topic?', min: 1, max: 5, minLabel: 'Not at all', maxLabel: 'Very', confidenceFor: ['pre1'] },
        { id: 'teach', type: 'content', title: 'Lesson', body: 'Replace with your teaching content, or teach from your own slides in Companion mode.' },
        { id: 'after', type: 'content', title: 'Now, the same questions again', body: 'Go back to the questions and choose “Run again” to compare.' },
      ],
    },
  },
];
