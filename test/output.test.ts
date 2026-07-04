import test from 'node:test';
import assert from 'node:assert/strict';

import { formatOutput } from '../src/output/format.js';

test('formatOutput emits json for agent workflows', () => {
  const output = formatOutput([{ id: 'abc12345', name: 'Inbox' }], 'json');

  assert.equal(output, '[\n  {\n    "id": "abc12345",\n    "name": "Inbox"\n  }\n]');
});

test('formatOutput emits compact project text', () => {
  const output = formatOutput([{ id: 'abc12345', name: 'Inbox', color: '#00aa00' }], 'text');

  assert.match(output, /ID\s+\| Name/);
  assert.match(output, /abc12345 \| Inbox/);
});

test('formatOutput renders reminders in task detail text view', () => {
  const task = {
    id: 'task1234',
    fullId: 'task123456789',
    title: 'Meeting',
    priority: 'none',
    tags: [],
    reminders: ['15m', '1h'],
  };

  const output = formatOutput(task, 'text');

  assert.match(output, /Reminders: 15m, 1h/);
});
