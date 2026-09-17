import type { Calendar, CalendarEvent } from '@cal/schemas';
import fs from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { OriginGhost, TimelineView } from './TimelineView';
import type { EventOccurrence } from '../hooks/useCalendarWindow';
import { resolveMoveGesture } from '../utils/event-resize';

const mockNow = new Date('2026-09-15T10:00:00.000Z');
const timeZone = 'America/New_York';

const calendar: Calendar = {
  id: 'b0000000-0000-0000-0000-000000000001',
  userId: '11111111-1111-1111-1111-111111111111',
  name: 'Work',
  color: '#4766db',
  sourceType: 'internal',
  providerAccountId: null,
  providerCalendarId: null,
  isVisible: true,
  isDefault: true,
  isReadOnly: false,
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
};

const makeEvent = (overrides: Partial<CalendarEvent>): CalendarEvent => ({
  id: 'a0000000-0000-0000-0000-000000000001',
  userId: calendar.userId,
  calendarId: calendar.id,
  title: 'Architecture Review',
  description: null,
  location: null,
  startAt: '2026-09-15T14:00:00.000Z', // 10:00 AM EDT
  endAt: '2026-09-15T15:00:00.000Z', // 11:00 AM EDT
  allDay: false,
  timezone: 'America/New_York',
  status: 'confirmed',
  recurrenceRule: null,
  alerts: [],
  sourceType: 'internal',
  providerEventId: null,
  recurringEventId: null,
  recurrenceOriginalStartAt: null,
  providerEtag: null,
  providerUpdatedAt: null,
  syncStatus: 'synced',
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
  ...overrides,
  color: overrides.color ?? null,
});

