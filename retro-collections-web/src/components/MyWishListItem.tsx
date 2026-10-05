import { motion } from 'framer-motion';
import { useState } from 'react';
import {
  useDeleteUserWishMutation,
  useUpdateUserWishMutation,
} from '../api/firestore/firestoreApi';
import type { Wish } from '../api/firestore/services/misc/userWishes';
import { findPreviewImage } from '../utils/findPreviewImage';
import type { FileType, FolderType } from '../api/firestore/types/shared';
import { PreviewImage } from './PreviewImage';
import WishActions from './WishActions';
import WishTags from './WishTags';

interface MyWishListItemProps {
  wish: Wish;
  userId: string;
  showTags?: boolean;
  isPublicWish: boolean;
  wishlistId?: string;
  readonly: boolean;
  showPreview?: boolean;
}

function MyWishListItem({
  readonly,
  wish,
  userId,
  showTags = true,
  isPublicWish,
  wishlistId: wishlistIdProp,
  showPreview = true,
}: MyWishListItemProps) {
  const wishlistId = wishlistIdProp || wish.wishlistId;
  const [editingField, setEditingField] = useState<
    'name' | 'description' | null
  >(null);
  const [editValue, setEditValue] = useState('');
  // Value when editing started, to skip saving when nothing changed.
  const [originalValue, setOriginalValue] = useState('');
  const [editing, setEditing] = useState(false);
  const [updateWish] = useUpdateUserWishMutation();
  const [deleteWish] = useDeleteUserWishMutation();

  const internalDeleteWish = async (wishId: string) => {
    if (!userId) return;
    try {
      await deleteWish({
        id: wishId,
        userId,
        isPublicWish,
        wishlistId,
      }).unwrap();
    } catch (error) {
      console.error('Error deleting wish:', error);
    }
  };

  const startEditing = (
    field: 'name' | 'description',
    currentValue: string
  ) => {
    if (readonly) return;
    setEditingField(field);
    setEditValue(currentValue);
    setOriginalValue(currentValue);
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!editingField) return;
    // Opening a field and closing it untouched isn't an edit: don't write
    // (which would also bump the item's last-updated time).
    if (editValue.trim() === originalValue.trim()) {
      setEditing(false);
      setEditingField(null);
      setEditValue('');
      return;
    }

    const updates =
      editingField === 'name'
        ? { name: editValue.trim() }
        : { description: editValue };

    try {
      await updateWish({
        id: wish.id,
        userId,
        updates,
        isPublicWish,
        wishlistId,
      }).unwrap();
    } catch (error) {
      console.error('Error updating wish:', error);
    }

    setEditing(false);
    setEditingField(null);
    setEditValue('');
  };

  const cancelEdit = () => {
    setEditing(false);
    setEditingField(null);
    setEditValue('');
  };

  const imageFolder =
    wish?.metadata?.imageFolder &&
    (wish.metadata.imageFolder.id ? wish.metadata.imageFolder : undefined);

  const imagePreview = wish?.metadata?.previewImage as
    | {
        id: string;
        name: string;
        mimeType?: string;
        thumbnailLink?: string;
      }
    | undefined;

  const setImageFolder = async ({
    folder,
    files,
  }: {
    folder: FolderType;
    files: FileType[];
  }) => {
    if (!userId) return;

    const previewImage = findPreviewImage(files);
    const metadata = {
      ...wish.metadata,
      imageFolder: folder?.id ? folder : {},
      previewImage: previewImage?.id
        ? { id: previewImage.id, name: previewImage.name }
        : {},
    };

    try {
      await updateWish({
        id: wish.id,
        userId,
        updates: { metadata },
        isPublicWish,
        wishlistId,
      }).unwrap();
    } catch (error) {
      console.error('Error updating wish image folder:', error);
    }
  };

  return (
    <motion.div
      layoutId={`wish-expandable-${wish.id}`}
      className="flex flex-col gap-2 sm:rounded-lg sm:border sm:border-base-300 bg-base-200 p-4"
    >
      <div className="flex items-center gap-2">
        {showTags && (
          <WishTags
            readOnly={readonly}
            userId={wish.userId}
            wishId={wish.id}
            tags={wish.tags || []}
            isPublicWish={isPublicWish}
            wishlistId={wishlistId}
          />
        )}
      </div>

      <div className="flex items-center gap-2">
        {editing && editingField === 'name' ? (
          <input
            className="input input-sm input-bordered font-medium w-full max-w-xs"
            value={editValue}
            autoFocus
            onChange={(event) => setEditValue(event.target.value)}
            onBlur={saveEdit}
            onKeyDown={(event) => {
              if (event.key === 'Enter') saveEdit();
              if (event.key === 'Escape') cancelEdit();
            }}
          />
        ) : (
          <p
            className="font-bold text-lg cursor-pointer hover:underline"
            onDoubleClick={() => startEditing('name', wish.name)}
            title="Double-click to edit name"
          >
            {wish.name}
          </p>
        )}
      </div>

      <div className="flex gap-4 justify-between items-start w-full">
        {showPreview && (
          <div className="flex flex-col gap-2">
            {imagePreview?.id && (
              <PreviewImage
                driveId={imagePreview.id}
                alt={imagePreview.name || 'Wish preview'}
                className="w-full h-auto rounded-md"
              />
            )}
          </div>
        )}

        <div className="flex-1 min-w-0">
          {editing && editingField === 'description' ? (
            <textarea
              className="textarea textarea-bordered textarea-sm w-full"
              value={editValue}
              autoFocus
              rows={2}
              onChange={(event) => setEditValue(event.target.value)}
              onBlur={saveEdit}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  saveEdit();
                }
                if (event.key === 'Escape') cancelEdit();
              }}
            />
          ) : wish.description ? (
            <p
              className="text-sm text-base-content/80 whitespace-pre-wrap cursor-pointer hover:underline"
              onDoubleClick={() =>
                startEditing('description', wish.description || '')
              }
              title="Double-click to edit description"
            >
              {wish.description}
            </p>
          ) : (
            <p
              className="text-sm text-base-content/80 italic cursor-pointer hover:underline"
              onDoubleClick={() => startEditing('description', '')}
              title="Double-click to add description"
            >
              Add description...
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-center text-xs text-base-content/60 justify-center sm:justify-between w-full mt-1">
        <div className="flex flex-row flex-wrap gap-x-4 gap-y-1 items-center justify-center sm:justify-start">
          <span>
            Visibility:{' '}
            <span
              className={isPublicWish ? 'text-green-600' : 'text-yellow-600'}
            >
              {isPublicWish ? 'Public' : 'Private'}
            </span>
          </span>
          {wish.createdAt && (
            <span>Created: {new Date(wish.createdAt).toLocaleString()}</span>
          )}
          {wish.updatedAt && (
            <span>Edited: {new Date(wish.updatedAt).toLocaleString()}</span>
          )}
        </div>

        <div className="flex flex-row items-center">
          <WishActions
            readonly={readonly}
            wishData={wish}
            onEdit={() => startEditing('name', wish.name)}
            onDelete={internalDeleteWish}
            onImageFolderSelect={setImageFolder}
            imageFolder={imageFolder}
          />
        </div>
      </div>
    </motion.div>
  );
}

export default MyWishListItem;
