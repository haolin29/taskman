import type { PriorityName, TaskUpdateInput, TodoProvider, TodoTask } from '../domain/models.js';
import { searchTasks } from './task-queries.js';

export interface BatchTagInput {
  keyword?: string;
  tags?: string[];
  priority?: PriorityName;
  addTags?: string[];
  removeTags?: string[];
  dryRun?: boolean;
}

export interface BatchTagResult {
  matched: number;
  updated: number;
  dryRun?: boolean;
  tasks: TodoTask[];
}

export interface BatchPriorityInput {
  keyword?: string;
  tags?: string[];
  currentPriority?: PriorityName;
  priority: PriorityName;
  dryRun?: boolean;
}

export interface BatchCompleteInput {
  keyword?: string;
  tags?: string[];
  priority?: PriorityName;
  dryRun?: boolean;
}

export interface BatchUpdateItem {
  taskId: string;
  projectId?: string;
  tags?: string[];
  reminders?: string[];
  dueDate?: string;
  content?: string;
  priority?: PriorityName;
}

export interface BatchUpdateInput {
  updates: BatchUpdateItem[];
  dryRun?: boolean;
}

export async function batchUpdateTags(
  provider: TodoProvider,
  input: BatchTagInput
): Promise<BatchTagResult> {
  if (!input.addTags?.length && !input.removeTags?.length) {
    throw new Error('At least one of --add-tags or --remove-tags is required');
  }

  const search = await matchingTasks(provider, input.keyword, input.tags, input.priority);
  if (input.dryRun) {
    return { matched: search.count, updated: 0, dryRun: true, tasks: search.tasks };
  }

  const tasks: TodoTask[] = [];

  for (const task of search.tasks) {
    const result = await provider.tasks.update(task.fullId, {
      addTags: input.addTags,
      removeTags: input.removeTags,
    });
    tasks.push(withTaskContext(result.task, task));
  }

  return {
    matched: search.count,
    updated: tasks.length,
    dryRun: false,
    tasks,
  };
}

export async function batchUpdatePriority(
  provider: TodoProvider,
  input: BatchPriorityInput
): Promise<BatchTagResult> {
  const search = await matchingTasks(provider, input.keyword, input.tags, input.currentPriority);
  if (input.dryRun) {
    return { matched: search.count, updated: 0, dryRun: true, tasks: search.tasks };
  }

  const tasks: TodoTask[] = [];
  for (const task of search.tasks) {
    const result = await provider.tasks.update(task.fullId, { priority: input.priority });
    tasks.push(withTaskContext(result.task, task));
  }

  return {
    matched: search.count,
    updated: tasks.length,
    dryRun: false,
    tasks,
  };
}

export async function batchCompleteTasks(
  provider: TodoProvider,
  input: BatchCompleteInput
): Promise<BatchTagResult> {
  const search = await matchingTasks(provider, input.keyword, input.tags, input.priority);
  if (input.dryRun) {
    return { matched: search.count, updated: 0, dryRun: true, tasks: search.tasks };
  }

  for (const task of search.tasks) {
    const projectId = task.fullProjectId ?? task.projectId;
    if (!projectId) {
      throw new Error(`Task ${task.id} has no project ID and cannot be completed in batch`);
    }
    await provider.tasks.complete(projectId, task.fullId);
  }

  return {
    matched: search.count,
    updated: search.tasks.length,
    dryRun: false,
    tasks: search.tasks,
  };
}

