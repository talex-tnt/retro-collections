import { useState } from 'react';

import {
  AI_PROVIDER_PRESETS,
  getPreset,
  listProviderModels,
  type AIModelInfo,
  type AIProviderConfig,
  type AIProviderPresetId,
} from '../api/ai';
import type { AIKeyStorage } from '../api/firestore/services/private/aiSettings';
import { useAISettings } from '../hooks';
import AIKeyStorageModal from './AIKeyStorageModal';

const TYPE_MODEL_OPTION = '__type__';
const AI_IMAGE_SIZE_OPTIONS = [512, 768, 1024, 1536, 2048];
const DRIVE_IMAGE_SIZE_OPTIONS = [1600, 2048, 3072, 4096];

const errorMessage = (error: unknown, fallback: string) =>
  (error as { message?: string })?.message || fallback;

interface ProviderRowProps {
  provider: AIProviderConfig;
  apiKey: string;
  isDefault: boolean;
  onSave: (provider: AIProviderConfig, apiKey: string) => Promise<void>;
  onRemove: () => Promise<void>;
  onMakeDefault: () => Promise<void>;
}

function ProviderRow({
  provider,
  apiKey,
  isDefault,
  onSave,
  onRemove,
  onMakeDefault,
}: ProviderRowProps) {
  const preset = getPreset(provider.preset);
  const [model, setModel] = useState(provider.model);
  const [baseUrl, setBaseUrl] = useState(provider.baseUrl ?? '');
  const [key, setKey] = useState(apiKey);
  const [showKey, setShowKey] = useState(false);
  const [models, setModels] = useState<AIModelInfo[]>([]);
  const [typeModel, setTypeModel] = useState(false);
  const [status, setStatus] = useState<{
    tone: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const modelIds = new Set(models.map((item) => item.id));
  const modelGroups = models.some((item) => item.acceptsImages !== undefined)
    ? [
        {
          label: 'Accept images',
          models: models.filter((item) => item.acceptsImages === true),
        },
        {
          label: 'Unknown',
          models: models.filter((item) => item.acceptsImages === undefined),
        },
        {
          label: "Text only (can't analyze photos)",
          models: models.filter((item) => item.acceptsImages === false),
        },
      ]
    : [{ label: 'Models', models }];

  const isDirty =
    model !== provider.model ||
    baseUrl !== (provider.baseUrl ?? '') ||
    key !== apiKey;
  const editableBaseUrl = provider.type === 'openai-compatible';

  const currentConfig = (): AIProviderConfig => ({
    ...provider,
    model: model.trim(),
    baseUrl: editableBaseUrl ? baseUrl.trim() : provider.baseUrl,
  });

  const handleSave = async () => {
    setBusy(true);
    setStatus(null);
    try {
      await onSave(currentConfig(), key);
      setStatus({ tone: 'success', text: 'Saved.' });
    } catch (error) {
      setStatus({ tone: 'error', text: errorMessage(error, 'Save failed.') });
    } finally {
      setBusy(false);
    }
  };

  const handleTest = async () => {
    setBusy(true);
    setStatus({ tone: 'info', text: 'Connecting...' });
    try {
      const found = await listProviderModels({
        config: currentConfig(),
        apiKey: key.trim(),
      });
      setModels(found);
      setTypeModel(false);
      const withImages = found.filter((item) => item.acceptsImages).length;
      const knowsImages = found.some(
        (item) => item.acceptsImages !== undefined
      );
      setStatus({
        tone: knowsImages && withImages === 0 ? 'error' : 'success',
        text: knowsImages
          ? `Connected. ${withImages} of ${found.length} models accept images; choose one, then Save.`
          : `Connected. ${found.length} models loaded; choose one that accepts images, then Save.`,
      });
    } catch (error) {
      setStatus({
        tone: 'error',
        text: errorMessage(error, 'Connection failed.'),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-base-300 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-semibold text-sm truncate">
            {provider.label}
          </span>
          <span className="badge badge-ghost badge-sm">{preset.pricing}</span>
          {isDefault && (
            <span className="badge badge-primary badge-sm">default</span>
          )}
        </div>
        <div className="flex gap-1">
          {!isDefault && (
            <button
              type="button"
              className="btn btn-xs btn-ghost"
              onClick={onMakeDefault}
              disabled={busy}
            >
              Make default
            </button>
          )}
          <button
            type="button"
            className="btn btn-xs btn-ghost text-error"
            onClick={() => {
              if (window.confirm(`Remove ${provider.label}?`)) {
                void onRemove();
              }
            }}
            disabled={busy}
          >
            Remove
          </button>
        </div>
      </div>

      {preset.notes && (
        <p className="text-xs text-base-content/60">{preset.notes}</p>
      )}

      {editableBaseUrl && (
        <label className="form-control w-full">
          <span className="label-text text-xs mb-1">Base URL</span>
          <input
            type="url"
            className="input input-sm input-bordered w-full"
            value={baseUrl}
            placeholder="https://example.com/v1"
            onChange={(event) => setBaseUrl(event.target.value)}
          />
        </label>
      )}

      <label className="form-control w-full">
        <span className="label-text text-xs mb-1 flex justify-between">
          <span>API key{preset.requiresKey ? '' : ' (optional)'}</span>
          {preset.keyUrl && (
            <a
              href={preset.keyUrl}
              target="_blank"
              rel="noreferrer"
              className="link link-primary"
            >
              Get a key
            </a>
          )}
        </span>
        <div className="join w-full">
          <input
            type={showKey ? 'text' : 'password'}
            autoComplete="off"
            className="input input-sm input-bordered join-item w-full"
            value={key}
            onChange={(event) => setKey(event.target.value)}
          />
          <button
            type="button"
            className="btn btn-sm join-item"
            onClick={() => setShowKey((prev) => !prev)}
          >
            {showKey ? 'Hide' : 'Show'}
          </button>
        </div>
      </label>

      <label className="form-control w-full">
        <span className="label-text text-xs mb-1">Model</span>
        <div className="join w-full">
          {models.length > 0 && !typeModel ? (
            <select
              className="select select-sm select-bordered join-item w-full"
              value={modelIds.has(model) ? model : ''}
              onChange={(event) => {
                if (event.target.value === TYPE_MODEL_OPTION) {
                  setTypeModel(true);
                } else {
                  setModel(event.target.value);
                }
              }}
            >
              <option value="" disabled>
                {model ? `${model} (not in list)` : 'Choose a model'}
              </option>
              {modelGroups.map((group) =>
                group.models.length === 0 ? null : (
                  <optgroup key={group.label} label={group.label}>
                    {group.models.map((item) => (
                      <option
                        key={item.id}
                        value={item.id}
                        disabled={item.acceptsImages === false}
                      >
                        {item.id}
                      </option>
                    ))}
                  </optgroup>
                )
              )}
              <option value={TYPE_MODEL_OPTION}>Type a model name…</option>
            </select>
          ) : (
            <input
              className="input input-sm input-bordered join-item w-full"
              value={model}
              placeholder="Model id"
              onChange={(event) => setModel(event.target.value)}
            />
          )}
          <button
            type="button"
            className="btn btn-sm join-item"
            onClick={handleTest}
            disabled={busy || (preset.requiresKey && !key.trim())}
          >
            Test &amp; load models
          </button>
        </div>
      </label>

      <div className="flex items-center justify-between gap-2">
        <span
          className={`text-xs ${
            status?.tone === 'error'
              ? 'text-error'
              : status?.tone === 'success'
                ? 'text-success'
                : 'text-base-content/60'
          }`}
        >
          {status?.text}
        </span>
        <button
          type="button"
          className="btn btn-sm btn-primary"
          onClick={handleSave}
          disabled={busy || !isDirty}
        >
          Save
        </button>
      </div>
    </div>
  );
}

export default function SettingsAI() {
  const {
    userId,
    settings,
    keys,
    isLoading,
    isSaving,
    loadError,
    saveSettings,
    setKey,
    changeKeyStorage,
    removeProvider,
    getLatestSettings,
  } = useAISettings();

  const [presetToAdd, setPresetToAdd] = useState<AIProviderPresetId>('gemini');
  const [storageModal, setStorageModal] = useState<{
    initialChoice: AIKeyStorage;
    pendingPreset?: AIProviderPresetId;
  } | null>(null);
  const [extraInstructions, setExtraInstructions] = useState<string | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<void>) => {
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(errorMessage(err, 'Failed to update AI settings.'));
    }
  };

  const addProvider = (presetId: AIProviderPresetId) =>
    run(async () => {
      const preset = getPreset(presetId);
      const provider: AIProviderConfig = {
        id: crypto.randomUUID(),
        preset: preset.id,
        type: preset.type,
        label: preset.label,
        model: preset.defaultModel,
        ...(preset.baseUrl !== undefined ? { baseUrl: preset.baseUrl } : {}),
      };
      const latest = getLatestSettings();
      await saveSettings({
        providers: [...latest.providers, provider],
        defaultProviderId: latest.defaultProviderId || provider.id,
      });
    });

  const handleAddClick = () => {
    // First provider: ask where keys should live before any key is entered.
    if (settings.providers.length === 0) {
      setStorageModal({
        initialChoice: settings.keyStorage,
        pendingPreset: presetToAdd,
      });
      return;
    }
    void addProvider(presetToAdd);
  };

  const handleStorageConfirm = (choice: AIKeyStorage) =>
    run(async () => {
      const pendingPreset = storageModal?.pendingPreset;
      await changeKeyStorage(choice);
      setStorageModal(null);
      if (pendingPreset) {
        await addProvider(pendingPreset);
      }
    });

  const saveProvider = async (provider: AIProviderConfig, apiKey: string) => {
    await saveSettings({
      providers: getLatestSettings().providers.map((item) =>
        item.id === provider.id ? provider : item
      ),
    });
    if ((keys[provider.id] ?? '') !== apiKey.trim()) {
      await setKey(provider.id, apiKey);
    }
  };

  if (!userId || isLoading) {
    return (
      <div className="text-base-content/60 flex items-center gap-2">
        <span className="loading loading-spinner loading-sm"></span>
        Loading AI settings...
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="text-error bg-error/10 p-3 rounded-md text-sm">
        Failed to load AI settings. Please try again.
      </div>
    );
  }

  return (
    <div className="bg-base-100 rounded-lg p-4 border border-base-300 space-y-5">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <span>✨</span> AI Assistant
        </h2>
        <p className="text-xs text-base-content/60 mt-1">
          Fill in new collectibles from photos. Your browser calls the AI
          provider directly with your own API key.
        </p>
      </div>

      {error && <div className="alert alert-error text-sm">{error}</div>}

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="font-semibold text-sm">API key storage</h3>
            <p className="text-xs text-base-content/60">
              {settings.keyStorage === 'account'
                ? 'Saved in your account, available on all your devices.'
                : 'Saved in this browser only.'}
            </p>
          </div>
          <button
            type="button"
            className="btn btn-xs btn-outline"
            onClick={() =>
              setStorageModal({
                initialChoice:
                  settings.keyStorage === 'account' ? 'local' : 'account',
              })
            }
          >
            Change
          </button>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="font-semibold text-sm">Providers</h3>
        {settings.providers.length === 0 && (
          <p className="text-xs text-base-content/60">
            No providers yet. Google Gemini, Groq and OpenRouter have free
            tiers.
          </p>
        )}
        {settings.providers.map((provider) => (
          <ProviderRow
            key={`${provider.id}:${keys[provider.id] ?? ''}`}
            provider={provider}
            apiKey={keys[provider.id] ?? ''}
            isDefault={provider.id === settings.defaultProviderId}
            onSave={saveProvider}
            onRemove={() => run(() => removeProvider(provider.id))}
            onMakeDefault={() =>
              run(() => saveSettings({ defaultProviderId: provider.id }))
            }
          />
        ))}
        <div className="join w-full">
          <select
            className="select select-sm select-bordered join-item flex-1"
            value={presetToAdd}
            onChange={(event) =>
              setPresetToAdd(event.target.value as AIProviderPresetId)
            }
          >
            {AI_PROVIDER_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label} ({preset.pricing})
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-sm btn-primary join-item"
            onClick={handleAddClick}
            disabled={isSaving}
          >
            Add provider
          </button>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="font-semibold text-sm">Photos</h3>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm">Size sent to the AI</p>
            <p className="text-xs text-base-content/60">
              Longest side in pixels. Smaller is faster and cheaper.
            </p>
          </div>
          <select
            className="select select-xs select-bordered w-24"
            value={settings.aiImageMaxSize}
            onChange={(event) =>
              run(() =>
                saveSettings({ aiImageMaxSize: Number(event.target.value) })
              )
            }
          >
            {AI_IMAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size}px
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm">Photos uploaded to Drive</p>
            <p className="text-xs text-base-content/60">
              Originals keep full quality; resized photos upload faster.
            </p>
          </div>
          <div className="flex gap-1">
            <select
              className="select select-xs select-bordered"
              value={settings.driveImageMode}
              onChange={(event) =>
                run(() =>
                  saveSettings({
                    driveImageMode: event.target.value as
                      | 'original'
                      | 'resized',
                  })
                )
              }
            >
              <option value="original">Original</option>
              <option value="resized">Resized</option>
            </select>
            {settings.driveImageMode === 'resized' && (
              <select
                className="select select-xs select-bordered w-24"
                value={settings.driveImageMaxSize}
                onChange={(event) =>
                  run(() =>
                    saveSettings({
                      driveImageMaxSize: Number(event.target.value),
                    })
                  )
                }
              >
                {DRIVE_IMAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {size}px
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="font-semibold text-sm">Extra instructions</h3>
        <p className="text-xs text-base-content/60">
          Added to every analysis, e.g. &quot;Write the description in
          Italian&quot;.
        </p>
        <textarea
          className="textarea textarea-bordered w-full text-sm"
          maxLength={2000}
          rows={3}
          value={extraInstructions ?? settings.extraInstructions}
          onChange={(event) => setExtraInstructions(event.target.value)}
          onBlur={() => {
            if (
              extraInstructions !== null &&
              extraInstructions !== settings.extraInstructions
            ) {
              void run(() => saveSettings({ extraInstructions }));
            }
          }}
        />
      </section>

      {storageModal && (
        <AIKeyStorageModal
          initialChoice={storageModal.initialChoice}
          isSaving={isSaving}
          onCancel={() => setStorageModal(null)}
          onConfirm={handleStorageConfirm}
        />
      )}
    </div>
  );
}
