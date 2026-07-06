import test from 'node:test';
import assert from 'node:assert/strict';

import { createTickTickProvider } from '../src/providers/ticktick/provider.js';

test('TickTick provider maps project list into domain projects', async () => {
  const calls: Array<{ method: string; path: string; body: unknown }> = [];
  const provider = createTickTickProvider(async (method, path, body) => {
    calls.push({ method, path, body });
    return [{
      id: 'abcdef123456',
      name: 'Inbox',
      color: '#00aa00',
      viewMode: 'list',
      closed: true,
      groupId: 'folder-1',
    }];
  });

  const projects = await provider.projects.list();

  assert.deepEqual(calls, [{ method: 'GET', path: '/project', body: undefined }]);
  assert.deepEqual(projects, [
    {
      id: 'abcdef12',
      fullId: 'abcdef123456',
      name: 'Inbox',
      color: '#00aa00',
      viewMode: 'list',
      closed: true,
      groupId: 'folder-1',
    },
  ]);
});

test('TickTick provider queries tasks through the filter endpoint', async () => {
  const calls: Array<{ method: string; path: string; body: unknown }> = [];
  const provider = createTickTickProvider(async (method, path, body) => {
    calls.push({ method, path, body });
    if (path === '/task/filter') {
      return [
        {
          id: '69f53e800000000000000000',
          projectId: 'project-active',
          title: 'recent clean task',
          content: 'Full task content',
          priority: 5,
          tags: ['work'],
          reminders: ['TRIGGER:-PT30M'],
          status: 0,
        },
        {
          id: '69f53e810000000000000000',
          projectId: 'project-active',
          title: 'blocked task',
          priority: 5,
          tags: ['blocked'],
          status: 0,
        },
        {
          id: '69f53e820000000000000000',
          projectId: 'project-closed',
          title: 'closed project task',
          priority: 5,
          tags: [],
          status: 0,
        },
        {
          id: '69f53e830000000000000000',
          projectId: 'inbox115491937',
          title: 'system inbox task',
          priority: 5,
          tags: [],
          status: 0,
        },
      ];
    }
    return [
      { id: 'project-active', name: 'Active' },
      { id: 'project-closed', name: 'Closed', closed: true },
    ];
  });

  const result = await provider.tasks.query?.({
    createdAfter: '2026-05-01T00:00:00Z',
    excludeTags: ['blocked'],
    skipClosed: true,
  });

  assert.deepEqual(calls, [
    { method: 'POST', path: '/task/filter', body: { status: [0] } },
    { method: 'GET', path: '/project', body: undefined },
  ]);
  assert.deepEqual(result, {
    count: 2,
    tasks: [
      {
        id: '69f53e80',
        fullId: '69f53e800000000000000000',
        projectId: 'project-',
        fullProjectId: 'project-active',
        projectName: 'Active',
        title: 'recent clean task',
        content: 'Full task content',
        priority: 'high',
        tags: ['work'],
        reminders: ['30m'],
        status: 'active',
      },
      {
        id: '69f53e83',
        fullId: '69f53e830000000000000000',
        projectId: 'inbox115',
        fullProjectId: 'inbox115491937',
        title: 'system inbox task',
        content: '',
        priority: 'high',
        tags: [],
        status: 'active',
      },
    ],
  });
});

test('TickTick provider creates tasks with normalized priority and tags', async () => {
  const calls: Array<{ method: string; path: string; body: unknown }> = [];
  const provider = createTickTickProvider(async (method, path, body) => {
    calls.push({ method, path, body });
    return {
      id: 'task123456789',
      projectId: 'project123456',
      title: 'Plan release',
      priority: 5,
      tags: ['work', 'release'],
    };
  });

  const result = await provider.tasks.create({
    projectId: 'project123456',
    title: 'Plan release',
    priority: 'high',
    tags: 'work, release',
  });

  assert.deepEqual(calls, [
    {
      method: 'POST',
      path: '/task',
      body: {
        projectId: 'project123456',
        title: 'Plan release',
        priority: 5,
        tags: ['work', 'release'],
      },
    },
  ]);
  assert.deepEqual(result.task, {
    id: 'task1234',
    fullId: 'task123456789',
    projectId: 'project1',
    fullProjectId: 'project123456',
    title: 'Plan release',
    priority: 'high',
    tags: ['work', 'release'],
  });
});

