/**
 * SUITE 5: AI ASSISTANT SETTINGS
 *
 * Test Checklist:
 * [x] 5.1.1 - owner can create valid AI settings
 * [x] 5.1.2 - owner can read own AI settings
 * [x] 5.1.3 - other user cannot read AI settings
 * [x] 5.1.4 - other user cannot write AI settings
 * [x] 5.1.5 - invalid keyStorage value is rejected
 * [x] 5.1.6 - unknown field is rejected
 * [x] 5.1.7 - more than 20 providers is rejected
 * [x] 5.1.8 - extraInstructions over 2000 characters is rejected
 * [x] 5.2.1 - owner can write and read own AI keys
 * [x] 5.2.2 - other user cannot read AI keys
 * [x] 5.2.3 - owner can delete own AI keys
 * [x] 5.2.4 - AI keys doc with an extra field is rejected
 * [x] 5.2.5 - AI keys doc where keys is not a map is rejected
 * [x] 5.2.6 - admin who is not the owner cannot read AI keys from the client
 */

import 'dotenv/config';

import test from 'node:test';
import assert from 'node:assert/strict';

import { deleteDoc, doc, getDocFromServer, setDoc } from 'firebase/firestore';

import {
  RULES_TARGET,
  TEST_DATA_FOLDER,
  TEST_CONFIG_PATH,
  createAdminApp,
  getAdminDb as sharedGetAdminDb,
  buildClientContext as sharedBuildClientContext,
  cleanupTestDocs as sharedCleanupTestDocs,
  expectPermissionDenied,
  acquireSuiteLock,
  joinPath,
  getPrivateResourceDocPath,
} from './test-utils.mjs';

const OWNER_ID = 'rules-ai-owner';
const OTHER_ID = 'rules-ai-other';
const ADMIN_ID = 'rules-ai-admin';

const userSettingsPath = (uid, name) =>
  joinPath(
    getPrivateResourceDocPath(TEST_DATA_FOLDER, 'users', uid),
    'settings',
    name
  );

const AI_SETTINGS_PATH = userSettingsPath(OWNER_ID, 'ai');
const AI_KEYS_PATH = userSettingsPath(OWNER_ID, 'aiKeys');

const validAISettings = () => ({
  keyStorage: 'local',
  defaultProviderId: 'provider-1',
  providers: [
    {
      id: 'provider-1',
      preset: 'gemini',
      type: 'gemini',
      label: 'Google Gemini',
      model: 'gemini-2.5-flash',
    },
  ],
  aiImageMaxSize: 1024,
  driveImageMode: 'original',
  driveImageMaxSize: 2048,
  extraInstructions: '',
});

const validAIKeys = () => ({ keys: { 'provider-1': 'test-key' } });

const aiCleanupDocPaths = [AI_SETTINGS_PATH, AI_KEYS_PATH];

const adminApp = createAdminApp('ai-settings');
const getAdminDb = () => sharedGetAdminDb(adminApp);
const buildClientContext = (options) =>
  sharedBuildClientContext(adminApp, options);
const cleanupTestDocs = (extraDocPaths = []) =>
  sharedCleanupTestDocs(adminApp, extraDocPaths);
const releaseSuiteLock = await acquireSuiteLock();

const withClient = async (options, fn) => {
  const context = await buildClientContext(options);
  try {
    await fn(context.db);
  } finally {
    await context.cleanup();
  }
};

test.beforeEach(async () => {
  await cleanupTestDocs(aiCleanupDocPaths);
  await getAdminDb()
    .doc(TEST_CONFIG_PATH)
    .set({ dataFolder: TEST_DATA_FOLDER }, { merge: true });
});

test.after(async () => {
  await cleanupTestDocs(aiCleanupDocPaths);
  if (adminApp) {
    await adminApp.delete();
  }
  releaseSuiteLock();
});

test(`[5.1.1] owner can create valid AI settings on ${RULES_TARGET}`, async () => {
  await withClient({ uid: OWNER_ID }, async (db) => {
    await assert.doesNotReject(
      setDoc(doc(db, AI_SETTINGS_PATH), validAISettings())
    );
  });
});

test(`[5.1.2] owner can read own AI settings on ${RULES_TARGET}`, async () => {
  await getAdminDb().doc(AI_SETTINGS_PATH).set(validAISettings());

  await withClient({ uid: OWNER_ID }, async (db) => {
    const snap = await getDocFromServer(doc(db, AI_SETTINGS_PATH));
    assert.equal(snap.data()?.keyStorage, 'local');
  });
});

