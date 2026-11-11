# mcp — specs

This folder holds specs of features that change **only** the MCP server. They are written before
implementation by the [`spec-creator`](../../.claude/agents/spec-creator.md) agent after you
approve them, and [`implementation-planner`](../../.claude/agents/implementation-planner.md)
plans from them. A new MCP tool usually needs a new API endpoint too. That changes two packages,
so its spec goes in the root [`specs/`](../../specs/README.md) folder.

- File name: `NNN-<slug>.md`. `NNN` is one sequence across every spec folder.
- `Spec ID: SPEC-NNN` · Status: `draft` → `approved` → `implemented`
- The file is in English, has EARS acceptance criteria and no implementation details.
- Template and rules: [`specs/README.md`](../../specs/README.md).
