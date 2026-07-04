import test from 'node:test';
import assert from 'node:assert/strict';

import { runCli } from '../src/cli/main.js';
import type { TodoProvider } from '../src/domain/models.js';
import type { SetupPromptService } from '../src/cli/setup-prompts.js';
import type { TickTickSetupService } from '../src/providers/ticktick/setup.js';

test('runCli writes JSON command output for agent callers', async () => {
  const output: string[] = [];
  const provider = fakeProvider();

  const code = await runCli(['projects', 'list', '--json'], {
    stdout: { write: (chunk) => output.push(chunk) },
    stderr: { write: () => undefined },
  }, provider);

  assert.equal(code, 0);
  assert.equal(output.join(''), '[\n  {\n    "id": "project1",\n    "fullId": "project123456",\n    "name": "Inbox"\n  }\n]\n');
});

test('runCli supports cross-project due query', async () => {
  const output: string[] = [];
  const provider = fakeProvider();

  const code = await runCli(['tasks', 'due', '3', '--json'], {
    stdout: { write: (chunk) => output.push(chunk) },
    stderr: { write: () => undefined },
  }, provider);

  assert.equal(code, 0);
  assert.deepEqual(JSON.parse(output.join('')), {
    days: 3,
    count: 1,
    tasks: [
      {
        id: 'task1',
        fullId: 'task123456',
        projectId: 'project1',
        fullProjectId: 'project123456',
        title: 'Ship CLI',
        dueDate: '2026-05-14T09:00:00Z',
        priority: 'high',
        tags: ['release'],
        status: 'active',
      },
    ],
  });
});

test('runCli dispatches completed task query options', async () => {
  const output: string[] = [];
  const provider = fakeProvider();

  const code = await runCli([
    'tasks',
    'completed',
    '--projects',
    'project123456,project223456',
    '--from',
    '2026-05-01',
    '--to',
    '2026-05-13',
    '--json',
  ], {
    stdout: { write: (chunk) => output.push(chunk) },
    stderr: { write: () => undefined },
  }, provider);

  assert.equal(code, 0);
  assert.deepEqual(JSON.parse(output.join('')), {
    count: 1,
    tasks: [
      {
        id: 'done1',
        fullId: 'done123456',
        title: 'Closed loop',
        priority: 'none',
        tags: [],
        completedTime: '2026-05-13T12:00:00Z',
      },
    ],
  });
});

test('runCli shows command-specific help', async () => {
  const output: string[] = [];

  const code = await runCli(['tasks', '--help'], {
    stdout: { write: (chunk) => output.push(chunk) },
    stderr: { write: () => undefined },
  }, fakeProvider());

  assert.equal(code, 0);
  assert.match(output.join(''), /Usage: taskman tasks <command>/);
  assert.match(output.join(''), /completed/);
});

test('runCli dispatches non-interactive TickTick setup', async () => {
  const output: string[] = [];

  const code = await runCli([
    'setup',
    'ticktick',
    '--client-id',
    'client-1',
    '--client-secret',
    'secret-1',
    '--region',
    'china',
    '--json',
  ], {
    stdout: { write: (chunk) => output.push(chunk) },
    stderr: { write: () => undefined },
  }, fakeProvider(), undefined, fakeSetup());

  assert.equal(code, 0);
  assert.deepEqual(JSON.parse(output.join('')), {
    success: true,
    message: 'TickTick config saved.',
    configPath: '~/.config/taskman/config.json',
    nextStep: 'Run: taskman auth login',
  });
});

test('runCli prompts for provider and TickTick config when setup has no subcommand', async () => {
  const output: string[] = [];
  const prompts: string[] = [];

  const code = await runCli(['setup', '--json'], {
    stdout: { write: (chunk) => output.push(chunk) },
    stderr: { write: () => undefined },
  }, fakeProvider(), undefined, fakeSetup(), fakePrompt(prompts));

  assert.equal(code, 0);
  assert.deepEqual(prompts, [
    'Provider (ticktick): ',
    'TickTick client id (create an app at https://developer.ticktick.com/): ',
    'TickTick client secret (from the same TickTick app): ',
    'Redirect URI (http://localhost:18888/callback): ',
    'Region (global/china) (global): ',
  ]);
  assert.deepEqual(JSON.parse(output.join('')), {
    success: true,
    message: 'TickTick config saved.',
    configPath: '~/.config/taskman/config.json',
    nextStep: 'Run: taskman auth login',
  });
});

