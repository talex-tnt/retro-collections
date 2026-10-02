import { createApi, fakeBaseQuery } from '@reduxjs/toolkit/query/react';
import type { FirestoreApiError } from './errorLogger';

import getRuntimeConfigEndpoints from './services/runtime-config';
import getUserItemsEndpoints from './services/misc/userItems';
import getUserCollectionsEndpoints from './services/misc/userCollections';
import getUserWishlistsEndpoints from './services/misc/userWishlists';
import getUserWishesEndpoints from './services/misc/userWishes';
import getUsersEndpoints from './services/public/users';
import getAuthorizedUsersEndpoints from './services/private/authorized-users';
import getPrivateUsersEndpoints from './services/private/users';
import getPublicUserTagsEndpoints from './services/public/userTags';
import getWikipediaSettingsEndpoints from './services/private/wikipediaSettings';
import getRawgSettingsEndpoints from './services/private/rawgSettings';
import { FIRESTORE_TAG_TYPES } from './types/firestoreBuilder';
import getUISettingsEndpoints from './services/private/uiSettings';
import getAISettingsEndpoints from './services/private/aiSettings';
export const firestoreApi = createApi({
  reducerPath: 'firestoreApi',

  baseQuery: fakeBaseQuery<FirestoreApiError>(),

  tagTypes: FIRESTORE_TAG_TYPES,

  endpoints: (builder) => ({
    ...getRuntimeConfigEndpoints(builder),
    ...getUserItemsEndpoints(builder),
    ...getUserCollectionsEndpoints(builder),
    ...getUserWishlistsEndpoints(builder),
    ...getUserWishesEndpoints(builder),
    ...getPublicUserTagsEndpoints(builder),
    ...getUsersEndpoints(builder),
    ...getPrivateUsersEndpoints(builder),
    ...getAuthorizedUsersEndpoints(builder),
    ...getWikipediaSettingsEndpoints(builder),
    ...getUISettingsEndpoints(builder),
    ...getRawgSettingsEndpoints(builder),
    ...getAISettingsEndpoints(builder),
  }),
});

export const {
  useGetRuntimeConfigQuery,

  useGetAllUserItemsQuery,
  useGetAllUserItemsCountQuery,
  useGetUserItemsQuery,
  useGetUserItemsCountQuery,
  useCreateUserItemMutation,
  useUpdateUserItemMutation,
  useDeleteUserItemMutation,
  useBatchDeleteUserItemsMutation,

  useGetUserCollectionsQuery,
  useGetUserCollectionQuery,
  useCreateUserCollectionMutation,
  useUpdateUserCollectionMutation,
  useDeleteUserCollectionMutation,
  useInjectCollectionIdIntoItemsMutation,

  useGetUserWishlistsQuery,
  useGetUserWishlistQuery,
  useCreateUserWishlistMutation,
  useUpdateUserWishlistMutation,
  useDeleteUserWishlistMutation,

  useGetAllUserWishesQuery,
  useGetAllUserWishesCountQuery,
  useGetUserWishesQuery,
  useGetUserWishesCountQuery,
  useCreateUserWishMutation,
  useUpdateUserWishMutation,
  useDeleteUserWishMutation,
  useBatchDeleteUserWishesMutation,
  useInjectWishlistIdIntoWishesMutation,

  useGetUsersQuery,
  useGetPublicUsersQuery,
  useGetPrivateUsersQuery,
  useGetUserByIdQuery,
  useGetPrivateUserByIdQuery,
  useLazyIsUserAuthorizedQuery,
  useCreateOrUpdateUserMutation,
  useCreateOrUpdatePrivateUserMutation,
  useSetUserVisibilityMutation,

  useIsUserAuthorizedQuery,
  useGetAuthorizedUsersQuery,
  useAddAuthorizedUserMutation,
  useRemoveAuthorizedUserMutation,
  useGetPublicUserTagsQuery,
  useCreatePublicUserTagMutation,
  useDeletePublicUserTagMutation,
  useUpdatePublicUserTagMutation,

  // Settings
  useGetWikipediaSettingsQuery,
  useUpdateWikipediaSettingsMutation,
  useGetRawgSettingsQuery,
  useUpdateRawgSettingsMutation,
  useGetUISettingsQuery,
  useUpdateUISettingsMutation,
  useGetAISettingsQuery,
  useUpdateAISettingsMutation,
  useGetAIAccountKeysQuery,
  useSetAIAccountKeysMutation,
  useDeleteAIAccountKeysMutation,
} = firestoreApi;