test('TickTick provider resolves short project IDs before project reads', async () => {
  const calls: Array<{ method: string; path: string; body: unknown }> = [];
  const provider = createTickTickProvider(async (method, path, body) => {
    calls.push({ method, path, body });
    if (path === '/project') {
      return [{ id: 'abcdef123456', name: 'Inbox' }];
    }
    return {
      project: { id: 'abcdef123456', name: 'Inbox' },
      tasks: [],
    };
  });

  const result = await provider.projects.get('abcdef12');

  assert.equal(result.project.fullId, 'abcdef123456');
  assert.deepEqual(calls.map((call) => call.path), ['/project', '/project/abcdef123456/data']);
});

test('TickTick provider resolves short task IDs across projects before update', async () => {
  const calls: Array<{ method: string; path: string; body: unknown }> = [];
  const provider = createTickTickProvider(async (method, path, body) => {
    calls.push({ method, path, body });
    if (path === '/project') {
      return [{ id: 'project123456', name: 'Inbox' }];
    }
    if (path === '/project/project123456/data') {
      return {
        project: { id: 'project123456', name: 'Inbox' },
        tasks: [{ id: 'task123456789', projectId: 'project123456', title: 'Old', priority: 0 }],
      };
    }
    return {
      id: 'task123456789',
      projectId: 'project123456',
      title: 'Old',
      priority: 3,
      tags: [],
    };
  });

  const result = await provider.tasks.update('task1234', { priority: 'medium' });

  assert.deepEqual(calls.map((call) => call.path), [
    '/project',
    '/project/project123456/data',
    '/task/task123456789',
  ]);
  assert.deepEqual(calls[2].body, { id: 'task123456789', projectId: 'project123456', priority: 3 });
  assert.equal(result.task.priority, 'medium');
});

test('TickTick provider uses provided project ID when updating a task', async () => {
  const calls: Array<{ method: string; path: string; body: unknown }> = [];
  const provider = createTickTickProvider(async (method, path, body) => {
    calls.push({ method, path, body });
    if (path === '/project') {
      return [{ id: 'project123456', name: 'Inbox' }];
    }
    if (path === '/project/project123456/data') {
      return {
        project: { id: 'project123456', name: 'Inbox' },
        tasks: [{ id: 'task123456789', projectId: 'project123456', title: 'Old', priority: 0 }],
      };
    }
    return {
      id: 'task123456789',
      projectId: 'project123456',
      title: 'test2',
      priority: 0,
      tags: [],
    };
  });

  const result = await provider.tasks.update('task1234', { projectId: 'project123456', title: 'test2' });

  assert.deepEqual(calls.map((call) => call.path), [
    '/project/project123456/data',
    '/task/task123456789',
  ]);
  assert.equal(result.task.title, 'test2');
});

test('TickTick provider sends empty update fields for clear operations', async () => {
  const calls: Array<{ method: string; path: string; body: unknown }> = [];
  const provider = createTickTickProvider(async (method, path, body) => {
    calls.push({ method, path, body });
    if (path === '/project/project123456/data') {
      return {
        project: { id: 'project123456', name: 'Inbox' },
        tasks: [{ id: 'task123456789', projectId: 'project123456', title: 'Old', priority: 0 }],
      };
    }
    return {
      id: 'task123456789',
      projectId: 'project123456',
      title: 'Old',
      content: '',
      priority: 0,
      tags: [],
      reminders: [],
    };
  });

  const result = await provider.tasks.update('task1234', {
    projectId: 'project123456',
    content: '',
    tags: [],
    reminder: '',
  });

  assert.deepEqual(calls.map((call) => call.path), [
    '/project/project123456/data',
    '/task/task123456789',
  ]);
  assert.deepEqual(calls[1].body, {
    id: 'task123456789',
    projectId: 'project123456',
    content: '',
    tags: [],
    reminders: [],
  });
  assert.deepEqual(result.task.tags, []);
  assert.equal(result.task.content, undefined);
});

