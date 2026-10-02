# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

A monorepo with three independently-installed npm packages (no root workspace; run `npm` inside each folder). Node version: 22 (`.nmv` / `retro-collections-web/.nvmrc`).

- `retro-collections-web/`: React 19 + TypeScript + Vite SPA (Redux Toolkit / RTK Query, Tailwind 4 + daisyUI, React Compiler via Babel). Talks to Firestore directly with the Firebase client SDK. Deployed to GitHub Pages.
- `firebase-admin/`: Firestore security rules (`firestore.rules`), indexes, rules test suites, and admin/migration scripts (`db-scripts/`). Deployed with the Firebase CLI.
- `retro-collections-backend/`: Vercel serverless functions (`api/*.ts`, one handler per file) for things the client can't do: Drive thumbnail proxy, legacy AI image analysis endpoints (superseded by the client-side item assistant), user access requests and approvals (Resend email + firebase-admin), public item listing. `api-unused/` is not deployed.
- `scripts/`: standalone shell utilities for managing game image/preview folders (exiftool, etc.), unrelated to the app build.

## Commands

### Web (`retro-collections-web/`)
```sh
npm run dev        # Vite dev server
npm run build      # tsc -b && vite build (type-check is part of build)
npm run lint       # eslint (prettier enforced via eslint-plugin-prettier)
npm run lint:fix
```
There is no test suite for the web app. `.env` needs `VITE_ENV` (`dev`|`prod`, selects which Firebase project in `src/lib/firebase.ts`), `VITE_GOOGLE_CLIENT_ID`, `VITE_RETRO_COLLECTIONS_BASEURL` (backend URL), and optionally `VITE_RAWG_API_KEY`. `BASE_PATH` sets the Vite `base` for GitHub Pages builds.

### Firebase (`firebase-admin/`)
```sh
npm run test:rules:emulator:all     # all rules tests against the local emulator (needs Java; this is what CI runs)
npm run test:rules:emulator:users   # one suite; also :authorized-users, :items, :misc, :nickname-index
npm run test:rules:live:all         # against the live dev project (RULES_TARGET=live ENV=dev)
npm run lint / npm run format
npm run deploy:firestore            # rules+indexes to $ENV from .env
npm run db:set-admin                # set admin custom claim; other db:* scripts are one-off migrations/backfills
```
`.env` provides `ENV` (`dev`|`prod`) and `ADMIN_UID`; service-account JSONs (`retro-collections-{dev,prod}.json`) are used by tests/scripts. To run a single suite directly: `RULES_TARGET=emulator npx firebase emulators:exec --only auth,firestore 'node --test tests/<file>'`.

### Backend (`retro-collections-backend/`)
```sh
npm run deploy:dev    # vercel + alias retro-collections-dev.vercel.app
npm run deploy:prod   # vercel --prod + alias retro-collections.vercel.app
```
Env vars are listed in `.env.example` (CORS `ALLOWED_ORIGINS`, Firebase service account, Resend, admin email, rate limit). Each handler sets CORS itself from `ALLOWED_ORIGINS`.

## Environments & deployment

- Two Firebase projects: `retro-collections-dev` and `retro-collections-prod`. Branch `develop` → dev, branch `main` → prod.
- GitHub Actions (`.github/workflows/`): pushes touching `firebase-admin/**` run the emulator rules tests and then deploy Firebase; pushes touching `retro-collections-web/**` build and copy `dist/` into the `talex-tnt.github.io` repo under `/retro-collections/` (main) or `/retro-collections-develop/` (develop). The backend is deployed manually with Vercel.

## Firestore data model & rules

Inside each Firebase project, data is split into two top-level environments:
- `/main`: real app data. Only users with the `enabled` claim and without `tester` (plus admins) can access it.
- `/test`: used by the rules test suites. Only `tester` users (plus admins) can access it.

Access is gated by custom auth claims: `admin`, `enabled`, `tester`.