test('runCli rejects unsupported interactive setup provider', async () => {
  const stderr: string[] = [];

  const code = await runCli(['setup'], {
    stdout: { write: () => undefined },
    stderr: { write: (chunk) => stderr.push(chunk) },
  }, fakeProvider(), undefined, fakeSetup(), {
    async ask() {
      return 'other';
    },
    close() {
      return undefined;
    },
  });

  assert.equal(code, 1);
  assert.match(stderr.join(''), /Unsupported setup provider: other/);
});

test('runCli dispatches batch tag updates', async () => {
  const output: string[] = [];
  const provider = batchProvider();

  const code = await runCli([
    'batch',
    'tag',
    '--query',
    'release',
    '--tags',
    'work',
    '--priority',
    'high',
    '--add-tags',
    'next',
    '--remove-tags',
    'stale',
    '--json',
  ], {
    stdout: { write: (chunk) => output.push(chunk) },
    stderr: { write: () => undefined },
  }, provider);

  assert.equal(code, 0);
  assert.deepEqual(JSON.parse(output.join('')), {
    matched: 1,
    updated: 1,
    dryRun: false,
    tasks: [
      {
        id: 'task1',
        fullId: 'task123456',
        projectId: 'project1',
        fullProjectId: 'project123456',
        title: 'release plan',
        priority: 'high',
        tags: ['work', 'next'],
      },
    ],
  });
});

test('runCli dispatches dry-run batch priority updates', async () => {
  const output: string[] = [];
  const provider = batchProvider();

  const code = await runCli([
    'batch',
    'priority',
    '--query',
    'release',
    '--priority',
    'medium',
    '--dry-run',
    '--json',
  ], {
    stdout: { write: (chunk) => output.push(chunk) },
    stderr: { write: () => undefined },
  }, provider);

  assert.equal(code, 0);
  assert.deepEqual(JSON.parse(output.join('')), {
    matched: 1,
    updated: 0,
    dryRun: true,
    tasks: [
      {
        id: 'task1',
        fullId: 'task123456',
        projectId: 'project1',
        fullProjectId: 'project123456',
        title: 'release plan',
        priority: 'high',
        tags: ['work', 'stale'],
      },
    ],
  });
});

test('runCli dispatches agent JSON batch updates', async () => {
  const output: string[] = [];
  const provider = agentBatchUpdateProvider();

  const code = await runCli([
    'batch',
    'update',
    '--input',
    JSON.stringify({
      updates: [
        {
          taskId: 'task123456',
          projectId: 'project123456',
          content: 'updated notes',
          priority: 'medium',
          tags: ['next'],
          reminders: ['15m'],
          dueDate: '2026-05-20',
        },
      ],
    }),
    '--json',
  ], {
    stdout: { write: (chunk) => output.push(chunk) },
    stderr: { write: () => undefined },
  }, provider);

  assert.equal(code, 0);
  assert.deepEqual(JSON.parse(output.join('')), {
    matched: 1,
    updated: 1,
    dryRun: false,
    tasks: [
      {
        id: 'task1',
        fullId: 'task123456',
        fullProjectId: 'project123456',
        title: 'release plan',
        content: 'updated notes',
        priority: 'medium',
        tags: ['next'],
        dueDate: '2026-05-20',
        reminders: ['15m'],
      },
    ],
  });
});

test('runCli shows batch update help with JSON examples', async () => {
  const output: string[] = [];

  const code = await runCli(['batch', 'update', '--help'], {
    stdout: { write: (chunk) => output.push(chunk) },
    stderr: { write: () => undefined },
  }, fakeProvider());

  assert.equal(code, 0);
  assert.match(output.join(''), /Usage: taskman batch update --input JSON/);
  assert.match(output.join(''), /"updates"/);
  assert.match(output.join(''), /"reminders": \["15m"\]/);
  assert.match(output.join(''), /"dueDate": "2026-05-20"/);
});

test('runCli passes project option to task update', async () => {
  const output: string[] = [];
  const provider = updateProvider();

  const code = await runCli([
    'tasks',
    'update',
    'task1234',
    '--project',
    'project123456',
    '--title',
    'test2',
    '--json',
  ], {
    stdout: { write: (chunk) => output.push(chunk) },
    stderr: { write: () => undefined },
  }, provider);

  assert.equal(code, 0);
  assert.deepEqual(JSON.parse(output.join('')), {
    success: true,
    task: {
      id: 'task1',
      fullId: 'task123456',
      title: 'test2',
      priority: 'none',
      tags: [],
    },
  });
});

