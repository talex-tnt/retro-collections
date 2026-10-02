/**
 * Background Drive upload queue.
 *
 * Jobs are persisted in IndexedDB so uploads survive reloads, and every
 * folder/file id is reserved up front (files.generateIds). That lets the item
 * be saved immediately with its final Drive ids, and makes retries
 * idempotent: if a retry finds the id already exists, the upload succeeded.
 */
import { useSyncExternalStore } from 'react';

import {
  deleteUploadJobs,
  listUploadJobs,
  putUploadJobs,
  type UploadJob,
} from '../../utils/assistantDb';
import {
  DriveRequestError,
  createDriveFolderWithId,
  driveFileExists,
  uploadDriveFileWithId,
} from './driveUploadRest';
import {
  clearDriveWriteToken,
  getDriveWriteToken,
  requestDriveWriteToken,
} from './googleDriveAuthWrite';

const CONCURRENCY = 3;
const MAX_ATTEMPTS = 6;
const COMPLETED_BATCH_TTL_MS = 24 * 60 * 60 * 1000;

export interface UploadQueueState {
  userId: string | null;
  jobs: UploadJob[];
  /** Drive token missing or expired; uploads resume after the user re-authorizes. */
  authNeeded: boolean;
}

let state: UploadQueueState = { userId: null, jobs: [], authNeeded: false };
const listeners = new Set<() => void>();
const inFlight = new Set<string>();
const localUrls = new Map<string, string>();
let retryTimer: number | undefined;
let startingFor: string | null = null;
let windowListenersAttached = false;

const emit = () => listeners.forEach((listener) => listener());

/* ---------------- SCREEN WAKE LOCK ---------------- */

// Keeps a phone from auto-locking (which freezes the page) while uploads run.
// Browsers drop the lock when the page is hidden; it is re-requested on return.
let wakeLock: WakeLockSentinel | null = null;
let wakeLockPending = false;

const hasActiveWork = () =>
  Boolean(state.userId) &&
  !state.authNeeded &&
  state.jobs.some(
    (job) => job.status === 'pending' || job.status === 'uploading'
  );

const syncWakeLock = () => {
  if (!('wakeLock' in navigator)) return;

  if (!hasActiveWork()) {
    if (wakeLock) {
      void wakeLock.release().catch(() => undefined);
      wakeLock = null;
    }
    return;
  }

  if (wakeLock || wakeLockPending || document.visibilityState !== 'visible') {
    return;
  }

  wakeLockPending = true;
  navigator.wakeLock
    .request('screen')
    .then((sentinel) => {
      wakeLock = sentinel;
      sentinel.addEventListener('release', () => {
        if (wakeLock === sentinel) wakeLock = null;
      });
      // Work may have finished while the request was pending.
      syncWakeLock();
    })
    .catch(() => {
      // Denied (e.g. battery saver); uploads still resume when visible.
    })
    .finally(() => {
      wakeLockPending = false;
    });
};

const setState = (patch: Partial<UploadQueueState>) => {
  state = { ...state, ...patch };
  emit();
  syncWakeLock();
};

const updateJob = async (jobId: string, patch: Partial<UploadJob>) => {
  let updated: UploadJob | undefined;
  const jobs = state.jobs.map((job) => {
    if (job.id !== jobId) return job;
    updated = { ...job, ...patch, updatedAt: Date.now() };
    return updated;
  });
  setState({ jobs });
  if (updated) {
    await putUploadJobs([updated]);
  }
};

const isRetryable = (error: unknown) => {
  if (!(error instanceof DriveRequestError)) {
    // fetch rejects with a TypeError on network failures.
    return true;
  }
  if (error.status === 429 || error.status >= 500) return true;
  return error.status === 403 && /rate|quota/i.test(error.message);
};

const backoffMs = (attempts: number) =>
  Math.min(60_000, 2_000 * 2 ** (attempts - 1));

