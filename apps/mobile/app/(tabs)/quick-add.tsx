import { Redirect } from 'expo-router';

/**
 * Placeholder route for the quick-add action. Quick Add is a sheet, opened by
 * Today's floating "+" (`AddFab`), so this is only reached via a stray deep link.
 */
export default function QuickAddRoute() {
  return <Redirect href="/(tabs)/today" />;
}
