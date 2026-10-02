import { useState } from 'react';

import { uploadQueue, useUploadQueue } from '../api/google-drive/uploadQueue';
import type { UploadJob } from '../utils/assistantDb';

interface BatchSummary {
  batchId: string;
  label: string;
  total: number;
  done: number;
  failed: number;
  uploading: boolean;
  error?: string;
}

const summarize = (jobs: UploadJob[]): BatchSummary[] => {
  const batches = new Map<string, UploadJob[]>();
  for (const job of jobs) {
    batches.set(job.batchId, [...(batches.get(job.batchId) ?? []), job]);
  }

  return [...batches.entries()].map(([batchId, batchJobs]) => {
    const files = batchJobs.filter((job) => job.kind === 'file');
    const failedJobs = batchJobs.filter((job) => job.status === 'error');
    return {
      batchId,
      label: batchJobs[0].batchLabel,
      total: files.length,
      done: files.filter((job) => job.status === 'done').length,
      failed: failedJobs.length,
      uploading: batchJobs.some((job) => job.status === 'uploading'),
      error: failedJobs[0]?.error,
    };
  });
};

const isBatchComplete = (batch: BatchSummary, jobs: UploadJob[]) =>
  jobs
    .filter((job) => job.batchId === batch.batchId)
    .every((job) => job.status === 'done');

export default function UploadQueueIndicator() {
  const { jobs, authNeeded } = useUploadQueue();
  const [expanded, setExpanded] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  if (jobs.length === 0) return null;

  const batches = summarize(jobs);
  const totalFiles = batches.reduce((sum, batch) => sum + batch.total, 0);
  const doneFiles = batches.reduce((sum, batch) => sum + batch.done, 0);
  const failed = batches.reduce((sum, batch) => sum + batch.failed, 0);
  const allComplete = batches.every((batch) => isBatchComplete(batch, jobs));

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
    setAuthError(null);
    try {
      await uploadQueue.authorize();
    } catch (error) {
      setAuthError(String((error as Error)?.message ?? error));
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-[9000] flex flex-col items-end gap-2 max-w-[calc(100vw-2rem)]">
      {expanded && (
        <div className="w-80 max-w-full max-h-80 overflow-y-auto rounded-xl border border-base-300 bg-base-100 p-3 shadow-xl space-y-2 text-xs">
          {authNeeded && (
            <div className="space-y-1">
              <p>
                Your Google Drive session expired. Queued photos are kept and
                upload once you sign in again.
              </p>
              <button
                type="button"
                className="btn btn-xs btn-warning"
                onClick={handleAuthorize}
              >
                Sign in to Drive
              </button>
              {authError && <p className="text-error">{authError}</p>}
            </div>
          )}
          {batches.map((batch) => {
            const complete = isBatchComplete(batch, jobs);
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
                      : complete
                        ? 'progress-success'
                        : 'progress-primary'
                  }`}
                  value={batch.done}
                  max={Math.max(batch.total, 1)}
                />
                {batch.error && (
                  <p className="text-error break-words">{batch.error}</p>
                )}
                {batch.failed > 0 && (
                  <div className="flex gap-1">
                    <button
                      type="button"
                      className="btn btn-xs"
                      onClick={() => void uploadQueue.retryBatch(batch.batchId)}
                    >
                      Retry
                    </button>
                    <button
                      type="button"
                      className="btn btn-xs btn-ghost text-error"
                      onClick={() => {
                        if (
                          window.confirm(
                            `Stop uploading "${batch.label}"? Photos not yet uploaded will be lost.`
                          )
                        ) {
                          void uploadQueue.discardBatch(batch.batchId);
                        }
                      }}
                    >
                      Discard
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          {batches.some((batch) => isBatchComplete(batch, jobs)) && (
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
        onClick={() => setExpanded((prev) => !prev)}
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