test('runCli dispatches tasks query filters', async () => {
  const output: string[] = [];
  const provider = queryProvider();

  const code = await runCli([
    'tasks',
    'query',
    '--created-after',
    '2026-05-01T00:00:00Z',
    '--exclude-tags',
    'blocked',
    '--exclude-projects',
    'Archive',
    '--skip-closed',
    '--json',
  ], {
    stdout: { write: (chunk) => output.push(chunk) },
    stderr: { write: () => undefined },
  }, provider);

  assert.equal(code, 0);
  assert.deepEqual(JSON.parse(output.join('')), {
    count: 1,
    tasks: [
      {
        id: '69f53e80',
        fullId: '69f53e800000000000000000',
        projectId: 'active',
        fullProjectId: 'project-active',
        projectName: 'Active',
        title: 'recent clean task',
        content: 'CLI query content',
        priority: 'high',
        tags: ['work'],
        status: 'active',
      },
    ],
  });
});

function fakeProvider(): TodoProvider {
  return {
    name: 'fake',
    projects: {
      async list() {
        return [{ id: 'project1', fullId: 'project123456', name: 'Inbox' }];
      },
      async get() {
        throw new Error('unused');
      },
      async create() {
        throw new Error('unused');
      },
      async remove() {
        throw new Error('unused');
      },
    },
    tasks: {
      async list(projectId) {
        return [
          {
            id: 'task1',
            fullId: 'task123456',
            projectId: 'project1',
            fullProjectId: projectId,
            title: 'Ship CLI',
            dueDate: '2026-05-14T09:00:00Z',
            priority: 'high',
            tags: ['release'],
            status: 'active',
          },
          {
            id: 'task2',
            fullId: 'task223456',
            projectId: 'project1',
            fullProjectId: projectId,
            title: 'Done task',
            dueDate: '2026-05-14T09:00:00Z',
            priority: 'high',
            tags: [],
            status: 'completed',
          },
        ];
      },
      async get() {
        throw new Error('unused');
      },
      async create() {
        throw new Error('unused');
      },
      async update() {
        throw new Error('unused');
      },
      async complete() {
        throw new Error('unused');
      },
      async remove() {
        throw new Error('unused');
      },
      async completed(options) {
        assert.deepEqual(options, {
          projectIds: ['project123456', 'project223456'],
          startDate: '2026-05-01',
          endDate: '2026-05-13',
        });
        return {
          count: 1,
          tasks: [
            {
              id: 'done1',
              fullId: 'done123456',
              title: 'Closed loop',
              priority: 'none',
              tags: [],
              completedTime: '2026-05-13T12:00:00Z',
            },
          ],
        };
      },
    },
  };
}

function fakeSetup(): TickTickSetupService {
  return {
    async configure(input) {
      assert.deepEqual(input, {
        clientId: 'client-1',
        clientSecret: 'secret-1',
        redirectUri: undefined,
        region: 'china',
      });
      return {
        success: true,
        message: 'TickTick config saved.',
        configPath: '~/.config/taskman/config.json',
        nextStep: 'Run: taskman auth login',
      };
    },
  };
}

function fakePrompt(prompts: string[]): SetupPromptService {
  const answers = [
    '',
    'client-1',
    'secret-1',
    '',
    'china',
  ];
  return {
    async ask(prompt) {
      prompts.push(prompt);
      return answers.shift() ?? '';
    },
    close() {
      return undefined;
    },
  };
}

function batchProvider(): TodoProvider {
  return {
    ...fakeProvider(),
    tasks: {
      ...fakeProvider().tasks,
      async list() {
        return [
          {
            id: 'task1',
            fullId: 'task123456',
            title: 'release plan',
            priority: 'high',
            tags: ['work', 'stale'],
          },
        ];
      },
      async update() {
        return {
          success: true,
          task: {
            id: 'task1',
            fullId: 'task123456',
            title: 'release plan',
            priority: 'high',
            tags: ['work', 'next'],
          },
        };
      },
    },
  };
}

function agentBatchUpdateProvider(): TodoProvider {
  return {
    ...fakeProvider(),
    tasks: {
      ...fakeProvider().tasks,
      async update(taskId, input) {
        assert.equal(taskId, 'task123456');
        assert.deepEqual(input, {
          projectId: 'project123456',
          tags: ['next'],
          reminder: '15m',
          dueDate: '2026-05-20',
          content: 'updated notes',
          priority: 'medium',
        });
        return {
          success: true,
          task: {
            id: 'task1',
            fullId: taskId,
            fullProjectId: input.projectId,
            title: 'release plan',
            content: input.content,
            priority: input.priority ?? 'none',
            tags: Array.isArray(input.tags) ? input.tags : [],
            dueDate: input.dueDate,
            reminders: input.reminder?.split(',').filter(Boolean),
          },
        };
      },
    },
  };
}

