import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import styles from './FindTimeBox.module.css';
import { FindTimeActivePrompt, FindTimeLockedTeaser } from './FindTimePromptPresentation';

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

function renderActive(
  overrides: {
    text?: string;
    isPending?: boolean;
    canSubmit?: boolean;
    showHint?: boolean;
    clarificationQuestion?: string | null;
  } = {},
) {
  return renderToStaticMarkup(
    <FindTimeActivePrompt
      inputId="find-time-input"
      inputRef={React.createRef<HTMLInputElement>()}
      text={overrides.text ?? ''}
      isPending={overrides.isPending ?? false}
      canSubmit={overrides.canSubmit ?? false}
      showHint={overrides.showHint ?? true}
      clarificationQuestion={overrides.clarificationQuestion ?? null}
      onSubmit={vi.fn()}
      onInputChange={vi.fn()}
      onInputKeyDown={vi.fn()}
    />,
  );
}

function findElement<T>(node: React.ReactNode, tag: string): React.ReactElement<T> | null {
  let found: React.ReactElement<T> | null = null;
  function visit(children: React.ReactNode) {
    React.Children.forEach(children, (child) => {
      if (!React.isValidElement<{ children?: React.ReactNode }>(child)) return;
      if (child.type === tag) found = child as React.ReactElement<T>;
      visit(child.props.children);
    });
  }
  visit(node);
  return found;
}

describe('Find Time prompt presentation', () => {
  it('renders the locked Free teaser with disabled input and subscription link', () => {
    const html = renderToStaticMarkup(<FindTimeLockedTeaser inputId="find-time-input" />);

    expect(html).toContain(styles.lockedTeaser);
    expect(html).toContain('>PRO</span>');
    expect(html).toContain('Find Time with AI');
    expect(html).toContain('AI-assisted natural language scheduling');
    expect(html).toContain('id="find-time-input"');
    expect(html).toContain('disabled="" readOnly=""');
    expect(html).toContain('placeholder="Try “15-minute meeting with Andrew”"');
    expect(html).toContain('aria-label="Find Time with AI is available on the Pro plan"');
    expect(html).toContain('href="/subscription"');
    expect(html).toContain('Upgrade to Pro');
    expect(html).not.toContain('Describe what you want to schedule');
  });

  it('renders the idle Pro form, rotating prompt, hint and disabled submit', () => {
    const html = renderActive();

    expect(html).toContain(`class="${styles.form}"`);
    expect(html).toContain('id="find-time-input"');
    expect(html).toContain('type="text"');
    expect(html).toContain('value=""');
    expect(html).toContain('placeholder=""');
    expect(html).toContain('aria-label="Describe what you want to schedule"');
    expect(html).toContain('>Try</span>');
    expect(html).toContain('Find time</span>');
    expect(html).toContain('disabled=""');
    expect(html).toContain('Describe a meeting and BPlan will suggest the three best open slots');
    expect(html).not.toContain('Finding slots…');
    expect(html).not.toContain('BPlan needs more verification');
  });

  it('shows typed text, enables submit and hides the rotating prompt', () => {
    const html = renderActive({ text: 'Review with Luna', canSubmit: true, showHint: false });

    expect(html).toContain('value="Review with Luna"');
    expect(html).toContain('Find time</span>');
    expect(html).not.toContain('>Try</span>');
    expect(html).not.toContain('disabled=""');
    expect(html).not.toContain('Describe a meeting and BPlan will suggest');
  });

  it('renders finding state and all three loading skeletons after the form', () => {
    const html = renderActive({ isPending: true, showHint: false });
    const skeletonCardClass = styles.skeletonCard;
    if (!skeletonCardClass) throw new Error('Missing loading skeleton class');

    expect(html).toContain(styles.inputWrapScanning);
    expect(html).toContain(styles.inputIconScanning);
    expect(html).toContain(styles.submitFinding);
    expect(html).toContain('Finding slots…');
    expect(html).toContain('disabled=""');
    expect(html).not.toContain('>Try</span>');
    expect(html).not.toContain('Describe a meeting and BPlan will suggest');
    expect(html).toContain(`class="${styles.loadingArea}" role="status" aria-live="polite"`);
    expect(html).toContain('AI Engine');
    expect(html).toContain(
      'Verifying deterministic calendar availability &amp; ranking optimal slots…',
    );
    expect(html.split(skeletonCardClass).length - 1).toBe(3);
    expect(html).toContain(styles.skeletonDelay1);
    expect(html).toContain(styles.skeletonDelay2);
    expect(html.indexOf('Finding slots…')).toBeLessThan(html.indexOf('AI Engine'));
  });

  it('renders clarification only when the parent supplies its visible question', () => {
    const html = renderActive({
      clarificationQuestion: 'Did you mean Thursday morning or afternoon?',
    });

    expect(html).toContain(`class="${styles.clarificationCard}" role="status"`);
    expect(html).toContain('BPlan needs more verification');
    expect(html).toContain('Did you mean Thursday morning or afternoon?');
    expect(html.indexOf('Describe a meeting and BPlan will suggest')).toBeLessThan(
      html.indexOf('BPlan needs more verification'),
    );
    expect(renderActive()).not.toContain('BPlan needs more verification');
  });

  it('forwards submit, change and keydown events to the parent callbacks', () => {
    const onSubmit = vi.fn();
    const onInputChange = vi.fn();
    const onInputKeyDown = vi.fn();
    const view = FindTimeActivePrompt({
      inputId: 'find-time-input',
      inputRef: React.createRef<HTMLInputElement>(),
      text: '',
      isPending: false,
      canSubmit: false,
      showHint: true,
      clarificationQuestion: null,
      onSubmit,
      onInputChange,
      onInputKeyDown,
    });
    const form = findElement<React.FormHTMLAttributes<HTMLFormElement>>(view, 'form');
    const input = findElement<React.InputHTMLAttributes<HTMLInputElement>>(view, 'input');
    const submitEvent = { preventDefault: vi.fn() } as unknown as React.FormEvent<HTMLFormElement>;
    const changeEvent = { target: { value: 'Review' } } as React.ChangeEvent<HTMLInputElement>;
    const keyEvent = { key: 'Escape' } as React.KeyboardEvent<HTMLInputElement>;

    form?.props.onSubmit?.(submitEvent);
    input?.props.onChange?.(changeEvent);
    input?.props.onKeyDown?.(keyEvent);
    expect(onSubmit).toHaveBeenCalledWith(submitEvent);
    expect(onInputChange).toHaveBeenCalledWith(changeEvent);
    expect(onInputKeyDown).toHaveBeenCalledWith(keyEvent);
  });
});