// Agent JSON batch update parser entrypoint. It validates the narrow schema before any provider mutation runs.
export function parseBatchUpdateJson(input: string): BatchUpdateInput {
  let data: unknown;
  try {
    data = JSON.parse(input);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid batch update JSON: ${detail}`);
  }

  const root = objectRecord(data, 'input');
  rejectUnknownKeys(root, new Set(['updates', 'dryRun']), 'input');

  if (!Array.isArray(root.updates) || root.updates.length === 0) {
    throw new Error('input.updates must be a non-empty array');
  }
  if (root.dryRun !== undefined && typeof root.dryRun !== 'boolean') {
    throw new Error('input.dryRun must be a boolean');
  }

  return {
    dryRun: root.dryRun,
    updates: root.updates.map(parseBatchUpdateItem),
  };
}

export async function batchUpdateTasks(
  provider: TodoProvider,
  input: BatchUpdateInput
): Promise<BatchTagResult> {
  if (!input.updates.length) {
    throw new Error('At least one update is required');
  }
  if (input.dryRun) {
    return { matched: input.updates.length, updated: 0, dryRun: true, tasks: [] };
  }

  const tasks: TodoTask[] = [];
  for (const item of input.updates) {
    const updateInput: TaskUpdateInput = {};
    if (item.projectId !== undefined) updateInput.projectId = item.projectId;
    if (item.tags !== undefined) updateInput.tags = item.tags;
    if (item.reminders !== undefined) updateInput.reminder = item.reminders.join(',');
    if (item.dueDate !== undefined) updateInput.dueDate = item.dueDate;
    if (item.content !== undefined) updateInput.content = item.content;
    if (item.priority !== undefined) updateInput.priority = item.priority;

    const result = await provider.tasks.update(item.taskId, updateInput);
    tasks.push({
      ...result.task,
      fullProjectId: result.task.fullProjectId ?? item.projectId,
    });
  }

  return {
    matched: input.updates.length,
    updated: tasks.length,
    dryRun: false,
    tasks,
  };
}

async function matchingTasks(
  provider: TodoProvider,
  keyword: string | undefined,
  tags: string[] | undefined,
  priority: PriorityName | undefined
) {
  return searchTasks(provider, keyword ?? '', { tags, priority });
}

function withTaskContext(updated: TodoTask, matched: TodoTask): TodoTask {
  return {
    ...updated,
    projectId: updated.projectId ?? matched.projectId,
    fullProjectId: updated.fullProjectId ?? matched.fullProjectId,
  };
}

function parseBatchUpdateItem(raw: unknown, index: number): BatchUpdateItem {
  const path = `updates[${index}]`;
  const item = objectRecord(raw, path);
  rejectUnknownKeys(item, new Set(['taskId', 'projectId', 'tags', 'reminders', 'dueDate', 'content', 'priority']), path);

  const taskId = requiredString(item.taskId, `${path}.taskId`);
  const parsed: BatchUpdateItem = { taskId };
  if (item.projectId !== undefined) parsed.projectId = requiredString(item.projectId, `${path}.projectId`);

  const hasMutableField = ['tags', 'reminders', 'dueDate', 'content', 'priority']
    .some((key) => Object.prototype.hasOwnProperty.call(item, key));
  if (!hasMutableField) {
    throw new Error(`${path} must include at least one update field`);
  }

  if (item.tags !== undefined) parsed.tags = stringArray(item.tags, `${path}.tags`);
  if (item.reminders !== undefined) parsed.reminders = stringArray(item.reminders, `${path}.reminders`);
  if (item.dueDate !== undefined) parsed.dueDate = requiredString(item.dueDate, `${path}.dueDate`);
  if (item.content !== undefined) {
    if (typeof item.content !== 'string') throw new Error(`${path}.content must be a string`);
    parsed.content = item.content;
  }
  if (item.priority !== undefined) parsed.priority = priorityValue(item.priority, `${path}.priority`);
  return parsed;
}

function objectRecord(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function rejectUnknownKeys(record: Record<string, unknown>, allowed: Set<string>, path: string): void {
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      const prefix = path === 'input' ? 'input' : path;
      throw new Error(`${prefix}.${key} is not supported`);
    }
  }
}

function requiredString(value: unknown, path: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${path} must be a non-empty string`);
  }
  return value.trim();
}

function stringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${path} must be an array of strings`);
  }
  return value.map((item, index) => requiredString(item, `${path}[${index}]`));
}

function priorityValue(value: unknown, path: string): PriorityName {
  if (value === 'none' || value === 'low' || value === 'medium' || value === 'high') {
    return value;
  }
  throw new Error(`${path} must be one of none, low, medium, high`);
}
