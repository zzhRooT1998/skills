# skills

Reusable operational runbooks live in this directory.

Each subdirectory contains a focused `SKILL.md` for a concrete workflow. The goal is to keep skills directly discoverable without an extra collection layer.

## Available Skills

### [`openobserve-metrics-triage`](./openobserve-metrics-triage/SKILL.md)

Use this skill for OpenObserve-based incident triage when you need deterministic handling for missing metrics, inconsistent label keys, stream differences, or mixed metrics and log investigation.

Typical use cases:

- check service CPU usage in a defined incident window
- query error or exception logs with fallback message fields
- distinguish telemetry gaps from bad labels or wrong streams
- return a structured summary with `data_status`, `confidence`, and `next_actions`

### [`jenkins-release-runbook`](./jenkins-release-runbook/SKILL.md)

Use this skill for Jenkins-based release execution when you need a controlled workflow around parameter validation, queue tracking, build monitoring, and failure follow-up.

Typical use cases:

- trigger a release job with explicit deployment parameters
- reuse a recent known-good parameter set
- follow a queued build through to completion
- summarize failure clues and rollback-oriented next steps

## How To Use This Directory

- Start with the MCP package README in [`../mcps`](../mcps/README.md) if you need setup instructions for the backing tools.
- Open the target `SKILL.md` when the task matches that workflow.
- Prepare the required inputs listed in the skill before invoking it.
- Treat each skill as the source of truth for workflow, fallbacks, and expected outputs.

## Structure

```text
skills/
+-- README.md
+-- jenkins-release-runbook/
|   +-- SKILL.md
+-- openobserve-metrics-triage/
    +-- SKILL.md
```
