import { useEffect, useState } from 'react';

import { getDraftPhoto, type ItemDraft } from '../../utils/assistantDb';

function DraftThumbnail({ photoId }: { photoId: string | null }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!photoId) return;
    let objectUrl: string | null = null;
    let cancelled = false;

    void getDraftPhoto(photoId).then((photo) => {
      if (cancelled || !photo) return;
      objectUrl = URL.createObjectURL(photo.blob);
      setUrl(objectUrl);
    });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [photoId]);

  return url ? (
    <img src={url} alt="" className="w-14 h-14 object-cover rounded-md" />
  ) : (
    <div className="w-14 h-14 rounded-md bg-base-300 flex items-center justify-center text-lg">
      📷
    </div>
  );
}

interface DraftListProps {
  drafts: ItemDraft[];
  onOpen: (draft: ItemDraft) => void;
  onDelete: (draft: ItemDraft) => void;
  onNew: () => void;
}

export default function DraftList({
  drafts,
  onOpen,
  onDelete,
  onNew,
}: DraftListProps) {
  return (
    <div className="space-y-3">
      <button
        type="button"
        className="btn btn-primary btn-sm w-full"
        onClick={onNew}
      >
        Start a new item
      </button>
      <p className="text-xs font-semibold opacity-70">Continue a saved draft</p>
      <ul className="space-y-2">
        {drafts.map((draft) => (
          <li
            key={draft.id}
            className="flex items-center gap-3 bg-base-100 border border-base-300 rounded-lg p-2"
          >
            <button
              type="button"
              className="flex items-center gap-3 flex-1 min-w-0 text-left"
              onClick={() => onOpen(draft)}
            >
              <DraftThumbnail photoId={draft.previewPhotoId} />
              <div className="min-w-0">
                <p className="font-medium text-sm truncate">
                  {draft.result?.title || draft.folderName || 'Untitled item'}
                </p>
                {draft.applied && (
                  <span className="badge badge-info badge-xs">
                    applied · not saved yet
                  </span>
                )}
                <p className="text-xs opacity-60">
                  {draft.photoIds.length} photo
                  {draft.photoIds.length === 1 ? '' : 's'} ·{' '}
                  {new Date(draft.updatedAt).toLocaleString()}
                </p>
              </div>
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-xs text-error"
              onClick={() => onDelete(draft)}
              aria-label="Delete draft"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
