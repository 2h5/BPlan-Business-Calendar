import type { Calendar, TaskList } from '@cal/schemas';
import type * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useQuickCreateDraft } from './useQuickCreateDraft';
import type { EventOccurrence } from '../utils/calendar-occurrences';

const { hooks } = vi.hoisted(() => {
  type Slot = { value?: unknown; deps?: readonly unknown[]; cleanup?: () => void };
  const hooks = {
    slots: [] as Slot[],
    index: 0,
    effects: [] as Array<() => void>,
    dirty: false,
    reset() {
      for (const slot of this.slots) slot.cleanup?.();
      this.slots = [];
      this.index = 0;
      this.effects = [];
      this.dirty = false;
    },
    sameDeps(a?: readonly unknown[], b?: readonly unknown[]) {
      return !!a && !!b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
    },
    state<T>(initial: T | (() => T)) {
      const index = this.index++;
      const slot = (this.slots[index] ??= {
        value: typeof initial === 'function' ? (initial as () => T)() : initial,
      });
      const set = (next: T | ((current: T) => T)) => {
        const value =
          typeof next === 'function' ? (next as (current: T) => T)(slot.value as T) : next;
        if (!Object.is(slot.value, value)) {
          slot.value = value;
          this.dirty = true;
        }
      };
      return [slot.value as T, set] as const;
    },
    memo<T>(factory: () => T, deps: readonly unknown[]) {
      const index = this.index++;
      const previous = this.slots[index];
      if (this.sameDeps(previous?.deps, deps)) return previous?.value as T;
      const value = factory();
      this.slots[index] = { value, deps };
      return value;
    },
    effect(callback: () => void | (() => void), deps: readonly unknown[]) {
      const index = this.index++;
      const previous = this.slots[index];
      if (this.sameDeps(previous?.deps, deps)) return;
      previous?.cleanup?.();
      const slot: Slot = { deps };
      this.slots[index] = slot;
      this.effects.push(() => {
        const cleanup = callback();
        if (cleanup) slot.cleanup = cleanup;
      });
    },
    flush() {
      for (const effect of this.effects.splice(0)) effect();
    },
  };
  return { hooks };
});

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof React>();
  return {
    ...actual,
    useState: <T>(initial: T | (() => T)) => hooks.state(initial),
    useMemo: <T>(factory: () => T, deps: readonly unknown[]) => hooks.memo(factory, deps),
    useEffect: (callback: () => void | (() => void), deps: readonly unknown[]) =>
      hooks.effect(callback, deps),
  };
});

const defaultCalendar = { id: 'cal-default' } as Calendar;
const otherCalendar = { id: 'cal-other' } as Calendar;
const taskLists = [{ id: 'list-first' }, { id: 'list-other' }] as TaskList[];
const editValues = {
  title: 'Edited event',
  calendarId: 'cal-edit',
  startDate: '2026-09-16',
  endDate: '2026-09-17',
  startTime: '13:15',
  endTime: '14:45',
  allDay: false,
  location: 'Edit room',
  description: 'Edit notes',
};
const editingOccurrence = {
  event: { title: 'Edited event', calendarId: 'cal-edit' },
} as EventOccurrence;

vi.mock('../utils/event-form', () => ({ eventToFormValues: () => editValues }));

type Inputs = Parameters<typeof useQuickCreateDraft>[0];
const defaults: Inputs = {
  isOpen: false,
  editingOccurrence: null,
  selectedDateKey: '2026-09-15',
  initialStartTime: undefined,
  initialEndTime: undefined,
  initialAllDay: false,
  timeZone: 'America/New_York',
  defaultDurationMinutes: 60,
  defaultCalendar,
  taskLists,
};

function DraftHarness(inputs: Inputs) {
  return useQuickCreateDraft(inputs);
}

function render(inputs: Inputs) {
  let result: ReturnType<typeof useQuickCreateDraft> | undefined;
  for (let pass = 0; pass < 8; pass++) {
    hooks.index = 0;
    hooks.dirty = false;
    result = DraftHarness(inputs);
    hooks.flush();
    if (!hooks.dirty) return result;
  }
  throw new Error('draft hook did not settle');
}

