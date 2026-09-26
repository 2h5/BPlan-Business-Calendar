import type { TaskList } from '@cal/schemas';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { QuickCreateTaskFields } from './QuickCreateTaskFields';

const taskList: TaskList = {
  id: 'list-1',
  userId: 'user-1',
  name: 'Work',
  color: '#4766db',
  position: 0,
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
};

const props = {
  startDate: '2026-09-15',
  startDateDisplay: 'Tuesday, September 15',
  onStartDateChange: vi.fn(),
  startTime: '10:00',
  startTimeOptions: [{ value: '10:00', label: '10:00am' }],
  onStartTimeChange: vi.fn(),
  taskHasTime: true,
  onTaskHasTimeChange: vi.fn(),
  taskLists: [taskList],
  selectedListId: '',
  onSelectedListChange: vi.fn(),
  taskPriority: 'normal' as const,
  onTaskPriorityChange: vi.fn(),
  description: 'Follow up',
  onDescriptionChange: vi.fn(),
};

describe('QuickCreateTaskFields', () => {
  it('renders due time, the first task-list fallback, and all priority values', () => {
    const html = renderToStaticMarkup(<QuickCreateTaskFields {...props} />);

    expect(html).toContain('aria-label="Due date: Tuesday, September 15"');
    expect(html).toContain('aria-label="Due time"');
    expect(html).toContain('Set time');
    expect(html).toContain('Work');
    expect(html).toContain('aria-label="Task priority"');
    for (const priority of ['Low', 'Normal', 'High', 'Urgent']) {
      expect(html).toContain(`>${priority}</button>`);
    }
    expect(html).toContain('Follow up');
  });

  it('omits optional due time and task-list selector when absent', () => {
    const html = renderToStaticMarkup(
      <QuickCreateTaskFields {...props} taskHasTime={false} taskLists={undefined} />,
    );

    expect(html).not.toContain('aria-label="Due time"');
    expect(html).not.toContain('Choose task list');
    expect(html).toContain('Set time');
    expect(html).toContain('aria-label="Task priority"');
  });
});
