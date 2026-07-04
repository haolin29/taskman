import type { PriorityName, TaskQueryOptions, TodoProvider, TodoTask } from '../domain/models.js';

export interface TaskQueryResult {
  keyword?: string;
  days?: number;
  count: number;
  tasks: TodoTask[];
}

export interface SearchOptions {
  tags?: string[];
  priority?: PriorityName;
}

export type QueryOptions = TaskQueryOptions;

export async function searchTasks(
  provider: TodoProvider,
  keyword: string,
  options: SearchOptions = {}
): Promise<TaskQueryResult> {
  const tasks = await allActiveTasks(provider);
  const needle = keyword.toLowerCase();
  const filtered = tasks.filter((task) => {
    const textMatches =
      !needle ||
      task.title.toLowerCase().includes(needle) ||
      (task.content?.toLowerCase().includes(needle) ?? false);
    const tagsMatch =
      !options.tags?.length ||
      options.tags.some((tag) => task.tags.includes(tag));
    const priorityMatches = !options.priority || task.priority === options.priority;
    return textMatches && tagsMatch && priorityMatches;
  });

  return { keyword, count: filtered.length, tasks: filtered };
}

export async function dueTasks(provider: TodoProvider, days: number): Promise<TaskQueryResult> {
  const cutoff = Date.now() + days * 24 * 60 * 60 * 1000;
  const filtered = (await allActiveTasks(provider))
    .filter((task) => task.dueDate && new Date(task.dueDate).getTime() <= cutoff)
    .sort((a, b) => new Date(a.dueDate ?? 0).getTime() - new Date(b.dueDate ?? 0).getTime());

  return { days, count: filtered.length, tasks: filtered };
}

export async function highPriorityTasks(provider: TodoProvider): Promise<TaskQueryResult> {
  const filtered = (await allActiveTasks(provider)).filter((task) => task.priority === 'high');
  return { count: filtered.length, tasks: filtered };
}

// Agent-facing cross-project query entrypoint. It returns detail content so agents can classify tasks without extra reads.
export async function queryTasks(
  provider: TodoProvider,
  options: QueryOptions = {}
): Promise<TaskQueryResult> {
  if (provider.tasks.query) {
    return provider.tasks.query(options);
  }

  const projects = await filteredProjects(provider, options);
  const excludeTagSet = new Set(options.excludeTags ?? []);
  const cutoffMs = options.createdAfter ? new Date(options.createdAfter).getTime() : null;
  const tasks: TodoTask[] = [];

  for (const project of projects) {
    const projectTasks = await provider.tasks.list(project.fullId);
    for (const task of projectTasks) {
      if (task.status === 'completed') continue;
      if (cutoffMs !== null && createdTimeFromObjectId(task.fullId) < cutoffMs) continue;
      if (excludeTagSet.size > 0 && task.tags.some((tag) => excludeTagSet.has(tag))) continue;
      const detail = await provider.tasks.get(project.fullId, task.fullId);
      tasks.push({
        ...task,
        ...detail,
        content: detail.content ?? task.content ?? '',
        projectId: detail.projectId ?? task.projectId ?? project.id,
        fullProjectId: detail.fullProjectId ?? task.fullProjectId ?? project.fullId,
        projectName: detail.projectName ?? task.projectName ?? project.name,
      });
    }
  }

  return { count: tasks.length, tasks };
}

async function allActiveTasks(provider: TodoProvider): Promise<TodoTask[]> {
  const projects = await provider.projects.list();
  const results: TodoTask[] = [];
  for (const project of projects) {
    const tasks = await provider.tasks.list(project.fullId);
    results.push(...tasks
      .filter((task) => task.status !== 'completed')
      .map((task) => ({
        ...task,
        projectId: task.projectId ?? project.id,
        fullProjectId: task.fullProjectId ?? project.fullId,
      })));
  }
  return results;
}

async function filteredProjects(provider: TodoProvider, options: QueryOptions): Promise<Awaited<ReturnType<TodoProvider['projects']['list']>>> {
  let projects = await provider.projects.list();
  if (options.skipClosed) {
    projects = projects.filter((project) => !project.closed);
  }
  if (options.excludeProjects?.length) {
    const excluded = new Set(options.excludeProjects.map((name) => name.toLowerCase()));
    projects = projects.filter((project) => !excluded.has(project.name.toLowerCase()));
  }
  return projects;
}

function createdTimeFromObjectId(taskId: string): number {
  const secondsHex = taskId.slice(0, 8);
  const seconds = Number.parseInt(secondsHex, 16);
  return Number.isFinite(seconds) ? seconds * 1000 : 0;
}