describe('useQuickCreateDraft', () => {
  beforeEach(() => {
    hooks.reset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-15T14:30:00Z')); // 10:30 in New York
  });

  afterEach(() => {
    hooks.reset();
    vi.useRealTimers();
  });

  it('initializes a fresh draft from the zoned next hour and first task list', () => {
    const draft = render(defaults);
    expect(draft).toMatchObject({
      mode: 'event',
      title: '',
      startDate: '2026-09-15',
      endDate: '2026-09-15',
      allDay: false,
      startTime: '11:00',
      endTime: '12:00',
      location: '',
      description: '',
      calendarId: 'cal-default',
      selectedListId: '',
      taskPriority: 'normal',
      taskHasTime: true,
      errorMessage: null,
      isDeleteConfirmOpen: false,
    });
    expect(render({ ...defaults, isOpen: true }).selectedListId).toBe('list-first');
  });

  it('keeps the existing 23:00 clamp and minute wrap at initialization', () => {
    vi.setSystemTime(new Date('2026-09-16T03:30:00Z')); // 23:30 in New York
    expect(render(defaults)).toMatchObject({ startTime: '23:00', endTime: '00:00' });
  });

  it('initializes Set time only from the initial All day flag', () => {
    expect(render({ ...defaults, initialAllDay: true })).toMatchObject({
      allDay: true,
      taskHasTime: false,
    });
  });

  it('initializes edit values and forces event mode when edit opens', () => {
    const initial = render({ ...defaults, editingOccurrence });
    expect(initial).toMatchObject({ ...editValues, mode: 'event' });
    initial.setMode('task');
    expect(render({ ...defaults, editingOccurrence }).mode).toBe('task');
    expect(render({ ...defaults, editingOccurrence, isOpen: true })).toMatchObject({
      ...editValues,
      mode: 'event',
    });
  });

  it('fresh reopen preserves mode, times, priority, and Set time without a supplied start', () => {
    const initial = render({ ...defaults, isOpen: true });
    initial.setMode('task');
    initial.setStartTime('08:07');
    initial.setEndTime('09:07');
    initial.setTaskPriority('urgent');
    initial.setTaskHasTime(false);
    initial.setTitle('Old title');
    initial.setLocation('Old room');
    initial.setDescription('Old notes');
    render({ ...defaults, isOpen: false });
    expect(
      render({ ...defaults, isOpen: true, selectedDateKey: '2026-09-20', initialAllDay: true }),
    ).toMatchObject({
      mode: 'task',
      title: '',
      startDate: '2026-09-20',
      endDate: '2026-09-20',
      allDay: true,
      startTime: '08:07',
      endTime: '09:07',
      location: '',
      description: '',
      taskPriority: 'urgent',
      taskHasTime: false,
    });
  });

  it('uses supplied start and derives end on a fresh reopen only when end is absent', () => {
    render(defaults);
    expect(render({ ...defaults, isOpen: true, initialStartTime: '16:30' })).toMatchObject({
      startTime: '16:30',
      endTime: '17:30',
    });
    render({ ...defaults, isOpen: false, initialStartTime: '16:30' });
    expect(
      render({ ...defaults, isOpen: true, initialStartTime: '07:15', initialEndTime: '08:45' }),
    ).toMatchObject({ startTime: '07:15', endTime: '08:45' });
  });

  it('preserves selected calendar and task list across fresh reopen', () => {
    const initial = render({ ...defaults, isOpen: true });
    initial.setCalendarId('cal-other');
    initial.setSelectedListId('list-other');
    render({ ...defaults, isOpen: false });
    expect(render({ ...defaults, isOpen: true, defaultCalendar: otherCalendar })).toMatchObject({
      calendarId: 'cal-other',
      selectedListId: 'list-other',
    });
  });

  it('adopts default calendar and first list only when their selections are empty', () => {
    const initial = render({
      ...defaults,
      isOpen: true,
      defaultCalendar: undefined,
      taskLists: undefined,
    });
    expect(initial).toMatchObject({ calendarId: '', selectedListId: '' });
    expect(render({ ...defaults, isOpen: true })).toMatchObject({
      calendarId: 'cal-default',
      selectedListId: 'list-first',
    });
  });

  it('resets event fields on edit open without resetting unrelated task state', () => {
    const initial = render({ ...defaults, isOpen: true });
    initial.setTaskPriority('high');
    initial.setTaskHasTime(false);
    initial.setSelectedListId('list-other');
    render({ ...defaults, isOpen: false });
    expect(render({ ...defaults, isOpen: true, editingOccurrence })).toMatchObject({
      ...editValues,
      mode: 'event',
      taskPriority: 'high',
      taskHasTime: false,
      selectedListId: 'list-other',
    });
  });

  it('keeps the open draft when the calendar or task list changes', () => {
    const fresh = render({ ...defaults, isOpen: true });
    fresh.setTitle('Lunch');
    fresh.setLocation('Cafe');
    fresh.setCalendarId('cal-other');
    fresh.setSelectedListId('list-other');
    expect(render({ ...defaults, isOpen: true })).toMatchObject({
      title: 'Lunch',
      location: 'Cafe',
      calendarId: 'cal-other',
      selectedListId: 'list-other',
    });

    hooks.reset();
    const editing = render({ ...defaults, isOpen: true, editingOccurrence });
    editing.setTitle('Renamed');
    editing.setCalendarId('cal-other');
    expect(render({ ...defaults, isOpen: true, editingOccurrence })).toMatchObject({
      title: 'Renamed',
      calendarId: 'cal-other',
    });
  });

  it('clears error and delete confirmation each time open synchronization runs', () => {
    const initial = render({ ...defaults, isOpen: true });
    initial.setErrorMessage('Failed');
    initial.setIsDeleteConfirmOpen(true);
    render({ ...defaults, isOpen: false });
    expect(render({ ...defaults, isOpen: true })).toMatchObject({
      errorMessage: null,
      isDeleteConfirmOpen: false,
    });
  });
});
