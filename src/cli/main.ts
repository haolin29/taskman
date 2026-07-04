import { parseArgs } from './args.js';
import { formatOutput } from '../output/format.js';
import type { OutputFormat, TodoProvider } from '../domain/models.js';
import { createTickTickProvider } from '../providers/ticktick/provider.js';
import { createTickTickApiRequest } from '../providers/ticktick/http-client.js';
import { dueTasks, highPriorityTasks, queryTasks, searchTasks } from '../core/task-queries.js';
import { batchCompleteTasks, batchUpdatePriority, batchUpdateTags, batchUpdateTasks, parseBatchUpdateJson } from '../core/batch.js';
import { createTickTickAuthService, type TickTickAuthService } from '../providers/ticktick/auth.js';
import { createTickTickSetupService, type TickTickSetupService } from '../providers/ticktick/setup.js';
import { createSetupPromptService, type SetupPromptService } from './setup-prompts.js';
import { createRequire } from 'node:module';

const VERSION: string = (createRequire(import.meta.url)('../../../package.json') as { version: string }).version;

export interface CliIO {
  stdout: { write(chunk: string): void };
  stderr: { write(chunk: string): void };
}

// Entry function for tests and the executable wrapper.
export async function runCli(
  argv: string[],
  io: CliIO = { stdout: process.stdout, stderr: process.stderr },
  provider: TodoProvider | undefined = createDefaultProvider(),
  auth: TickTickAuthService | undefined = createTickTickAuthService(),
  setup: TickTickSetupService = createTickTickSetupService(),
  prompts?: SetupPromptService
): Promise<number> {
  const parsed = parseArgs(argv);
  const format = parsed.options.format as OutputFormat;

  try {
    if (parsed.options.version) {
      io.stdout.write(`${VERSION}\n`);
      return 0;
    }

    if (!parsed.command) {
      io.stdout.write(`${mainHelp()}\n`);
      return 0;
    }

    const result = await dispatch(
      parsed.command,
      parsed.subcommand,
      parsed.positional,
      parsed.options,
      provider,
      auth ?? createTickTickAuthService(),
      setup,
      prompts
    );
    io.stdout.write(`${formatOutput(result, format)}\n`);
    return 0;
  } catch (error) {
    io.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

function createDefaultProvider(): TodoProvider {
  return createTickTickProvider(createTickTickApiRequest());
}

async function dispatch(
  command: string,
  subcommand: string | null,
  positional: string[],
  options: Record<string, string | boolean>,
  provider: TodoProvider | undefined,
  auth: TickTickAuthService,
  setup: TickTickSetupService,
  prompts: SetupPromptService | undefined
): Promise<unknown> {
  if (command === 'setup') {
    return dispatchSetup(subcommand, options, setup, prompts);
  }
  if (command === 'auth') {
    return dispatchAuth(subcommand, positional, options, auth);
  }
  const activeProvider = provider ?? createDefaultProvider();
  if (command === 'projects') {
    return dispatchProjects(subcommand, positional, options, activeProvider);
  }
  if (command === 'tasks') {
    return dispatchTasks(subcommand, positional, options, activeProvider);
  }
  if (command === 'batch') {
    return dispatchBatch(subcommand, options, activeProvider);
  }
  throw new Error(`Unknown command: ${command}`);
}

async function dispatchSetup(
  subcommand: string | null,
  options: Record<string, string | boolean>,
  setup: TickTickSetupService,
  prompts: SetupPromptService | undefined
): Promise<unknown> {
  if (options.help) return setupHelp();
  if (!subcommand) return runInteractiveSetup(setup, prompts ?? createSetupPromptService());
  if (subcommand !== 'ticktick') {
    throw new Error(`Unknown setup command: ${subcommand}`);
  }
  return setup.configure({
    clientId: stringOption(options['client-id']),
    clientSecret: stringOption(options['client-secret']),
    redirectUri: stringOption(options['redirect-uri']),
    region: stringOption(options.region),
  });
}

async function runInteractiveSetup(
  setup: TickTickSetupService,
  prompts: SetupPromptService
): Promise<unknown> {
  try {
    const provider = (await prompts.ask('Provider (ticktick): ')).trim() || 'ticktick';
    if (provider !== 'ticktick') {
      throw new Error(`Unsupported setup provider: ${provider}`);
    }

    const clientId = await prompts.ask('TickTick client id (create an app at https://developer.ticktick.com/): ');
    const clientSecret = await prompts.ask('TickTick client secret (from the same TickTick app): ');
    const redirectUri = await prompts.ask('Redirect URI (http://localhost:18888/callback): ');
    const region = await prompts.ask('Region (global/china) (global): ');
    return setup.configure({
      clientId: blankToUndefined(clientId),
      clientSecret: blankToUndefined(clientSecret),
      redirectUri: blankToUndefined(redirectUri),
      region: blankToUndefined(region),
    });
  } finally {
    prompts.close();
  }
}

async function dispatchAuth(
  subcommand: string | null,
  positional: string[],
  options: Record<string, string | boolean>,
  auth: TickTickAuthService
): Promise<unknown> {
  if (!subcommand || options.help) return authHelp();
  if (subcommand === 'status') return auth.status();
  if (subcommand === 'login') return auth.login();
  if (subcommand === 'exchange') {
    const [code] = positional;
    if (!code) throw new Error('Usage: taskman auth exchange AUTH_CODE');
    return auth.exchange(code);
  }
  if (subcommand === 'refresh') return auth.refresh();
  if (subcommand === 'logout') return auth.logout();
  throw new Error(`Unknown auth command: ${subcommand}`);
}

async function dispatchProjects(
  subcommand: string | null,
  positional: string[],
  options: Record<string, string | boolean>,
  provider: TodoProvider
): Promise<unknown> {
  if (!subcommand || options.help) return projectsHelp();
  if (subcommand === 'list') return provider.projects.list();
  if (subcommand === 'get') {
    const [projectId] = positional;
    if (!projectId) throw new Error('Usage: taskman projects get PROJECT_ID');
    return provider.projects.get(projectId);
  }
  if (subcommand === 'create') {
    const [name] = positional;
    if (!name) throw new Error('Usage: taskman projects create NAME');
    return provider.projects.create(name, {
      color: stringOption(options.color),
      viewMode: stringOption(options.viewMode),
    });
  }
  if (subcommand === 'delete') {
    const [projectId] = positional;
    if (!projectId) throw new Error('Usage: taskman projects delete PROJECT_ID');
    return provider.projects.remove(projectId);
  }
  throw new Error(`Unknown projects command: ${subcommand}`);
}

async function dispatchTasks(
  subcommand: string | null,
  positional: string[],
  options: Record<string, string | boolean>,
  provider: TodoProvider
): Promise<unknown> {
  if (!subcommand || options.help) return tasksHelp();
  if (subcommand === 'list') {
    const [projectId] = positional;
    if (!projectId) throw new Error('Usage: taskman tasks list PROJECT_ID');
    return provider.tasks.list(projectId);
  }
  if (subcommand === 'get') {
    const [projectId, taskId] = positional;
    if (!projectId || !taskId) throw new Error('Usage: taskman tasks get PROJECT_ID TASK_ID');
    return provider.tasks.get(projectId, taskId);
  }
  if (subcommand === 'create') {
    const [projectId, title] = positional.length > 1 ? positional : [undefined, positional[0]];
    if (!title) throw new Error('Usage: taskman tasks create [PROJECT_ID] TITLE');
    return provider.tasks.create({
      projectId,
      title,
      content: stringOption(options.content),
      dueDate: stringOption(options.due),
      priority: stringOption(options.priority) as 'none' | 'low' | 'medium' | 'high' | undefined,
      tags: stringOption(options.tags),
      reminder: stringOption(options.reminder),
    });
  }
  if (subcommand === 'update') {
    const [taskId] = positional;
    if (!taskId) throw new Error('Usage: taskman tasks update TASK_ID');
    return provider.tasks.update(taskId, {
      projectId: stringOption(options.project),
      title: stringOption(options.title),
      content: stringOption(options.content),
      dueDate: stringOption(options.due),
      priority: stringOption(options.priority) as 'none' | 'low' | 'medium' | 'high' | undefined,
      tags: stringOption(options.tags),
      addTags: splitCsvOption(options['add-tags']),
      removeTags: splitCsvOption(options['remove-tags']),
      reminder: stringOption(options.reminder),
    });
  }
  if (subcommand === 'complete') {
    const [projectId, taskId] = positional;
    if (!projectId || !taskId) throw new Error('Usage: taskman tasks complete PROJECT_ID TASK_ID');
    return provider.tasks.complete(projectId, taskId);
  }
  if (subcommand === 'delete') {
    const [projectId, taskId] = positional;
    if (!projectId || !taskId) throw new Error('Usage: taskman tasks delete PROJECT_ID TASK_ID');
    return provider.tasks.remove(projectId, taskId);
  }
  if (subcommand === 'search') {
    const keyword = positional[0] ?? '';
    const tags = stringOption(options.tags)?.split(',').map((tag) => tag.trim()).filter(Boolean);
    const priority = stringOption(options.priority) as 'none' | 'low' | 'medium' | 'high' | undefined;
    if (!keyword && !tags?.length && !priority) {
      throw new Error('Usage: taskman tasks search [KEYWORD] [--tags TAGS] [--priority LEVEL]');
    }
    return searchTasks(provider, keyword, { tags, priority });
  }
  if (subcommand === 'due') {
    return dueTasks(provider, Number.parseInt(positional[0] ?? '7', 10) || 7);
  }
  if (subcommand === 'priority') {
    return highPriorityTasks(provider);
  }
  if (subcommand === 'completed') {
    return provider.tasks.completed({
      projectIds: splitCsvOption(options.projects),
      startDate: stringOption(options.from),
      endDate: stringOption(options.to),
    });
  }
  if (subcommand === 'query') {
    return queryTasks(provider, {
      createdAfter: stringOption(options['created-after']),
      excludeTags: splitCsvOption(options['exclude-tags']),
      excludeProjects: splitCsvOption(options['exclude-projects']),
      skipClosed: options['skip-closed'] === true,
    });
  }
  throw new Error(`Unknown tasks command: ${subcommand}`);
}

async function dispatchBatch(
  subcommand: string | null,
  options: Record<string, string | boolean>,
  provider: TodoProvider
): Promise<unknown> {
  if (options.help && subcommand === 'update') return batchUpdateHelp();
  if (!subcommand || options.help) return batchHelp();
  if (subcommand === 'tag') {
    return batchUpdateTags(provider, {
      keyword: stringOption(options.query),
      tags: splitCsvOption(options.tags),
      priority: stringOption(options.priority) as 'none' | 'low' | 'medium' | 'high' | undefined,
      addTags: splitCsvOption(options['add-tags']),
      removeTags: splitCsvOption(options['remove-tags']),
      dryRun: options['dry-run'] === true,
    });
  }
  if (subcommand === 'priority') {
    const priority = stringOption(options.priority) as 'none' | 'low' | 'medium' | 'high' | undefined;
    if (!priority) throw new Error('Usage: taskman batch priority --priority LEVEL');
    return batchUpdatePriority(provider, {
      keyword: stringOption(options.query),
      tags: splitCsvOption(options.tags),
      currentPriority: stringOption(options['current-priority']) as 'none' | 'low' | 'medium' | 'high' | undefined,
      priority,
      dryRun: options['dry-run'] === true,
    });
  }
  if (subcommand === 'complete') {
    return batchCompleteTasks(provider, {
      keyword: stringOption(options.query),
      tags: splitCsvOption(options.tags),
      priority: stringOption(options.priority) as 'none' | 'low' | 'medium' | 'high' | undefined,
      dryRun: options['dry-run'] === true,
    });
  }
  if (subcommand === 'update') {
    const inputJson = stringOption(options.input);
    if (!inputJson) throw new Error('Usage: taskman batch update --input JSON');
    const input = parseBatchUpdateJson(inputJson);
    if (options['dry-run'] === true) input.dryRun = true;
    return batchUpdateTasks(provider, input);
  }
  throw new Error(`Unknown batch command: ${subcommand}`);
}

function stringOption(value: string | boolean | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function blankToUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function splitCsvOption(value: string | boolean | undefined): string[] | undefined {
  const text = stringOption(value);
  return text?.split(',').map((item) => item.trim()).filter(Boolean);
}

function mainHelp(): string {
  return [
    'Taskman CLI',
    '',
    'Usage: taskman <command> [options]',
    '',
    'Commands:',
    '  setup      Configure providers',
    '  auth       Authentication management',
    '  projects   Project operations',
    '  tasks      Task operations',
    '  batch      Cross-project batch operations',
    '',
    'Global options:',
    '  --json            Output JSON',
    '  --format <type>   Output format: text or json',
    '  --help, -h        Show help',
    '  --version, -v     Show version',
  ].join('\n');
}

function setupHelp(): string {
  return [
    'Usage: taskman setup ticktick --client-id ID --client-secret SECRET',
    '',
    'Options:',
    '  --redirect-uri URI',
    '  --region global|china',
  ].join('\n');
}

function authHelp(): string {
  return [
    'Usage: taskman auth <command>',
    '',
    'Commands:',
    '  status',
    '  login',
    '  exchange AUTH_CODE',
    '  refresh',
    '  logout',
  ].join('\n');
}

function projectsHelp(): string {
  return [
    'Usage: taskman projects <command>',
    '',
    'Commands:',
    '  list',
    '  get PROJECT_ID',
    '  create NAME',
    '  delete PROJECT_ID',
  ].join('\n');
}

function tasksHelp(): string {
  return [
    'Usage: taskman tasks <command>',
    '',
    'Commands:',
    '  list PROJECT_ID',
    '  get PROJECT_ID TASK_ID',
    '  create [PROJECT_ID] TITLE [--reminder OFFSETS]',
    '  update TASK_ID [--reminder OFFSETS]',
    '  complete PROJECT_ID TASK_ID',
    '  delete PROJECT_ID TASK_ID',
    '  search [KEYWORD]',
    '  due [DAYS]',
    '  priority',
    '  completed',
    '  query',
    '',
    'Reminder offsets: 0m, 15m, 30m, 1h, 2h, 1d (comma-separated for multiple)',
    'Examples:',
    '  taskman tasks create "Meeting" --reminder 15m',
    '  taskman tasks update TASK_ID --reminder 15m,1h',
  ].join('\n');
}

function batchHelp(): string {
  return [
    'Usage: taskman batch <command>',
    '',
    'Commands:',
    '  tag --query TEXT --add-tags TAGS',
    '  priority --query TEXT --priority LEVEL',
    '  complete --query TEXT',
    '  update --input JSON',
  ].join('\n');
}

function batchUpdateHelp(): string {
  return [
    'Usage: taskman batch update --input JSON',
    '',
    'Updates explicit tasks from a schema-validated JSON payload.',
    '',
    'Allowed update fields: tags, reminders, dueDate, content, priority',
    '',
    'Schema:',
    '  {',
    '    "dryRun": false,',
    '    "updates": [',
    '      {',
    '        "taskId": "TASK_ID",',
    '        "projectId": "PROJECT_ID",',
    '        "tags": ["work", "next"],',
    '        "reminders": ["15m"],',
    '        "dueDate": "2026-05-20",',
    '        "content": "Notes",',
    '        "priority": "high"',
    '      }',
    '    ]',
    '  }',
    '',
    'Examples:',
    '  taskman batch update --input \'{"updates":[{"taskId":"TASK_ID","tags":["next"],"priority":"medium"}]}\'',
    '  taskman batch update --input \'{"dryRun":true,"updates":[{"taskId":"TASK_ID","projectId":"PROJECT_ID","reminders":["15m"]}]}\'',
  ].join('\n');
}
