---
name: openobserve-metrics-triage
description: Use when triaging OpenObserve incidents with service metrics or logs, especially when cross-environment labels, stream differences, or missing data make queries unreliable.
---

# OpenObserve Metrics and Log Triage

## Overview

Use this runbook to query service CPU metrics or exception logs with `QueryMetrics` and still produce a deterministic result when data is missing.

## Inputs

- `mode`: `metrics` or `logs`
- `target_env`: OpenObserve profile environment, default `default`
- `org`: OpenObserve org (required). If unknown, run org detection first.
- `service_name`: target service value (for example `iot-core`)
- `service_label_key` (optional): default `service_name`; fallback keys: `service`, `application`
- `environment`: deployment environment value (for example `test`)
- `environment_label_key` (optional): default `deployment_environment`; fallback keys: `env`, `environment`
- `incident_start` / `incident_end`: ISO8601 time window
- `step` (optional): PromQL range step, default `30s`
- `label_map` (optional): explicit key/value label map when standard keys do not match
- `stream` (logs mode): log stream/table name (for example `logs_app`)
- `keyword` (logs mode): exception keyword (for example `rejected`)
- `message_field` (logs mode, optional): default `message`; fallback keys `log`, `content`, `_raw`
- `level_field` (logs mode, optional): default `level`
- `need_chart` (optional): whether user asks for chart output
- `chart_type` (optional): user-specified chart type; if missing, reuse this metric's chart type from OpenObserve if available

## Query Contract Mapping

For each query call, always set:

- `target_env`, `org`
- `time_range.start`: `incident_start`
- `time_range.end`: `incident_end`
- `options.timeout_ms`: recommended `30000`

Metrics mode:

- `query_type`: use `promql` for CPU triage
- `query`: selected from metric fallback chain below
- `time_range.step`: `step` (default `30s`)

Logs mode:

- `query_type`: use `sql`
- `stream`: required
- `query`: SQL filtered by service/environment/keyword

Metrics request shape:

```json
{
  "mode": "metrics",
  "target_env": "default",
  "org": "your-org",
  "query_type": "promql",
  "query": "<promql>",
  "time_range": {
    "start": "2026-03-05T10:00:00Z",
    "end": "2026-03-05T10:01:00Z",
    "step": "30s"
  },
  "options": {
    "timeout_ms": 30000
  }
}
```

Logs request shape:

```json
{
  "mode": "logs",
  "target_env": "default",
  "org": "your-org",
  "query_type": "sql",
  "stream": "logs_app",
  "query": "SELECT _timestamp, level, service_name, deployment_environment, message FROM logs_app WHERE _timestamp >= to_timestamp_micros(1772704800000000) AND _timestamp < to_timestamp_micros(1772704860000000) AND service_name = 'iot-core' AND deployment_environment = 'test' AND lower(message) LIKE '%rejected%' ORDER BY _timestamp DESC LIMIT 200",
  "time_range": {
    "start": "2026-03-05T10:00:00Z",
    "end": "2026-03-05T10:01:00Z"
  },
  "options": {
    "timeout_ms": 30000
  }
}
```

## Metric Fallback Chain (CPU)

1. Primary metric: `system_cpu_usage`

```promql
avg(system_cpu_usage{service_name="iot-core",deployment_environment="test"})
```

2. Fallback metric: `container_cpu_usage_seconds_total` with `rate`

```promql
sum(rate(container_cpu_usage_seconds_total{service_name="iot-core",deployment_environment="test"}[5m]))
```

3. Label-key fallback order:

- service label: `service_name` -> `service` -> `application`
- environment label: `deployment_environment` -> `env` -> `environment`

4. If `label_map` is provided, prioritize it over default label keys.

## No-Data Triage (`series_count=0`)

1. Verify `org`:
- Retry with a minimal probe query (`up`/known metric) to confirm org exists and is accessible.
- If upstream returns org error or permission error, stop and report org issue.

2. Relax labels:
- Query with service label only.
- Then add environment label.
- Then test fallback label keys.

3. Expand time window:
- `1m` -> `5m` -> `15m` while keeping `step=30s` (or `60s` for long windows).

4. Switch metric:
- `system_cpu_usage` -> `container_cpu_usage_seconds_total` (`rate` query).

5. Final empty conclusion:
- If still empty, report: monitoring integration missing, telemetry lag, or wrong labels.

## No-Data Triage for Logs (`rows=0`)

1. Verify `org` and `stream`:
- Confirm stream exists and account can query it.

2. Relax filters:
- Keep `service_name` and keyword first.
- Add/remove environment filter to validate label mismatch.

3. Expand time window:
- `1m` -> `5m` -> `15m`.

4. Fallback message fields:
- Try `message` -> `log` -> `content` -> `_raw`.

5. Final empty conclusion:
- If still empty, report no matching logs in selected stream/time window or ingestion delay.

## Output Template

```text
Incident window: <start> ~ <end>
Mode: <metrics|logs>
Service: <service_name>
Environment: <environment>
data_status: <ok|partial|empty>
confidence: <high|medium|low>

metric_used: <metric_name>
stream_used: <stream>
label_key_used: <service_label_key, environment_label_key>
current_cpu: <value or n/a>
points: <count>
matched_logs: <count>
top_errors: <optional list>
chart_type: <line|area|bar|table|...>

empty_reason: <optional, required when data_status=empty>

next_actions:
- <action 1>
- <action 2>
```

## Chart Rendering Rule

When user asks for chart output:

1. If user explicitly provides `chart_type`, use it.
2. Else use the same chart type already configured for this target in OpenObserve:
- metrics mode: same metric and dashboard/panel context when known.
- logs mode: same stream/log-analysis panel type when known.
3. If existing type cannot be determined:
- metrics mode fallback `line`
- logs mode fallback `table`

## Examples

### Example A: `test + iot-core` (no data path)

- Window: recent 1 minute
- Query primary metric first:

```promql
avg(system_cpu_usage{service_name="iot-core",deployment_environment="test"})
```

- If empty, run fallback labels and metric chain. Final sample report:

```text
data_status: empty
confidence: low
empty_reason: no series after metric+label fallback and 1m->5m window expansion; likely telemetry missing or label mismatch
next_actions:
- confirm iot-core metric export in test
- verify label keys in OpenObserve stream
```

### Example B: `test + iot-paas` (has data path)

```promql
avg(system_cpu_usage{service_name="iot-paas",deployment_environment="test"})
```

Sample result:

```text
data_status: ok
confidence: high
metric_used: system_cpu_usage
current_cpu: 0.37
points: 3
next_actions:
- continue latency/error triage if CPU not saturated
```

### Example C: `test + iot-core` rejected exception logs (recent 1 minute)

```sql
SELECT _timestamp, level, service_name, deployment_environment, message
FROM logs_app
WHERE _timestamp >= to_timestamp_micros(1772704800000000)
  AND _timestamp < to_timestamp_micros(1772704860000000)
  AND service_name = 'iot-core'
  AND deployment_environment = 'test'
  AND lower(message) LIKE '%rejected%'
ORDER BY _timestamp DESC
LIMIT 200
```

Sample result:

```text
mode: logs
data_status: ok
confidence: high
stream_used: logs_app
matched_logs: 27
chart_type: table
next_actions:
- group by error signature and trace id
- correlate with CPU and latency window
```
