export {};

declare global {
  namespace google {
    namespace accounts {
      namespace oauth2 {
        interface TokenResponse {
          access_token: string;
          expires_in: number;
          /** Space-separated scopes the user actually granted. */
          scope: string;
          token_type: string;
          error?: string;
          error_description?: string;
        }

        /** Reported when the consent popup can't open or is closed. */
        interface ClientConfigError {
          type: 'popup_failed_to_open' | 'popup_closed' | 'unknown';
          message?: string;
        }

        interface TokenClient {
          requestAccessToken: (options?: { prompt?: string }) => void;
          callback: (response: TokenResponse) => void;
        }

        function initTokenClient(config: {
          client_id: string;
          scope: string;
          callback: (response: TokenResponse) => void;
          error_callback?: (error: ClientConfigError) => void;
        }): TokenClient;
      }
    }
  }
}
