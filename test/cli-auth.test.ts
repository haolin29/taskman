import test from 'node:test';
import assert from 'node:assert/strict';

import { runCli } from '../src/cli/main.js';
import type { TickTickAuthService } from '../src/providers/ticktick/auth.js';

test('runCli dispatches auth status with JSON output', async () => {
  const output: string[] = [];

  const code = await runCli(['auth', 'status', '--json'], {
    stdout: { write: (chunk) => output.push(chunk) },
    stderr: { write: () => undefined },
  }, undefined, fakeAuth());

  assert.equal(code, 0);
  assert.deepEqual(JSON.parse(output.join('')), {
    authenticated: false,
    message: 'Not authenticated. Run: taskman auth login',
  });
});

function fakeAuth(): TickTickAuthService {
  return {
    async status() {
      return {
        authenticated: false,
        message: 'Not authenticated. Run: taskman auth login',
      };
    },
    async login() {
      throw new Error('unused');
    },
    async exchange() {
      throw new Error('unused');
    },
    async refresh() {
      throw new Error('unused');
    },
    async logout() {
      throw new Error('unused');
    },
  };
}
