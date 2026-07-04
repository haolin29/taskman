import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import type { TickTickApiRequest } from './provider.js';

export interface TickTickConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  region: 'global' | 'china';
}

export interface TickTickTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  tokenType?: string;
  storedAt?: number;
}

const CONFIG_DIR = join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'taskman');
const CONFIG_PATH = join(CONFIG_DIR, 'config.json');
const TOKEN_PATH = join(CONFIG_DIR, 'ticktick-tokens.json');
export const CONFIG_PATH_DISPLAY = '~/.config/taskman/config.json';
export const TOKEN_PATH_DISPLAY = '~/.config/taskman/ticktick-tokens.json';

const API_URLS = {
  global: 'https://api.ticktick.com/open/v1',
  china: 'https://api.dida365.com/open/v1',
};

export async function loadTickTickConfig(): Promise<TickTickConfig> {
  if (process.env.TICKTICK_CLIENT_ID && process.env.TICKTICK_CLIENT_SECRET) {
    return {
      clientId: process.env.TICKTICK_CLIENT_ID,
      clientSecret: process.env.TICKTICK_CLIENT_SECRET,
      redirectUri: process.env.TICKTICK_REDIRECT_URI ?? 'http://localhost:18888/callback',
      region: normalizeRegion(process.env.TICKTICK_REGION),
    };
  }

  if (!existsSync(CONFIG_PATH)) {
    throw new Error(`No config found. Create ${CONFIG_PATH} or set TICKTICK_CLIENT_ID and TICKTICK_CLIENT_SECRET`);
  }

  const config = JSON.parse(await readFile(CONFIG_PATH, 'utf-8')) as Partial<TickTickConfig>;
  if (!config.clientId || !config.clientSecret) {
    throw new Error(`Invalid config file at ${CONFIG_PATH}`);
  }

  return {
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    redirectUri: config.redirectUri ?? 'http://localhost:18888/callback',
    region: normalizeRegion(config.region),
  };
}

export async function saveTickTickConfig(config: TickTickConfig): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), { mode: 0o600 });
}

export async function saveTickTickTokens(tokens: TickTickTokens): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
  await writeFile(TOKEN_PATH, JSON.stringify(tokens, null, 2), { mode: 0o600 });
}

export async function loadTickTickTokens(): Promise<TickTickTokens | null> {
  if (!existsSync(TOKEN_PATH)) return null;
  const text = await readFile(TOKEN_PATH, 'utf-8');
  return text.trim() ? JSON.parse(text) as TickTickTokens : null;
}

export async function clearTickTickTokens(): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
  await writeFile(TOKEN_PATH, '', { mode: 0o600 });
}

export function createTickTickApiRequest(): TickTickApiRequest {
  return async (method, path, body) => {
    const config = await loadTickTickConfig();
    const tokens = await loadTickTickTokens();
    if (!tokens?.accessToken) {
      throw new Error('Not authenticated. Add TickTick tokens before running API commands.');
    }

    const response = await fetch(`${API_URLS[config.region]}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${tokens.accessToken}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`TickTick API request failed (${response.status}): ${await response.text()}`);
    }

    if (response.status === 204) return undefined;
    const text = await response.text();
    return text ? JSON.parse(text) : undefined;
  };
}

function normalizeRegion(region: string | undefined): 'global' | 'china' {
  return region === 'china' ? 'china' : 'global';
}
