import test from 'node:test';
import assert from 'node:assert/strict';

import { queryTasks } from '../src/core/task-queries.js';
import type { TodoProject, TodoProvider, TodoTask } from '../src/domain/models.js';

test('queryTasks filters by created-after, excluded tags, excluded projects, and closed projects', async () => {
  const calls: string[] = [];
  const provider = fakeQueryProvider(calls);

  const result = await queryTasks(provider, {
    createdAfter: '2026-05-01T00:00:00Z',
    excludeTags: ['blocked'],
    excludeProjects: ['Archive'],
    skipClosed: true,
  });

  assert.deepEqual(calls, [
    'projects.list',
    'tasks.list:project-active',
    'tasks.get:project-active:69f53e800000000000000000',
  ]);
  assert.deepEqual(result, {
    count: 1,
    tasks: [
      {
        id: '69f53e80',
        fullId: '69f53e800000000000000000',
        projectId: 'active',
        fullProjectId: 'project-active',
        projectName: 'Active',
        title: 'recent clean task',
        content: 'Full task content',
        priority: 'high',
        tags: ['work'],
        status: 'active',
      },
    ],
  });
});

function fakeQueryProvider(calls: string[]): TodoProvider {
  const projects: TodoProject[] = [
    { id: 'active', fullId: 'project-active', name: 'Active' },
    { id: 'closed', fullId: 'project-closed', name: 'Closed', closed: true },
    { id: 'archive', fullId: 'project-archive', name: 'Archive' },
  ];
  const tasksByProject: Record<string, TodoTask[]> = {
    'project-active': [
      {
        id: '69f53e80',
        fullId: '69f53e800000000000000000',
        title: 'recent clean task',
        priority: 'high',
        tags: ['work'],
        status: 'active',
      },
      {
        id: '5e0be100',
        fullId: '5e0be1000000000000000000',
        title: 'old task',
        priority: 'medium',
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
    ],
    'project-closed': [
      {
        id: '69f53e82',
        fullId: '69f53e820000000000000000',
        title: 'closed project task',
        priority: 'high',
        tags: [],
        status: 'active',
      },
    ],
    'project-archive': [
      {
        id: '69f53e83',
        fullId: '69f53e830000000000000000',
        title: 'archive task',
        priority: 'high',
        tags: [],
        status: 'active',
      },
    ],
  };

  return {
    name: 'fake',
    projects: {
      async list() {
        calls.push('projects.list');
        return projects;
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
        return tasksByProject[projectId] ?? [];
      },
      async get(projectId, taskId) {
        calls.push(`tasks.get:${projectId}:${taskId}`);
        return {
          id: '69f53e80',
          fullId: '69f53e800000000000000000',
          title: 'recent clean task',
          content: 'Full task content',
          priority: 'high',
          tags: ['work'],
          status: 'active',
        };
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
      async completed() {
        throw new Error('unused');
      },
    },
  };
}
