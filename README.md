# taskman

Agent-first todo CLI with provider adapters. The first provider is TickTick.

## Background

Most todo CLIs are designed for humans first, with JSON output bolted on as an afterthought. Taskman flips that: it abstracts common todo concepts (project, task, priority) into a provider-neutral domain model, then implements adapters for specific todo services on top of that model. Nearly every command supports `--json` so an LLM agent can call it directly and get structured, predictable output, while the same commands still print human-readable text for terminal use.

The first adapter targets TickTick, following the capability shape of the `ticktick-cli` project, and talks to TickTick's [OpenAPI](https://developer.ticktick.com/api#/openapi?id=introduction) over OAuth. Provider-specific details (API paths, payload shapes, response mapping) live entirely in the adapter layer, so the CLI and domain model stay provider-neutral.

## Use Cases

- Give an agent (Claude Code or another LLM agent) direct task-management ability through `--json` output on nearly every command.
- Batch operations (tag, priority, complete, or arbitrary field update) driven by a single schema-validated JSON payload, so an agent can update many tasks in one pass instead of one at a time.
- Cross-project querying (`tasks query`) for agents that need to reason over "what's due soon", "what's overdue", or "tagged X but not Y" without hand-rolling TickTick API filters.
- Day-to-day human use from the terminal, since the same commands support readable text output alongside `--json`.

## Install For Local Development

```bash
npm install
npm test
npm link
```

## Setup

```bash
taskman setup
```

Interactive setup asks for the provider first, then prompts for provider-specific credentials.
For TickTick, create an app at https://developer.ticktick.com/ to get the client ID and client secret.

Non-interactive setup is also supported:

```bash
taskman setup ticktick \
  --client-id CLIENT_ID \
  --client-secret CLIENT_SECRET \
  --redirect-uri http://localhost:18888/callback \
  --region global \
  --json
```

## Commands

```bash
taskman auth login --json
taskman auth exchange AUTH_CODE --json
taskman auth status --json
taskman auth refresh --json
taskman auth logout --json

taskman projects list --json
taskman projects get PROJECT_ID --json
taskman projects create "Inbox" --color "#00aa00"
taskman projects delete PROJECT_ID

taskman tasks list PROJECT_ID --json
taskman tasks get PROJECT_ID TASK_ID --json
taskman tasks create "Plan release" --priority high --tags work,release
taskman tasks create PROJECT_ID "Plan release" --due 2026-05-14
taskman tasks update TASK_ID --title "Updated title"
taskman tasks update TASK_ID --project PROJECT_ID --title "Updated title"
taskman tasks update TASK_ID --add-tags work --remove-tags stale
taskman tasks complete PROJECT_ID TASK_ID
taskman tasks delete PROJECT_ID TASK_ID

taskman tasks search release --json
taskman tasks search --tags work,release --json
taskman tasks due 7 --json
taskman tasks priority --json
taskman tasks completed --from 2026-05-01 --to 2026-05-13 --json
taskman tasks query --created-after 2026-05-01 --exclude-tags blocked --exclude-projects Archive --skip-closed --json

taskman batch tag --query release --tags work --add-tags next --remove-tags stale --json
taskman batch priority --query release --priority medium --dry-run --json
taskman batch complete --query release --tags done --dry-run --json
taskman batch update --input '{"updates":[{"taskId":"TASK_ID","projectId":"PROJECT_ID","tags":["next"],"reminders":["15m"],"dueDate":"2026-05-20","content":"Notes","priority":"medium"}]}'
```

## TickTick Configuration

`taskman` reads TickTick credentials from environment variables first:

```bash
export TICKTICK_CLIENT_ID="client_id"
export TICKTICK_CLIENT_SECRET="client_secret"
export TICKTICK_REDIRECT_URI="http://localhost:18888/callback"
export TICKTICK_REGION="global"
```

It can also read config from `~/.config/taskman/config.json`:

```json
{
  "clientId": "client_id",
  "clientSecret": "client_secret",
  "redirectUri": "http://localhost:18888/callback",
  "region": "global"
}
```

Access tokens are read from `~/.config/taskman/ticktick-tokens.json`.

```json
{
  "accessToken": "access_token"
}
```

## Architecture

- `src/domain` contains provider-neutral task and project contracts.
- `src/providers/ticktick` maps TickTick API responses into the shared contracts.
- `src/core/task-queries.ts` contains agent-friendly cross-project orchestration.
- `src/core/batch.ts` contains agent-friendly batch tag, priority, and complete operations.
- `src/cli` parses commands and formats provider-neutral results.

## Agent Batch Update JSON

`taskman batch update --input JSON` accepts a schema-validated payload for explicit task updates. Each item requires `taskId`, may include `projectId`, and can update only `tags`, `reminders`, `dueDate`, `content`, and `priority`.

```json
{
  "dryRun": false,
  "updates": [
    {
      "taskId": "TASK_ID",
      "projectId": "PROJECT_ID",
      "tags": ["work", "next"],
      "reminders": ["15m"],
      "dueDate": "2026-05-20",
      "content": "Notes",
      "priority": "high"
    }
  ]
}
```

## Roadmap

- Provider registry to support todo services beyond TickTick (e.g. Todoist, Google Tasks) behind the same domain model.
- Richer task fields: checklist items and repeat rules, including create/update and output mapping.
- Safer batch workflows: `--dry-run`/`--yes` confirmation across all mutating commands, plus batch delete and batch move project.
- Stable JSON error contract so agents can parse failures as reliably as successes.
- Local OAuth callback server to remove the manual "paste the auth code" step.
- Per-command README/schema examples aimed at agent consumption.

## Notes

This is an early CLI skeleton. Safer delete workflows, richer setup validation, and package metadata polish are the next implementation slices.

`tasks update TASK_ID` can find the project automatically by scanning projects. Pass `--project PROJECT_ID` when you know the project to avoid that scan.
