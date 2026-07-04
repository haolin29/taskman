#!/usr/bin/env node
import { runCli } from '../dist/src/cli/main.js';

// Executable entry function for the taskman command.
async function main() {
  const code = await runCli(process.argv.slice(2));
  process.exitCode = code;
}

main();
