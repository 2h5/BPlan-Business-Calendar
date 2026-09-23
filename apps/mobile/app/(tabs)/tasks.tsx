import { Screen } from '@cal/ui';
import { useLocalSearchParams } from 'expo-router';

import { useOpenTaskFromParam } from '../../src/features/tasks/hooks/useOpenTaskFromParam';
import { useTasksRefresh } from '../../src/features/tasks/hooks/useTasksRefresh';
import { TasksScreen } from '../../src/features/tasks/screens/TasksScreen';

export default function TasksScreenRoute() {
  // A tapped reminder deep-links here with the task to open.
  const { taskId } = useLocalSearchParams<{ taskId?: string }>();
  useOpenTaskFromParam(taskId);
  const { refreshing, onRefresh } = useTasksRefresh();

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <TasksScreen />
    </Screen>
  );
}
