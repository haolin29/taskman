import {
  clearTickTickTokens,
  loadTickTickConfig,
  loadTickTickTokens,
  saveTickTickTokens,
  TOKEN_PATH_DISPLAY,
  type TickTickConfig,
  type TickTickTokens,
} from './http-client.js';

export interface TickTickAuthService {
  status(): Promise<AuthStatus>;
  login(): Promise<AuthLoginResult>;
  exchange(code: string): Promise<AuthTokenResult>;
  refresh(): Promise<AuthTokenResult>;
  logout(): Promise<{ success: boolean; message: string }>;
}

export type AuthStatus =
  | { authenticated: false; message: string }
  | {
      authenticated: true;
      expired: boolean;
      expiresAt: string;
      expiresIn: string;
      tokenPath: string;
    };

export interface AuthLoginResult {
  message: string;
  url: string;
  state: string;
  nextStep: string;
}

export interface AuthTokenResult {
  success: boolean;
  message: string;
  expiresAt: string;
  tokenPath: string;
}

export interface TickTickAuthDeps {
  loadConfig: () => Promise<TickTickConfig>;
  loadTokens: () => Promise<TickTickTokens | null>;
  saveTokens: (tokens: TickTickTokens) => Promise<void>;
  clearTokens: () => Promise<void>;
  fetchToken: (region: TickTickConfig['region'], body: URLSearchParams) => Promise<TickTickTokenResponse>;
  now: () => number;
  createState: () => string;
}

interface TickTickTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type?: string;
}

const OAUTH_URLS = {
  global: {
    authorize: 'https://ticktick.com/oauth/authorize',
    token: 'https://ticktick.com/oauth/token',
  },
  china: {
    authorize: 'https://dida365.com/oauth/authorize',
    token: 'https://dida365.com/oauth/token',
  },
};

export function createTickTickAuthService(deps: TickTickAuthDeps = defaultDeps()): TickTickAuthService {
  return {
    async status() {
      const tokens = await deps.loadTokens();
      if (!tokens?.accessToken) {
        return {
          authenticated: false,
          message: 'Not authenticated. Run: taskman auth login',
        };
      }

      const expiresAt = tokens.expiresAt ?? 0;
      const expired = isTokenExpired(tokens, deps.now());
      const seconds = expired ? 0 : Math.floor((expiresAt - deps.now()) / 1000);
      return {
        authenticated: true,
        expired,
        expiresAt: new Date(expiresAt).toISOString(),
        expiresIn: `${seconds} seconds`,
        tokenPath: TOKEN_PATH_DISPLAY,
      };
    },
    async login() {
      const config = await deps.loadConfig();
      const state = deps.createState();
      const params = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        response_type: 'code',
        scope: 'tasks:read tasks:write',
        state,
      });
      return {
        message: 'Open the authorization URL in your browser',
        url: `${OAUTH_URLS[config.region].authorize}?${params.toString()}`,
        state,
        nextStep: 'Run: taskman auth exchange AUTH_CODE',
      };
    },
    async exchange(code) {
      const config = await deps.loadConfig();
      const body = new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: config.redirectUri,
      });
      const response = await deps.fetchToken(config.region, body);
      const tokens = normalizeTokenResponse(response, deps.now());
      await deps.saveTokens(tokens);
      return tokenResult('Authentication successful.', tokens);
    },
    async refresh() {
      const config = await deps.loadConfig();
      const tokens = await deps.loadTokens();
      if (!tokens?.refreshToken) {
        throw new Error('No refresh token available. Run: taskman auth login');
      }

      const body = new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        refresh_token: tokens.refreshToken,
        grant_type: 'refresh_token',
      });
      const response = await deps.fetchToken(config.region, body);
      const nextTokens = normalizeTokenResponse(response, deps.now());
      await deps.saveTokens(nextTokens);
      return tokenResult('Token refreshed successfully.', nextTokens);
    },
    async logout() {
      await deps.clearTokens();
      return {
        success: true,
        message: 'Logged out. Tokens cleared.',
      };
    },
  };
}

function defaultDeps(): TickTickAuthDeps {
  return {
    loadConfig: loadTickTickConfig,
    loadTokens: loadTickTickTokens,
    saveTokens: saveTickTickTokens,
    clearTokens: clearTickTickTokens,
    fetchToken: fetchTickTickToken,
    now: () => Date.now(),
    createState: createOAuthState,
  };
}

async function fetchTickTickToken(
  region: TickTickConfig['region'],
  body: URLSearchParams
): Promise<TickTickTokenResponse> {
  const response = await fetch(OAUTH_URLS[region].token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new Error(`Token request failed (${response.status}): ${await response.text()}`);
  }

  return await response.json() as TickTickTokenResponse;
}

function normalizeTokenResponse(response: TickTickTokenResponse, now: number): TickTickTokens {
  return {
    accessToken: response.access_token,
    refreshToken: response.refresh_token,
    expiresAt: now + response.expires_in * 1000,
    tokenType: response.token_type,
    storedAt: now,
  };
}

function tokenResult(message: string, tokens: TickTickTokens): AuthTokenResult {
  return {
    success: true,
    message,
    expiresAt: new Date(tokens.expiresAt ?? 0).toISOString(),
    tokenPath: TOKEN_PATH_DISPLAY,
  };
}

function isTokenExpired(tokens: TickTickTokens, now: number): boolean {
  return now >= (tokens.expiresAt ?? 0) - 60000;
}

function createOAuthState(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let state = '';
  for (let index = 0; index < 32; index += 1) {
    state += chars[Math.floor(Math.random() * chars.length)];
  }
  return state;
}