describe('Phase 3.2 � Origin Ghost Indicator', () => {
  const event = makeEvent({});
  const occurrence: EventOccurrence = {
    key: 'arch-review-key',
    occurrenceIndex: 0,
    start: Date.parse(event.startAt),
    end: Date.parse(event.endAt),
    event,
    calendar,
  };

  describe('OriginGhost Component Rendering', () => {
    it('renders with timelineEventGhost class and origin ghost test/data attributes', () => {
      const html = renderToStaticMarkup(
        <OriginGhost
          occurrence={occurrence}
          originalMinutes={{ startMinute: 600, endMinute: 660 }}
          originalLayout={{ left: 0, width: 1 }}
          hourHeight={64}
          isWeek={false}
        />,
      );

      expect(html).toContain('timelineEventGhost');
      expect(html).toContain('data-testid="timeline-origin-ghost"');
      expect(html).toContain('data-origin-ghost="true"');
      expect(html).toContain(`data-event-id="${event.id}"`);
      expect(html).toContain(`data-occurrence-key="${occurrence.key}"`);
      expect(html).toContain('aria-hidden="true"');
    });

    it('renders a clean non-interactive silhouette without title, time text, or buttons', () => {
      const html = renderToStaticMarkup(
        <OriginGhost
          occurrence={occurrence}
          originalMinutes={{ startMinute: 600, endMinute: 660 }}
          originalLayout={{ left: 0, width: 1 }}
          hourHeight={64}
          isWeek={false}
        />,
      );

      expect(html).not.toContain('Architecture Review');
      expect(html).not.toContain('<button');
      expect(html).not.toContain('10:00 AM');
      expect(html).not.toContain('data-resize-edge');
    });

    it('positions ghost accurately using the event original geometry and calendar color', () => {
      const html = renderToStaticMarkup(
        <OriginGhost
          occurrence={occurrence}
          originalMinutes={{ startMinute: 600, endMinute: 660 }}
          originalLayout={{ left: 0.25, width: 0.5 }}
          hourHeight={64}
          isWeek={false}
        />,
      );

      expect(html).toContain('top:640px');
      expect(html).toContain('height:62px');
      expect(html).toContain('left:calc(25% + 2px)');
      expect(html).toContain('width:calc(50% - 4px)');
      expect(html).toContain('--event-color:#4766db');
    });

    it('respects minimum height constraints in week and day views', () => {
      const htmlWeek = renderToStaticMarkup(
        <OriginGhost
          occurrence={occurrence}
          originalMinutes={{ startMinute: 900, endMinute: 915 }}
          originalLayout={{ left: 0, width: 1 }}
          hourHeight={54}
          isWeek={true}
        />,
      );
      expect(htmlWeek).toContain('height:20px');

      const htmlDay = renderToStaticMarkup(
        <OriginGhost
          occurrence={occurrence}
          originalMinutes={{ startMinute: 900, endMinute: 915 }}
          originalLayout={{ left: 0, width: 1 }}
          hourHeight={64}
          isWeek={false}
        />,
      );
      expect(htmlDay).toContain('height:24px');
    });

    it('applies timelineEventGhostExiting and data-exiting when isExiting is true', () => {
      const htmlExiting = renderToStaticMarkup(
        <OriginGhost
          occurrence={occurrence}
          originalMinutes={{ startMinute: 600, endMinute: 660 }}
          originalLayout={{ left: 0, width: 1 }}
          hourHeight={64}
          isWeek={false}
          isExiting
        />,
      );

      expect(htmlExiting).toContain('timelineEventGhostExiting');
      expect(htmlExiting).toContain('data-exiting="true"');

      const htmlActive = renderToStaticMarkup(
        <OriginGhost
          occurrence={occurrence}
          originalMinutes={{ startMinute: 600, endMinute: 660 }}
          originalLayout={{ left: 0, width: 1 }}
          hourHeight={64}
          isWeek={false}
          isExiting={false}
        />,
      );

      expect(htmlActive).not.toContain('timelineEventGhostExiting');
      expect(htmlActive).not.toContain('data-exiting');
    });
  });

  describe('Gesture Lifecycle & Activation Rules', () => {
    it('does not begin move gesture on click below drag threshold (< 6px)', () => {
      const resolution = resolveMoveGesture({
        startY: 100,
        startX: 100,
        currentY: 104,
        currentX: 102,
        hourHeight: 64,
        originalMinutes: { startMinute: 600, endMinute: 660 },
      });

      expect(resolution.type).toBe('click');
    });

    it('activates dragging gesture once movement reaches threshold (>= 6px)', () => {
      // 6px movement snaps within initial 15m slot -> noop resolution, but begins dragging
      const resolutionNoop = resolveMoveGesture({
        startY: 100,
        startX: 100,
        currentY: 106,
        currentX: 100,
        hourHeight: 64,
        originalMinutes: { startMinute: 600, endMinute: 660 },
      });
      expect(resolutionNoop.type).toBe('noop');

      // 20px movement snaps to +15m slot -> move resolution
      const resolutionMove = resolveMoveGesture({
        startY: 100,
        startX: 100,
        currentY: 120,
        currentX: 100,
        hourHeight: 64,
        originalMinutes: { startMinute: 600, endMinute: 660 },
      });
      expect(resolutionMove.type).toBe('move');
    });

    it('cancelling gesture via Escape or pointercancel returns cancelled resolution', () => {
      const resolution = resolveMoveGesture({
        startY: 100,
        startX: 100,
        currentY: 200,
        currentX: 100,
        hourHeight: 64,
        originalMinutes: { startMinute: 600, endMinute: 660 },
        cancelled: true,
      });

      expect(resolution.type).toBe('cancel');
    });
  });

  describe('Static TimelineView Invariants', () => {
    it('does not render origin ghost during quiescent state or normal viewing', () => {
      const byDateKey = new Map<string, EventOccurrence[]>([['2026-09-15', [occurrence]]]);

      const html = renderToStaticMarkup(
        <TimelineView
          dateKeys={['2026-09-15']}
          byDateKey={byDateKey}
          selectedDateKey="2026-09-15"
          timeZone={timeZone}
          hourCycle="h12"
          now={mockNow}
          onSelectDate={() => {}}
          onSelectEvent={() => {}}
        />,
      );

      expect(html).not.toContain('timelineEventGhost');
      expect(html).not.toContain('data-testid="timeline-origin-ghost"');
      expect(html).not.toContain('data-origin-ghost="true"');
      expect(html).toContain('Architecture Review');
    });
  });

  describe('Reduced Motion CSS Compliance', () => {
    const cssPath = path.resolve(__dirname, 'CalendarView.module.css');
    const cssContent = fs.readFileSync(cssPath, 'utf8');

    it('includes .timelineEventMoving and .timelineEventResizing in prefers-reduced-motion reset', () => {
      const reducedMotionIdx = cssContent.indexOf('@media (prefers-reduced-motion: reduce)');
      expect(reducedMotionIdx).toBeGreaterThan(-1);

      const reducedMotionBlock = cssContent.slice(
        reducedMotionIdx,
        cssContent.indexOf(
          '}',
          cssContent.indexOf('transition: none !important;', reducedMotionIdx),
        ),
      );

      expect(reducedMotionBlock).toContain('.timelineEventMoving');
      expect(reducedMotionBlock).toContain('.timelineEventResizing');
      expect(reducedMotionBlock).toContain('transition: none !important;');
    });

    it('includes .timelineEventGhost and .timelineEventGhostExiting in prefers-reduced-motion reset', () => {
      const reducedMotionIdx = cssContent.indexOf('@media (prefers-reduced-motion: reduce)');
      const reducedMotionBlock = cssContent.slice(
        reducedMotionIdx,
        cssContent.indexOf(
          '}',
          cssContent.indexOf('transition: none !important;', reducedMotionIdx),
        ),
      );

      expect(reducedMotionBlock).toContain('.timelineEventGhost');
      expect(reducedMotionBlock).toContain('.timelineEventGhostExiting');
      expect(reducedMotionBlock).toContain('animation: none !important;');
    });

    it('configures .timelineEventGhostExiting with fade-out keyframes', () => {
      const exitingClassIdx = cssContent.indexOf('.timelineEventGhostExiting {');
      expect(exitingClassIdx).toBeGreaterThan(-1);

      const exitingClassBlock = cssContent.slice(
        exitingClassIdx,
        cssContent.indexOf('}', exitingClassIdx),
      );
      expect(exitingClassBlock).toContain('timeline-ghost-fade-out');

      expect(cssContent).toContain('@keyframes timeline-ghost-fade-out');
    });

    it('configures .timelineEventGhost with pointer-events: none and subtle dashed outline', () => {
      const ghostClassIdx = cssContent.indexOf('.timelineEventGhost {');
      expect(ghostClassIdx).toBeGreaterThan(-1);

      const ghostClassBlock = cssContent.slice(
        ghostClassIdx,
        cssContent.indexOf('}', ghostClassIdx),
      );

      expect(ghostClassBlock).toContain('pointer-events: none');
      expect(ghostClassBlock).toContain('dashed');
      expect(ghostClassBlock).toContain('position: absolute');
    });
  });
});
