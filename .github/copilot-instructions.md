# Copilot Instructions

This file tracks implementation requirements and coding guidelines for the retro-collections project.

## AI Expected General Behavior Guidelines
- When generating code, ensure it adheres to the project's coding style and conventions.
- For Firestore rules, ensure that the generated rules are secure and follow best practices for access control.
- When generating tests, ensure they cover both positive and negative cases for the rules being tested.
- For documentation, ensure it is clear, concise, and provides sufficient context for understanding the implementation requirements and guidelines.
- Before considering a task complete, ALWAYS (unless explicitly stated otherwise) ensure that all related tests are passing and that the implementation meets the specified requirements.


## Project Overview
- **Frontend**: retro-collections-web (React + TypeScript + Vite)
- **Firebase**: firebase-admin (Firestore rules, rules tests, admin scripts)
- **Backend**: retro-collections-backend (Vercel serverless functions)
- **Stack**: React, TypeScript, Tailwind CSS, Firebase/Firestore

## Implementation Tasks
-  Update this file with new implementation tasks as they arise, and mark them as completed when done. This will help maintain a clear record of what has been implemented and what is currently being worked on.

### Completed Tasks
- [x] Add delete collection button to MyCollectionsPage with confirmation dialog
- [x] Restructure MyCollectionsPage to 3-column layout (left: collections management, center: items content, right: auth panel)
- [x] Convert collection and item creation to use forms with Enter key support
- [x] Replace item action buttons with ItemActions component using icons
- [x] Add item counters next to collection names
- [x] Refactor MyCollectionsPage into separate components (CollectionsPanel, ItemsPanel)
- [x] Implement orphaned items feature: special non-deletable collection showing items with non-existent parent collectionId

### Current Tasks
- [x] Implement admin-only access for config and test data paths (4/7 tests)
  - ✅ Admin-only rules:
    - `match /main/config/{document=**}` - admin read/write only
    - `match /test/data/{document=**}` - admin read/write only
- [x] Implement dataFolder configuration and access control (7/7 tests passing on emulator & live)
  - ✅ Architecture:
    - Config stored at `/main/config/public/runtime` with `{dataFolder: 'default'}` value
    - Users can only write to `/main/data/{folder}/{resourceType}/docs/{document}` paths
    - Direct writes to `/main/data/{folder}/**` are blocked (requires nested resourceType)
  - ✅ Smoke test suite with 7 assertions:
    - Admin can write to test/data/rulesSmoke (admin-only test path)
    - Non-admin cannot write to test data
    - Admin can write to test/config/public/runtime
    - Non-admin cannot write to test config
    - User can write to matched dataFolder path
    - User cannot write to non-matched dataFolder (e.g., writing to `items` when `dataFolder='default'`)
    - Authenticated user can read data
- [x] Implement resource type rules (collections, items, users) with validation
- [x] Implement authorization rules for multi-user access patterns
- [x] **NICKNAME FEATURE** — Add nickname support to users (Spark-compatible, Cloud Functions ready)
  - ✅ Spark-compatible implementation completed:
    - ✅ Added `nickname` field to user public profile schema validation in rules
    - ✅ Optional `nickname` field on user public profiles (no requirement)
    - ✅ Created `nicknameIndex` collection rules at `/{env}/data/{folder}/public/nicknameIndex/{nickname}`
    - ✅ Rules: user can only read/write nicknameIndex docs if they contain their own userId
    - ✅ Ownership enforcement prevents duplicate nicknames (non-owners can't modify others' entries)
    - ✅ Profile + nicknameIndex interaction documented and tested
    - ✅ Test coverage: 9 tests in suite 4 (nickname index), 8 tests in suite 5 (profile+nickname interaction)
  - Future plan (after upgrading to Blaze):
    - [ ] Create Cloud Function `setUserNickname` callable that validates uniqueness server-side
    - [ ] Cloud Function: check if nickname already exists before transaction
    - [ ] Prevent users from creating multiple nicknames via direct Firebase writes
- [ ] **ITEM LIMITS FEATURE** — Add max items per user limit (Cloud Functions required)
  - Blocked by: Firebase Blaze plan upgrade (Cloud Functions not available on Spark)
  - Implementation (future, Blaze only):
    - [ ] Create Cloud Function to count user's existing items before create/update
    - [ ] Enforce limit via function, return error if limit exceeded
    - [ ] Add `itemLimit` field to user config (default ~100 or configurable per user)
    - [ ] Log attempts to exceed limit for analytics

## Firestore Architecture

`firebase-admin/firestore.rules` and its test suites (`firebase-admin/tests/`) are the source of truth; keep this section in sync with them.

### User Types (custom auth claims)
- **Admin** (`admin == true`): full access to config and data in any environment it can enter; also `/test/testData/**`
- **User** (`enabled == true`, no `tester` claim): can access `/main`
- **Tester** (`enabled == true`, `tester == true`): can access `/test` (used by the rules test suites)
- Users without `enabled` can only read their own `authorized-users` entry and access request

### Path Structure
```
/{env}/config/public/runtime                          # {dataFolder: 'default'}; readable in env, admin-write
/{env}/config/{document=**}                           # Admin-only
/test/testData/{document=**}                          # Admin-only scratch area for tests
/{env}/data/{folder}                                  # Admin-only folder doc
/{env}/data/{folder}/private/authorized-users/{email} # Admin writes; owner of that email can read
/{env}/data/{folder}/private/users-access-requests/{uid}  # Written by backend API; admin-managed
/{env}/data/{folder}/public/users/{userId}            # Public profile (name, nickname, visibility)
/{env}/data/{folder}/public/users/{userId}/{items|tags|collections|wishlists}/...
/{env}/data/{folder}/public/users/{userId}/collections/{id}/items/{itemId}
/{env}/data/{folder}/public/users/{userId}/wishlists/{id}/wishes/{wishId}
/{env}/data/{folder}/public/nicknameIndex/{nickname}  # {userId}; enforces nickname uniqueness
/{env}/data/{folder}/private/users/{userId}           # Private profile (email, lastLogin, ...)
/{env}/data/{folder}/private/users/{userId}/settings/{wikipedia|rawg|ui}
/{env}/data/{folder}/private/users/{userId}/{items|collections|wishlists}/...  # Private counterparts
/{document=**}                                        # Everything else denied
```

### Database Hierarchy
- `{env}`: `main` (production data) or `test` (rules test data); both exist in each Firebase project (dev/prod)
- `{folder}`: must match `/{env}/config/public/runtime.dataFolder` (currently `default`) for any data access
- `public` / `private`: public docs are readable by others only when `visibility.public == true`; private docs are owner + admin only
- `{userId}`: per-user subtree; owners write their own docs, with field validation and server timestamps enforced by the rules

## Coding Guidelines
- TypeScript for all new code
- Functional components with hooks in React
- Follow existing project structure and naming conventions
- Firestore API abstraction layer in `src/api/firestore/`
- In Firestore API logging, do not duplicate document or collection refs just for logging. Use `path` and `segmentPaths` in the context, and only include `requestPayload` when it is the actual data or query object passed to Firebase.

## Notes
- **2026-05-14**: Decided on Spark-compatible nickname implementation with future Cloud Function path. Using separate `nicknameIndex` collection + client-side transaction. This prevents data structure lock-in and allows easy migration to Cloud Functions when upgrading to Blaze plan. Item limits deferred until Blaze plan upgrade (requires Cloud Functions for server-side enforcement).

Last updated: 2026-05-15 (nickname feature completed with comprehensive test coverage)
