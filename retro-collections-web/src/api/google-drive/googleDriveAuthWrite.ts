let tokenClientWrite: google.accounts.oauth2.TokenClient | null = null;
let pendingRequest: {
  resolve: (token: string) => void;
  reject: (error: Error) => void;
} | null = null;

// Dedicated storage keys to completely separate this session from read-only operations
export const WRITE_TOKEN_KEY = 'gdrive_access_token_write';
export const WRITE_EXPIRY_KEY = 'gdrive_token_expiry_write';

const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

/** Sign-in finished without the Drive permission (e.g. it was unticked). */
export class DriveAccessNotGrantedError extends Error {
  constructor() {
    super(
      'Drive access was not granted. Sign in again and allow access to Google Drive.'
    );
    this.name = 'DriveAccessNotGrantedError';
  }
}

const settle = (outcome: { token: string } | { error: Error }) => {
  const request = pendingRequest;
  pendingRequest = null;
  if (!request) return;
  if ('token' in outcome) request.resolve(outcome.token);
  else request.reject(outcome.error);
};

export const initGoogleDriveAuthWrite = (clientId: string): void => {
  tokenClientWrite = google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    // Requests full file-level create/write permissions alongside read capability
    scope: `https://www.googleapis.com/auth/drive.readonly ${DRIVE_FILE_SCOPE}`,
    callback: (response) => {
      if (response.error || !response.access_token) {
        settle({
          error: new Error(
            response.error_description ||
              response.error ||
              'Google sign-in failed.'
          ),
        });
        return;
      }

      // Google lets users untick individual permissions; without drive.file
      // every upload would fail, so treat it as a failed sign-in.
      if (!response.scope?.split(' ').includes(DRIVE_FILE_SCOPE)) {
        settle({ error: new DriveAccessNotGrantedError() });
        return;
      }

      const expiresInSeconds = response.expires_in || 3600;
      const expiryTime = Date.now() + expiresInSeconds * 1000;

      sessionStorage.setItem(WRITE_TOKEN_KEY, response.access_token);
      sessionStorage.setItem(WRITE_EXPIRY_KEY, expiryTime.toString());

      settle({ token: response.access_token });
    },
    // Without this, a closed or blocked popup left callers waiting forever.
    error_callback: (error) => {
      settle({
        error: new Error(
          error.type === 'popup_closed'
            ? 'Google sign-in was closed before finishing.'
            : error.type === 'popup_failed_to_open'
              ? 'The Google sign-in window could not open. Allow pop-ups for this site and try again.'
              : error.message || 'Google sign-in failed.'
        ),
      });
    },
  });
};

export const getDriveWriteToken = (): string | null => {
  const token = sessionStorage.getItem(WRITE_TOKEN_KEY);
  const expiry = sessionStorage.getItem(WRITE_EXPIRY_KEY);

  if (!token || !expiry) return null;

  const isExpired = Date.now() > parseInt(expiry, 10) - 120000;

  if (isExpired) {
    clearDriveWriteToken();
    return null;
  }

  return token;
};

/**
 * Returns a valid token, opening Google's consent popup if needed (so call it
 * from a click). `forceConsent` shows the permission screen again, e.g. after
 * the user declined Drive access.
 */
export const requestDriveWriteToken = ({
  forceConsent = false,
}: { forceConsent?: boolean } = {}): Promise<string> => {
  return new Promise((resolve, reject) => {
    if (!tokenClientWrite) {
      return reject(new Error('Google Write Token Client not initialized'));
    }

    const validToken = forceConsent ? null : getDriveWriteToken();
    if (validToken) {
      return resolve(validToken);
    }

    // A newer request supersedes one that never finished.
    pendingRequest?.reject(new Error('Google sign-in was restarted.'));
    pendingRequest = { resolve, reject };
    tokenClientWrite.requestAccessToken(
      forceConsent ? { prompt: 'consent' } : undefined
    );
  });
};

export const clearDriveWriteToken = (): void => {
  sessionStorage.removeItem(WRITE_TOKEN_KEY);
  sessionStorage.removeItem(WRITE_EXPIRY_KEY);
};
