export type OutputFormat = 'text' | 'json';

export type PriorityName = 'none' | 'low' | 'medium' | 'high';

export type TaskStatus = 'active' | 'completed';

export interface TodoProject {
  id: string;
  fullId: string;
  name: string;
  color?: string;
  viewMode?: string;
  closed?: boolean;
  groupId?: string;
}

export interface TodoTask {
  id: string;
  fullId: string;
  projectId?: string;
  fullProjectId?: string;
  title: string;
  projectName?: string;
  content?: string;
  dueDate?: string;
  priority: PriorityName;
  tags: string[];
  reminders?: string[];
  status?: TaskStatus;
  completedTime?: string;
}

export interface TaskCreateInput {
  projectId?: string;
  title: string;
  content?: string;
  dueDate?: string;
  priority?: PriorityName;
  tags?: string[] | string;
  reminder?: string;
}

export interface TaskUpdateInput extends Partial<TaskCreateInput> {
  addTags?: string[];
  removeTags?: string[];
}

export interface TaskMutationResult {
  success: boolean;
  task: TodoTask;
}

export interface CompletedTaskOptions {
  projectIds?: string[];
  startDate?: string;
  endDate?: string;
}

export interface TaskQueryOptions {
  createdAfter?: string;
  excludeTags?: string[];
  excludeProjects?: string[];
  skipClosed?: boolean;
}

export interface TaskListResult {
  count: number;
  tasks: TodoTask[];
}

export interface MessageResult {
  success: boolean;
  message: string;
}

export interface TodoProvider {
  name: string;
  projects: {
    list(): Promise<TodoProject[]>;
    get(projectId: string): Promise<{ project: TodoProject; tasks: TodoTask[]; taskCount: number }>;
    create(name: string, options?: { color?: string; viewMode?: string }): Promise<{ success: boolean; project: TodoProject }>;
    remove(projectId: string): Promise<MessageResult>;
  };
  tasks: {
    list(projectId: string): Promise<TodoTask[]>;
    get(projectId: string, taskId: string): Promise<TodoTask>;
    create(input: TaskCreateInput): Promise<TaskMutationResult>;
    update(taskId: string, input: TaskUpdateInput): Promise<TaskMutationResult>;
    complete(projectId: string, taskId: string): Promise<MessageResult>;
    remove(projectId: string, taskId: string): Promise<MessageResult>;
    completed(options?: CompletedTaskOptions): Promise<TaskListResult>;
    query?(options?: TaskQueryOptions): Promise<TaskListResult>;
  };
}
