import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import styles from './FindTimeBox.module.css';
import { ScheduledBanner, ScheduledConfirmationCard } from './FindTimeScheduledNotice';
import type { FindTimeConfirmation } from '../api/find-time.api';

vi.mock('react-router-dom', () => ({
  Link: ({
    to,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

const event: FindTimeConfirmation['event'] = {
  id: 'event-123',
  title: 'Design Review with Luna',
  startAt: '2026-09-15T14:00:00Z',
  endAt: '2026-09-15T14:30:00Z',
};

function findButton(node: React.ReactNode) {
  let button: React.ReactElement<{ onClick?: () => void }> | null = null;
  function visit(children: React.ReactNode) {
    React.Children.forEach(children, (child) => {
      if (!React.isValidElement<{ children?: React.ReactNode; onClick?: () => void }>(child))
        return;
      if (child.type === 'button') button = child;
      visit(child.props.children);
    });
  }
  visit(node);
  return button as React.ReactElement<{ onClick?: () => void }> | null;
}

describe('scheduled notice presentation', () => {
  it('renders the full confirmation with the event, time and calendar link', () => {
    const html = renderToStaticMarkup(
      <ScheduledConfirmationCard
        event={event}
        timeZone="America/New_York"
        onScheduleAnother={vi.fn()}
      />,
    );

    expect(html).toContain(`class="${styles.confirmationCard}" role="status"`);
    expect(html).toContain('Successfully Scheduled');
    expect(html).toContain('✦ Synced');
    expect(html).toContain('Design Review with Luna');
    expect(html).toContain('Tue, Sep 15 · 10:00 AM – 10:30 AM');
    expect(html).toContain('Schedule another');
    expect(html).toContain('View in Calendar');
    expect(html).toContain('href="/calendar?date=2026-09-15&amp;event=event-123"');
  });

  it('forwards Schedule another to the parent', () => {
    const onScheduleAnother = vi.fn();
    const view = ScheduledConfirmationCard({ event, timeZone: 'UTC', onScheduleAnother });

    findButton(view)?.props.onClick?.();
    expect(onScheduleAnother).toHaveBeenCalledOnce();
  });

  it('renders the compact banner with calendar link and remaining timer duration', () => {
    const html = renderToStaticMarkup(
      <ScheduledBanner
        event={event}
        timeZone="America/New_York"
        isExiting={false}
        remainingMs={12_600}
        totalDurationMs={30_000}
        onDismiss={vi.fn()}
      />,
    );

    expect(html).toContain(`class="${styles.recentBanner} " role="status"`);
    expect(html).toContain('>Scheduled</span>');
    expect(html).toContain('Design Review with Luna');
    expect(html).toContain('Tue, Sep 15 · 10:00 AM – 10:30 AM');
    expect(html).toContain('href="/calendar?date=2026-09-15&amp;event=event-123"');
    expect(html).toContain('aria-label="Dismiss scheduled notice"');
    expect(html).toContain('--start-width:42%;--deplete-duration:12600ms');
    expect(html).not.toContain('Successfully Scheduled');
  });

  it('applies exit styling and retains the countdown width calculation', () => {
    const html = renderToStaticMarkup(
      <ScheduledBanner
        event={event}
        timeZone="UTC"
        isExiting={true}
        remainingMs={35_000}
        totalDurationMs={30_000}
        onDismiss={vi.fn()}
      />,
    );

    expect(html).toContain(`${styles.recentBanner} ${styles.recentBannerExiting}`);
    expect(html).toContain('--start-width:100%;--deplete-duration:35000ms');
  });

  it('forwards dismiss and keeps the calendar fallback without an event ID', () => {
    const onDismiss = vi.fn();
    const eventWithoutId = { ...event, id: '' };
    const view = ScheduledBanner({
      event: eventWithoutId,
      timeZone: 'UTC',
      isExiting: false,
      remainingMs: 0,
      totalDurationMs: 30_000,
      onDismiss,
    });
    const html = renderToStaticMarkup(view);

    findButton(view)?.props.onClick?.();
    expect(onDismiss).toHaveBeenCalledOnce();
    expect(html).toContain('href="/calendar"');
    expect(html).toContain('--start-width:0%;--deplete-duration:0ms');
  });
});
