import { useEffect, useState } from 'react';

import { uploadQueue, useUploadQueue } from '../api/google-drive/uploadQueue';
import type { UploadJob } from '../utils/assistantDb';

interface BatchSummary {
  batchId: string;
  label: string;
  total: number;
  done: number;
  failed: number;
  complete: boolean;
  jobs: UploadJob[];
}

const summarize = (jobs: UploadJob[]): BatchSummary[] => {
  const batches = new Map<string, UploadJob[]>();
  for (const job of jobs) {
    batches.set(job.batchId, [...(batches.get(job.batchId) ?? []), job]);
  }

  return [...batches.entries()].map(([batchId, batchJobs]) => {
    const files = batchJobs.filter((job) => job.kind === 'file');
    return {
      batchId,
      label: batchJobs[0].batchLabel,
      total: files.length,
      done: files.filter((job) => job.status === 'done').length,
      failed: batchJobs.filter((job) => job.status === 'error').length,
      complete: batchJobs.every((job) => job.status === 'done'),
      jobs: batchJobs,
    };
  });
};

/** One line explaining what a batch is doing (or why it isn't). */
const describeBatch = (
  batch: BatchSummary,
  authNeeded: boolean,
  now: number
): { text: string; tone: 'muted' | 'warning' | 'error' | 'success' } => {
  if (batch.complete) return { text: 'Uploaded', tone: 'success' };

  const failedJob = batch.jobs.find((job) => job.status === 'error');
  if (failedJob) {
    return { text: failedJob.error || 'Upload failed.', tone: 'error' };
  }
  if (authNeeded) {
    return { text: 'Waiting for Google Drive sign-in', tone: 'warning' };
  }

  const folder = batch.jobs.find((job) => job.kind === 'folder');
  if (batch.jobs.some((job) => job.status === 'uploading')) {
    return {
      text:
        folder?.status === 'uploading'
          ? 'Creating the folder…'
          : 'Uploading photos…',
      tone: 'muted',
    };
  }

  const waiting = batch.jobs
    .filter((job) => job.status === 'pending' && job.nextAttemptAt > now)
    .sort((a, b) => a.nextAttemptAt - b.nextAttemptAt)[0];
  if (waiting) {
    const seconds = Math.max(
      1,
      Math.ceil((waiting.nextAttemptAt - now) / 1000)
    );
    return {
      text: `Retrying in ${seconds}s (attempt ${waiting.attempts + 1})${
        waiting.error ? `: ${waiting.error}` : ''
      }`,
      tone: 'warning',
    };
  }

  if (folder && folder.status !== 'done') {
    return { text: 'Waiting to create the folder', tone: 'muted' };
  }
  return { text: 'Queued', tone: 'muted' };
};

const TONE_CLASS = {
  muted: 'opacity-70',
  warning: 'text-warning',
  error: 'text-error',
  success: 'text-success',
};

export default function UploadQueueIndicator() {
  const { jobs, authNeeded, authMessage } = useUploadQueue();
  const [expanded, setExpanded] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Tick while open so "retrying in Ns" counts down.
  useEffect(() => {
    if (!expanded) return;
    const intervalId = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, [expanded]);

  if (jobs.length === 0) return null;

  const batches = summarize(jobs);
  const totalFiles = batches.reduce((sum, batch) => sum + batch.total, 0);
  const doneFiles = batches.reduce((sum, batch) => sum + batch.done, 0);
  const failed = batches.reduce((sum, batch) => sum + batch.failed, 0);
  const allComplete = batches.every((batch) => batch.complete);

  let summary: string;
  let tone: string;
  if (authNeeded) {
    summary = 'Drive sign-in needed to continue uploads';
    tone = 'btn-warning';
  } else if (failed > 0) {
    summary = `${failed} upload${failed === 1 ? '' : 's'} failed`;
    tone = 'btn-error';
  } else if (allComplete) {
    summary = `All ${totalFiles} photos uploaded`;
    tone = 'btn-success';
  } else {
    summary = `Uploading photos ${doneFiles}/${totalFiles}`;
    tone = 'btn-neutral';
  }

  const handleAuthorize = async () => {
    setSigningIn(true);
    try {
      await uploadQueue.authorize();
    } catch {
      // The queue records the reason in authMessage, shown below.
    } finally {
      setSigningIn(false);
    }
  };

  const handleCancel = (batch: BatchSummary) => {
    if (
      window.confirm(
        `Stop uploading "${batch.label}"? Photos that haven't reached Drive yet won't be uploaded. If you haven't saved the item yet, its draft (with the photos) is still in the AI assistant.`
      )
    ) {
      void uploadQueue.discardBatch(batch.batchId);
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-[9000] flex flex-col items-end gap-2 max-w-[calc(100vw-2rem)]">
      {expanded && (
        <div className="w-80 max-w-full max-h-96 overflow-y-auto rounded-xl border border-base-300 bg-base-100 p-3 shadow-xl space-y-2 text-xs">
          {authNeeded && (
            <div className="space-y-1">
              <p>
                {authMessage ??
                  'Sign in to Google Drive to continue the uploads.'}{' '}
                Queued photos are kept until then.
              </p>
              <button
                type="button"
                className="btn btn-xs btn-warning"
                onClick={handleAuthorize}
                disabled={signingIn}
              >
                {signingIn ? 'Signing in…' : 'Sign in to Drive'}
              </button>
            </div>
          )}
          {batches.map((batch) => {
            const status = describeBatch(batch, authNeeded, now);
            return (
              <div
                key={batch.batchId}
                className="border border-base-300 rounded-lg p-2 space-y-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium truncate">📁 {batch.label}</span>
                  <span className="opacity-70 shrink-0">
                    {batch.done}/{batch.total}
                  </span>
                </div>
                <progress
                  className={`progress w-full ${
                    batch.failed > 0
                      ? 'progress-error'
                      : batch.complete
                        ? 'progress-success'
                        : 'progress-primary'
                  }`}
                  value={batch.done}
                  max={Math.max(batch.total, 1)}
                />
                <p className={`break-words ${TONE_CLASS[status.tone]}`}>
                  {status.text}
                </p>
                {!batch.complete && (
                  <div className="flex gap-1">
                    <button
                      type="button"
                      className="btn btn-xs"
                      onClick={() => void uploadQueue.retryBatch(batch.batchId)}
                      disabled={authNeeded}
                      title={
                        authNeeded ? 'Sign in to Drive first' : 'Retry now'
                      }
                    >
                      Retry now
                    </button>
                    <button
                      type="button"
                      className="btn btn-xs btn-ghost text-error"
                      onClick={() => handleCancel(batch)}
                    >
                      Cancel upload
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          {batches.some((batch) => batch.complete) && (
            <button
              type="button"
              className="btn btn-xs btn-ghost w-full"
              onClick={() => void uploadQueue.clearCompleted()}
            >
              Clear completed
            </button>
          )}
        </div>
      )}

      <button
        type="button"
        className={`btn btn-sm shadow-lg gap-2 ${tone}`}
        onClick={() => {
          setNow(Date.now());
          setExpanded((prev) => !prev);
        }}
        aria-expanded={expanded}
      >
        {!allComplete && !authNeeded && failed === 0 && (
          <span className="loading loading-spinner loading-xs" />
        )}
        {summary}
      </button>
    </div>
  );
}