const scheduleRetry = () => {
  window.clearTimeout(retryTimer);
  const waiting = state.jobs
    .filter((job) => job.status === 'pending' && job.nextAttemptAt > Date.now())
    .map((job) => job.nextAttemptAt);
  if (waiting.length > 0) {
    retryTimer = window.setTimeout(
      kick,
      Math.max(0, Math.min(...waiting) - Date.now())
    );
  }
};

const runJob = async (job: UploadJob, token: string) => {
  inFlight.add(job.id);
  await updateJob(job.id, { status: 'uploading' });

  try {
    // A previous attempt may have succeeded without us seeing the response.
    const alreadyExists =
      job.attempts > 0 && (await driveFileExists(token, job.driveId));

    if (!alreadyExists) {
      if (job.kind === 'folder') {
        await createDriveFolderWithId(token, {
          id: job.driveId,
          name: job.name,
          parentId: job.parentDriveId,
        });
      } else {
        if (!job.blob) throw new Error('The photo is no longer available.');
        await uploadDriveFileWithId(token, {
          id: job.driveId,
          name: job.name,
          parentId: job.parentDriveId,
          blob: job.blob,
        });
      }
    }

    await updateJob(job.id, {
      status: 'done',
      blob: undefined,
      error: undefined,
    });
  } catch (error) {
    if (error instanceof DriveRequestError && error.status === 401) {
      clearDriveWriteToken();
      await updateJob(job.id, { status: 'pending' });
      setState({ authNeeded: true });
      return;
    }

    if (
      error instanceof DriveRequestError &&
      (error.status === 400 || error.status === 409) &&
      (await driveFileExists(token, job.driveId).catch(() => false))
    ) {
      await updateJob(job.id, { status: 'done', blob: undefined });
      return;
    }

    const attempts = job.attempts + 1;
    const message = (error as Error)?.message || 'Upload failed.';

    if (isRetryable(error) && attempts < MAX_ATTEMPTS) {
      await updateJob(job.id, {
        status: 'pending',
        attempts,
        nextAttemptAt: Date.now() + backoffMs(attempts),
        error: message,
      });
    } else {
      await updateJob(job.id, { status: 'error', attempts, error: message });
    }
  } finally {
    inFlight.delete(job.id);
    kick();
  }
};

function kick() {
  if (!state.userId || state.authNeeded || !navigator.onLine) return;

  const token = getDriveWriteToken();
  const hasPending = state.jobs.some((job) => job.status === 'pending');
  if (!token) {
    if (hasPending) setState({ authNeeded: true });
    return;
  }

  const doneIds = new Set(
    state.jobs.filter((job) => job.status === 'done').map((job) => job.id)
  );
  const now = Date.now();

  for (const job of state.jobs) {
    if (inFlight.size >= CONCURRENCY) break;
    if (
      job.status !== 'pending' ||
      inFlight.has(job.id) ||
      job.nextAttemptAt > now ||
      (job.dependsOnJobId && !doneIds.has(job.dependsOnJobId))
    ) {
      continue;
    }
    void runJob(job, token);
  }

  scheduleRetry();
}

const attachWindowListeners = () => {
  if (windowListenersAttached) return;
  windowListenersAttached = true;

  window.addEventListener('online', kick);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    // Back from a locked screen or another app: retry now instead of waiting
    // out a backoff that mostly accumulated while the page was frozen.
    setState({
      jobs: state.jobs.map((job) =>
        job.status === 'pending' ? { ...job, nextAttemptAt: 0 } : job
      ),
    });
    kick();
  });
  window.addEventListener('beforeunload', (event) => {
    // Pending jobs resume on the next visit; only warn about live transfers.
    if (inFlight.size > 0) {
      event.preventDefault();
    }
  });
};

const sortJobs = (jobs: UploadJob[]) =>
  [...jobs].sort((a, b) => a.createdAt - b.createdAt);

