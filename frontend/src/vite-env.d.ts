/// <reference types="vite/client" />

type GoogleTokenClientConfig = {
	client_id: string;
	scope: string;
	callback: (response: GoogleTokenResponse) => void;
	prompt?: string;
	include_granted_scopes?: boolean;
};

type GoogleTokenResponse = {
	access_token?: string;
	expires_in?: number;
	scope?: string;
	token_type?: string;
	error?: string;
	error_description?: string;
};

type GoogleTokenClient = {
	requestAccessToken: (options?: { prompt?: string }) => void;
};

type GoogleIdentityServices = {
	oauth2: {
		initTokenClient: (config: GoogleTokenClientConfig) => GoogleTokenClient;
	};
};

declare global {
	interface Window {
		google?: {
			accounts?: GoogleIdentityServices;
		};
	}

	interface ImportMetaEnv {
		readonly VITE_GOOGLE_CALENDAR_CLIENT_ID?: string;
	}
}

export {};
