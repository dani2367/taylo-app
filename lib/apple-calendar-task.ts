import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import { APPLE_CALENDAR_SYNC_TASK } from '@/lib/apple-calendar-map';

// iOS — not the app — controls when background fetch actually fires. Background App
// Refresh being off, Low Power Mode, and system heuristics can delay or skip this
// task. Treat it as best-effort, never as guaranteed real-time calendar sync.
TaskManager.defineTask(APPLE_CALENDAR_SYNC_TASK, async () => {
  try {
    const { syncAppleCalendar } = await import('@/lib/apple-calendar');
    const { changed } = await syncAppleCalendar();
    return changed
      ? BackgroundFetch.BackgroundFetchResult.NewData
      : BackgroundFetch.BackgroundFetchResult.NoData;
  } catch (err) {
    console.error('Apple calendar background sync failed:', err);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});
