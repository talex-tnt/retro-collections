import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';

import { analyzeImages, getPreset } from '../../api/ai';
import { useGetPublicUserTagsQuery } from '../../api/firestore/firestoreApi';
import {
  getDriveWriteToken,
  requestDriveWriteToken,
} from '../../api/google-drive/googleDriveAuthWrite';
import { useAISettings } from '../../hooks';
import {
  deleteDraft,
  listDrafts,
  type ItemDraft,
} from '../../utils/assistantDb';
import { useCurrentUser } from '../../utils/hooks';
import { blobToBase64, resizeImage } from '../../utils/imageResize';
import DriveFolderModal from '../DriveFolderModal';
import { PhotoEditorModal } from '../PhotoEditorModal';
import TagBadge from '../TagBadge';
import DraftList from './DraftList';
import PhotoStrip from './PhotoStrip';
import { queueDraftUploads, uniqueFolderName } from './queueDraftUploads';
import { createEmptyDraft, useItemDraft } from './useItemDraft';

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const EMPTY_TAG_STYLE = {
  backgroundColor: null,
  foregroundColor: null,
  imageUrl: null,
};

export interface ItemAssistantResult {
  title?: string;
  description?: string;
  tags?: string[];
  uploadedFolderId?: { id: string; name: string };
  fallbackPreview?: { id: string; name: string };
}

interface ItemAssistantProps {
  currentTags?: string[];
  onApply: (result: ItemAssistantResult) => void;
}

const errorText = (error: unknown) =>
  (error as { message?: string })?.message || 'Something went wrong.';

