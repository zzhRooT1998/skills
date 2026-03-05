---
name: openobserve-metrics-triage
description: Use QueryMetrics to run fast incident triage on service SLO signals (error rate, latency, resource usage).
---

# OpenObserve Metrics Triage

## Purpose

Provide a repeatable incident workflow using `QueryMetrics` so every triage run checks the same key signals.

## Inputs

- `org` (OpenObserve organization)
- `service` (target service label)
- `incident_start` / `incident_end` (ISO8601)
- optional `baseline_start` / `baseline_end`

## Workflow

1. Query `error_rate` (PromQL)
2. Query `latency_p95` (PromQL)
3. Query `cpu` and `memory` (PromQL or SQL)
4. If baseline is provided, run same set on baseline window
5. Report:
   - current value
   - baseline value
   - delta (%)
   - confidence notes (missing data, sparse points)

## PromQL Examples

```promql
sum(rate(http_requests_total{service="api",status=~"5.."}[5m])) by (service)
```

```promql
histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{service="api"}[5m])) by (le))
```

```promql
avg(container_cpu_usage_seconds_total{service="api"})
```

## Output Template

```text
Incident window: <start> ~ <end>
Service: <service>

1) error_rate: <current> (baseline <baseline>, delta <x>%)
2) p95_latency: <current> (baseline <baseline>, delta <x>%)
3) cpu_usage: <current> (baseline <baseline>, delta <x>%)
4) memory_usage: <current> (baseline <baseline>, delta <x>%)

Conclusion:
- Primary anomaly:
- Suspected scope:
- Suggested next action:
```
