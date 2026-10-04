import { Screen } from '@cal/ui';
import { useLocalSearchParams } from 'expo-router';

import { TAB_BAR_CLEARANCE } from '../../src/components/app-shell/floating-layout';
import { SignedIn } from '../../src/features/auth';
import { useOpenTaskFromParam } from '../../src/features/tasks/hooks/useOpenTaskFromParam';
import { useTasksRefresh } from '../../src/features/tasks/hooks/useTasksRefresh';
import { TasksScreen } from '../../src/features/tasks/screens/TasksScreen';

function TasksTab() {
  // A tapped reminder deep-links here with the task to open.
  const { taskId } = useLocalSearchParams<{ taskId?: string }>();
  useOpenTaskFromParam(taskId);
  const { refreshing, onRefresh } = useTasksRefresh();

  return (
    <Screen bottomClearance={TAB_BAR_CLEARANCE} refreshing={refreshing} onRefresh={onRefresh}>
      <TasksScreen />
    </Screen>
  );
}

export default function TasksScreenRoute() {
  return (
    <SignedIn>
      <TasksTab />
    </SignedIn>
  );
}
