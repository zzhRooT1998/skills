# devops-skills

Centralized skills for DevOps MCP workflows.

## Available

- `openobserve-metrics-triage/SKILL.md`
- `jenkins-release-runbook/SKILL.md`

## openobserve-metrics-triage Quick Start

Use this skill when querying service metrics or logs in OpenObserve and you need deterministic fallback behavior for missing data.

Recommended input set:

- `mode` (`metrics` or `logs`)
- `target_env` (default `default`)
- `org`
- `service_name` (for example `iot-core`)
- `environment` (for example `test`)
- `incident_start` / `incident_end`
- `step` (default `30s`)
- optional `service_label_key` / `environment_label_key` / `label_map`
- logs mode: `stream` + `keyword` (+ optional `message_field`)
- optional `need_chart` / `chart_type`

Output fields:

- `data_status`: `ok | partial | empty`
- `confidence`: `high | medium | low`
- `empty_reason` (when empty)
- `chart_type` (if user asks chart output)
- `matched_logs` (logs mode)

Chart rule:

- If user requests chart visualization and does not specify chart type, reuse the same type in OpenObserve when available.
- Fallback: `line` for metrics, `table` for logs.
