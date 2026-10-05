import type { Item } from '../api/firestore/services/misc/userItems';
import ItemActions from './ItemActions';
import { useState } from 'react';
import {
  useUpdateUserItemMutation,
  useDeleteUserItemMutation,
} from '../api/firestore/firestoreApi';
import Tags from './Tags';
import { findPreviewImage } from '../utils/findPreviewImage';
import type { FolderType, FileType } from '../api/firestore/types/shared';
import ItemImages from './ItemImages';
import { useDisableScroll, useUISettings } from '../utils/hooks';
import { FiMinimize2 as Minimize } from 'react-icons/fi';
import { PreviewImage } from './PreviewImage';

interface MyExpandedItemProps {
  item: Item;
  userId: string;
  showTags?: boolean;
  isPublicItem?: boolean;
  onExpand?: () => void;
  collectionId?: string;
  readonly: boolean;
  onClose?: () => void;
}

function MyExpandedItem({
  item,
  userId,
  showTags = true,
  isPublicItem = true,
  collectionId: collectionIdProp,
  readonly,
  onClose,
}: MyExpandedItemProps) {
  useDisableScroll();
  const [uiSettings] = useUISettings();
  const collectionId = collectionIdProp || item.collectionId;
  const collapseItemImages = uiSettings?.collapseImages ?? false;
  const [editingField, setEditingField] = useState<
    'name' | 'description' | null
  >(null);
  const [editValue, setEditValue] = useState('');
  // Value when editing started, to skip saving when nothing changed.
  const [originalValue, setOriginalValue] = useState('');
  const [editing, setEditing] = useState(false);
  const [updateItem] = useUpdateUserItemMutation();
  const [deleteItem] = useDeleteUserItemMutation();

  const internalDeleteItem = async (itemId: string) => {
    if (!userId) return;
    try {
      await deleteItem({
        id: itemId,
        userId,
        isPublicItem,
        collectionId,
      }).unwrap();
    } catch (error) {
      console.error('Error deleting item:', error);
    }
  };

  const startEditing = (
    field: 'name' | 'description',
    currentValue: string
  ) => {
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
      await updateItem({
        id: item.id,
        userId,
        updates,
        isPublicItem,
        collectionId,
      }).unwrap();
    } catch (error) {
      console.error('Error updating item:', error);
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
    item?.metadata?.imageFolder &&
    (item.metadata.imageFolder.id ? item.metadata.imageFolder : undefined);
  const imagePreview = item?.metadata?.previewImage as
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
    console.log('Set image folder:', folder);
    if (!userId) return;
    const previewImage = findPreviewImage(files);
    const metadata = {
      ...item.metadata,
      imageFolder: folder?.id ? folder : {},
      previewImage: previewImage?.thumbnailLink ? previewImage : {},
    };
    try {
      await updateItem({
        id: item.id,
        userId,
        collectionId,
        isPublicItem,
        updates: {
          metadata,
        },
      }).unwrap();
    } catch (error) {
      console.error('Error updating image folder:', error);
    }
  };
  return (
    <div className="flex w-full flex-col gap-2 overflow-x-hidden bg-base-200 p-4">
      {/* Tags at the top, toggleable */}
      <div className="flex items-center gap-2">
        {showTags && (
          <Tags
            readOnly={readonly}
            userId={item.userId}
            itemId={item.id}
            tags={item.tags || []}
            isPublicItem={isPublicItem}
            collectionId={collectionId}
          />
        )}
      </div>
      <div className="flex items-center gap-2">
        {editing && editingField === 'name' ? (
          <input
            className="input input-sm input-bordered font-medium w-full max-w-xs"
            value={editValue}
            autoFocus
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={saveEdit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveEdit();
              if (e.key === 'Escape') cancelEdit();
            }}
          />
        ) : (
          <p
            className="font-bold text-lg cursor-pointer hover:underline "
            onDoubleClick={() => startEditing('name', item.name)}
            title="Double-click to edit name"
          >
            {item.name}
          </p>
        )}
        <button
          type="button"
          className="ml-auto btn btn-sm btn-ghost"
          onClick={onClose}
        >
          <Minimize className="w-4 h-4" />
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start w-full">
        {/* Description (left) */}
        <div className="flex flex-col gap-2">
          {imagePreview?.id && (
            // <img
            //   loading="lazy"
            //   // src={imagePreview.thumbnailLink} --- IGNORE ---
            //   src={`https://drive.google.com/thumbnail?id=${imagePreview?.id}&sz=w200`}
            //   referrerPolicy={'no-referrer'}
            //   alt={imagePreview.name}
            //   className="w-full h-auto rounded"
            // />
            <PreviewImage
              driveId={imagePreview?.id}
              // size="w200"
              alt={imagePreview?.name || 'Item preview'}
              className="w-full h-auto rounded-md" // custom styling still flows through
            />
          )}
        </div>
        <div className="flex-1 min-w-0">
          {editing && editingField === 'description' ? (
            <textarea
              className="textarea textarea-bordered textarea-sm w-full"
              value={editValue}
              autoFocus
              rows={2}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={saveEdit}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  saveEdit();
                }
                if (e.key === 'Escape') cancelEdit();
              }}
            />
          ) : item.description ? (
            <p
              className="text-sm text-base-content/80 whitespace-pre-wrap cursor-pointer hover:underline"
              onDoubleClick={() =>
                startEditing('description', item.description || '')
              }
              title="Double-click to edit description"
            >
              {item.description}
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
        {/* End Description */}
      </div>

      {!collapseItemImages && imageFolder && (
        <ItemImages folder={imageFolder} />
      )}
      {collapseItemImages && imageFolder && (
        <details className="collapse collapse-arrow bg-base-100 rounded">
          <summary className="collapse-title text-sm font-medium cursor-pointer">
            See more images...
          </summary>

          <div className="collapse-content">
            <ItemImages folder={imageFolder} />
          </div>
        </details>
      )}

      {/* Visibility, dates, and actions row */}
      <div className="flex flex-col sm:flex-row gap-4 items-center text-xs text-base-content/60 justify-center sm:justify-between w-full mt-1">
        <div className="flex flex-row flex-wrap gap-x-4 gap-y-1 items-center justify-center sm:justify-start">
          <span>
            Visibility:{' '}
            <span
              className={isPublicItem ? 'text-green-600' : 'text-yellow-600'}
            >
              {isPublicItem ? 'Public' : 'Private'}
            </span>
          </span>
          {item.createdAt && (
            <span>Created: {new Date(item.createdAt).toLocaleString()}</span>
          )}
          {item.updatedAt && (
            <span>Edited: {new Date(item.updatedAt).toLocaleString()}</span>
          )}
        </div>
        <div className="flex flex-row items-center">
          <ItemActions
            readonly={readonly}
            itemData={item}
            isPublicItem={isPublicItem}
            onEdit={() => startEditing('name', item.name)}
            onDelete={internalDeleteItem}
            onImageFolderSelect={setImageFolder}
            imageFolder={imageFolder}
          />
        </div>
      </div>
    </div>
  );
}

export default MyExpandedItem;