export const uploadQueue = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  getSnapshot: () => state,

  async start(userId: string) {
    if (state.userId === userId || startingFor === userId) return;
    startingFor = userId;
    attachWindowListeners();

    const stored = await listUploadJobs(userId).finally(() => {
      startingFor = null;
    });
    const now = Date.now();
    const staleBatchIds = new Set<string>();

    const byBatch = new Map<string, UploadJob[]>();
    for (const job of stored) {
      byBatch.set(job.batchId, [...(byBatch.get(job.batchId) ?? []), job]);
    }
    for (const [batchId, jobs] of byBatch) {
      const allDone = jobs.every((job) => job.status === 'done');
      const lastUpdate = Math.max(...jobs.map((job) => job.updatedAt));
      if (allDone && now - lastUpdate > COMPLETED_BATCH_TTL_MS) {
        staleBatchIds.add(batchId);
      }
    }

    const staleIds = stored
      .filter((job) => staleBatchIds.has(job.batchId))
      .map((job) => job.id);
    if (staleIds.length > 0) await deleteUploadJobs(staleIds);

    // Uploads interrupted by a reload start over.
    const jobs = stored
      .filter((job) => !staleBatchIds.has(job.batchId))
      .map((job) =>
        job.status === 'uploading'
          ? { ...job, status: 'pending' as const }
          : job
      );

    setState({ userId, jobs: sortJobs(jobs), authNeeded: false });
    kick();
  },

  stop() {
    window.clearTimeout(retryTimer);
    setState({ userId: null, jobs: [], authNeeded: false });
  },

  async enqueue(jobs: UploadJob[]) {
    await putUploadJobs(jobs);
    setState({ jobs: sortJobs([...state.jobs, ...jobs]) });
    kick();
  },

  /** Must be called from a click handler: it may open the Google popup. */
  async authorize() {
    await requestDriveWriteToken();
    setState({ authNeeded: false });
    kick();
  },

  async retryBatch(batchId: string) {
    const jobs = state.jobs.filter(
      (job) => job.batchId === batchId && job.status === 'error'
    );
    for (const job of jobs) {
      await updateJob(job.id, {
        status: 'pending',
        nextAttemptAt: 0,
        // Keep at least one attempt so the existence check runs first.
        attempts: Math.min(job.attempts, 1),
        error: undefined,
      });
    }
    kick();
  },

  async discardBatch(batchId: string) {
    const ids = state.jobs
      .filter((job) => job.batchId === batchId && !inFlight.has(job.id))
      .map((job) => job.id);
    await deleteUploadJobs(ids);
    setState({ jobs: state.jobs.filter((job) => !ids.includes(job.id)) });
  },

  async clearCompleted() {
    const batchIds = new Set(state.jobs.map((job) => job.batchId));
    const completed = [...batchIds].filter((batchId) =>
      state.jobs
        .filter((job) => job.batchId === batchId)
        .every((job) => job.status === 'done')
    );
    const ids = state.jobs
      .filter((job) => completed.includes(job.batchId))
      .map((job) => job.id);
    await deleteUploadJobs(ids);
    setState({ jobs: state.jobs.filter((job) => !ids.includes(job.id)) });
  },

  /** Local object URL for a photo still queued (or uploaded this session). */
  getLocalImageUrl(driveId: string | undefined) {
    if (!driveId) return undefined;
    const cached = localUrls.get(driveId);
    if (cached) return cached;

    const job = state.jobs.find(
      (item) => item.kind === 'file' && item.driveId === driveId && item.blob
    );
    if (!job?.blob) return undefined;

    const url = URL.createObjectURL(job.blob);
    localUrls.set(driveId, url);
    return url;
  },
};

export const useUploadQueue = () =>
  useSyncExternalStore(uploadQueue.subscribe, uploadQueue.getSnapshot);

export const useQueuedImageUrl = (driveId: string | undefined) =>
  useSyncExternalStore(uploadQueue.subscribe, () =>
    uploadQueue.getLocalImageUrl(driveId)
  );
