import { useEffect } from 'react';

import { TasksView } from '../features/tasks';

export function TasksPage() {
  useEffect(() => {
    document.title = 'BPlan | Tasks';
  }, []);

  return <TasksView />;
}
