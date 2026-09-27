import type { AnchorRect } from './utils/popover-position';

export interface SlotSelection {
  dateKey: string;
  startMinute?: number;
  endMinute?: number;
  allDay?: boolean;
  anchorRect: AnchorRect;
}

export interface DraftEventState {
  dateKey: string;
  startMinute?: number;
  endMinute?: number;
  allDay?: boolean;
  title?: string;
  calendarColor?: string;
  isClosing?: boolean;
}

export interface EventTiming {
  start: number;
  end: number;
}
