import type { BaseQueryFn, EndpointBuilder } from '@reduxjs/toolkit/query';
import type { FirestoreApiError } from '../errorLogger';

export const FIRESTORE_TAG_TYPES = [
  'PublicCollections',
  'PublicUserItems',
  'PrivateUserItems',
  'PublicUserWishes',
  'PrivateUserWishes',
  'PublicUserTags',
  'PublicUsers',
  'PrivateUsers',
  'UserItems',
  'UserWishes',
  'PrivateAuthorizedUsers',
  'RawgSettings',
  'UISettings',
  'AISettings',
  'AIKeys',
  'RawgSettings',
  'WikipediaSettings',
  'PublicUserCollections',
  'PrivateUserCollections',
  'PublicUserWishlists',
  'PrivateUserWishlists',
] as const;

// 2. Extract the TypeScript union type from the array values
export type FirestoreTagTypes = (typeof FIRESTORE_TAG_TYPES)[number];

export type FirestoreBuilder = EndpointBuilder<
  BaseQueryFn<void, unknown, FirestoreApiError>,
  FirestoreTagTypes,
  'firestoreApi'
>;
