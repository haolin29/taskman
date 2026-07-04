# Agent Instructions

- 避免使用否定后再转折对照的固定句式。
- 不要出现破折号。
- 在搜索的时候优先使用英文网站的信源。
- 入口函数要写注释。

## Taskman Development Notes

- 实施 TickTick API endpoint 时，先用真实数据对比旧实现和新实现的 `count`、样本 task id、关键边界项，再改代码。
- 不能只用“不报错”判断查询成功。用户给了具体 CLI 命令时，要跑同一条命令验证结果数量和代表性任务是否符合预期。
- `taskman tasks query` 当前应通过 TickTick `POST /task/filter` 查询 active tasks，body 使用 `{ "status": [0] }`。
- 不要把 `POST /task/filter` 空 body 当成“查询所有 active tasks”。实测空 body 会返回默认分页结果，且可能主要是历史 completed tasks。
- 不要使用 `status: 0` 或字符串 status 调 TickTick filter API。实测这些 body 可能返回 500。
- `POST /task/filter` 可能返回 `GET /project` 列表里没有的系统 Inbox `projectId`。除非用户明确要求过滤，否则保留这些任务。
- TickTick 不同接口返回的同一字段 shape 可能不同。比如 `reminders` 可能是 `{ trigger }[]`，也可能是 `string[]`，provider mapper 要在 domain 边界做兼容归一化。
- 对外部 API 行为做修复时，测试要覆盖真实坏样本，例如字符串 reminder、系统 Inbox task、closed project task、excluded tag task。
- 当新 API 返回额外数据时，先向用户说明差异和可选处理方式，避免擅自添加业务过滤。
