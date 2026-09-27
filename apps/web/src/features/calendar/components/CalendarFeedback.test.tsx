import { Children, isValidElement, type FocusEvent, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { CalendarState, CalendarToastPresentation } from './CalendarFeedback';
import styles from './CalendarView.module.css';

interface ButtonProps {
  children?: ReactNode;
  onClick?: () => void;
}

function findButton(node: ReactNode): ButtonProps | undefined {
  if (!isValidElement<ButtonProps>(node)) return undefined;
  if (node.type === 'button') return node.props;
  for (const child of Children.toArray(node.props.children)) {
    const button = findButton(child);
    if (button) return button;
  }
  return undefined;
}

const toastProps = {
  message: 'Event moved',
  isExiting: false,
  onHold: vi.fn(),
  onRelease: vi.fn(),
};

describe('CalendarState', () => {
  it('renders the loading status with its existing copy and icon', () => {
    const html = renderToStaticMarkup(<CalendarState kind="loading" />);

    expect(html).toContain(`class="${styles.statePanel}" role="status"`);
    expect(html).toContain('Loading your calendar');
    expect(html).toContain('Bringing your calendars and events into view.');
    expect(html).toContain('<svg viewBox="0 0 24 24" width="36" height="36"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('<rect x="3" y="5" width="18" height="16" rx="2"></rect>');
    expect(html).not.toContain('Try again');
  });

  it('renders the empty status without a retry button', () => {
    const html = renderToStaticMarkup(<CalendarState kind="empty" />);

    expect(html).toContain(`class="${styles.statePanel}" role="status"`);
    expect(html).toContain('Nothing scheduled here');
    expect(html).toContain('This range is clear. Events from visible calendars will appear here.');
    expect(html).not.toContain('<button');
  });

  it('renders the error alert and forwards retry', () => {
    const onRetry = vi.fn();
    const html = renderToStaticMarkup(<CalendarState kind="error" onRetry={onRetry} />);

    expect(html).toContain(`class="${styles.statePanel}" role="alert"`);
    expect(html).toContain('We could not load your calendar');
    expect(html).toContain('Check the local connection and try again.');
    expect(html).toContain('<path d="M12 14v3M12 19h.01"></path>');
    expect(html).toContain('<button type="button">Try again</button>');

    findButton(CalendarState({ kind: 'error', onRetry }))?.onClick?.();
    expect(onRetry).toHaveBeenCalledOnce();
  });
});

describe('CalendarToastPresentation', () => {
  it('renders a normal message as a polite status', () => {
    const html = renderToStaticMarkup(<CalendarToastPresentation {...toastProps} />);

    expect(html).toContain(`class="${styles.toast} " role="status" aria-live="polite"`);
    expect(html).toContain(`<span class="${styles.toastMessage}"><span>Event moved</span></span>`);
    expect(html).not.toContain(styles.toastSpinner);
    expect(html).not.toContain('<button');
  });

  it('renders the restoring spinner and keys the message span to its copy', () => {
    const message = 'Restoring event…';
    const tree = CalendarToastPresentation({ ...toastProps, message });
    const messageSpan = Children.toArray(tree.props.children)[0];
    const html = renderToStaticMarkup(tree);

    expect(isValidElement(messageSpan) && messageSpan.key).toContain(message);
    expect(html).toContain(`<span class="${styles.toastSpinner}" aria-hidden="true"></span>`);
    expect(html).toContain(`<span>${message}</span>`);
  });

  it('shows an action and forwards its callback', () => {
    const onAction = vi.fn();
    const props = { ...toastProps, actionLabel: 'Undo', onAction };
    const html = renderToStaticMarkup(<CalendarToastPresentation {...props} />);

    expect(html).toContain('<button type="button">Undo</button>');
    findButton(CalendarToastPresentation(props))?.onClick?.();
    expect(onAction).toHaveBeenCalledOnce();
  });

  it('adds the exit class and hides the action while exiting', () => {
    const props = { ...toastProps, actionLabel: 'Undo', onAction: vi.fn(), isExiting: true };
    const html = renderToStaticMarkup(<CalendarToastPresentation {...props} />);

    expect(html).toContain(`class="${styles.toast} ${styles.toastExiting}"`);
    expect(html).toContain('role="status" aria-live="polite"');
    expect(html).not.toContain('<button');
    expect(findButton(CalendarToastPresentation(props))).toBeUndefined();
  });

  it('forwards pointer/focus holds and releases only when focus leaves the toast', () => {
    const onHold = vi.fn();
    const onRelease = vi.fn();
    const tree = CalendarToastPresentation({ ...toastProps, onHold, onRelease });
    const relatedTarget = {} as Node;
    const contains = vi.fn().mockReturnValueOnce(true).mockReturnValueOnce(false);
    const blurEvent = {
      currentTarget: { contains },
      relatedTarget,
    } as unknown as FocusEvent<HTMLDivElement>;

    tree.props.onPointerEnter();
    tree.props.onPointerLeave();
    tree.props.onFocus();
    tree.props.onBlur(blurEvent);
    expect(onHold).toHaveBeenCalledTimes(2);
    expect(onRelease).toHaveBeenCalledTimes(1);
    expect(contains).toHaveBeenCalledWith(relatedTarget);

    tree.props.onBlur(blurEvent);
    expect(onRelease).toHaveBeenCalledTimes(2);
  });
});
