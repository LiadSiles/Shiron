import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { startBackgroundWork, stopBackgroundWork } from '../../modules/shiron-audio';
import { diag } from '../diag/log';
import { onImportState } from './ingest';
import { onProcessorState, processQueue } from './processor';

/**
 * New songs keep being saved and processed after she leaves the app (owner request, 0.6.0):
 *
 * 1. While there is work (saving a share, converting, naming), `keepWorkingInBackground()` keeps the app
 *    running: on Android a foreground service with a quiet notification; on iPhone the extra
 *    ~30 s iOS grants, enough to finish the song in hand.
 * 2. Whatever is left is picked up by a background task the system runs from time to time
 *    (expo-background-task: Android WorkManager, iOS BGTaskScheduler — at the system's choice,
 *    every 15 minutes at best, on iPhone often later), and in any case when she opens the app.
 */

/**
 * Keeps the app running while songs are being saved or processed: watches the import and
 * processor state, so neither module needs to know about it.
 */
let keeping = false;

export function keepWorkingInBackground(): void {
  if (keeping) return;
  keeping = true;
  let saving = false;
  let processing = false;
  let active = false;
  const update = () => {
    const want = saving || processing;
    if (want === active) return;
    active = want;
    try {
      if (want) startBackgroundWork('שירון מכינה שירים חדשים…');
      else stopBackgroundWork();
    } catch (e) {
      diag('background work unavailable', e);
    }
  };
  onImportState((s) => {
    saving = s.saving;
    update();
  });
  onProcessorState((s) => {
    processing = s.running;
    update();
  });
}

const TASK = 'shiron-process-songs';

// Must be defined at module scope, so the system can run it without the app's screens.
TaskManager.defineTask(TASK, async () => {
  try {
    await processQueue();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (e) {
    diag('background task failed', e);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

/** Called once at start-up; the task does nothing when every song is already processed. */
export async function registerBackgroundProcessing(): Promise<void> {
  try {
    const status = await BackgroundTask.getStatusAsync();
    if (status !== BackgroundTask.BackgroundTaskStatus.Available) {
      diag('background task unavailable', String(status));
      return;
    }
    if (!(await TaskManager.isTaskRegisteredAsync(TASK))) {
      await BackgroundTask.registerTaskAsync(TASK, { minimumInterval: 15 });
    }
  } catch (e) {
    diag('background task registration failed', e);
  }
}
