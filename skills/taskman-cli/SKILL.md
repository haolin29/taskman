---
name: taskman-cli
description: Manage tasks and projects via the taskman CLI (TickTick wrapper). Use whenever the user mentions tasks, to-dos, reminders, deadlines, "what's on my todo", schedules, or follow-ups. Also triggers for creating a task, listing upcoming work, batch-updating tasks through JSON, batch-updating tags/priority, or managing projects. Always use --json for internal lookups and decision-making.
metadata: 
  version: 1.1.0
---

# taskman CLI

Agent-first todo CLI backed by TickTick. Provider-neutral domain model; TickTick is the service provider.

## Setup

```bash
taskman setup           # interactive: picks provider, then prompts for credentials
taskman auth status     # verify auth
```

For TickTick, create an app at https://developer.ticktick.com/ to get client ID and secret.

Config lives at `~/.config/taskman/config.json`; tokens at `~/.config/taskman/ticktick-tokens.json`.

## Output

All commands support `--json` for machine-readable output. **Always use `--json` for internal decision-making.**

```bash
taskman tasks list PROJECT_ID --json
```

## Projects

```bash
taskman projects list                         # find project ID by name
taskman projects get PROJECT_ID               # project + its tasks
taskman projects create "Name" --color "#f00"
taskman projects delete PROJECT_ID
```

When the user refers to a project by name, resolve it to an ID first:
```bash
taskman projects list --json
```

## Tasks

```bash
# List / get
taskman tasks list PROJECT_ID --json
taskman tasks get PROJECT_ID TASK_ID --json

# Create
taskman tasks create "Plan release" --priority high --tags work,release
taskman tasks create PROJECT_ID "Plan release" --due 2026-05-14

# Update (auto-finds project; agent should pass --project to skip scan)
taskman tasks update TASK_ID --title "New title"
taskman tasks update TASK_ID --project PROJECT_ID --due 2026-05-20 --priority medium
taskman tasks update TASK_ID --project PROJECT_ID --add-tags next --remove-tags stale

# Complete / delete (both need PROJECT_ID)
taskman tasks complete PROJECT_ID TASK_ID
taskman tasks delete PROJECT_ID TASK_ID
```

### Discovery / Filtering

```bash
taskman tasks due 7 --json              # due within N days (default 7)
taskman tasks priority --json           # high-priority tasks
taskman tasks search "keyword" --json
taskman tasks search --tags work,release --json
taskman tasks search --priority high --json

# Completed tasks in a date range
taskman tasks completed --from 2026-05-01 --to 2026-05-13 --json

# Cross-project query with filters
taskman tasks query \
  --created-after 2026-05-01 \
  --exclude-tags blocked \
  --exclude-projects Archive \
  --skip-closed \
  --json
```

## Batch Operations

All batch commands support `--dry-run` to preview without applying changes.

```bash
# Tag operations: add/remove tags on matching tasks
taskman batch tag --query "release" --add-tags next --remove-tags stale --dry-run
taskman batch tag --tags work --add-tags urgent

# Bulk-set priority on matching tasks
taskman batch priority --query "release" --priority medium --dry-run

# Bulk-complete matching tasks
taskman batch complete --query "done" --tags processed --dry-run

# Agent JSON batch update for explicit task IDs
taskman batch update --input '{"updates":[{"taskId":"TASK_ID","projectId":"PROJECT_ID","tags":["next"],"reminders":["15m"],"dueDate":"2026-05-20","content":"Notes","priority":"medium"}]}'
```

Batch filter options: `--query TEXT`, `--tags TAGS`, `--priority LEVEL`.
`taskman batch update` uses an explicit JSON payload instead of search filters. Each update requires `taskId`, may include `projectId`, and can update only `tags`, `reminders`, `dueDate`, `content`, and `priority`. Use `dryRun` inside the payload or pass `--dry-run` to preview without applying changes.

```json
{
  "dryRun": true,
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

## Authentication

```bash
taskman auth login              # start OAuth flow (opens browser)
taskman auth exchange AUTH_CODE # finish OAuth with the code from redirect
taskman auth refresh            # renew access token
taskman auth logout             # clear tokens
```

## Options Reference

**Create/Update:**
- `--title "New title"`：rename (update only)
- `--content "desc"`：body text
- `--due "2026-05-20"`：due date (YYYY-MM-DD or ISO 8601)
- `--priority none|low|medium|high`
- `--tags "tag1,tag2"`：replace tags
- `--add-tags "t1,t2"` / `--remove-tags "t1,t2"`：incremental tag edit
- `--project PROJECT_ID`：skip auto-scan in update

## Short IDs

IDs are displayed as 8-char short IDs. Use them in commands instead of full UUIDs.

```
ID       | Title          | Due        | Priority
--------------------------------------------------
685cfca6 | Plan release   | 2026-05-20 | high
```

## Troubleshooting

- **"No config found"** → run `taskman setup`
- **"Not authenticated"** → run `taskman auth login`
- **Token expired** → run `taskman auth refresh`
