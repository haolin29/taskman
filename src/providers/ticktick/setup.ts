import {
  CONFIG_PATH_DISPLAY,
  saveTickTickConfig,
  type TickTickConfig,
} from './http-client.js';

export interface TickTickSetupInput {
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  region?: string;
}

export interface TickTickSetupResult {
  success: boolean;
  message: string;
  configPath: string;
  nextStep: string;
}

export interface TickTickSetupService {
  configure(input: TickTickSetupInput): Promise<TickTickSetupResult>;
}

interface TickTickSetupDeps {
  saveConfig: (config: TickTickConfig) => Promise<void>;
}

export function createTickTickSetupService(
  deps: TickTickSetupDeps = { saveConfig: saveTickTickConfig }
): TickTickSetupService {
  return {
    async configure(input) {
      const config = normalizeConfig(input);
      await deps.saveConfig(config);
      return {
        success: true,
        message: 'TickTick config saved.',
        configPath: CONFIG_PATH_DISPLAY,
        nextStep: 'Run: taskman auth login',
      };
    },
  };
}

function normalizeConfig(input: TickTickSetupInput): TickTickConfig {
  if (!input.clientId?.trim()) {
    throw new Error('client-id is required');
  }
  if (!input.clientSecret?.trim()) {
    throw new Error('client-secret is required');
  }

  return {
    clientId: input.clientId.trim(),
    clientSecret: input.clientSecret.trim(),
    redirectUri: input.redirectUri?.trim() || 'http://localhost:18888/callback',
    region: input.region === 'china' ? 'china' : 'global',
  };
}
