import type {
  CompletedTaskOptions,
  TaskCreateInput,
  TaskMutationResult,
  TaskQueryOptions,
  TaskUpdateInput,
  TodoProject,
  TodoProvider,
  TodoTask,
} from '../../domain/models.js';
import { shortId } from '../../core/ids.js';
import { formatPriority, parsePriority } from '../../core/priority.js';

export type TickTickApiRequest = (method: string, path: string, body?: unknown) => Promise<unknown>;

interface TickTickProject {
  id: string;
  name: string;
  color?: string;
  viewMode?: string;
  closed?: boolean;
  groupId?: string;
}

interface TickTickTask {
  id: string;
  projectId?: string;
  title: string;
  content?: string;
  dueDate?: string;
  priority?: number;
  tags?: string[];
  reminders?: Array<string | { trigger: string }>;
  status?: number;
  completedTime?: string;
}

interface TickTickProjectData {
  project: TickTickProject;
  tasks: TickTickTask[];
}

// TickTick query endpoint entrypoint. It uses the provider's server-side filter API, then applies Taskman's agent-facing filters.
async function queryTickTickTasks(
  request: TickTickApiRequest,
  options: TaskQueryOptions = {}
): Promise<{ count: number; tasks: TodoTask[] }> {
  const [rawTasks, projects] = await Promise.all([
    request('POST', '/task/filter', { status: [0] }) as Promise<TickTickTask[]>,
    request('GET', '/project') as Promise<TickTickProject[]>,
  ]);
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const excludeTagSet = new Set(options.excludeTags ?? []);
  const excludedProjects = new Set((options.excludeProjects ?? []).map((name) => name.toLowerCase()));
  const cutoffMs = options.createdAfter ? new Date(options.createdAfter).getTime() : null;

  const tasks = rawTasks
    .map(mapTask)
    .filter((task) => task.status !== 'completed')
    .filter((task) => cutoffMs === null || createdTimeFromObjectId(task.fullId) >= cutoffMs)
    .filter((task) => excludeTagSet.size === 0 || !task.tags.some((tag) => excludeTagSet.has(tag)))
    .filter((task) => {
      const project = task.fullProjectId ? projectById.get(task.fullProjectId) : undefined;
      if (options.skipClosed && project?.closed) return false;
      if (project && excludedProjects.has(project.name.toLowerCase())) return false;
      return true;
    })
    .map((task) => {
      const project = task.fullProjectId ? projectById.get(task.fullProjectId) : undefined;
      const mapped = {
        ...task,
        content: task.content ?? '',
      };
      if (task.projectName ?? project?.name) mapped.projectName = task.projectName ?? project?.name;
      return mapped;
    });

  return { count: tasks.length, tasks };
}

export function createTickTickProvider(request: TickTickApiRequest): TodoProvider {
  return {
    name: 'ticktick',
    projects: {
      async list() {
        const projects = await request('GET', '/project') as TickTickProject[];
        return projects.map(mapProject);
      },
      async get(projectId) {
        const resolvedProjectId = await resolveProjectId(projectId, request);
        const data = await request(
          'GET',
          `/project/${encodeURIComponent(resolvedProjectId)}/data`
        ) as TickTickProjectData;
        const tasks = data.tasks.map(mapTask);
        return {
          project: mapProject(data.project),
          tasks,
          taskCount: tasks.length,
        };
      },
      async create(name, options = {}) {
        const project = await request('POST', '/project', { name, ...options }) as TickTickProject;
        return { success: true, project: mapProject(project) };
      },
      async remove(projectId) {
        const resolvedProjectId = await resolveProjectId(projectId, request);
        await request('DELETE', `/project/${encodeURIComponent(resolvedProjectId)}`);
        return { success: true, message: `Project ${shortId(resolvedProjectId)} deleted` };
      },
    },
    tasks: {
      async list(projectId) {
        const resolvedProjectId = await resolveProjectId(projectId, request);
        const data = await request(
          'GET',
          `/project/${encodeURIComponent(resolvedProjectId)}/data`
        ) as TickTickProjectData;
        return data.tasks.map(mapTask);
      },
      async get(projectId, taskId) {
        const resolvedProjectId = await resolveProjectId(projectId, request);
        const resolvedTaskId = await resolveTaskId(taskId, resolvedProjectId, request);
        const task = await request(
          'GET',
          `/project/${encodeURIComponent(resolvedProjectId)}/task/${encodeURIComponent(resolvedTaskId)}`
        ) as TickTickTask;
        return mapTask(task);
      },
      async create(input) {
        const projectId = input.projectId ? await resolveProjectId(input.projectId, request) : undefined;
        const body = buildTaskCreateBody({ ...input, projectId });
        const task = await request('POST', '/task', body) as TickTickTask;
        return mapTaskMutation(task);
      },
      async update(taskId, input) {
        const resolvedTask = input.projectId
          ? await resolveTaskInProject(taskId, input.projectId, request)
          : await resolveTask(taskId, request);
        const body = {
          id: resolvedTask.id,
          ...await buildTaskUpdateBody(
            { ...input, projectId: resolvedTask.projectId ?? undefined },
            resolvedTask,
            request
          ),
        };
        const task = await request('POST', `/task/${encodeURIComponent(resolvedTask.id)}`, body) as TickTickTask;
        const updatedTask = task ?? await fetchResolvedTask(resolvedTask, request);
        return mapTaskMutation(updatedTask);
      },
      async complete(projectId, taskId) {
        const resolvedProjectId = await resolveProjectId(projectId, request);
        const resolvedTaskId = await resolveTaskId(taskId, resolvedProjectId, request);
        await request(
          'POST',
          `/project/${encodeURIComponent(resolvedProjectId)}/task/${encodeURIComponent(resolvedTaskId)}/complete`
        );
        return { success: true, message: `Task ${shortId(resolvedTaskId)} completed` };
      },
      async remove(projectId, taskId) {
        const resolvedProjectId = await resolveProjectId(projectId, request);
        const resolvedTaskId = await resolveTaskId(taskId, resolvedProjectId, request);
        await request(
          'DELETE',
          `/project/${encodeURIComponent(resolvedProjectId)}/task/${encodeURIComponent(resolvedTaskId)}`
        );
        return { success: true, message: `Task ${shortId(resolvedTaskId)} deleted` };
      },
      async completed(options = {}) {
        const tasks = await request('POST', '/task/completed', buildCompletedBody(options)) as TickTickTask[];
        const mapped = tasks.map(mapCompletedTask)
          .sort((first, second) =>
            new Date(second.completedTime ?? 0).getTime() - new Date(first.completedTime ?? 0).getTime()
          );
        return { count: mapped.length, tasks: mapped };
      },
      query(options = {}) {
        return queryTickTickTasks(request, options);
      },
    },
  };
}