test('TickTick provider fetches updated task when update response is empty', async () => {
  const calls: Array<{ method: string; path: string; body: unknown }> = [];
  const provider = createTickTickProvider(async (method, path, body) => {
    calls.push({ method, path, body });
    if (path === '/project') {
      return [{ id: 'project123456', name: 'Inbox' }];
    }
    if (path === '/project/project123456/data') {
      return {
        project: { id: 'project123456', name: 'Inbox' },
        tasks: [{ id: 'task123456789', projectId: 'project123456', title: 'Old', priority: 0 }],
      };
    }
    if (method === 'POST' && path === '/task/task123456789') {
      return undefined;
    }
    return {
      id: 'task123456789',
      projectId: 'project123456',
      title: 'test2',
      priority: 0,
      tags: [],
    };
  });

  const result = await provider.tasks.update('task1234', { title: 'test2' });

  assert.deepEqual(calls.map((call) => call.path), [
    '/project',
    '/project/project123456/data',
    '/task/task123456789',
    '/project/project123456/task/task123456789',
  ]);
  assert.equal(result.task.title, 'test2');
});

test('TickTick provider resolves full task IDs to project context before update fallback fetch', async () => {
  const calls: Array<{ method: string; path: string; body: unknown }> = [];
  const provider = createTickTickProvider(async (method, path, body) => {
    calls.push({ method, path, body });
    if (path === '/project') {
      return [{ id: 'project123456', name: 'Inbox' }];
    }
    if (path === '/project/project123456/data') {
      return {
        project: { id: 'project123456', name: 'Inbox' },
        tasks: [{ id: 'task123456789', projectId: 'project123456', title: 'Old', priority: 0 }],
      };
    }
    if (method === 'POST' && path === '/task/task123456789') {
      return undefined;
    }
    return {
      id: 'task123456789',
      projectId: 'project123456',
      title: 'test2',
      priority: 0,
      tags: [],
    };
  });

  const result = await provider.tasks.update('task123456789', { title: 'test2' });

  assert.deepEqual(calls.map((call) => call.path), [
    '/project',
    '/project/project123456/data',
    '/task/task123456789',
    '/project/project123456/task/task123456789',
  ]);
  assert.equal(result.task.title, 'test2');
});

test('TickTick provider merges add-tags and remove-tags during update', async () => {
  const calls: Array<{ method: string; path: string; body: unknown }> = [];
  const provider = createTickTickProvider(async (method, path, body) => {
    calls.push({ method, path, body });
    if (path === '/project') {
      return [{ id: 'project123456', name: 'Inbox' }];
    }
    if (path === '/project/project123456/data') {
      return {
        project: { id: 'project123456', name: 'Inbox' },
        tasks: [{ id: 'task123456789', projectId: 'project123456', title: 'Old', priority: 0 }],
      };
    }
    if (path === '/project/project123456/task/task123456789') {
      return {
        id: 'task123456789',
        projectId: 'project123456',
        title: 'Old',
        priority: 0,
        tags: ['old', 'keep'],
      };
    }
    return {
      id: 'task123456789',
      projectId: 'project123456',
      title: 'Old',
      priority: 0,
      tags: ['keep', 'new'],
    };
  });

  const result = await provider.tasks.update('task1234', {
    addTags: ['new', 'keep'],
    removeTags: ['old'],
  });

  assert.deepEqual(calls.map((call) => call.path), [
    '/project',
    '/project/project123456/data',
    '/project/project123456/task/task123456789',
    '/task/task123456789',
  ]);
  assert.deepEqual(calls[3].body, { id: 'task123456789', projectId: 'project123456', tags: ['keep', 'new'] });
  assert.deepEqual(result.task.tags, ['keep', 'new']);
});

