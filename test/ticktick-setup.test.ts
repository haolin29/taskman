import test from 'node:test';
import assert from 'node:assert/strict';

import { createTickTickSetupService } from '../src/providers/ticktick/setup.js';

test('TickTick setup saves normalized config', async () => {
  let saved: unknown;
  const setup = createTickTickSetupService({
    saveConfig: async (config) => {
      saved = config;
    },
  });

  const result = await setup.configure({
    clientId: 'client-1',
    clientSecret: 'secret-1',
    redirectUri: undefined,
    region: 'china',
  });

  assert.deepEqual(saved, {
    clientId: 'client-1',
    clientSecret: 'secret-1',
    redirectUri: 'http://localhost:18888/callback',
    region: 'china',
  });
  assert.deepEqual(result, {
    success: true,
    message: 'TickTick config saved.',
    configPath: '~/.config/taskman/config.json',
    nextStep: 'Run: taskman auth login',
  });
});

test('TickTick setup rejects missing client credentials', async () => {
  const setup = createTickTickSetupService({
    saveConfig: async () => undefined,
  });

  await assert.rejects(
    () => setup.configure({
      clientId: '',
      clientSecret: 'secret-1',
      redirectUri: undefined,
      region: 'global',
    }),
    /client-id is required/
  );
});