function buildTaskCreateBody(input: TaskCreateInput): Record<string, unknown> {
  if (!input.title?.trim()) {
    throw new Error('Title is required');
  }

  const body: Record<string, unknown> = { title: input.title.trim() };
  if (input.projectId) body.projectId = input.projectId;
  if (input.content) body.content = input.content;
  if (input.dueDate) body.dueDate = input.dueDate;
  if (input.priority) body.priority = parsePriority(input.priority);
  if (input.tags) body.tags = normalizeTags(input.tags);
  if (input.reminder) body.reminders = buildReminderTriggers(input.reminder);
  return body;
}

async function buildTaskUpdateBody(
  input: TaskUpdateInput,
  resolvedTask: { id: string; projectId: string | null },
  request: TickTickApiRequest
): Promise<Record<string, unknown>> {
  const body: Record<string, unknown> = {};
  if (input.title !== undefined) {
    if (!input.title.trim()) throw new Error('Title is required');
    body.title = input.title.trim();
  }
  if (input.projectId) body.projectId = input.projectId;
  if (input.content !== undefined) body.content = input.content;
  if (input.dueDate) body.dueDate = input.dueDate;
  if (input.priority) body.priority = parsePriority(input.priority);
  if (input.tags !== undefined) body.tags = normalizeTags(input.tags);
  if (!input.tags && (input.addTags?.length || input.removeTags?.length)) {
    body.tags = await mergeTaskTags(input, resolvedTask, request);
  }
  if (input.reminder !== undefined) body.reminders = buildReminderTriggers(input.reminder);
  return body;
}

async function mergeTaskTags(
  input: TaskUpdateInput,
  resolvedTask: { id: string; projectId: string | null },
  request: TickTickApiRequest
): Promise<string[]> {
  let existingTags: string[] = [];
  if (resolvedTask.projectId) {
    const task = await request(
      'GET',
      `/project/${encodeURIComponent(resolvedTask.projectId)}/task/${encodeURIComponent(resolvedTask.id)}`
    ) as TickTickTask;
    existingTags = task.tags ?? [];
  }

  const removeSet = new Set(input.removeTags ?? []);
  const merged = existingTags.filter((tag) => !removeSet.has(tag));
  for (const tag of input.addTags ?? []) {
    const trimmed = tag.trim();
    if (trimmed && !merged.includes(trimmed)) merged.push(trimmed);
  }
  return merged;
}

function buildCompletedBody(options: CompletedTaskOptions): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (options.projectIds?.length) body.projectIds = options.projectIds;
  if (options.startDate) body.startDate = options.startDate;
  if (options.endDate) body.endDate = options.endDate;
  return body;
}

async function resolveProjectId(projectId: string, request: TickTickApiRequest): Promise<string> {
  if (!isShortId(projectId)) return projectId;
  const projects = await request('GET', '/project') as TickTickProject[];
  const match = projects.find((project) => project.id.startsWith(projectId));
  return match?.id ?? projectId;
}

async function resolveTaskId(taskId: string, projectId: string, request: TickTickApiRequest): Promise<string> {
  if (!isShortId(taskId)) return taskId;
  const data = await request('GET', `/project/${encodeURIComponent(projectId)}/data`) as TickTickProjectData;
  const match = data.tasks.find((task) => task.id.startsWith(taskId));
  return match?.id ?? taskId;
}

