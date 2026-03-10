# skills

DevOps-focused MCP servers and reusable operational skills.

This repository separates the tool layer from the workflow layer:

- `mcps/` contains MCP server implementations that expose concrete tools
- `skills/` contains task-oriented runbooks in `SKILL.md` format

The result is a repository structure where MCP packages provide capabilities such as querying observability systems or operating Jenkins, while skills define how those capabilities should be used in repeatable operational workflows.

## What This Repository Is For

This project is designed for teams that want to standardize DevOps work instead of relying on ad hoc terminal usage or one-off operator knowledge.

It is useful when you need to:

- investigate incidents through a consistent observability workflow
- run Jenkins releases with explicit safety checks and status tracking
- connect low-level MCP tools with higher-level operational runbooks
- keep reusable troubleshooting and release procedures versioned in one place

## Repository Layout

```text
skills/
+-- README.md
+-- mcps/
|   +-- README.md
|   +-- jenkins-mcp/
|   +-- openobserve-mcp/
+-- skills/
    +-- README.md
    +-- jenkins-release-runbook/
    +-- openobserve-metrics-triage/
```

## Current Capabilities

### OpenObserve Incident Triage

- MCP package: [`mcps/openobserve-mcp`](./mcps/openobserve-mcp/README.md)
- Skill: [`skills/openobserve-metrics-triage`](./skills/openobserve-metrics-triage/SKILL.md)

This path is intended for service metrics and log investigation in OpenObserve, including no-data triage, label fallback, and structured incident summaries.

### Jenkins Release Workflow

- MCP package: [`mcps/jenkins-mcp`](./mcps/jenkins-mcp/README.md)
- Skill: [`skills/jenkins-release-runbook`](./skills/jenkins-release-runbook/SKILL.md)

This path is intended for controlled Jenkins-based deployment workflows, including parameter validation, queue tracking, build monitoring, and failure follow-up.

## How To Navigate The Project

- Start with [`mcps/README.md`](./mcps/README.md) if you want to understand the available MCP servers and how to configure them.
- Start with [`skills/README.md`](./skills/README.md) if you want to find the right runbook for an operational task.
- Open a package README when you need setup details for a concrete MCP server.
- Open a `SKILL.md` when you need the workflow, inputs, fallbacks, and expected outputs for a task.

## Design Principle

This repository keeps implementation and operations guidance separate on purpose:

- MCPs answer "what tools are available?"
- Skills answer "how should those tools be used for a real task?"

That split makes it easier to evolve tooling without rewriting runbooks, and easier to improve runbooks without changing the underlying MCP server implementation.
