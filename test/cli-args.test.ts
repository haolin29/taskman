import test from 'node:test';
import assert from 'node:assert/strict';

import { parseArgs } from '../src/cli/args.js';

test('parseArgs treats --json as json output format', () => {
  const parsed = parseArgs(['projects', 'list', '--json']);

  assert.equal(parsed.command, 'projects');
  assert.equal(parsed.subcommand, 'list');
  assert.equal(parsed.options.format, 'json');
});

test('parseArgs collects provider-neutral command positionals', () => {
  const parsed = parseArgs(['tasks', 'create', 'inbox1234', 'Plan release', '--priority', 'high']);

  assert.equal(parsed.command, 'tasks');
  assert.equal(parsed.subcommand, 'create');
  assert.deepEqual(parsed.positional, ['inbox1234', 'Plan release']);
  assert.equal(parsed.options.priority, 'high');
});
