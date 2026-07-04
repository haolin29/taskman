declare module 'node:test' {
  export default function test(name: string, fn: () => void | Promise<void>): void;
}

declare module 'node:assert/strict' {
  const assert: {
    equal(actual: unknown, expected: unknown, message?: string): void;
    deepEqual(actual: unknown, expected: unknown, message?: string): void;
    match(actual: string, expected: RegExp, message?: string): void;
    ok(value: unknown, message?: string): void;
    rejects(fn: () => Promise<unknown>, expected?: RegExp, message?: string): Promise<void>;
  };
  export default assert;
}

declare module 'node:fs' {
  export function existsSync(path: string): boolean;
}

declare module 'node:fs/promises' {
  export function mkdir(path: string, options?: { recursive?: boolean; mode?: number }): Promise<void>;
  export function readFile(path: string, encoding: BufferEncoding): Promise<string>;
  export function writeFile(path: string, data: string, options?: { mode?: number }): Promise<void>;
}

declare module 'node:os' {
  export function homedir(): string;
}

declare module 'node:path' {
  export function join(...paths: string[]): string;
}

declare module 'node:module' {
  export function createRequire(filename: string | URL): (id: string) => unknown;
}

declare module 'node:readline/promises' {
  export interface Interface {
    question(prompt: string): Promise<string>;
    close(): void;
  }

  export function createInterface(options: {
    input: unknown;
    output: unknown;
  }): Interface;
}

type BufferEncoding = 'utf-8' | 'utf8';

declare const process: {
  argv: string[];
  env: Record<string, string | undefined>;
  exitCode?: number;
  stdout: { write(chunk: string): void };
  stderr: { write(chunk: string): void };
  stdin: unknown;
};

declare const fetch: (input: string, init?: {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
  json(): Promise<unknown>;
}>;
