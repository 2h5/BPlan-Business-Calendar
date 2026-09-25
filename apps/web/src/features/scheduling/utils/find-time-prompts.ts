/**
 * Example requests for the Find Time box's rotating placeholder.
 *
 * Instead of a short fixed list, examples are composed from an activity, a day,
 * and a time that suits the activity, so the rotation rarely repeats. Every
 * shape here is one the semantic-time parser understands; add new activities
 * freely, but keep phrasing natural and schedulable.
 */

type TimeOfDay = 'morning' | 'lunch' | 'afternoon' | 'evening';

type Activity = {
  /** `{name}` is replaced with a random first name. */
  label: string;
  times: readonly TimeOfDay[];
  /** Also works with no time at all, e.g. "haircut sometime next week". */
  flexible?: boolean;
  weekendOnly?: boolean;
};

const NAMES = [
  'Andrew',
  'Priya',
  'Sam',
  'Maya',
  'Jordan',
  'Leo',
  'Nina',
  'Chris',
  'Aisha',
  'Tom',
  'Elena',
  'Marcus',
  'Sofia',
  'Ben',
  'Hana',
  'Omar',
] as const;

const ACTIVITIES: readonly Activity[] = [
  { label: '15-minute check-in with {name}', times: ['morning', 'afternoon'], flexible: true },
  { label: '30-minute call with {name}', times: ['morning', 'afternoon'], flexible: true },
  { label: '1:1 with {name}', times: ['morning', 'afternoon'], flexible: true },
  { label: 'intro call with {name}', times: ['morning', 'afternoon'], flexible: true },
  { label: 'catch-up with {name}', times: ['afternoon', 'evening'], flexible: true },
  { label: 'coffee with {name}', times: ['morning', 'afternoon'] },
  { label: 'lunch with {name}', times: ['lunch'] },
  { label: 'dinner with {name}', times: ['evening'] },
  { label: 'drinks with {name}', times: ['evening'] },
  { label: 'team standup', times: ['morning'] },
  { label: 'sprint planning', times: ['morning'] },
  { label: 'design review', times: ['morning', 'afternoon'], flexible: true },
  { label: 'quarterly planning session', times: ['morning', 'afternoon'], flexible: true },
  { label: 'interview prep', times: ['morning', 'afternoon', 'evening'], flexible: true },
  { label: '2 hours of deep work', times: ['morning', 'afternoon'], flexible: true },
  { label: '90 minutes of focus time', times: ['morning', 'afternoon'], flexible: true },
  { label: '45 minutes to review the deck', times: ['morning', 'afternoon'], flexible: true },
  { label: 'an hour to clear my inbox', times: ['morning', 'afternoon'], flexible: true },
  { label: 'gym session', times: ['morning', 'evening'] },
  { label: '1-hour workout', times: ['morning', 'evening'], flexible: true },
  { label: 'yoga class', times: ['morning', 'evening'] },
  { label: '30-minute run', times: ['morning', 'evening'], flexible: true },
  { label: 'swim', times: ['morning'] },
  { label: 'dentist appointment', times: ['morning', 'afternoon'] },
  { label: "doctor's appointment", times: ['morning', 'afternoon'] },
  { label: 'haircut', times: ['afternoon', 'evening'], flexible: true },
  { label: 'car service', times: ['morning'], flexible: true },
  { label: 'grocery run', times: ['evening'], flexible: true },
  { label: 'call with Mom', times: ['evening'], flexible: true },
  { label: 'date night', times: ['evening'] },
  { label: 'movie night', times: ['evening'] },
  { label: 'guitar practice', times: ['evening'], flexible: true },
  { label: 'Spanish lesson', times: ['evening'] },
  { label: 'study session', times: ['afternoon', 'evening'], flexible: true },
  { label: 'book club', times: ['evening'] },
  { label: 'hike', times: ['morning'], weekendOnly: true },
  { label: 'brunch with {name}', times: ['lunch'], weekendOnly: true },
  { label: 'farmers market trip', times: ['morning'], weekendOnly: true },
  { label: 'bike ride', times: ['morning', 'afternoon'], weekendOnly: true },
  { label: 'meal prep', times: ['afternoon'], weekendOnly: true },
];

const WEEKDAYS = [
  'tomorrow',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'next Monday',
  'next Wednesday',
  'next Friday',
] as const;

const WEEKEND_DAYS = ['Saturday', 'Sunday', 'this Saturday', 'next Sunday'] as const;

const TIMES: Record<TimeOfDay, readonly string[]> = {
  morning: ['morning', 'at 9', 'at 8:30', 'before 10', 'around 10'],
  lunch: ['around noon', 'at 12:30', 'at 1'],
  afternoon: ['afternoon', 'at 2', 'at 3:30', 'after 2', 'around 4'],
  evening: ['evening', 'at 6', 'at 7', 'around 8', 'after 6'],
};

const FLEXIBLE_WINDOWS = [
  'this week',
  'sometime next week',
  'before Friday',
  'early next week',
] as const;

/** Phrases shown before one is allowed to come back. */
const RECENT_PHRASES = 60;
/** Consecutive examples never reuse an activity within this many steps. */
const RECENT_ACTIVITIES = 6;

/** Stable, calm example for the native input placeholder. */
export const FIND_TIME_PLACEHOLDER_EXAMPLE = '“15-minute meeting with Andrew”';

export type Random = () => number;

function pick<T>(items: readonly T[], random: Random): T {
  return items[Math.floor(random() * items.length) % items.length] as T;
}

function composePrompt(activity: Activity, random: Random): string {
  const label = activity.label.replace('{name}', pick(NAMES, random));
  if (activity.flexible && random() < 0.2) {
    return `${label} ${pick(FLEXIBLE_WINDOWS, random)}`;
  }
  const day = pick(activity.weekendOnly ? WEEKEND_DAYS : WEEKDAYS, random);
  return `${label} ${day} ${pick(TIMES[pick(activity.times, random)], random)}`;
}

/**
 * Returns a function that yields a fresh, quoted example on every call. Recent
 * phrases and activities are held back so the rotation keeps feeling new.
 */
export function createFindTimePromptSequence(random: Random = Math.random): () => string {
  const recentPhrases: string[] = [];
  const recentActivities: number[] = [];

  return () => {
    let phrase = '';
    for (let attempt = 0; attempt < 12; attempt++) {
      const index = Math.floor(random() * ACTIVITIES.length) % ACTIVITIES.length;
      if (recentActivities.includes(index) && attempt < 11) continue;
      phrase = composePrompt(ACTIVITIES[index] as Activity, random);
      if (recentPhrases.includes(phrase) && attempt < 11) continue;

      recentActivities.push(index);
      if (recentActivities.length > RECENT_ACTIVITIES) recentActivities.shift();
      break;
    }
    recentPhrases.push(phrase);
    if (recentPhrases.length > RECENT_PHRASES) recentPhrases.shift();
    return `“${phrase}”`;
  };
}

/** Cycles a fixed list in order, for callers that supply their own examples. */
export function createCyclingSequence(examples: readonly string[]): () => string {
  let index = 0;
  return () => {
    const example = examples[index % examples.length] ?? '';
    index++;
    return example;
  };
}
