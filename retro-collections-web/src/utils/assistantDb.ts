import { openDB, type DBSchema } from 'idb';

import type { AIAnalysisResult } from '../api/ai/types';

export interface DraftPhoto {
  id: string;
  draftId: string;
  blob: Blob;
  name: string;
  createdAt: number;
}

export interface ItemDraft {
  id: string;
  userId: string;
  createdAt: number;
  updatedAt: number;
  /** Photo ids in display order. */
  photoIds: string[];
  /** Photos sent to the AI. */
  aiPhotoIds: string[];
  previewPhotoId: string | null;
  parentFolder: { id: string; name: string } | null;
  folderName: string;
  result: AIAnalysisResult | null;
  apply: { title: boolean; description: boolean; tags: boolean };
  providerId: string;
  /**
   * Set once the draft has been applied to the item form. The draft is kept
   * until the item is actually saved, so a reload before saving loses
   * nothing; re-applying reuses these uploads instead of queueing them again.
   */
  applied?: AppliedDraft;
}

export interface AppliedDraft {
  appliedAt: number;
  /** Upload batch in the queue, if photos were sent to Drive. */
  batchId: string | null;
  folder: { id: string; name: string } | null;
  preview: { id: string; name: string } | null;
}

export type UploadJobStatus = 'pending' | 'uploading' | 'done' | 'error';

export interface UploadJob {
  id: string;
  userId: string;
  batchId: string;
  /** Folder name shown in the queue UI. */
  batchLabel: string;
  kind: 'folder' | 'file';
  /** Drive id reserved up front with files.generateIds. */
  driveId: string;
  parentDriveId: string;
  name: string;
  /** Job that must finish first (the folder, for its files). */
  dependsOnJobId?: string;
  blob?: Blob;
  mimeType?: string;
  size: number;
  status: UploadJobStatus;
  attempts: number;
  nextAttemptAt: number;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

interface AssistantDB extends DBSchema {
  drafts: { key: string; value: ItemDraft; indexes: { userId: string } };
  draftPhotos: { key: string; value: DraftPhoto; indexes: { draftId: string } };
  uploadJobs: { key: string; value: UploadJob; indexes: { userId: string } };
}

const dbPromise = openDB<AssistantDB>('rc-item-assistant', 1, {
  upgrade(db) {
    db.createObjectStore('drafts', { keyPath: 'id' }).createIndex(
      'userId',
      'userId'
    );
    db.createObjectStore('draftPhotos', { keyPath: 'id' }).createIndex(
      'draftId',
      'draftId'
    );
    db.createObjectStore('uploadJobs', { keyPath: 'id' }).createIndex(
      'userId',
      'userId'
    );
  },
});

/* ---------------- DRAFTS ---------------- */

const draftListeners = new Set<() => void>();
const notifyDrafts = () => draftListeners.forEach((listener) => listener());

/** Called whenever a draft is saved or deleted (e.g. to refresh counts). */
export const onDraftsChanged = (listener: () => void) => {
  draftListeners.add(listener);
  return () => {
    draftListeners.delete(listener);
  };
};

export const listDrafts = async (userId: string) => {
  const db = await dbPromise;
  const drafts = await db.getAllFromIndex('drafts', 'userId', userId);
  return drafts.sort((a, b) => b.updatedAt - a.updatedAt);
};

export const saveDraft = async (draft: ItemDraft) => {
  const db = await dbPromise;
  await db.put('drafts', draft);
  notifyDrafts();
};

export const getDraftPhotos = async (draftId: string) => {
  const db = await dbPromise;
  return db.getAllFromIndex('draftPhotos', 'draftId', draftId);
};

export const putDraftPhoto = async (photo: DraftPhoto) => {
  const db = await dbPromise;
  await db.put('draftPhotos', photo);
};

export const deleteDraftPhoto = async (photoId: string) => {
  const db = await dbPromise;
  await db.delete('draftPhotos', photoId);
};

export const deleteDraft = async (draftId: string) => {
  const db = await dbPromise;
  const tx = db.transaction(['drafts', 'draftPhotos'], 'readwrite');
  const photoKeys = await tx
    .objectStore('draftPhotos')
    .index('draftId')
    .getAllKeys(draftId);
  await Promise.all([
    tx.objectStore('drafts').delete(draftId),
    ...photoKeys.map((key) => tx.objectStore('draftPhotos').delete(key)),
    tx.done,
  ]);
  notifyDrafts();
};

/* ---------------- UPLOAD JOBS ---------------- */

export const listUploadJobs = async (userId: string) => {
  const db = await dbPromise;
  return db.getAllFromIndex('uploadJobs', 'userId', userId);
};

export const putUploadJobs = async (jobs: UploadJob[]) => {
  const db = await dbPromise;
  const tx = db.transaction('uploadJobs', 'readwrite');
  await Promise.all([...jobs.map((job) => tx.store.put(job)), tx.done]);
};

export const deleteUploadJobs = async (jobIds: string[]) => {
  const db = await dbPromise;
  const tx = db.transaction('uploadJobs', 'readwrite');
  await Promise.all([...jobIds.map((id) => tx.store.delete(id)), tx.done]);
};

export const getDraftPhoto = async (photoId: string) => {
  const db = await dbPromise;
  return db.get('draftPhotos', photoId);
};
