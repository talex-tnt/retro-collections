import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';

import type { FirestoreBuilder } from '../../types/firestoreBuilder';
import { createFirestoreApiError } from '../../errorLogger';
import { db } from '../../../../lib/firebase';
import { resolveDataCollectionPath } from '../../runtimeConfig';
import type { AIProviderConfig } from '../../../ai/types';

const visibility = 'private' as const;

export type AIKeyStorage = 'local' | 'account';
export type DriveImageMode = 'original' | 'resized';

export interface AISettings {
  keyStorage: AIKeyStorage;
  defaultProviderId: string;
  providers: AIProviderConfig[];
  aiImageMaxSize: number;
  driveImageMode: DriveImageMode;
  driveImageMaxSize: number;
  extraInstructions: string;
}

export interface AISettingsRecord extends AISettings {
  userId: string;
}

export const DEFAULT_AI_SETTINGS: AISettings = {
  keyStorage: 'local',
  defaultProviderId: '',
  providers: [],
  aiImageMaxSize: 1024,
  driveImageMode: 'original',
  driveImageMaxSize: 2048,
  extraInstructions: '',
};

const normalizeProviders = (value: unknown): AIProviderConfig[] =>
  Array.isArray(value)
    ? value.filter(
        (provider): provider is AIProviderConfig =>
          typeof provider?.id === 'string' &&
          typeof provider?.type === 'string' &&
          typeof provider?.model === 'string'
      )
    : [];

// Firestore rejects undefined values, so optional provider fields are dropped.
const serializeProviders = (providers: AIProviderConfig[]) =>
  providers.map(({ baseUrl, ...provider }) =>
    baseUrl ? { ...provider, baseUrl } : provider
  );

const getAISettingsEndpoints = (builder: FirestoreBuilder) => ({
  getAISettings: builder.query<AISettingsRecord, string>({
    keepUnusedDataFor: 60 * 60, // 1h cache
    async queryFn(userId) {
      const path = await resolveDataCollectionPath({
        visibility,
        resourceType: 'users',
      });

      const context = {
        apiEndpoint: 'getAISettings',
        operation: 'GET' as const,
        firebaseFunc: 'getDoc',
        path,
        segmentPaths: [userId, 'settings', 'ai'],
      };

      try {
        const snap = await getDoc(doc(db, path, ...context.segmentPaths));
        const data = (snap.data() ?? {}) as Partial<AISettings>;

        return {
          data: {
            userId,
            ...DEFAULT_AI_SETTINGS,
            ...data,
            keyStorage: data.keyStorage === 'account' ? 'account' : 'local',
            providers: normalizeProviders(data.providers),
            driveImageMode:
              data.driveImageMode === 'resized' ? 'resized' : 'original',
          },
        };
      } catch (error) {
        return { error: createFirestoreApiError(context, error) };
      }
    },
    providesTags: (_result, _error, userId) => [
      { type: 'AISettings' as const, id: userId },
    ],
  }),

  updateAISettings: builder.mutation<void, AISettingsRecord>({
    async queryFn({ userId, ...settings }) {
      const path = await resolveDataCollectionPath({
        visibility,
        resourceType: 'users',
      });

      const requestPayload: AISettings = {
        keyStorage: settings.keyStorage,
        defaultProviderId: settings.defaultProviderId,
        providers: serializeProviders(settings.providers),
        aiImageMaxSize: Math.round(settings.aiImageMaxSize),
        driveImageMode: settings.driveImageMode,
        driveImageMaxSize: Math.round(settings.driveImageMaxSize),
        extraInstructions: settings.extraInstructions,
      };

      const context = {
        apiEndpoint: 'updateAISettings',
        operation: 'UPDATE' as const,
        firebaseFunc: 'setDoc',
        path,
        segmentPaths: [userId, 'settings', 'ai'],
        requestPayload,
      };

      try {
        await setDoc(doc(db, path, ...context.segmentPaths), requestPayload);
        return { data: undefined };
      } catch (error) {
        return { error: createFirestoreApiError(context, error) };
      }
    },
    invalidatesTags: (_result, _error, { userId }) => [
      { type: 'AISettings' as const, id: userId },
    ],
  }),

  getAIAccountKeys: builder.query<Record<string, string>, string>({
    keepUnusedDataFor: 60 * 60, // 1h cache
    async queryFn(userId) {
      const path = await resolveDataCollectionPath({
        visibility,
        resourceType: 'users',
      });

      const context = {
        apiEndpoint: 'getAIAccountKeys',
        operation: 'GET' as const,
        firebaseFunc: 'getDoc',
        path,
        segmentPaths: [userId, 'settings', 'aiKeys'],
      };

      try {
        const snap = await getDoc(doc(db, path, ...context.segmentPaths));
        const keys = (snap.data()?.keys ?? {}) as Record<string, unknown>;

        return {
          data: Object.fromEntries(
            Object.entries(keys).filter(
              (entry): entry is [string, string] => typeof entry[1] === 'string'
            )
          ),
        };
      } catch (error) {
        return { error: createFirestoreApiError(context, error) };
      }
    },
    providesTags: (_result, _error, userId) => [
      { type: 'AIKeys' as const, id: userId },
    ],
  }),

  setAIAccountKeys: builder.mutation<
    void,
    { userId: string; keys: Record<string, string> }
  >({
    async queryFn({ userId, keys }) {
      const path = await resolveDataCollectionPath({
        visibility,
        resourceType: 'users',
      });

      const context = {
        apiEndpoint: 'setAIAccountKeys',
        operation: 'UPDATE' as const,
        firebaseFunc: 'setDoc',
        path,
        segmentPaths: [userId, 'settings', 'aiKeys'],
        // Never log the keys themselves.
        requestPayload: { providerIds: Object.keys(keys) },
      };

      try {
        await setDoc(doc(db, path, ...context.segmentPaths), { keys });
        return { data: undefined };
      } catch (error) {
        return { error: createFirestoreApiError(context, error) };
      }
    },
    invalidatesTags: (_result, _error, { userId }) => [
      { type: 'AIKeys' as const, id: userId },
    ],
  }),

  deleteAIAccountKeys: builder.mutation<void, string>({
    async queryFn(userId) {
      const path = await resolveDataCollectionPath({
        visibility,
        resourceType: 'users',
      });

      const context = {
        apiEndpoint: 'deleteAIAccountKeys',
        operation: 'DELETE' as const,
        firebaseFunc: 'deleteDoc',
        path,
        segmentPaths: [userId, 'settings', 'aiKeys'],
      };

      try {
        await deleteDoc(doc(db, path, ...context.segmentPaths));
        return { data: undefined };
      } catch (error) {
        return { error: createFirestoreApiError(context, error) };
      }
    },
    invalidatesTags: (_result, _error, userId) => [
      { type: 'AIKeys' as const, id: userId },
    ],
  }),
});

export default getAISettingsEndpoints;