async function resolveTaskInProject(
  taskId: string,
  projectId: string,
  request: TickTickApiRequest
): Promise<{ id: string; projectId: string }> {
  const resolvedProjectId = await resolveProjectId(projectId, request);
  return {
    id: await resolveTaskId(taskId, resolvedProjectId, request),
    projectId: resolvedProjectId,
  };
}

async function resolveTask(
  taskId: string,
  request: TickTickApiRequest
): Promise<{ id: string; projectId: string | null }> {
  const projects = await request('GET', '/project') as TickTickProject[];
  for (const project of projects) {
    const data = await request('GET', `/project/${encodeURIComponent(project.id)}/data`) as TickTickProjectData;
    const match = data.tasks.find((task) => isShortId(taskId) ? task.id.startsWith(taskId) : task.id === taskId);
    if (match) {
      return { id: match.id, projectId: project.id };
    }
  }
  return { id: taskId, projectId: null };
}

async function fetchResolvedTask(
  resolvedTask: { id: string; projectId: string | null },
  request: TickTickApiRequest
): Promise<TickTickTask> {
  if (!resolvedTask.projectId) {
    throw new Error(`Task ${shortId(resolvedTask.id)} updated but no project ID was available to fetch the updated task`);
  }
  return await request(
    'GET',
    `/project/${encodeURIComponent(resolvedTask.projectId)}/task/${encodeURIComponent(resolvedTask.id)}`
  ) as TickTickTask;
}

function isShortId(id: string): boolean {
  return id.length <= 8;
}

function mapProject(project: TickTickProject): TodoProject {
  return {
    id: shortId(project.id),
    fullId: project.id,
    name: project.name,
    color: project.color,
    viewMode: project.viewMode,
    closed: project.closed,
    groupId: project.groupId,
  };
}

function mapTask(task: TickTickTask): TodoTask {
  const mapped: TodoTask = {
    id: shortId(task.id),
    fullId: task.id,
    title: task.title,
    priority: formatPriority(task.priority),
    tags: task.tags ?? [],
  };
  if (task.projectId) {
    mapped.projectId = shortId(task.projectId);
    mapped.fullProjectId = task.projectId;
  }
  if (task.content) mapped.content = task.content;
  if (task.dueDate) mapped.dueDate = task.dueDate;
  if (task.status !== undefined) mapped.status = task.status === 2 ? 'completed' : 'active';
  if (task.completedTime) mapped.completedTime = task.completedTime;
  if (task.reminders?.length) {
    mapped.reminders = task.reminders.map((reminder) => parseReminderTrigger(reminderTriggerValue(reminder)));
  }
  return mapped;
}

function mapCompletedTask(task: TickTickTask): TodoTask {
  const mapped = mapTask(task);
  delete mapped.status;
  return mapped;
}

function mapTaskMutation(task: TickTickTask): TaskMutationResult {
  return {
    success: true,
    task: mapTask(task),
  };
}

function normalizeTags(tags: string[] | string): string[] {
  if (Array.isArray(tags)) {
    return tags.map((tag) => tag.trim()).filter(Boolean);
  }
  return tags.split(',').map((tag) => tag.trim()).filter(Boolean);
}

function createdTimeFromObjectId(taskId: string): number {
  const seconds = Number.parseInt(taskId.slice(0, 8), 16);
  return Number.isFinite(seconds) ? seconds * 1000 : 0;
}

function reminderTriggerValue(reminder: string | { trigger: string }): string {
  return typeof reminder === 'string' ? reminder : reminder.trigger;
}

function parseReminderTrigger(trigger: string): string {
  if (trigger === 'TRIGGER:PT0S') return '0m';
  const minMatch = trigger.match(/^TRIGGER:-PT(\d+)M$/);
  if (minMatch) return `${minMatch[1]}m`;
  const hourMatch = trigger.match(/^TRIGGER:-PT(\d+)H$/);
  if (hourMatch) return `${hourMatch[1]}h`;
  const dayMatch = trigger.match(/^TRIGGER:-P(\d+)D$/);
  if (dayMatch) return `${dayMatch[1]}d`;
  return trigger;
}

function buildReminderTriggers(reminder: string): Array<{ trigger: string }> {
  return reminder
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((value) => {
      if (value === '0m' || value === '0') return { trigger: 'TRIGGER:PT0S' };
      const minMatch = value.match(/^(\d+)m$/);
      if (minMatch) return { trigger: `TRIGGER:-PT${minMatch[1]}M` };
      const hourMatch = value.match(/^(\d+)h$/);
      if (hourMatch) return { trigger: `TRIGGER:-PT${hourMatch[1]}H` };
      const dayMatch = value.match(/^(\d+)d$/);
      if (dayMatch) return { trigger: `TRIGGER:-P${dayMatch[1]}D` };
      return { trigger: value };
    });
}