function queryProvider(): TodoProvider {
  return {
    ...fakeProvider(),
    projects: {
      ...fakeProvider().projects,
      async list() {
        return [
          { id: 'active', fullId: 'project-active', name: 'Active' },
          { id: 'archive', fullId: 'project-archive', name: 'Archive' },
        ];
      },
    },
    tasks: {
      ...fakeProvider().tasks,
      async list(projectId) {
        if (projectId === 'project-archive') {
          return [
            {
              id: '69f53e83',
              fullId: '69f53e830000000000000000',
              title: 'archive task',
              priority: 'high',
              tags: [],
              status: 'active',
            },
          ];
        }
        return [
          {
            id: '69f53e80',
            fullId: '69f53e800000000000000000',
            title: 'recent clean task',
            priority: 'high',
            tags: ['work'],
            status: 'active',
          },
          {
            id: '69f53e81',
            fullId: '69f53e810000000000000000',
            title: 'blocked task',
            priority: 'high',
            tags: ['blocked'],
            status: 'active',
          },
        ];
      },
      async get(projectId, taskId) {
        assert.equal(projectId, 'project-active');
        assert.equal(taskId, '69f53e800000000000000000');
        return {
          id: '69f53e80',
          fullId: '69f53e800000000000000000',
          title: 'recent clean task',
          content: 'CLI query content',
          priority: 'high',
          tags: ['work'],
          status: 'active',
        };
      },
    },
  };
}

function updateProvider(): TodoProvider {
  return {
    ...fakeProvider(),
    tasks: {
      ...fakeProvider().tasks,
      async update(taskId, input) {
        assert.equal(taskId, 'task1234');
        assert.deepEqual(input, {
          projectId: 'project123456',
          title: 'test2',
          content: undefined,
          dueDate: undefined,
          priority: undefined,
          tags: undefined,
          addTags: undefined,
          removeTags: undefined,
          reminder: undefined,
        });
        return {
          success: true,
          task: {
            id: 'task1',
            fullId: 'task123456',
            title: 'test2',
            priority: 'none',
            tags: [],
          },
        };
      },
    },
  };
}

test('runCli passes --reminder to tasks create', async () => {
  let capturedInput: unknown;
  const provider: TodoProvider = {
    name: 'fake',
    projects: {
      async list() { return []; },
      async get() { throw new Error('unused'); },
      async create() { throw new Error('unused'); },
      async remove() { throw new Error('unused'); },
    },
    tasks: {
      async list() { return []; },
      async get() { throw new Error('unused'); },
      async create(input) {
        capturedInput = input;
        return { success: true, task: { id: 'task1', fullId: 'task123456', title: 'Meeting', priority: 'none', tags: [] } };
      },
      async update() { throw new Error('unused'); },
      async complete() { throw new Error('unused'); },
      async remove() { throw new Error('unused'); },
      async completed() { throw new Error('unused'); },
    },
  };

  const code = await runCli(
    ['tasks', 'create', 'Meeting', '--reminder', '15m,1h', '--json'],
    { stdout: { write: () => undefined }, stderr: { write: () => undefined } },
    provider,
  );

  assert.equal(code, 0);
  assert.deepEqual((capturedInput as Record<string, unknown>).reminder, '15m,1h');
});

test('runCli passes --reminder to tasks update', async () => {
  let capturedInput: unknown;
  const provider: TodoProvider = {
    name: 'fake',
    projects: {
      async list() {
        return [{ id: 'proj1', fullId: 'project123456', name: 'Inbox' }];
      },
      async get() {
        return {
          project: { id: 'proj1', fullId: 'project123456', name: 'Inbox' },
          tasks: [{ id: 'task1', fullId: 'task123456', title: 'Meeting', priority: 'none' as const, tags: [] }],
          taskCount: 1,
        };
      },
      async create() { throw new Error('unused'); },
      async remove() { throw new Error('unused'); },
    },
    tasks: {
      async list() { return []; },
      async get() { throw new Error('unused'); },
      async create() { throw new Error('unused'); },
      async update(_taskId, input) {
        capturedInput = input;
        return { success: true, task: { id: 'task1', fullId: 'task123456', title: 'Meeting', priority: 'none', tags: [] } };
      },
      async complete() { throw new Error('unused'); },
      async remove() { throw new Error('unused'); },
      async completed() { throw new Error('unused'); },
    },
  };

  const code = await runCli(
    ['tasks', 'update', 'task1234', '--project', 'project123456', '--reminder', '30m', '--json'],
    { stdout: { write: () => undefined }, stderr: { write: () => undefined } },
    provider,
  );

  assert.equal(code, 0);
  assert.deepEqual((capturedInput as Record<string, unknown>).reminder, '30m');
});
