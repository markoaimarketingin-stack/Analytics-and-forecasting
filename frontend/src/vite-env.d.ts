/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_API_URL?: string;
  readonly VITE_API_ROOT_URL?: string;
  readonly VITE_GOOGLE_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface GoogleCredentialResponse {
  credential?: string;
}

interface Window {
  google?: {
	accounts: {
	  id: {
		initialize: (config: {
		  client_id: string;
		  callback: (response: GoogleCredentialResponse) => void;
		  auto_select?: boolean;
		  cancel_on_tap_outside?: boolean;
		}) => void;
		renderButton: (
		  parent: HTMLElement,
		  options: {
			theme?: 'outline' | 'filled_blue' | 'filled_black';
			size?: 'small' | 'medium' | 'large';
			shape?: 'rectangular' | 'pill' | 'circle' | 'square';
			text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
			width?: number;
		  },
		) => void;
		prompt: () => void;
		disableAutoSelect: () => void;
	  };
	};
  };
}

