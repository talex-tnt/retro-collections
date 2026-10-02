import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';

import {
  useDeleteAIAccountKeysMutation,
  useGetAIAccountKeysQuery,
  useGetAISettingsQuery,
  useSetAIAccountKeysMutation,
  useUpdateAISettingsMutation,
} from '../api/firestore/firestoreApi';
import {
  DEFAULT_AI_SETTINGS,
  type AIKeyStorage,
  type AISettings,
} from '../api/firestore/services/private/aiSettings';
import {
  getLocalKeys,
  setLocalKeys,
  subscribeLocalKeys,
} from '../utils/aiLocalKeyStore';
import { useCurrentUser } from '../utils/hooks';

/**
 * AI assistant settings plus the API keys, wherever the user chose to keep
 * them (this browser or their account).
 */
export const useAISettings = () => {
  const user = useCurrentUser();
  const userId = user?.uid ?? '';

  const {
    data,
    isLoading,
    error: loadError,
  } = useGetAISettingsQuery(userId, { skip: !userId });
  const settings: AISettings = data ?? DEFAULT_AI_SETTINGS;
  const usesAccountKeys = settings.keyStorage === 'account';

  // Consecutive saves must build on each other, not on the last fetched
  // snapshot, or a second save would revert the first before refetch.
  const latestSettingsRef = useRef<AISettings>(settings);
  useEffect(() => {
    latestSettingsRef.current = data ?? DEFAULT_AI_SETTINGS;
  }, [data]);

  const { data: accountKeys = {}, isLoading: isLoadingAccountKeys } =
    useGetAIAccountKeysQuery(userId, { skip: !userId || !usesAccountKeys });
  const localKeys = useSyncExternalStore(subscribeLocalKeys, () =>
    getLocalKeys(userId)
  );

  const [updateSettings, { isLoading: isSaving }] =
    useUpdateAISettingsMutation();
  const [setAccountKeys] = useSetAIAccountKeysMutation();
  const [deleteAccountKeys] = useDeleteAIAccountKeysMutation();

  const keys = usesAccountKeys ? accountKeys : localKeys;

  const saveSettings = useCallback(
    async (patch: Partial<AISettings>) => {
      if (!userId) return;
      const next = { ...latestSettingsRef.current, ...patch };
      latestSettingsRef.current = next;
      await updateSettings({ userId, ...next }).unwrap();
    },
    [updateSettings, userId]
  );

  const writeKeys = useCallback(
    async (nextKeys: Record<string, string>) => {
      if (!userId) return;
      if (usesAccountKeys) {
        await setAccountKeys({ userId, keys: nextKeys }).unwrap();
      } else {
        setLocalKeys(userId, nextKeys);
      }
    },
    [setAccountKeys, userId, usesAccountKeys]
  );

  const setKey = useCallback(
    async (providerId: string, apiKey: string) => {
      const nextKeys = { ...keys };
      if (apiKey.trim()) {
        nextKeys[providerId] = apiKey.trim();
      } else {
        delete nextKeys[providerId];
      }
      await writeKeys(nextKeys);
    },
    [keys, writeKeys]
  );

  /**
   * Moves the keys to the other storage. The destination is written before
   * the source is cleared so a failure never loses keys.
   */
  const changeKeyStorage = useCallback(
    async (target: AIKeyStorage) => {
      if (!userId || target === settings.keyStorage) return;

      if (target === 'account') {
        await setAccountKeys({ userId, keys: localKeys }).unwrap();
        await saveSettings({ keyStorage: 'account' });
        setLocalKeys(userId, {});
      } else {
        setLocalKeys(userId, accountKeys);
        await saveSettings({ keyStorage: 'local' });
        await deleteAccountKeys(userId).unwrap();
      }
    },
    [
      accountKeys,
      deleteAccountKeys,
      localKeys,
      saveSettings,
      setAccountKeys,
      settings.keyStorage,
      userId,
    ]
  );

  const removeProvider = useCallback(
    async (providerId: string) => {
      const current = latestSettingsRef.current;
      const providers = current.providers.filter(
        (provider) => provider.id !== providerId
      );
      await saveSettings({
        providers,
        defaultProviderId:
          current.defaultProviderId === providerId
            ? (providers[0]?.id ?? '')
            : current.defaultProviderId,
      });
      if (keys[providerId]) {
        await setKey(providerId, '');
      }
    },
    [keys, saveSettings, setKey]
  );

  return {
    userId,
    settings,
    keys,
    isLoading: isLoading || (usesAccountKeys && isLoadingAccountKeys),
    isSaving,
    loadError,
    saveSettings,
    setKey,
    changeKeyStorage,
    removeProvider,
    getLatestSettings: () => latestSettingsRef.current,
  };
};