test('TickTick provider creates task with reminders converted to ICAL triggers', async () => {
  const calls: Array<{ method: string; path: string; body: unknown }> = [];
  const provider = createTickTickProvider(async (method, path, body) => {
    calls.push({ method, path, body });
    return {
      id: 'task123456789',
      title: 'Meeting',
      reminders: [{ trigger: 'TRIGGER:-PT15M' }, { trigger: 'TRIGGER:-PT1H' }],
    };
  });

  const result = await provider.tasks.create({ title: 'Meeting', reminder: '15m,1h' });

  assert.deepEqual(calls[0].body, {
    title: 'Meeting',
    reminders: [{ trigger: 'TRIGGER:-PT15M' }, { trigger: 'TRIGGER:-PT1H' }],
  });
  assert.deepEqual(result.task.reminders, ['15m', '1h']);
});

test('TickTick provider maps API reminders to human-readable domain strings', async () => {
  const provider = createTickTickProvider(async (_method, path) => {
    if (path.includes('/data')) {
      return {
        project: { id: 'proj123456789', name: 'Inbox' },
        tasks: [
          {
            id: 'task123456789',
            projectId: 'proj123456789',
            title: 'Meeting',
            priority: 0,
            reminders: [
              { trigger: 'TRIGGER:-PT30M' },
              { trigger: 'TRIGGER:-P1D' },
            ],
          },
        ],
      };
    }
    return [];
  });

  const tasks = await provider.tasks.list('proj123456789');
  assert.deepEqual(tasks[0].reminders, ['30m', '1d']);
});

test('TickTick provider handles 0m reminder (at due time)', async () => {
  const calls: Array<{ method: string; path: string; body: unknown }> = [];
  const provider = createTickTickProvider(async (method, path, body) => {
    calls.push({ method, path, body });
    return {
      id: 'task123456789',
      title: 'Standup',
      reminders: [{ trigger: 'TRIGGER:PT0S' }],
    };
  });

  const result = await provider.tasks.create({ title: 'Standup', reminder: '0m' });

  assert.deepEqual(calls[0].body, {
    title: 'Standup',
    reminders: [{ trigger: 'TRIGGER:PT0S' }],
  });
  assert.deepEqual(result.task.reminders, ['0m']);
});

test('TickTick provider lists completed tasks with date filters', async () => {
  const calls: Array<{ method: string; path: string; body: unknown }> = [];
  const provider = createTickTickProvider(async (method, path, body) => {
    calls.push({ method, path, body });
    return [
      {
        id: 'task123456789',
        projectId: 'project123456',
        title: 'Finished',
        completedTime: '2026-05-13T10:00:00Z',
        dueDate: '2026-05-12T10:00:00Z',
        priority: 5,
        tags: ['done'],
      },
    ];
  });

  const result = await provider.tasks.completed({
    projectIds: ['project123456'],
    startDate: '2026-05-01',
    endDate: '2026-05-13',
  });

  assert.deepEqual(calls, [
    {
      method: 'POST',
      path: '/task/completed',
      body: {
        projectIds: ['project123456'],
        startDate: '2026-05-01',
        endDate: '2026-05-13',
      },
    },
  ]);
  assert.deepEqual(result, {
    count: 1,
    tasks: [
      {
        id: 'task1234',
        fullId: 'task123456789',
        projectId: 'project1',
        fullProjectId: 'project123456',
        title: 'Finished',
        completedTime: '2026-05-13T10:00:00Z',
        dueDate: '2026-05-12T10:00:00Z',
        priority: 'high',
        tags: ['done'],
      },
    ],
  });
});
