import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { QuickCreateHeader } from './QuickCreateHeader';
import { QuickCreateTypeTabs } from './QuickCreateTypeTabs';

const props = {
  isEditing: false,
  mode: 'event' as const,
  isSaving: false,
  showDelete: false,
  isDeleteConfirmOpen: false,
  onSelectEvent: vi.fn(),
  onSelectTask: vi.fn(),
  onToggleDeleteConfirm: vi.fn(),
  onCancelDelete: vi.fn(),
  onConfirmDelete: vi.fn(),
  onRequestClose: vi.fn(),
};

interface ButtonProps {
  children?: ReactNode;
  'aria-label'?: string;
  onClick?: () => void;
}

function findElement<P>(node: ReactNode, type: unknown): ReactElement<P> | undefined {
  if (!isValidElement<P & { children?: ReactNode }>(node)) return undefined;
  if (node.type === type) return node;
  for (const child of Children.toArray(node.props.children)) {
    const match = findElement<P>(child, type);
    if (match) return match;
  }
  return undefined;
}

function findButton(node: ReactNode, label: string): ReactElement<ButtonProps> | undefined {
  if (!isValidElement<ButtonProps>(node)) return undefined;
  if (
    node.type === 'button' &&
    (node.props.children === label || node.props['aria-label'] === label)
  ) {
    return node;
  }
  for (const child of Children.toArray(node.props.children)) {
    const match = findButton(child, label);
    if (match) return match;
  }
  return undefined;
}

describe('QuickCreateHeader', () => {
  it('renders creation tabs in order and marks the selected mode', () => {
    const eventHtml = renderToStaticMarkup(<QuickCreateHeader {...props} />);
    const taskHtml = renderToStaticMarkup(<QuickCreateHeader {...props} mode="task" />);

    expect(eventHtml).toContain('role="tablist" aria-label="Creation type"');
    expect(eventHtml).toMatch(/role="tab" aria-selected="true"[^>]*>Event<\/button>/);
    expect(eventHtml).toMatch(/role="tab" aria-selected="false"[^>]*>Task<\/button>/);
    expect(taskHtml).toMatch(/role="tab" aria-selected="false"[^>]*>Event<\/button>/);
    expect(taskHtml).toMatch(/role="tab" aria-selected="true"[^>]*>Task<\/button>/);
    expect(eventHtml.indexOf('>Event</button>')).toBeLessThan(eventHtml.indexOf('>Task</button>'));
  });

  it('shows Edit event instead of creation tabs when editing', () => {
    const html = renderToStaticMarkup(<QuickCreateHeader {...props} isEditing />);

    expect(html).toContain('Edit event');
    expect(html).not.toContain('role="tablist"');
    expect(html).not.toContain('role="tab"');
  });

  it('shows the delete control only when requested, with its exact ARIA contract', () => {
    const hidden = renderToStaticMarkup(<QuickCreateHeader {...props} isEditing />);
    const visible = renderToStaticMarkup(<QuickCreateHeader {...props} isEditing showDelete />);

    expect(hidden).not.toContain('aria-label="Delete event"');
    expect(visible).toMatch(
      /aria-label="Delete event" aria-expanded="false" aria-controls="quick-create-delete-confirm" title="Delete event"/,
    );
    expect(visible).not.toContain('role="alertdialog"');
  });

  it('shows confirmation only while open, with Cancel before Delete', () => {
    const html = renderToStaticMarkup(
      <QuickCreateHeader {...props} isEditing showDelete isDeleteConfirmOpen />,
    );

    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('id="quick-create-delete-confirm"');
    expect(html).toContain('role="alertdialog" aria-label="Confirm event deletion"');
    expect(html).toContain('Delete this event?');
    expect(html.indexOf('>Cancel</button>')).toBeLessThan(html.indexOf('>Delete</button>'));
  });

  it('keeps Close in create and edit modes and disables Close and delete while saving', () => {
    const createHtml = renderToStaticMarkup(<QuickCreateHeader {...props} />);
    const editHtml = renderToStaticMarkup(
      <QuickCreateHeader {...props} isEditing showDelete isSaving />,
    );

    expect(createHtml).toContain('aria-label="Close"');
    expect(editHtml).toContain('aria-label="Close"');
    expect(editHtml).toMatch(/aria-label="Delete event"[^>]*disabled/);
    expect(editHtml).toMatch(/aria-label="Close"[^>]*disabled/);
  });

  it('routes each control to its supplied callback', () => {
    const header = QuickCreateHeader({ ...props, showDelete: true, isDeleteConfirmOpen: true });
    const tabs = findElement<Parameters<typeof QuickCreateTypeTabs>[0]>(
      header,
      QuickCreateTypeTabs,
    );
    tabs?.props.onSelectEvent();
    tabs?.props.onSelectTask();
    expect(props.onSelectEvent).toHaveBeenCalledOnce();
    expect(props.onSelectTask).toHaveBeenCalledOnce();

    const actions = [
      ['Delete event', props.onToggleDeleteConfirm],
      ['Cancel', props.onCancelDelete],
      ['Delete', props.onConfirmDelete],
      ['Close', props.onRequestClose],
    ] as const;

    for (const [label, callback] of actions) {
      findButton(header, label)?.props.onClick?.();
      expect(callback).toHaveBeenCalledOnce();
    }
  });
});
