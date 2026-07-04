import type { PriorityName } from '../domain/models.js';

const PRIORITY_VALUES: Record<PriorityName, number> = {
  none: 0,
  low: 1,
  medium: 3,
  high: 5,
};

export function parsePriority(priority: PriorityName | undefined): number | undefined {
  if (!priority) return undefined;
  const value = PRIORITY_VALUES[priority];
  if (value === undefined) {
    throw new Error(`Invalid priority "${priority}". Valid options: none, low, medium, high`);
  }
  return value;
}

export function formatPriority(priority: unknown): PriorityName {
  if (priority === 1) return 'low';
  if (priority === 3) return 'medium';
  if (priority === 5) return 'high';
  return 'none';
}
