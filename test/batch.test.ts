import test from 'node:test';
import assert from 'node:assert/strict';

import {
  batchCompleteTasks,
  batchUpdatePriority,
  batchUpdateTags,
  batchUpdateTasks,
  parseBatchUpdateJson,
} from '../src/core/batch.js';
import type { TaskUpdateInput, TodoProvider, TodoTask } from '../src/domain/models.js';

test('batchUpdateTags updates tasks matched by search options', async () => {
  const updated: Array<{ taskId: string; addTags?: string[]; removeTags?: string[] }> = [];
  const provider = fakeProvider(updated);

  const result = await batchUpdateTags(provider, {
    keyword: 'release',
    tags: ['work'],
    priority: 'high',
    addTags: ['next'],
    removeTags: ['stale'],
  });

  assert.deepEqual(updated, [
    { taskId: 'task123456', addTags: ['next'], removeTags: ['stale'] },
  ]);
  assert.deepEqual(result, {
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

test('batchUpdatePriority supports dry-run without updating tasks', async () => {
  const calls: string[] = [];
  const provider = fakeProviderWithCalls(calls);

  const result = await batchUpdatePriority(provider, {
    keyword: 'release',
    priority: 'medium',
    dryRun: true,
  });

  assert.deepEqual(calls, ['projects.list', 'tasks.list:project123456']);
  assert.deepEqual(result, {
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

test('batchUpdatePriority updates matched task priority', async () => {
  const calls: string[] = [];
  const provider = fakeProviderWithCalls(calls);

  const result = await batchUpdatePriority(provider, {
    keyword: 'release',
    priority: 'medium',
  });

  assert.deepEqual(calls, [
    'projects.list',
    'tasks.list:project123456',
    'tasks.update:task123456:medium',
  ]);
  assert.equal(result.matched, 1);
  assert.equal(result.updated, 1);
  assert.equal(result.tasks[0]?.priority, 'medium');
});

test('batchCompleteTasks completes matched tasks with project IDs', async () => {
  const calls: string[] = [];
  const provider = fakeProviderWithCalls(calls);

  const result = await batchCompleteTasks(provider, {
    keyword: 'release',
  });

  assert.deepEqual(calls, [
    'projects.list',
    'tasks.list:project123456',
    'tasks.complete:project123456:task123456',
  ]);
  assert.deepEqual(result, {
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
        tags: ['work', 'stale'],
      },
    ],
  });
});

test('parseBatchUpdateJson accepts only agent batch update fields', () => {
  const input = parseBatchUpdateJson(JSON.stringify({
    dryRun: true,
    updates: [
      {
        taskId: 'task123456',
        projectId: 'project123456',
        tags: ['work', 'next'],
        reminders: ['15m', '1h'],
        dueDate: '2026-05-20',
        content: '',
        priority: 'high',
      },
    ],
  }));

  assert.deepEqual(input, {
    dryRun: true,
    updates: [
      {
        taskId: 'task123456',
        projectId: 'project123456',
        tags: ['work', 'next'],
        reminders: ['15m', '1h'],
        dueDate: '2026-05-20',
        content: '',
        priority: 'high',
      },
    ],
  });
});

test('parseBatchUpdateJson rejects unknown update fields', () => {
  assert.throws(
    () => parseBatchUpdateJson(JSON.stringify({
      updates: [
        {
          taskId: 'task123456',
          title: 'not allowed',
        },
      ],
    })),
    /updates\[0\]\.title is not supported/
  );
});

test('batchUpdateTasks updates explicit tasks from schema-validated input', async () => {
  const updated: Array<{ taskId: string; input: TaskUpdateInput }> = [];
  const provider = explicitUpdateProvider(updated);

  const result = await batchUpdateTasks(provider, {
    updates: [
      {
        taskId: 'task123456',
        projectId: 'project123456',
        tags: [],
        reminders: ['15m', '1h'],
        dueDate: '2026-05-20T10:00:00Z',
        content: '',
        priority: 'medium',
      },
    ],
  });

  assert.deepEqual(updated, [
    {
      taskId: 'task123456',
      input: {
        projectId: 'project123456',
        tags: [],
        reminder: '15m,1h',
        dueDate: '2026-05-20T10:00:00Z',
        content: '',
        priority: 'medium',
      },
    },
  ]);
  assert.deepEqual(result, {
    matched: 1,
    updated: 1,
    dryRun: false,
    tasks: [
      {
        id: 'task1',
        fullId: 'task123456',
        fullProjectId: 'project123456',
        title: 'release plan',
        content: '',
        priority: 'medium',
        tags: [],
        dueDate: '2026-05-20T10:00:00Z',
        reminders: ['15m', '1h'],
      },
    ],
  });
});

function fakeProvider(updated: Array<{ taskId: string; addTags?: string[]; removeTags?: string[] }>): TodoProvider {
  const task: TodoTask = {
    id: 'task1',
    fullId: 'task123456',
    title: 'release plan',
    priority: 'high',
    tags: ['work', 'stale'],
  };

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
      async list() {
        return [task];
      },
      async get() {
        throw new Error('unused');
      },
      async create() {
        throw new Error('unused');
      },
      async update(taskId, input) {
        updated.push({
          taskId,
          addTags: input.addTags,
          removeTags: input.removeTags,
        });
        return {
          success: true,
          task: {
            ...task,
            tags: ['work', 'next'],
          },
        };
      },
      async complete() {
        throw new Error('unused');
      },
      async remove() {
        throw new Error('unused');
      },
      async completed() {
        throw new Error('unused');
      },
    },
  };
}

function fakeProviderWithCalls(calls: string[]): TodoProvider {
  const task: TodoTask = {
    id: 'task1',
    fullId: 'task123456',
    fullProjectId: 'project123456',
    title: 'release plan',
    priority: 'high',
    tags: ['work', 'stale'],
  };

  return {
    name: 'fake',
    projects: {
      async list() {
        calls.push('projects.list');
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
        calls.push(`tasks.list:${projectId}`);
        return [task];
      },
      async get() {
        throw new Error('unused');
      },
      async create() {
        throw new Error('unused');
      },
      async update(taskId, input) {
        calls.push(`tasks.update:${taskId}:${input.priority}`);
        return {
          success: true,
          task: {
            ...task,
            priority: input.priority ?? task.priority,
          },
        };
      },
      async complete(projectId, taskId) {
        calls.push(`tasks.complete:${projectId}:${taskId}`);
        return { success: true, message: 'completed' };
      },
      async remove() {
        throw new Error('unused');
      },
      async completed() {
        throw new Error('unused');
      },
    },
  };
}

function explicitUpdateProvider(updated: Array<{ taskId: string; input: TaskUpdateInput }>): TodoProvider {
  return {
    name: 'fake',
    projects: {
      async list() {
        throw new Error('unused');
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
      async list() {
        throw new Error('unused');
      },
      async get() {
        throw new Error('unused');
      },
      async create() {
        throw new Error('unused');
      },
      async update(taskId, input) {
        updated.push({ taskId, input });
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
      async complete() {
        throw new Error('unused');
      },
      async remove() {
        throw new Error('unused');
      },
      async completed() {
        throw new Error('unused');
      },
    },
  };
}