Path shape: `/{env}/config/public/runtime` holds `{ dataFolder }` (default `"default"`). Actual data lives under `/{env}/data/{dataFolder}/{public|private}/{resourceType}/...`. Rules only allow writes when `{dataFolder}` matches the runtime config. Examples: public `users`, `nicknameIndex`, `items`; private `users`, `authorized-users`, per-user settings. The web client resolves paths at runtime through `src/api/firestore/runtimeConfig.ts` (`loadRuntimeConfig` / `resolveDataCollectionPath`). Don't hardcode `default`.

Records have `visibility.public`, an owner `userId`, and server-timestamped `createdAt`/`updatedAt`, all enforced by the rules. Nickname uniqueness is handled with a client-side transaction that updates the profile and its `nicknameIndex` entry together (Spark plan; there are no Cloud Functions yet). Item limits and server-side nickname validation are blocked until the project moves to the Blaze plan (see `PENDING_TASKS.md`).

Data is nested per user (e.g. `public/users/{uid}/collections/{id}/items/{itemId}`, with private counterparts under `private/users/{uid}/...`); the full path map is in `.github/copilot-instructions.md`. The rules and tests are the source of truth.

### Rules/test conventions (from `.agents/skills/firestore-*`)
- Before changing rules or tests, make sure the existing tests pass. If any fail, report them before refactoring.
- Test files are named `N-firestore.rules.<area>.test.mjs`. Each file starts with a numbered list of its cases in `x.y.z` form (suite.group.case), and test names use the same numbers (e.g. `1.1.1 - user can read own collections`). Shared helpers live in `tests/test-utils.mjs`.
- Put each rule condition on its own line with a `// Rule x.y.z` comment that maps it to its test case.
- A task is done only when the related rules tests pass, including both positive and negative cases.

## Web app architecture

- `src/api/firestore/firestoreApi.ts` defines one RTK Query `createApi` with `fakeBaseQuery`. Endpoints come from builder functions in `services/{public,private,misc}/*.ts`, and each is spread into `endpoints`. The generated hooks are re-exported from that file. To add a service, write a builder function, spread it in, export its hooks, and add cache tags to `FIRESTORE_TAG_TYPES` (`types/firestoreBuilder`).
- Errors go through `errorLogger.ts` (`FirestoreApiError`). Logging guideline: don't duplicate document or collection refs just for logging. Pass `path`/`segmentPaths` in the context, and include `requestPayload` only when it is the actual data or query object sent to Firebase. Use `sanitizeFirestorePayload` (`utils.ts`) before writes.
- Other API clients in `src/api/` cover the Vercel backend (`retro-collections/`), Google Drive read/write with OAuth (`google-drive/`), RAWG game metadata (`games/`), and Wikipedia.
- AI item assistant (`src/components/ItemAssistant/`): the browser calls AI providers directly with the user's own keys (`src/api/ai/`: Gemini, any OpenAI-compatible API, Anthropic via `@anthropic-ai/sdk`, lazy-loaded). Provider settings live in Firestore `settings/ai`; keys live either in localStorage (`src/utils/aiLocalKeyStore.ts`) or Firestore `settings/aiKeys`, per the user's choice (`useAISettings`). Drafts (including photos) are stored in IndexedDB (`src/utils/assistantDb.ts`).
- Drive uploads from the assistant go through a persistent background queue (`src/api/google-drive/uploadQueue.ts`, started in `App.tsx`). Drive ids are reserved up front with `files.generateIds`, so the item is saved with its final folder/preview ids before the upload finishes, and retries are idempotent. `PreviewImage` shows the local copy while a photo is still queued.
- The Redux store (`src/store/`) holds `authSlice` plus the `firestoreApi` reducer. Pages live in `src/pages/`, and shared UI lives in `src/components/`. The admin check reads the token's custom claims (`getIsAdmin` in `src/lib/firebase.ts`).
- Prettier: single quotes, semicolons, 80 columns, `trailingComma: es5`. Use TypeScript and functional components with hooks.
