import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import styles from './FindTimeBox.module.css';
import { FindTimeProposalResults } from './FindTimeProposalResults';
import type { FindTimeProposal } from '../api/find-time.api';

const proposal: FindTimeProposal = {
  status: 'proposed',
  requestId: 'req-1',
  task: { id: null, title: 'Fallback task', durationMinutes: 45, deadlineAt: null },
  targetCalendar: { id: 'cal-1', name: 'Primary' },
  readback: {
    title: 'Design review',
    durationMinutes: 30,
    durationLabel: '30 minutes',
    dateLabel: 'Thursday',
    timeLabel: 'Afternoon',
    location: 'Conference room',
  },
  suggestions: [
    {
      id: 'sugg-2',
      slotId: 'slot-2',
      startAt: '2026-09-10T17:00:00Z',
      endAt: '2026-09-10T17:30:00Z',
      rank: 2,
      score: 0.8,
      reason: 'Leaves preparation time.',
    },
    {
      id: 'sugg-1',
      slotId: 'slot-1',
      startAt: '2026-09-10T16:15:00Z',
      endAt: '2026-09-10T16:45:00Z',
      rank: 1,
      score: 0.98,
      reason: 'Best open window.',
    },
  ],
};

function renderProposal(
  overrides: {
    proposal?: FindTimeProposal;
    confirmingSuggestionId?: string | null;
    isExiting?: boolean;
  } = {},
) {
  return renderToStaticMarkup(
    <FindTimeProposalResults
      proposal={overrides.proposal ?? proposal}
      timeZone="America/New_York"
      isExiting={overrides.isExiting ?? false}
      confirmingSuggestionId={overrides.confirmingSuggestionId ?? null}
      onSelect={vi.fn()}
    />,
  );
}

function findButtons(node: React.ReactNode) {
  const buttons: React.ReactElement<{ children?: React.ReactNode; onClick?: () => void }>[] = [];
  function visit(children: React.ReactNode) {
    React.Children.forEach(children, (child) => {
      if (!React.isValidElement<{ children?: React.ReactNode; onClick?: () => void }>(child))
        return;
      if (child.type === 'button') buttons.push(child);
      visit(child.props.children);
    });
  }
  visit(node);
  return buttons;
}

describe('FindTimeProposalResults', () => {
  it('renders parsed readback chips and ranked slots in proposal order', () => {
    const html = renderProposal();

    expect(html).toContain('Design review');
    expect(html).toContain('30 minutes');
    expect(html).toContain('Thursday');
    expect(html).toContain('Afternoon');
    expect(html).toContain('Conference room');
    expect(html).not.toContain('Fallback task');
    expect(html).toContain('Verified Open Slots');
    expect(html).toContain('Guaranteed Conflict-Free');
    expect(html.indexOf('Leaves preparation time.')).toBeLessThan(
      html.indexOf('Best open window.'),
    );
    expect(html).toContain('Thu, Sep 10 · 1:00 PM – 1:30 PM');
    expect(html).toContain('Thu, Sep 10 · 12:15 PM – 12:45 PM');
    expect(html.match(/✦ Recommended/g)).toHaveLength(1);
    expect(html).toContain('animation-delay:0ms');
    expect(html).toContain('animation-delay:70ms');
    expect(html.match(/aria-hidden="true"/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('renders task title and formatted duration when readback is missing', () => {
    const html = renderProposal({ proposal: { ...proposal, readback: undefined } });

    expect(html).toContain('Fallback task');
    expect(html).toContain('45m');
    expect(html).not.toContain('Conference room');
    expect(html).not.toContain('Afternoon');
  });

  it('shows booking on the selected slot and disables both schedule actions', () => {
    const html = renderProposal({ confirmingSuggestionId: 'sugg-1' });

    expect(html).toContain('Booking…');
    expect(html.match(/disabled=""/g)).toHaveLength(2);
    expect(html).toContain(styles.slotCardBooking);
    expect(html).toContain(styles.slotCardDimmed);
    expect(html).toContain(styles.slotCardTopPick);
    expect(html).toContain(styles.scheduleButtonPrimary);
    expect(html).toContain(styles.scheduleButtonLoading);
    expect(html).toContain('✦ Recommended');
  });

  it('applies the proposal exit class to both readback and results', () => {
    const exitClass = styles.proposalExiting;
    if (!exitClass) throw new Error('Missing proposal exit class');
    const html = renderProposal({ isExiting: true });
    expect(html.split(exitClass).length - 1).toBe(2);
  });

  it('passes the clicked suggestion to the parent selection callback', () => {
    const onSelect = vi.fn();
    const view = FindTimeProposalResults({
      proposal,
      timeZone: 'America/New_York',
      isExiting: false,
      confirmingSuggestionId: null,
      onSelect,
    });
    const buttons = findButtons(view);

    expect(buttons).toHaveLength(2);
    buttons[1]?.props.onClick?.();
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith(proposal.suggestions[1]);
  });
});
