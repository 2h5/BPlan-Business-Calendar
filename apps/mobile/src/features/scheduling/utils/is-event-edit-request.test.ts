import { describe, expect, it } from 'vitest';

import { isEventEditRequest } from './is-event-edit-request';

describe('isEventEditRequest', () => {
  it.each([
    'Change my weekend in Vermont Friday to Saturday',
    'move the dentist to Thursday at 3pm',
    'Reschedule partner sync to Monday',
    'Push standup to 10',
    'please move gym to tomorrow',
    'Can you shift lunch with Sam to 1pm',
    'Bring forward the review to Wednesday',
  ])('treats "%s" as an edit', (text) => {
    expect(isEventEditRequest(text)).toBe(true);
  });

  it.each([
    'Coffee with Pat Friday',
    'Team meeting 10am',
    'Movie night Saturday',
    'Gym this weekend',
    'Lunch then move boxes Sunday',
    '',
  ])('treats "%s" as Find Time', (text) => {
    expect(isEventEditRequest(text)).toBe(false);
  });

  it('reads a title that starts with an edit verb as an edit', () => {
    // A known trade-off: the server then answers "no event matches", and the
    // message tells the user how to find time for something new instead.
    expect(isEventEditRequest('Change management workshop next week')).toBe(true);
  });
});
