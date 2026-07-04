import type { OutputFormat } from '../domain/models.js';

export interface ParsedArgs {
  command: string | null;
  subcommand: string | null;
  positional: string[];
  options: Record<string, string | boolean | OutputFormat>;
}

export function parseArgs(args: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    command: null,
    subcommand: null,
    positional: [],
    options: {
      format: 'text',
      help: false,
      version: false,
    },
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--help' || arg === '-h') {
      parsed.options.help = true;
    } else if (arg === '--version' || arg === '-v') {
      parsed.options.version = true;
    } else if (arg === '--json') {
      parsed.options.format = 'json';
    } else if (arg === '--format' && args[index + 1]) {
      parsed.options.format = args[index + 1] as OutputFormat;
      index += 1;
    } else if (arg.startsWith('--') && args[index + 1] && !args[index + 1].startsWith('-')) {
      parsed.options[arg.slice(2)] = args[index + 1];
      index += 1;
    } else if (arg.startsWith('--')) {
      parsed.options[arg.slice(2)] = true;
    } else if (!parsed.command) {
      parsed.command = arg;
    } else if (!parsed.subcommand) {
      parsed.subcommand = arg;
    } else {
      parsed.positional.push(arg);
    }
  }

  return parsed;
}
