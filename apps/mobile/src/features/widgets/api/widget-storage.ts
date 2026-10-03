import { ExtensionStorage } from '@bacons/apple-targets';
import { Platform } from 'react-native';

import { logError } from '../../../lib/logger';
import { WIDGET_APP_GROUP, WIDGET_KIND, WIDGET_STORAGE_KEYS } from '../constants';
import {
  pendingTaskTogglesSchema,
  widgetSnapshotSchema,
  type PendingTaskToggle,
  type WidgetSnapshot,
} from '../schema';

/**
 * The only place the app touches the widget's shared App Group storage.
 *
 * On Android, in Expo Go, and in builds made before the widget existed, the
 * native module is absent and `ExtensionStorage` quietly does nothing, so
 * every call here is safe to make unconditionally.
 */
const storage = new ExtensionStorage(WIDGET_APP_GROUP);
const isSupported = Platform.OS === 'ios';

/** Validates, stores, and asks WidgetKit to redraw. */
export function writeWidgetSnapshot(snapshot: WidgetSnapshot): void {
  if (!isSupported) return;
  // Our own output still passes the contract check: a bad payload would leave
  // the widget blank on the Home Screen with nothing in the app to show why.
  const parsed = widgetSnapshotSchema.parse(snapshot);
  storage.set(WIDGET_STORAGE_KEYS.snapshot, JSON.stringify(parsed));
  ExtensionStorage.reloadWidget(WIDGET_KIND);
}

/** Signing out must not leave someone's calendar on the Home Screen. */
export function clearWidgetSnapshot(): void {
  if (!isSupported) return;
  storage.remove(WIDGET_STORAGE_KEYS.snapshot);
  storage.remove(WIDGET_STORAGE_KEYS.pendingTaskToggles);
  ExtensionStorage.reloadWidget(WIDGET_KIND);
}

/** Ticks the widget recorded since the app last looked. Malformed input is dropped. */
export function readPendingTaskToggles(): PendingTaskToggle[] {
  if (!isSupported) return [];
  const raw = storage.get(WIDGET_STORAGE_KEYS.pendingTaskToggles);
  if (!raw) return [];

  try {
    const parsed = pendingTaskTogglesSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : [];
  } catch (error) {
    logError(error);
    return [];
  }
}

/**
 * Removes the ticks the app has sent. Re-reads first and keeps anything newer,
 * so a tick made on the Home Screen while the requests were in flight survives.
 */
export function acknowledgePendingTaskToggles(handled: readonly PendingTaskToggle[]): void {
  if (!isSupported || handled.length === 0) return;
  const done = new Set(handled.map((toggle) => `${toggle.id}:${toggle.at}`));
  const remaining = readPendingTaskToggles().filter(
    (toggle) => !done.has(`${toggle.id}:${toggle.at}`),
  );

  if (remaining.length === 0) storage.remove(WIDGET_STORAGE_KEYS.pendingTaskToggles);
  else storage.set(WIDGET_STORAGE_KEYS.pendingTaskToggles, JSON.stringify(remaining));
}
