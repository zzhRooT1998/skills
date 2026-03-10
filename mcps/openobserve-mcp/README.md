# openobserve-mcp

MCP server for querying OpenObserve metrics with one unified tool: `QueryMetrics`.

The tool supports both:

- `sql` mode via OpenObserve `/_search`
- `promql` mode via OpenObserve Prometheus-compatible `query_range`

Results are normalized into the same time-series shape so clients can consume one output contract.

## Features

- Single tool: `QueryMetrics`
- Dual query modes: `sql` and `promql`
- Normalized series output: `[{ name, labels, points }]`
- Time parsing for ISO8601 and epoch (seconds/milliseconds/microseconds)
- Error mapping to stable tool error codes

## Project Layout

```text
openobserve-mcp/
+-- src/
|   +-- index.ts                  # MCP server entrypoint
|   +-- openobserveClient.ts      # OpenObserve HTTP client
|   +-- tools/queryMetrics.ts     # Tool schema + core logic
+-- tests/
|   +-- queryMetrics.test.ts      # TDD tests for QueryMetrics
+-- package.json
+-- README.md
```

## Prerequisites

- Node.js 22+
- OpenObserve endpoint and credentials

## Installation

```bash
npm install
```

## Configuration

Multi-environment mode (recommended):

1. Create a profiles file (for example `openobserve.profiles.json`):

```json
{
  "default_env": "staging",
  "environments": {
    "staging": {
      "base_url": "https://oo-staging.example.com",
      "username": "svc_stg",
      "password": "xxx",
      "allow_streams": ["logs_app", "metrics_app"],
      "read_only": true
    },
    "prod": {
      "base_url": "https://oo-prod.example.com",
      "username": "svc_prod",
      "password": "yyy"
    }
  }
}
```

2. Set:

```bash
OPENOBSERVE_PROFILES_FILE=/path/to/openobserve.profiles.json
```

Single-environment fallback (legacy):

```bash
OPENOBSERVE_BASE_URL=https://your-openobserve.example.com
OPENOBSERVE_USERNAME=your-username
OPENOBSERVE_PASSWORD=your-password
```

## Run

Development:

```bash
npm run dev
```

Build and run:

```bash
npm run build
npm start
```

## Tool Contract: `QueryMetrics`

### Input

```json
{
  "target_env": "staging",
  "org": "prod",
  "query_type": "sql",
  "query": "SELECT histogram(_timestamp) as ts, avg(value) as value FROM prometheus GROUP BY ts ORDER BY ts",
  "stream": "prometheus",
  "time_range": {
    "start": "2026-03-05T08:00:00Z",
    "end": "2026-03-05T09:00:00Z"
  },
  "options": {
    "limit": 1000,
    "timeout_ms": 30000,
    "search_type": "dashboards",
    "raw_response": false
  }
}
```

### Output

```json
{
  "query_type": "sql",
  "window": {
    "start_us": 1772697600000000,
    "end_us": 1772701200000000
  },
  "series": [
    {
      "name": "cpu_usage",
      "labels": {
        "service": "api"
      },
      "points": [
        [1772697600000000, 0.12],
        [1772697630000000, 0.11]
      ]
    }
  ],
  "meta": {
    "source_api": "search",
    "scan_size_mb": 12.6
  }
}
```

### PromQL Example

```json
{
  "target_env": "prod",
  "org": "prod",
  "query_type": "promql",
  "query": "sum(rate(http_requests_total{service=\"api\",status=~\"5..\"}[5m])) by (service)",
  "time_range": {
    "start": "2026-03-05T08:00:00Z",
    "end": "2026-03-05T09:00:00Z",
    "step": "30s"
  }
}
```

## Error Codes

- `INVALID_ARGUMENT`
- `UNSUPPORTED_QUERY_TYPE`
- `UPSTREAM_AUTH_FAILED`
- `UPSTREAM_RATE_LIMITED`
- `UPSTREAM_BAD_REQUEST`
- `UPSTREAM_TIMEOUT`
- `UPSTREAM_INTERNAL_ERROR`
- `NORMALIZATION_ERROR`

## Verification

```bash
npm test
npm run build
```

## Notes

- SQL mode expects query rows to contain timestamp in one of: `ts`, `_timestamp`, `timestamp`.
- PromQL mode expects matrix response and converts timestamps to microseconds.
- `raw_response=true` returns upstream payload in `raw`.
- `target_env` selects which profile/environment to use. If omitted, `default_env` is used.

## Included Skill

- `../../skills/openobserve-metrics-triage/SKILL.md`
  - A reusable incident-triage workflow for metrics and logs based on `QueryMetrics`.
  - Defaults:
    - `target_env=default`
    - `step=30s`
    - primary CPU metric `system_cpu_usage`
  - Label fallback:
    - service: `service_name -> service -> application`
    - environment: `deployment_environment -> env -> environment`
  - Log query supports `stream` + `keyword` with message-field fallback (`message -> log -> content -> _raw`).
  - Output includes `data_status`, `confidence`, and optional `empty_reason`.
  - If chart rendering is requested, use user-provided `chart_type`; otherwise reuse existing OpenObserve chart type when available.
  - Chart fallback: `line` for metrics, `table` for logs.
