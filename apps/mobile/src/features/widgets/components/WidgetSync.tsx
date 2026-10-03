import { usePendingWidgetToggles } from '../hooks/usePendingWidgetToggles';
import { useWidgetSnapshotSync } from '../hooks/useWidgetSnapshotSync';

/**
 * Renders nothing. Mounted once at the root, outside the signed-in overlays,
 * so it is still there to clear the widget when the user signs out.
 */
export function WidgetSync() {
  useWidgetSnapshotSync();
  usePendingWidgetToggles();
  return null;
}
