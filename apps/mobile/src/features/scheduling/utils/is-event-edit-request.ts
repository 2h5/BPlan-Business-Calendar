/**
 * Verbs that mean "change an event that already exists" rather than "find
 * room for a new one". Deliberately narrow: a miss only means the sentence is
 * treated as Find Time, which is today's behaviour, while a false hit would
 * send a scheduling request to the wrong place.
 */
const EDIT_VERBS = [
  'change',
  'move',
  'reschedule',
  'push',
  'shift',
  'postpone',
  'bump',
  'bring forward',
  'pull forward',
  'delay',
] as const;

/** Whether the AI bar should treat `text` as moving an existing event. */
export function isEventEditRequest(text: string): boolean {
  const normalized = text.trim().toLowerCase().replace(/\s+/g, ' ');
  const opening = normalized.replace(/^(please|can you|could you|pls|hey)[, ]+/, '');
  return EDIT_VERBS.some((verb) => opening === verb || opening.startsWith(`${verb} `));
}