export function ItemAssistant({
  currentTags = [],
  onApply,
}: ItemAssistantProps) {
  const user = useCurrentUser();
  const userId = user?.uid ?? '';
  const { settings, keys } = useAISettings();
  const { data: userTags = [] } = useGetPublicUserTagsQuery(
    { userId },
    { skip: !userId }
  );
  const editor = useItemDraft();
  const { draft, photos } = editor;

  const [isOpen, setIsOpen] = useState(false);
  const [drafts, setDrafts] = useState<ItemDraft[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingPhotoId, setEditingPhotoId] = useState<string | null>(null);
  const [isDriveOpen, setIsDriveOpen] = useState(false);
  const [siblingFolderNames, setSiblingFolderNames] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!userId) return;
    void listDrafts(userId).then(setDrafts);
  }, [userId]);

  const refreshDrafts = async () => setDrafts(await listDrafts(userId));

  const busy = isImporting || isAnalyzing || isApplying;
  const providers = settings.providers;
  const activeProvider =
    providers.find((provider) => provider.id === draft?.providerId) ??
    providers.find((provider) => provider.id === settings.defaultProviderId) ??
    providers[0];

  const styleMap = Object.fromEntries(
    userTags.map((tag) => [
      tag.id,
      {
        backgroundColor: tag.style?.backgroundColor || null,
        foregroundColor: tag.style?.foregroundColor || null,
        imageUrl: (tag.style as { imageUrl?: string | null })?.imageUrl || null,
      },
    ])
  );

  const startNewDraft = () => {
    setError(null);
    setSiblingFolderNames([]);
    editor.startDraft(createEmptyDraft(userId, settings.defaultProviderId));
  };

  const handleOpen = async () => {
    setError(null);
    setIsOpen(true);
    const list = await listDrafts(userId);
    setDrafts(list);
    if (list.length === 0) startNewDraft();
  };

  const handleClose = async () => {
    abortRef.current?.abort();
    await editor.close();
    setIsOpen(false);
    await refreshDrafts();
  };

  const handleBackToDrafts = async () => {
    abortRef.current?.abort();
    await editor.close();
    setError(null);
    await refreshDrafts();
  };

  const handleDiscard = async () => {
    if (!window.confirm('Discard this draft and its photos?')) return;
    abortRef.current?.abort();
    await editor.discard();
    setIsOpen(false);
    await refreshDrafts();
  };

  const handleAddFiles = async (files: File[]) => {
    setError(null);
    setIsImporting(true);
    try {
      await editor.addFiles(files);
    } catch (err) {
      setError(`Could not load the photos: ${errorText(err)}`);
    } finally {
      setIsImporting(false);
    }
  };

  const handleRemovePhoto = (photoId: string) => {
    void editor.removePhoto(photoId);
  };

  const handleAnalyze = async () => {
    if (!draft) return;
    setError(null);

    if (!activeProvider) {
      setError('Add an AI provider in Settings first.');
      return;
    }
    const apiKey = keys[activeProvider.id] ?? '';
    if (getPreset(activeProvider.preset).requiresKey && !apiKey) {
      setError(
        settings.keyStorage === 'account'
          ? `No API key saved for ${activeProvider.label}. Add it in Settings.`
          : `No API key for ${activeProvider.label} in this browser. Add it in Settings.`
      );
      return;
    }
    const selected = photos.filter((photo) =>
      draft.aiPhotoIds.includes(photo.id)
    );
    if (selected.length === 0) {
      setError('Select at least one photo for the AI.');
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setIsAnalyzing(true);

    try {
      const images = await Promise.all(
        selected.map(async (photo) => ({
          mimeType: 'image/jpeg',
          base64: await blobToBase64(
            await resizeImage(photo.blob, { maxSize: settings.aiImageMaxSize })
          ),
        }))
      );

      const result = await analyzeImages(
        { config: activeProvider, apiKey, signal: controller.signal },
        {
          images,
          inputTags: currentTags,
          knownTags: userTags.map((tag) => tag.id),
          extraInstructions: settings.extraInstructions,
        }
      );
      editor.setResult(result);
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(errorText(err));
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setIsAnalyzing(false);
    }
  };

  const handleApply = async () => {
    if (!draft) return;
    setError(null);

    const willUpload = photos.length > 0 && Boolean(draft.parentFolder);
    if (
      photos.length > 0 &&
      !draft.parentFolder &&
      !window.confirm(
        'No Drive folder selected, so the photos will not be uploaded and will be discarded. Apply anyway?'
      )
    ) {
      return;
    }

    setIsApplying(true);
    try {
      const result = draft.result;
      const payload: ItemAssistantResult = {};
      if (result && draft.apply.title && result.title) {
        payload.title = result.title;
      }
      if (result && draft.apply.description && result.description) {
        payload.description = result.description;
      }
      if (result && draft.apply.tags && result.tags.length > 0) {
        payload.tags = result.tags;
      }

      if (willUpload) {
        // Ask for the token first: the Google popup needs this click.
        const token = getDriveWriteToken() ?? (await requestDriveWriteToken());
        const { folder, preview } = await queueDraftUploads({
          token,
          userId,
          draft,
          photos,
          settings,
        });
        payload.uploadedFolderId = folder;
        if (preview) payload.fallbackPreview = preview;
      }

      onApply(payload);
      await editor.discard();
      setIsOpen(false);
      await refreshDrafts();
    } catch (err) {
      setError(`Could not queue the upload: ${errorText(err)}`);
    } finally {
      setIsApplying(false);
    }
  };

  const editingPhoto = photos.find((photo) => photo.id === editingPhotoId);
  const folderName = draft?.folderName.trim() ?? '';
  const finalFolderName = folderName
    ? uniqueFolderName(folderName, siblingFolderNames)
    : '';

  const renderEditor = () => {
    if (!draft) return null;
    const result = draft.result;

    return (
      <div className="space-y-4">
        <section className="space-y-1">
          <h4 className="text-xs font-semibold opacity-80">1. Photos</h4>
          <PhotoStrip
            photos={photos}
            aiPhotoIds={draft.aiPhotoIds}
            previewPhotoId={draft.previewPhotoId}
            isImporting={isImporting}
            disabled={isAnalyzing || isApplying}
            onAddFiles={handleAddFiles}
            onEdit={setEditingPhotoId}
            onRemove={handleRemovePhoto}
            onToggleAI={editor.toggleAIPhoto}
            onSetPreview={editor.setPreviewPhoto}
          />
        </section>

        <section className="space-y-2 bg-base-100/40 border border-base-300 rounded-lg p-3">
          <h4 className="text-xs font-semibold opacity-80">
            2. AI suggestions (optional)
          </h4>
          {providers.length === 0 ? (
            <p className="text-xs">
              No AI provider configured.{' '}
              <Link to="/settings" className="link link-primary">
                Add one in Settings
              </Link>{' '}
              (Gemini, Groq and OpenRouter have free tiers).
            </p>
          ) : (
            <div className="flex flex-col sm:flex-row gap-2">
              <select
                className="select select-sm select-bordered flex-1"
                value={activeProvider?.id ?? ''}
                onChange={(event) => editor.setProviderId(event.target.value)}
                disabled={busy}
              >
                {providers.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.label} · {provider.model || 'no model'}
                  </option>
                ))}
              </select>
              {isAnalyzing ? (
                <button
                  type="button"
                  className="btn btn-sm btn-outline"
                  onClick={() => abortRef.current?.abort()}
                >
                  <span className="loading loading-spinner loading-xs" />
                  Cancel
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={handleAnalyze}
                  disabled={busy || draft.aiPhotoIds.length === 0}
                >
                  {result ? 'Analyze again' : 'Analyze photos'}
                </button>
              )}
            </div>
          )}

          {result && (
            <div className="space-y-2 bg-base-100 border border-success/30 rounded-lg p-3 text-xs">
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  className="checkbox checkbox-xs checkbox-success mt-2"
                  checked={draft.apply.title}
                  onChange={(event) =>
                    editor.setApply({ title: event.target.checked })
                  }
                />
                <div className="flex-1">
                  <span className="font-semibold opacity-70">Title</span>
                  <input
                    className="input input-sm input-bordered w-full"
                    value={result.title}
                    onChange={(event) =>
                      editor.editResult({ title: event.target.value })
                    }
                  />
                </div>
              </label>
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  className="checkbox checkbox-xs checkbox-success mt-2"
                  checked={draft.apply.description}
                  onChange={(event) =>
                    editor.setApply({ description: event.target.checked })
                  }
                />
                <div className="flex-1">
                  <span className="font-semibold opacity-70">Description</span>
                  <textarea
                    className="textarea textarea-bordered textarea-sm w-full"
                    rows={3}
                    value={result.description}
                    onChange={(event) =>
                      editor.editResult({ description: event.target.value })
                    }
                  />
                </div>
              </label>
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  className="checkbox checkbox-xs checkbox-success mt-1"
                  checked={draft.apply.tags}
                  onChange={(event) =>
                    editor.setApply({ tags: event.target.checked })
                  }
                  aria-label="Apply tags"
                />
                <div className="flex-1">
                  <span className="font-semibold opacity-70 block mb-1">
                    Tags
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {result.tags.length === 0 && (
                      <span className="opacity-60">No tags suggested.</span>
                    )}
                    {result.tags.map((tag) => (
                      <TagBadge
                        key={tag}
                        tag={tag}
                        style={styleMap[tag] ?? EMPTY_TAG_STYLE}
                        readOnly={false}
                        onRemove={(removed) =>
                          editor.editResult({
                            tags: result.tags.filter(
                              (item) => item !== removed
                            ),
                          })
                        }
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="space-y-2 bg-base-100/40 border border-base-300 rounded-lg p-3">
          <h4 className="text-xs font-semibold opacity-80">
            3. Drive folder (optional)
          </h4>
          <button
            type="button"
            className={`btn btn-sm btn-block ${
              draft.parentFolder ? 'btn-neutral' : 'btn-outline btn-primary'
            }`}
            onClick={() => setIsDriveOpen(true)}
            disabled={busy}
          >
            {draft.parentFolder
              ? `Inside: ${draft.parentFolder.name}`
              : 'Choose where to create the folder'}
          </button>
          <input
            className="input input-sm input-bordered w-full"
            placeholder="New folder name"
            value={draft.folderName}
            onChange={(event) => editor.setFolderName(event.target.value)}
            disabled={busy || !draft.parentFolder}
          />
          {draft.parentFolder &&
            finalFolderName &&
            finalFolderName !== folderName && (
              <p className="text-[11px] text-warning">
                A folder with this name already exists; it will be created as
                &quot;{finalFolderName}&quot;.
              </p>
            )}
          {draft.parentFolder && photos.length > 0 && (
            <p className="text-[11px] opacity-60">
              Photos upload in the background after you apply, so you can keep
              working. Progress shows in the bottom corner.
            </p>
          )}
        </section>

        {error && (
          <div className="alert alert-error text-xs p-3 break-words">
            {error}
          </div>
        )}

        <div className="flex flex-col-reverse sm:flex-row gap-2 justify-between">
          <div className="flex gap-2">
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={handleBackToDrafts}
              disabled={busy}
            >
              Save draft
            </button>
            <button
              type="button"
              className="btn btn-sm btn-ghost text-error"
              onClick={handleDiscard}
              disabled={busy}
            >
              Discard
            </button>
          </div>
          <button
            type="button"
            className="btn btn-sm btn-success"
            onClick={handleApply}
            disabled={
              busy ||
              (photos.length === 0 && !result) ||
              (Boolean(draft.parentFolder) && photos.length > 0 && !folderName)
            }
          >
            {isApplying ? (
              <span className="loading loading-spinner loading-xs" />
            ) : (
              'Apply to form'
            )}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="ml-auto">
      <button
        type="button"
        onClick={handleOpen}
        className="btn btn-xs btn-tertiary gap-1 rounded-xl shadow-sm font-medium normal-case"
        disabled={!userId}
      >
        AI ✨
        {drafts.length > 0 && (
          <span className="badge badge-xs badge-primary">{drafts.length}</span>
        )}
      </button>

      {isOpen &&
        createPortal(
          <div className="modal modal-open z-[9999] backdrop-blur-sm fixed inset-0 flex items-center justify-center bg-black/50">
            <div className="modal-box bg-base-200 w-full max-w-full h-full sm:h-auto sm:max-w-2xl p-5 border border-base-300 rounded-2xl shadow-xl space-y-4 relative">
              <button
                type="button"
                onClick={handleClose}
                className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2"
                aria-label="Close"
              >
                ✕
              </button>
              <div>
                <h3 className="text-sm font-bold text-primary">
                  ✨ AI item assistant
                </h3>
                <p className="text-[11px] opacity-60">
                  Photos, AI suggestions and Drive upload. Your progress is
                  saved as a draft on this device.
                </p>
              </div>

              {draft ? (
                renderEditor()
              ) : (
                <DraftList
                  drafts={drafts}
                  onNew={startNewDraft}
                  onOpen={(stored) => {
                    setError(null);
                    setSiblingFolderNames([]);
                    void editor.openDraft(stored);
                  }}
                  onDelete={async (stored) => {
                    if (!window.confirm('Delete this draft and its photos?')) {
                      return;
                    }
                    await deleteDraft(stored.id);
                    await refreshDrafts();
                  }}
                />
              )}
            </div>
          </div>,
          document.body
        )}

      {editingPhoto &&
        createPortal(
          <PhotoEditorModal
            imageSrc={editingPhoto.url}
            fileName={editingPhoto.name}
            mimeType={editingPhoto.blob.type}
            onCancel={() => setEditingPhotoId(null)}
            onSave={(file) => {
              void editor.replacePhoto(editingPhoto.id, file);
              setEditingPhotoId(null);
            }}
          />,
          document.body
        )}

      <DriveFolderModal
        isOpen={isDriveOpen}
        selectedFolder={
          draft?.parentFolder ? { ...draft.parentFolder } : undefined
        }
        onClose={() => setIsDriveOpen(false)}
        onSelectFolder={({ folder, files }) => {
          if (!folder?.id) return;
          editor.setParentFolder({ id: folder.id, name: folder.name ?? '' });
          setSiblingFolderNames(
            files
              .filter(
                (file) =>
                  (file as { mimeType?: string }).mimeType === FOLDER_MIME
              )
              .map((file) => file.name ?? '')
          );
        }}
      />
    </div>
  );
}

export default ItemAssistant;
