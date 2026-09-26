import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import styles from './CalendarView.module.css';
import { TimelineAllDayDraft, TimelineDraftEvent } from './TimelineDraftEvent';

describe('TimelineDraftEvent', () => {
  it('renders the timed draft at its minutes, in its layout column, with its title and colour', () => {
    const html = renderToStaticMarkup(
      <TimelineDraftEvent
        startMinute={9 * 60}
        endMinute={10 * 60 + 30}
        placement={{ left: 0.5, width: 0.5 }}
        hourHeight={64}
        hourCycle="h12"
        title="Planning"
        calendarColor="#ff0000"
      />,
    );

    expect(html).toContain('data-quick-create-draft="true"');
    expect(html).toContain(
      `class="${styles.draftTimelineEvent} ${styles.draftTimelineEventBubbleEnter}"`,
    );
    expect(html).toContain(
      'style="top:576px;left:calc(50% + 2px);width:calc(50% - 4px);right:auto;height:94px;--event-color:#ff0000"',
    );
    expect(html).toContain(`<span class="${styles.draftTimelineEventTitle}">Planning</span>`);
    expect(html).toContain(
      `<span class="${styles.draftTimelineEventTime}">9:00 AM – 10:30 AM</span>`,
    );
  });

  it('falls back to the default title and accent colour, with no column and a minimum height', () => {
    const html = renderToStaticMarkup(
      <TimelineDraftEvent
        startMinute={9 * 60}
        endMinute={9 * 60 + 15}
        hourHeight={54}
        hourCycle="h23"
        title=""
        isClosing
      />,
    );

    expect(html).toContain(
      `class="${styles.draftTimelineEvent} ${styles.draftTimelineEventBubbleExit}"`,
    );
    expect(html).toContain('style="top:486px;height:22px;--event-color:var(--color-accent)"');
    expect(html).toContain('(New event)');
    expect(html).toContain('09:00 – 09:15');
  });
});

describe('TimelineAllDayDraft', () => {
  it('renders a compact entering chip with the draft title and colour', () => {
    const html = renderToStaticMarkup(
      <TimelineAllDayDraft title="Offsite" calendarColor="#00ff00" />,
    );

    expect(html).toBe(
      `<div class="${styles.timelineEvent} ${styles.timelineEventCompact} ${styles.monthEventDraft} ${styles.monthEventDraftEntering}" style="--event-color:#00ff00">` +
        `<span class="${styles.timelineEventTitle}">Offsite</span></div>`,
    );
  });

  it('falls back to the default title and accent colour while closing', () => {
    const html = renderToStaticMarkup(<TimelineAllDayDraft isClosing />);

    expect(html).toContain(styles.monthEventDraftClosing);
    expect(html).not.toContain(styles.monthEventDraftEntering);
    expect(html).toContain('--event-color:var(--color-accent)');
    expect(html).toContain('(New event)');
  });
});
