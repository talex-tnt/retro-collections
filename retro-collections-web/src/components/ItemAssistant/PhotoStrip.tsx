import { useId, type ChangeEvent } from 'react';

import type { DraftPhotoView } from './useItemDraft';

interface PhotoStripProps {
  photos: DraftPhotoView[];
  aiPhotoIds: string[];
  previewPhotoId: string | null;
  isImporting: boolean;
  disabled: boolean;
  onAddFiles: (files: File[]) => void;
  onEdit: (photoId: string) => void;
  onRemove: (photoId: string) => void;
  onToggleAI: (photoId: string) => void;
  onSetPreview: (photoId: string) => void;
}

export default function PhotoStrip({
  photos,
  aiPhotoIds,
  previewPhotoId,
  isImporting,
  disabled,
  onAddFiles,
  onEdit,
  onRemove,
  onToggleAI,
  onSetPreview,
}: PhotoStripProps) {
  const inputId = useId();

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    // Allow picking the same file again.
    event.target.value = '';
    if (files.length > 0) onAddFiles(files);
  };

  return (
    <div className="space-y-2">
      <input
        id={inputId}
        type="file"
        accept="image/*"
        multiple
        onChange={handleChange}
        className="sr-only"
        disabled={disabled || isImporting}
      />
      <label
        htmlFor={inputId}
        className={`btn btn-sm btn-outline w-full normal-case ${
          disabled || isImporting ? 'pointer-events-none opacity-50' : ''
        }`}
      >
        {isImporting ? (
          <span className="loading loading-spinner loading-xs" />
        ) : (
          'Take photos or choose files'
        )}
      </label>

      {photos.length > 0 && (
        <>
          <div className="flex gap-2 overflow-x-auto p-2 bg-base-100 rounded-lg border border-base-300">
            {photos.map((photo, index) => {
              const forAI = aiPhotoIds.includes(photo.id);
              const isPreview = previewPhotoId === photo.id;
              return (
                <div key={photo.id} className="relative w-28 h-28 shrink-0">
                  <img
                    src={photo.url}
                    alt={`Photo ${index + 1}`}
                    className={`w-28 h-28 object-cover rounded-md border-2 ${
                      isPreview ? 'border-success' : 'border-base-300'
                    }`}
                  />
                  <button
                    type="button"
                    className="btn btn-circle btn-xs btn-neutral absolute top-1 left-1"
                    onClick={() => onEdit(photo.id)}
                    disabled={disabled}
                    title="Crop or rotate"
                    aria-label={`Edit photo ${index + 1}`}
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    className="btn btn-circle btn-xs btn-error text-white absolute top-1 right-1"
                    onClick={() => onRemove(photo.id)}
                    disabled={disabled}
                    title="Remove photo"
                    aria-label={`Remove photo ${index + 1}`}
                  >
                    ✕
                  </button>
                  <button
                    type="button"
                    className={`btn btn-xs absolute bottom-1 left-1 px-1.5 ${
                      forAI ? 'btn-primary' : 'btn-outline bg-base-100/90'
                    }`}
                    onClick={() => onToggleAI(photo.id)}
                    disabled={disabled}
                    title={forAI ? 'Sent to the AI' : 'Not sent to the AI'}
                    aria-pressed={forAI}
                  >
                    AI
                  </button>
                  <button
                    type="button"
                    className={`btn btn-xs absolute bottom-1 right-1 px-1.5 ${
                      isPreview
                        ? 'btn-success text-white'
                        : 'btn-outline bg-base-100/90'
                    }`}
                    onClick={() => onSetPreview(photo.id)}
                    disabled={disabled}
                    title="Use as the item's preview image"
                    aria-pressed={isPreview}
                  >
                    Preview
                  </button>
                </div>
              );
            })}
          </div>
          <p className="text-[11px] opacity-60">
            {aiPhotoIds.length} of {photos.length} photos sent to the AI. All
            photos are uploaded to Drive.
          </p>
        </>
      )}
    </div>
  );
}
