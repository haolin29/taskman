import { createInterface, type Interface } from 'node:readline/promises';

export interface SetupPromptService {
  ask(prompt: string): Promise<string>;
  close(): void;
}

export function createSetupPromptService(): SetupPromptService {
  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new ReadlineSetupPromptService(readline);
}

class ReadlineSetupPromptService implements SetupPromptService {
  constructor(private readonly readline: Interface) {}

  async ask(prompt: string): Promise<string> {
    return this.readline.question(prompt);
  }

  close(): void {
    this.readline.close();
  }
}
