import type { OutputFormat } from '../domain/models.js';

export function formatOutput(data: unknown, format: OutputFormat = 'json'): string {
  if (format === 'json') {
    return JSON.stringify(data, null, 2);
  }

  if (Array.isArray(data)) {
    return formatArray(data);
  }

  if (data && typeof data === 'object') {
    return formatObject(data as Record<string, unknown>);
  }

  return String(data);
}

function formatArray(items: unknown[]): string {
  if (items.length === 0) return '(no items)';

  const first = items[0];
  if (!first || typeof first !== 'object') {
    return items.map((item, index) => `${index + 1}. ${String(item)}`).join('\n');
  }

  const sample = first as Record<string, unknown>;
  if ('title' in sample) return formatTaskRows(items as Array<Record<string, unknown>>);
  if ('name' in sample) return formatProjectRows(items as Array<Record<string, unknown>>);

  return items.map((item) => formatObject(item as Record<string, unknown>)).join('\n\n');
}

function formatProjectRows(projects: Array<Record<string, unknown>>): string {
  const lines = ['ID       | Name                           | Color', '-'.repeat(55)];
  for (const project of projects) {
    const id = String(project.id ?? '').padEnd(8);
    const name = truncate(String(project.name ?? ''), 30).padEnd(30);
    const color = String(project.color ?? '');
    lines.push(`${id} | ${name} | ${color}`);
  }
  return lines.join('\n');
}

function formatTaskRows(tasks: Array<Record<string, unknown>>): string {
  const lines = ['ID       | Title                          | Due        | Pri    | Tags', '-'.repeat(80)];
  for (const task of tasks) {
    const id = String(task.id ?? '').padEnd(8);
    const title = truncate(String(task.title ?? ''), 30).padEnd(30);
    const due = String(task.dueDate ?? '').slice(0, 10).padEnd(10);
    const priority = String(task.priority ?? 'none').padEnd(6);
    const tags = Array.isArray(task.tags) ? task.tags.join(', ') : '';
    lines.push(`${id} | ${title} | ${due} | ${priority} | ${tags}`);
  }
  return lines.join('\n');
}

function formatObject(record: Record<string, unknown>): string {
  if ('success' in record && record.success === true) {
    const nested = record.task ?? record.project;
    if (nested && typeof nested === 'object') {
      return `Success!\n\n${formatObject(nested as Record<string, unknown>)}`;
    }
  }

  const lines: string[] = [];
  for (const [key, value] of Object.entries(record)) {
    if (value === undefined || value === null) continue;
    if (key === 'fullId' || key === 'fullProjectId') continue;
    if (Array.isArray(value)) {
      if (value.length > 0) lines.push(`${formatKey(key)}: ${value.join(', ')}`);
    } else if (typeof value === 'object') {
      lines.push(`${formatKey(key)}:\n${formatOutput(value, 'text')}`);
    } else {
      lines.push(`${formatKey(key)}: ${String(value)}`);
    }
  }
  return lines.join('\n');
}

function formatKey(key: string): string {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (char) => char.toUpperCase());
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3)}...`;
}
