import { useCallback, useEffect, useRef, useState } from 'react';

import type { AIAnalysisResult } from '../../api/ai/types';
import {
  deleteDraft,
  deleteDraftPhoto,
  getDraftPhotos,
  putDraftPhoto,
  saveDraft,
  type ItemDraft,
} from '../../utils/assistantDb';
import { stripImageMetadata } from '../../utils/imageEditing';

export interface DraftPhotoView {
  id: string;
  name: string;
  blob: Blob;
  url: string;
}

const AUTOSAVE_DELAY_MS = 400;

export const createEmptyDraft = (
  userId: string,
  providerId: string
): ItemDraft => {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    userId,
    createdAt: now,
    updatedAt: now,
    photoIds: [],
    aiPhotoIds: [],
    previewPhotoId: null,
    parentFolder: null,
    folderName: '',
    result: null,
    apply: { title: true, description: true, tags: true },
    providerId,
  };
};

export const isDraftEmpty = (draft: ItemDraft) =>
  draft.photoIds.length === 0 &&
  !draft.result &&
  !draft.folderName.trim() &&
  !draft.parentFolder;

/**
 * State for the draft being edited. Metadata autosaves to IndexedDB; photos
 * are written once when added or edited.
 */
export const useItemDraft = () => {
  const [draft, setDraft] = useState<ItemDraft | null>(null);
  const [photos, setPhotos] = useState<DraftPhotoView[]>([]);
  const photosRef = useRef<DraftPhotoView[]>([]);

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  useEffect(() => {
    if (!draft || isDraftEmpty(draft)) return;
    const timeoutId = window.setTimeout(
      () => void saveDraft(draft),
      AUTOSAVE_DELAY_MS
    );
    return () => window.clearTimeout(timeoutId);
  }, [draft]);

  useEffect(
    () => () => {
      photosRef.current.forEach((photo) => URL.revokeObjectURL(photo.url));
    },
    []
  );

  const update = useCallback(
    (patch: (prev: ItemDraft) => Partial<ItemDraft>) =>
      setDraft((prev) =>
        prev ? { ...prev, ...patch(prev), updatedAt: Date.now() } : prev
      ),
    []
  );

  const releasePhotos = useCallback(() => {
    photosRef.current.forEach((photo) => URL.revokeObjectURL(photo.url));
    photosRef.current = [];
    setPhotos([]);
  }, []);

  const startDraft = useCallback(
    (next: ItemDraft) => {
      releasePhotos();
      setDraft(next);
    },
    [releasePhotos]
  );

  const openDraft = useCallback(
    async (stored: ItemDraft) => {
      releasePhotos();
      const storedPhotos = await getDraftPhotos(stored.id);
      const byId = new Map(storedPhotos.map((photo) => [photo.id, photo]));
      const views = stored.photoIds
        .map((id) => byId.get(id))
        .filter((photo) => Boolean(photo))
        .map((photo) => ({
          id: photo!.id,
          name: photo!.name,
          blob: photo!.blob,
          url: URL.createObjectURL(photo!.blob),
        }));
      const presentIds = new Set(views.map((view) => view.id));

      setPhotos(views);
      setDraft({
        ...stored,
        photoIds: stored.photoIds.filter((id) => presentIds.has(id)),
        aiPhotoIds: stored.aiPhotoIds.filter((id) => presentIds.has(id)),
      });
    },
    [releasePhotos]
  );

  /** Saves pending changes, or removes the draft if nothing was entered. */
  const close = useCallback(async () => {
    if (draft) {
      if (isDraftEmpty(draft)) {
        await deleteDraft(draft.id);
      } else {
        await saveDraft(draft);
      }
    }
    releasePhotos();
    setDraft(null);
  }, [draft, releasePhotos]);

  const discard = useCallback(async () => {
    if (draft) await deleteDraft(draft.id);
    releasePhotos();
    setDraft(null);
  }, [draft, releasePhotos]);

  const addFiles = useCallback(
    async (files: File[]) => {
      if (!draft) return;
      const draftId = draft.id;
      const sanitized = await Promise.all(
        files.map((file) => stripImageMetadata(file))
      );
      const views = sanitized.map((file) => ({
        id: crypto.randomUUID(),
        name: file.name,
        blob: file as Blob,
        url: URL.createObjectURL(file),
      }));

      await Promise.all(
        views.map((view) =>
          putDraftPhoto({
            id: view.id,
            draftId,
            blob: view.blob,
            name: view.name,
            createdAt: Date.now(),
          })
        )
      );

      setPhotos((prev) => [...prev, ...views]);
      update((prev) => ({
        photoIds: [...prev.photoIds, ...views.map((view) => view.id)],
        // Default: the first photo is used for both the AI and the preview.
        aiPhotoIds:
          prev.aiPhotoIds.length === 0 && views.length > 0
            ? [views[0].id]
            : prev.aiPhotoIds,
        previewPhotoId: prev.previewPhotoId ?? views[0]?.id ?? null,
      }));
    },
    [draft, update]
  );

  const removePhoto = useCallback(
    async (photoId: string) => {
      await deleteDraftPhoto(photoId);
      setPhotos((prev) => {
        const removed = prev.find((photo) => photo.id === photoId);
        if (removed) URL.revokeObjectURL(removed.url);
        return prev.filter((photo) => photo.id !== photoId);
      });
      update((prev) => {
        const photoIds = prev.photoIds.filter((id) => id !== photoId);
        const aiPhotoIds = prev.aiPhotoIds.filter((id) => id !== photoId);
        return {
          photoIds,
          aiPhotoIds:
            aiPhotoIds.length === 0 && photoIds.length > 0
              ? [photoIds[0]]
              : aiPhotoIds,
          previewPhotoId:
            prev.previewPhotoId === photoId
              ? (photoIds[0] ?? null)
              : prev.previewPhotoId,
        };
      });
    },
    [update]
  );

  const replacePhoto = useCallback(
    async (photoId: string, file: File) => {
      if (!draft) return;
      await putDraftPhoto({
        id: photoId,
        draftId: draft.id,
        blob: file,
        name: file.name,
        createdAt: Date.now(),
      });
      setPhotos((prev) =>
        prev.map((photo) => {
          if (photo.id !== photoId) return photo;
          URL.revokeObjectURL(photo.url);
          return {
            ...photo,
            blob: file,
            name: file.name,
            url: URL.createObjectURL(file),
          };
        })
      );
      update(() => ({}));
    },
    [draft, update]
  );

  const toggleAIPhoto = useCallback(
    (photoId: string) =>
      update((prev) => ({
        aiPhotoIds: prev.aiPhotoIds.includes(photoId)
          ? prev.aiPhotoIds.filter((id) => id !== photoId)
          : prev.photoIds.filter(
              (id) => id === photoId || prev.aiPhotoIds.includes(id)
            ),
      })),
    [update]
  );

  const setPreviewPhoto = useCallback(
    (photoId: string) => update(() => ({ previewPhotoId: photoId })),
    [update]
  );

  const setParentFolder = useCallback(
    (parentFolder: ItemDraft['parentFolder']) =>
      update(() => ({ parentFolder })),
    [update]
  );

  const setFolderName = useCallback(
    (folderName: string) => update(() => ({ folderName })),
    [update]
  );

  const setProviderId = useCallback(
    (providerId: string) => update(() => ({ providerId })),
    [update]
  );

  /** Stores a fresh AI result and uses its title as folder name if none is set. */
  const setResult = useCallback(
    (result: AIAnalysisResult) =>
      update((prev) => ({
        result,
        apply: { title: true, description: true, tags: true },
        folderName: prev.folderName.trim() ? prev.folderName : result.title,
      })),
    [update]
  );

  const editResult = useCallback(
    (patch: Partial<AIAnalysisResult>) =>
      update((prev) => ({
        result: {
          title: '',
          description: '',
          tags: [],
          ...prev.result,
          ...patch,
        },
      })),
    [update]
  );

  const clearResult = useCallback(
    () => update(() => ({ result: null })),
    [update]
  );

  const setApply = useCallback(
    (patch: Partial<ItemDraft['apply']>) =>
      update((prev) => ({ apply: { ...prev.apply, ...patch } })),
    [update]
  );

  return {
    draft,
    photos,
    startDraft,
    openDraft,
    close,
    discard,
    addFiles,
    removePhoto,
    replacePhoto,
    toggleAIPhoto,
    setPreviewPhoto,
    setParentFolder,
    setFolderName,
    setProviderId,
    setResult,
    editResult,
    clearResult,
    setApply,
  };
};
