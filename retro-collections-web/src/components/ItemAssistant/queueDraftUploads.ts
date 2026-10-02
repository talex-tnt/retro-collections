import type {
  AISettings,
  DriveImageMode,
} from '../../api/firestore/services/private/aiSettings';
import {
  generateDriveIds,
  listChildFolderNames,
} from '../../api/google-drive/driveUploadRest';
import { uploadQueue } from '../../api/google-drive/uploadQueue';
import type { ItemDraft, UploadJob } from '../../utils/assistantDb';
import { setDiskBlob, setMemoryBlob } from '../../utils/driveImageCache';
import { extensionForType, resizeImage } from '../../utils/imageResize';

export interface QueuedPhoto {
  id: string;
  blob: Blob;
  name: string;
}

/** Appends " - 1", " - 2"... until the name is free (case-insensitive). */
export const uniqueFolderName = (name: string, existing: string[]) => {
  const taken = new Set(existing.map((item) => item.trim().toLowerCase()));
  const base = name.trim() || 'New item';
  let candidate = base;
  for (let counter = 1; taken.has(candidate.toLowerCase()); counter += 1) {
    candidate = `${base} - ${counter}`;
  }
  return candidate;
};

const prepareBlob = async (
  blob: Blob,
  mode: DriveImageMode,
  maxSize: number
) => {
  if (mode !== 'resized') return blob;
  return resizeImage(blob, {
    maxSize,
    type: blob.type === 'image/png' ? 'image/png' : 'image/jpeg',
    quality: 0.9,
    skipIfSmaller: true,
  });
};

/**
 * Reserves Drive ids for the folder and photos, queues the uploads and returns
 * the ids so the item can be saved right away. The caller must already hold a
 * Drive write token (obtained from the click that triggered this).
 */
export const queueDraftUploads = async ({
  token,
  userId,
  draft,
  photos,
  settings,
}: {
  token: string;
  userId: string;
  draft: ItemDraft;
  photos: QueuedPhoto[];
  settings: Pick<AISettings, 'driveImageMode' | 'driveImageMaxSize'>;
}) => {
  const parent = draft.parentFolder;
  if (!parent) throw new Error('Choose a Drive folder first.');

  const [existingNames, ids] = await Promise.all([
    listChildFolderNames(token, parent.id),
    generateDriveIds(token, photos.length + 1),
  ]);
  const folderName = uniqueFolderName(draft.folderName, existingNames);
  const [folderDriveId, ...photoDriveIds] = ids;

  const previewPhotoId = draft.previewPhotoId ?? photos[0]?.id;
  const ordered = [
    ...photos.filter((photo) => photo.id === previewPhotoId),
    ...photos.filter((photo) => photo.id !== previewPhotoId),
  ];

  const now = Date.now();
  const batchId = crypto.randomUUID();
  const folderJob: UploadJob = {
    id: crypto.randomUUID(),
    userId,
    batchId,
    batchLabel: folderName,
    kind: 'folder',
    driveId: folderDriveId,
    parentDriveId: parent.id,
    name: folderName,
    size: 0,
    status: 'pending',
    attempts: 0,
    nextAttemptAt: 0,
    createdAt: now,
    updatedAt: now,
  };

  const fileJobs: UploadJob[] = [];
  let preview: { id: string; name: string } | null = null;

  for (const [index, photo] of ordered.entries()) {
    const blob = await prepareBlob(
      photo.blob,
      settings.driveImageMode,
      settings.driveImageMaxSize
    );
    const extension = extensionForType(blob.type, photo.name);
    const isPreview = photo.id === previewPhotoId;
    const name = isPreview
      ? `Preview.${extension}`
      : `IMG_${String(index).padStart(3, '0')}.${extension}`;
    const driveId = photoDriveIds[index];

    if (isPreview) preview = { id: driveId, name };

    // Let the full-size viewer show the photo before the upload finishes.
    setMemoryBlob(driveId, blob);
    void setDiskBlob(driveId, blob);

    fileJobs.push({
      id: crypto.randomUUID(),
      userId,
      batchId,
      batchLabel: folderName,
      kind: 'file',
      driveId,
      parentDriveId: folderDriveId,
      name,
      dependsOnJobId: folderJob.id,
      blob,
      mimeType: blob.type,
      size: blob.size,
      status: 'pending',
      attempts: 0,
      nextAttemptAt: 0,
      createdAt: now + index + 1,
      updatedAt: now,
    });
  }

  await uploadQueue.enqueue([folderJob, ...fileJobs]);

  return { folder: { id: folderDriveId, name: folderName }, preview };
};