test(`[5.1.3] other user cannot read AI settings on ${RULES_TARGET}`, async () => {
  await getAdminDb().doc(AI_SETTINGS_PATH).set(validAISettings());

  await withClient({ uid: OTHER_ID }, async (db) => {
    await expectPermissionDenied(
      getDocFromServer(doc(db, AI_SETTINGS_PATH))
    );
  });
});

test(`[5.1.4] other user cannot write AI settings on ${RULES_TARGET}`, async () => {
  await withClient({ uid: OTHER_ID }, async (db) => {
    await expectPermissionDenied(
      setDoc(doc(db, AI_SETTINGS_PATH), validAISettings())
    );
  });
});

test(`[5.1.5] invalid keyStorage value is rejected on ${RULES_TARGET}`, async () => {
  await withClient({ uid: OWNER_ID }, async (db) => {
    await expectPermissionDenied(
      setDoc(doc(db, AI_SETTINGS_PATH), {
        ...validAISettings(),
        keyStorage: 'cloud',
      })
    );
  });
});

test(`[5.1.6] unknown field is rejected on ${RULES_TARGET}`, async () => {
  await withClient({ uid: OWNER_ID }, async (db) => {
    await expectPermissionDenied(
      setDoc(doc(db, AI_SETTINGS_PATH), {
        ...validAISettings(),
        apiKey: 'should-not-be-here',
      })
    );
  });
});

test(`[5.1.7] more than 20 providers is rejected on ${RULES_TARGET}`, async () => {
  const providers = Array.from({ length: 21 }, (_, index) => ({
    id: `provider-${index}`,
    preset: 'custom',
    type: 'openai-compatible',
    label: `Provider ${index}`,
    model: 'model',
  }));

  await withClient({ uid: OWNER_ID }, async (db) => {
    await expectPermissionDenied(
      setDoc(doc(db, AI_SETTINGS_PATH), { ...validAISettings(), providers })
    );
  });
});

test(`[5.1.8] extraInstructions over 2000 characters is rejected on ${RULES_TARGET}`, async () => {
  await withClient({ uid: OWNER_ID }, async (db) => {
    await expectPermissionDenied(
      setDoc(doc(db, AI_SETTINGS_PATH), {
        ...validAISettings(),
        extraInstructions: 'x'.repeat(2001),
      })
    );
  });
});

test(`[5.2.1] owner can write and read own AI keys on ${RULES_TARGET}`, async () => {
  await withClient({ uid: OWNER_ID }, async (db) => {
    await assert.doesNotReject(setDoc(doc(db, AI_KEYS_PATH), validAIKeys()));
    const snap = await getDocFromServer(doc(db, AI_KEYS_PATH));
    assert.equal(snap.data()?.keys?.['provider-1'], 'test-key');
  });
});

test(`[5.2.2] other user cannot read AI keys on ${RULES_TARGET}`, async () => {
  await getAdminDb().doc(AI_KEYS_PATH).set(validAIKeys());

  await withClient({ uid: OTHER_ID }, async (db) => {
    await expectPermissionDenied(getDocFromServer(doc(db, AI_KEYS_PATH)));
  });
});

test(`[5.2.3] owner can delete own AI keys on ${RULES_TARGET}`, async () => {
  await getAdminDb().doc(AI_KEYS_PATH).set(validAIKeys());

  await withClient({ uid: OWNER_ID }, async (db) => {
    await assert.doesNotReject(deleteDoc(doc(db, AI_KEYS_PATH)));
  });
});

test(`[5.2.4] AI keys doc with an extra field is rejected on ${RULES_TARGET}`, async () => {
  await withClient({ uid: OWNER_ID }, async (db) => {
    await expectPermissionDenied(
      setDoc(doc(db, AI_KEYS_PATH), { ...validAIKeys(), note: 'extra' })
    );
  });
});

test(`[5.2.5] AI keys doc where keys is not a map is rejected on ${RULES_TARGET}`, async () => {
  await withClient({ uid: OWNER_ID }, async (db) => {
    await expectPermissionDenied(
      setDoc(doc(db, AI_KEYS_PATH), { keys: 'test-key' })
    );
  });
});

test(`[5.2.6] admin who is not the owner cannot read AI keys from the client on ${RULES_TARGET}`, async () => {
  await getAdminDb().doc(AI_KEYS_PATH).set(validAIKeys());

  await withClient({ uid: ADMIN_ID, claims: { admin: true } }, async (db) => {
    await expectPermissionDenied(getDocFromServer(doc(db, AI_KEYS_PATH)));
  });
});
