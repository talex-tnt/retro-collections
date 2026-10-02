import { useRef, useState } from 'react';
import { FiImage } from 'react-icons/fi';

import {
  useCreateUserItemMutation,
  useGetPublicUserTagsQuery,
  useCreatePublicUserTagMutation,
} from '../api/firestore/firestoreApi';
import { useSearchGamesQuery } from '../api/games/rawgApi';
import { useSearchQuery } from '../api/wikipedia/wikipediaApi';
import { useRawgSettings, useWikiSettings } from '../utils/hooks';
import AutocompleteInput from './AutocompleteInput';
import CollapsePanel from './CollapsePanel';
import SelectTags from './SelectTags';
import ImportModal from './ImportModal';
import DriveFolderModal from './DriveFolderModal';
import { ItemAssistant } from './ItemAssistant';
import type { PreparedImportItem } from '../utils/useDriveImport';
import type { FolderType } from '../api/firestore/types/shared';

interface NewItemProps {
  userId: string;
  collectionId?: string;
}

type Suggestion = {
  name: string;
};

function NewItem({
  userId,
  isPublicItem = true,
  collectionId,
}: NewItemProps & { isPublicItem: boolean }) {
  const [wikiSettings] = useWikiSettings();
  const [rawgSettings] = useRawgSettings();
  const enableWikiSuggestions = wikiSettings?.enableSuggestions ?? false;
  const enableRawgSuggestions = rawgSettings?.enableSuggestions ?? false;
  const [name, setName] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagError] = useState<string | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);

  // Drive state variables
  const [imageFolder, setImageFolder] = useState<FolderType | null>(null);
  const [previewImage, setPreviewImage] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [showDrivePopup, setShowDrivePopup] = useState<boolean>(false);

  const isGame = selectedTags.map((tag) => tag.toLowerCase()).includes('game');

  const { data: wikiResults, isLoading: isLoadingWikiSuggestions } =
    useSearchQuery(name, {
      skip: name.length < 3 || isGame || !enableWikiSuggestions,
    });
  const { data: rawgResults, isLoading: isLoadingGameSuggestions } =
    useSearchGamesQuery(name, {
      skip: name.length < 3 || !isGame || !enableRawgSuggestions,
    });
  const gameSuggestions =
    rawgResults?.results?.map((g) => ({ name: g.name })) ||
    ([] as Suggestion[]);

  const isLoadingSuggestions =
    isLoadingWikiSuggestions || isLoadingGameSuggestions;

  const wikiSuggestions = wikiResults?.results || ([] as Suggestion[]);

  const suggestions = isGame ? gameSuggestions : wikiSuggestions;

  const { data: allTags = [] } = useGetPublicUserTagsQuery(
    { userId },
    { skip: !userId }
  );

  const nameInputRef = useRef<HTMLInputElement | null>(null);

  const [createItem, { isLoading: isCreatingItem }] =
    useCreateUserItemMutation();
  const [createPublicUserTag] = useCreatePublicUserTagMutation();

  const handleApplyAISuggestions = (suggestions: {
    title?: string;
    description?: string;
    tags?: string[];
    uploadedFolderId?: { id: string; name: string };
    fallbackPreview?: { id: string; name: string };
  }) => {
    if (typeof suggestions.title === 'string') {
      setName(suggestions.title);
    }

    if (typeof suggestions.description === 'string') {
      setDescription(suggestions.description);
    }

    if (Array.isArray(suggestions.tags)) {
      const mergedTags = Array.from(
        new Set([...selectedTags, ...suggestions.tags])
      );
      setSelectedTags(mergedTags);
    }

    if (suggestions.uploadedFolderId) {
      setImageFolder(suggestions.uploadedFolderId);

      if (suggestions.fallbackPreview) {
        setPreviewImage({
          id: suggestions.fallbackPreview.id,
          name: suggestions.fallbackPreview.name,
        });
      } else {
        setPreviewImage(null);
      }
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!name.trim()) return;

    try {
      const itemData: Record<string, unknown> = {
        name: name.trim(),
        userId,
      };

      if (description.trim()) {
        itemData.description = description.trim();
      }

      if (selectedTags.length > 0) {
        itemData.tags = selectedTags;
      }

      // Structures nested data matching identical layout state required by MyListItem
      if (imageFolder) {
        itemData.metadata = {
          imageFolder: imageFolder.id ? imageFolder : {},
          previewImage: previewImage?.id ? previewImage : {},
        };
      }

      await createItem({
        ...itemData,
        isPublicItem,
        collectionId,
      } as Parameters<typeof createItem>[0]).unwrap();

      setName('');
      setDescription('');
      setSelectedTags([]);
      setImageFolder(null);
      setPreviewImage(null);

      requestAnimationFrame(() => {
        nameInputRef.current?.focus();
      });
    } catch (error) {
      console.error('Error adding item:', error);
    }
  };

  const handleBulkImport = async (
    items: PreparedImportItem[],
    importTag: string
  ) => {
    const cleanedTag = importTag.trim();

    if (!cleanedTag) return;

    try {
      await createPublicUserTag({ userId, tag: cleanedTag }).unwrap();
    } catch (error) {
      console.error(`Failed to register batch tag "${cleanedTag}":`, error);
    }

    for (const item of items) {
      try {
        const itemData: Record<string, unknown> = {
          name: item.name,
          description: item.description,
          userId,
          metadata: item.metadata,
        };

        if (selectedTags.length > 0) {
          itemData.tags = importTag
            ? [...selectedTags, importTag]
            : selectedTags;
        } else if (importTag) {
          itemData.tags = [importTag];
        }

        await createItem({
          ...itemData,
          isPublicItem,
          collectionId,
        } as Parameters<typeof createItem>[0]).unwrap();
      } catch (error) {
        console.error(`Error importing item ${item.name}:`, error);
      }
    }
  };

  return (
    <CollapsePanel
      title="New Collectible"
      className="bg-base-100 shadow-xl h-fit border border-base-200"
      headerClassName="text-lg font-bold px-6 pt-5"
      contentClassName="space-y-4 px-6"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-3">
          {/* TAG SELECTION */}
          <div className="form-control w-full">
            <span className="label-text">Tags</span>
            <div className="flex flex-wrap gap-2 mt-1 items-center">
              {allTags.length === 0 && (
                <span className="text-xs opacity-60">No tags available</span>
              )}
              <SelectTags
                selectedTags={selectedTags}
                userTags={allTags}
                onSelectedTagsChange={setSelectedTags}
              />
            </div>
            {tagError && (
              <div className="text-xs text-error mt-1">{tagError}</div>
            )}
          </div>

          {/* NAME INPUT WITH AUTOCOMPLETE */}
          <label className="form-control w-full">
            <span className="label-text mb-1">Name</span>
            <AutocompleteInput
              value={name}
              onChange={setName}
              suggestions={suggestions}
              isLoading={isLoadingSuggestions}
              placeholder={'New collectible name'}
              getLabel={(g) => g.name}
              getKey={(g) => g.name}
            />
          </label>

          {/* DESCRIPTION */}
          <label className="form-control w-full">
            <span className="label-text mb-1">Description</span>
            <textarea
              className="textarea textarea-bordered min-h-24 w-full"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional collectible description"
              disabled={isCreatingItem}
            />
          </label>
        </div>

        {/* CONTROLS BAR CONTAINER */}
        <div className="flex flex-row items-center gap-3 mt-1">
          <button
            type="button"
            disabled={isCreatingItem}
            className="btn btn-sm btn-ghost p-0 h-fit min-h-fit hover:bg-transparent tooltip tooltip-right"
            data-tip={
              imageFolder ? 'Click to remove link' : 'Link Drive image folder'
            }
            onClick={() => {
              if (imageFolder) {
                setImageFolder(null);
                setPreviewImage(null);
              } else {
                setShowDrivePopup(true);
              }
            }}
          >
            <div className="relative inline-block select-none cursor-pointer">
              <FiImage
                size={22}
                className={
                  imageFolder ? 'text-primary' : 'text-base-content/60'
                }
              />
              <span
                className={`absolute -top-1 -right-1.5 font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center text-[10px] text-white shadow-sm transition-colors duration-150 ${
                  imageFolder ? 'bg-error' : 'bg-primary'
                }`}
              >
                {imageFolder ? '−' : '+'}
              </span>
            </div>
          </button>

          {imageFolder && (
            <div className="flex items-center gap-1 bg-base-200 rounded py-1 px-2 border border-base-300 max-w-[180px] truncate shadow-sm">
              <span className="text-[10px] font-medium opacity-80 truncate">
                {imageFolder.name}
              </span>
            </div>
          )}

          {/* AI IMAGE ANALYZER TRIGGER PANEL */}
          <ItemAssistant
            currentTags={selectedTags}
            onApply={handleApplyAISuggestions}
          />
        </div>

        <div className="flex gap-2 mt-2 w-full">
          <button
            type="submit"
            className="btn btn-primary flex-1"
            disabled={isCreatingItem || !name.trim()}
          >
            {isCreatingItem ? 'Adding...' : 'Add Collectible'}
          </button>

          <button
            type="button"
            className="btn btn-outline btn-secondary"
            onClick={() => setIsImportModalOpen(true)}
          >
            Import Collectibles
          </button>
        </div>
      </form>

      <ImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onConfirmImport={handleBulkImport}
      />

      <DriveFolderModal
        isOpen={showDrivePopup}
        selectedFolder={imageFolder || undefined}
        onClose={() => setShowDrivePopup(false)}
        onSelectFolder={(data) => {
          setImageFolder(data.folder);
          setPreviewImage(data.previewImage);
        }}
      />
    </CollapsePanel>
  );
}

export default NewItem;
