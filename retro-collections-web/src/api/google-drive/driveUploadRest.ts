/**
 * Plain fetch helpers for the background upload queue. They take the token
 * explicitly so the queue decides when to ask the user to re-authorize
 * (an OAuth popup needs a user click).
 */

const DRIVE = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

export class DriveRequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'DriveRequestError';
    this.status = status;
  }
}

// Generous enough for a full-resolution photo on a slow mobile connection,
// but a connection left hanging by a frozen page fails and gets retried.
const REQUEST_TIMEOUT_MS = 5 * 60 * 1000;

const driveFetch = async <T>(
  url: string,
  token: string,
  init: RequestInit = {}
): Promise<T> => {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  // Callers may pass their own signal (to cancel a stuck upload); keep the
  // timeout either way.
  const signal =
    init.signal && typeof AbortSignal.any === 'function'
      ? AbortSignal.any([init.signal, timeout])
      : (init.signal ?? timeout);
  const response = await fetch(url, {
    ...init,
    signal,
    headers: { Authorization: `Bearer ${token}`, ...init.headers },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new DriveRequestError(
      body.error?.message || `Drive request failed (${response.status})`,
      response.status
    );
  }

  return (await response.json().catch(() => ({}))) as T;
};

/** Reserves Drive ids so items can reference files before they upload. */
export const generateDriveIds = async (token: string, count: number) => {
  const data = await driveFetch<{ ids?: string[] }>(
    `${DRIVE}/files/generateIds?count=${count}&space=drive&type=files`,
    token
  );
  if (!data.ids || data.ids.length < count) {
    throw new DriveRequestError('Drive did not return enough file ids.', 500);
  }
  return data.ids;
};

export const listChildFolderNames = async (token: string, parentId: string) => {
  const query = encodeURIComponent(
    `'${parentId}' in parents and mimeType='${FOLDER_MIME}' and trashed=false`
  );
  const data = await driveFetch<{ files?: Array<{ name: string }> }>(
    `${DRIVE}/files?q=${query}&fields=files(name)&pageSize=1000`,
    token
  );
  return (data.files ?? []).map((file) => file.name);
};

export const createDriveFolderWithId = (
  token: string,
  { id, name, parentId }: { id: string; name: string; parentId: string },
  signal?: AbortSignal
) =>
  driveFetch<{ id: string }>(`${DRIVE}/files?fields=id`, token, {
    signal,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id,
      name,
      mimeType: FOLDER_MIME,
      parents: [parentId],
    }),
  });

export const uploadDriveFileWithId = (
  token: string,
  {
    id,
    name,
    parentId,
    blob,
  }: { id: string; name: string; parentId: string; blob: Blob },
  signal?: AbortSignal
) => {
  const form = new FormData();
  form.append(
    'metadata',
    new Blob([JSON.stringify({ id, name, parents: [parentId] })], {
      type: 'application/json',
    })
  );
  form.append('file', blob);

  return driveFetch<{ id: string }>(
    `${UPLOAD}/files?uploadType=multipart&fields=id`,
    token,
    { method: 'POST', body: form, signal }
  );
};

export const driveFileExists = async (
  token: string,
  id: string,
  signal?: AbortSignal
) => {
  try {
    await driveFetch(`${DRIVE}/files/${id}?fields=id`, token, { signal });
    return true;
  } catch (error) {
    if (error instanceof DriveRequestError && error.status === 404) {
      return false;
    }
    throw error;
  }
};
