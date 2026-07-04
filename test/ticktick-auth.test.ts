import test from 'node:test';
import assert from 'node:assert/strict';

import { createTickTickAuthService } from '../src/providers/ticktick/auth.js';

test('TickTick auth login returns an authorization URL and next step', async () => {
  const auth = createTickTickAuthService({
    loadConfig: async () => ({
      clientId: 'client-1',
      clientSecret: 'secret-1',
      redirectUri: 'http://localhost:18888/callback',
      region: 'global',
    }),
    loadTokens: async () => null,
    saveTokens: async () => undefined,
    clearTokens: async () => undefined,
    fetchToken: async () => {
      throw new Error('unused');
    },
    now: () => 1000,
    createState: () => 'state-1',
  });

  const result = await auth.login();

  assert.equal(result.message, 'Open the authorization URL in your browser');
  assert.equal(result.state, 'state-1');
  assert.match(result.url, /^https:\/\/ticktick\.com\/oauth\/authorize\?/);
  assert.match(result.url, /client_id=client-1/);
  assert.match(result.url, /scope=tasks%3Aread\+tasks%3Awrite/);
  assert.equal(result.nextStep, 'Run: taskman auth exchange AUTH_CODE');
});

test('TickTick auth exchange saves normalized tokens', async () => {
  let saved: unknown;
  const auth = createTickTickAuthService({
    loadConfig: async () => ({
      clientId: 'client-1',
      clientSecret: 'secret-1',
      redirectUri: 'http://localhost:18888/callback',
      region: 'global',
    }),
    loadTokens: async () => null,
    saveTokens: async (tokens) => {
      saved = tokens;
    },
    clearTokens: async () => undefined,
    fetchToken: async (_region, body) => {
      assert.equal(body.get('grant_type'), 'authorization_code');
      assert.equal(body.get('code'), 'code-1');
      return {
        access_token: 'access-1',
        refresh_token: 'refresh-1',
        expires_in: 3600,
        token_type: 'Bearer',
      };
    },
    now: () => 1000,
    createState: () => 'state-1',
  });

  const result = await auth.exchange('code-1');

  assert.deepEqual(saved, {
    accessToken: 'access-1',
    refreshToken: 'refresh-1',
    expiresAt: 3601000,
    tokenType: 'Bearer',
    storedAt: 1000,
  });
  assert.equal(result.success, true);
  assert.equal(result.expiresAt, '1970-01-01T01:00:01.000Z');
});

test('TickTick auth status reports expired tokens', async () => {
  const auth = createTickTickAuthService({
    loadConfig: async () => {
      throw new Error('unused');
    },
    loadTokens: async () => ({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresAt: 900,
      tokenType: 'Bearer',
      storedAt: 0,
    }),
    saveTokens: async () => undefined,
    clearTokens: async () => undefined,
    fetchToken: async () => {
      throw new Error('unused');
    },
    now: () => 1000,
    createState: () => 'state-1',
  });

  const result = await auth.status();

  assert.deepEqual(result, {
    authenticated: true,
    expired: true,
    expiresAt: '1970-01-01T00:00:00.900Z',
    expiresIn: '0 seconds',
    tokenPath: '~/.config/taskman/ticktick-tokens.json',
  });
});
