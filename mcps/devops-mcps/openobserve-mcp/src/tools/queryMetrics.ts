import z from "zod/v4";

export const QueryMetricsInputSchema = z.object({
  target_env: z.string().min(1).optional(),
  org: z.string().min(1),
  query_type: z.enum(["sql", "promql"]),
  query: z.string().min(1),
  stream: z.string().optional(),
  time_range: z
    .object({
      start: z.union([z.string(), z.number()]),
      end: z.union([z.string(), z.number()]),
      step: z.string().optional()
    })
    .strict(),
  options: z
    .object({
      limit: z.number().int().min(1).max(50_000).default(1_000),
      timeout_ms: z.number().int().min(1_000).max(120_000).default(30_000),
      search_type: z.enum(["ui", "dashboards", "reports", "alerts"]).default("ui"),
      raw_response: z.boolean().default(false)
    })
    .strict()
    .optional()
});

export type QueryMetricsInput = z.infer<typeof QueryMetricsInputSchema>;

export enum QueryMetricsErrorCode {
  INVALID_ARGUMENT = "INVALID_ARGUMENT",
  UNSUPPORTED_QUERY_TYPE = "UNSUPPORTED_QUERY_TYPE",
  UPSTREAM_AUTH_FAILED = "UPSTREAM_AUTH_FAILED",
  UPSTREAM_RATE_LIMITED = "UPSTREAM_RATE_LIMITED",
  UPSTREAM_BAD_REQUEST = "UPSTREAM_BAD_REQUEST",
  UPSTREAM_TIMEOUT = "UPSTREAM_TIMEOUT",
  UPSTREAM_INTERNAL_ERROR = "UPSTREAM_INTERNAL_ERROR",
  NORMALIZATION_ERROR = "NORMALIZATION_ERROR"
}

export class QueryMetricsError extends Error {
  public readonly code: QueryMetricsErrorCode;
  public readonly status?: number;

  public constructor(code: QueryMetricsErrorCode, message: string, status?: number) {
    super(message);
    this.name = "QueryMetricsError";
    this.code = code;
    this.status = status;
  }
}

type Primitive = string | number | boolean | null;

export interface QueryMetricsSeries {
  name: string;
  labels: Record<string, string>;
  points: Array<[number, number | null]>;
}

export interface QueryMetricsResult {
  query_type: "sql" | "promql";
  window: {
    start_us: number;
    end_us: number;
    step_seconds?: number;
  };
  series: QueryMetricsSeries[];
  meta?: {
    source_api: string;
    scan_size_mb?: number;
    warnings?: string[];
  };
  raw?: unknown;
}

interface OpenObserveSearchRequest {
  org: string;
  query: {
    sql: string;
    start_time: number;
    end_time: number;
    from: number;
    size: number;
    search_type: "ui" | "dashboards" | "reports" | "alerts";
  };
  stream?: string;
  timeoutMs: number;
}

interface OpenObservePromRequest {
  org: string;
  query: string;
  startSeconds: number;
  endSeconds: number;
  step: string;
  timeoutMs: number;
}

export interface QueryMetricsDeps {
  search(request: OpenObserveSearchRequest): Promise<unknown>;
  promQueryRange(request: OpenObservePromRequest): Promise<unknown>;
}

interface NormalizedWindow {
  startUs: number;
  endUs: number;
  stepSeconds?: number;
}

const SQL_RESERVED_COLUMNS = new Set(["ts", "_timestamp", "timestamp", "value", "name", "metric"]);

export async function runQueryMetrics(input: QueryMetricsInput, deps: QueryMetricsDeps): Promise<QueryMetricsResult> {
  const parsedInput = QueryMetricsInputSchema.parse(input);
  const parsedOptions = parsedInput.options ?? {
    limit: 1_000,
    timeout_ms: 30_000,
    search_type: "ui" as const,
    raw_response: false
  };

  const window = normalizeWindow(
    parsedInput.time_range.start,
    parsedInput.time_range.end,
    parsedInput.time_range.step
  );

  try {
    if (parsedInput.query_type === "sql") {
      const rawResponse = await deps.search({
        org: parsedInput.org,
        query: {
          sql: parsedInput.query,
          start_time: window.startUs,
          end_time: window.endUs,
          from: 0,
          size: parsedOptions.limit,
          search_type: parsedOptions.search_type
        },
        stream: parsedInput.stream,
        timeoutMs: parsedOptions.timeout_ms
      });

      const series = normalizeSqlResponse(rawResponse, parsedInput.stream);
      const scanSize = pickScanSize(rawResponse);

      return {
        query_type: "sql",
        window: {
          start_us: window.startUs,
          end_us: window.endUs
        },
        series,
        meta: {
          source_api: "search",
          scan_size_mb: scanSize
        },
        raw: parsedOptions.raw_response ? rawResponse : undefined
      };
    }

    if (parsedInput.query_type === "promql") {
      const step = parsedInput.time_range.step ?? "30s";
      const stepSeconds = parseStepToSeconds(step);

      const rawResponse = await deps.promQueryRange({
        org: parsedInput.org,
        query: parsedInput.query,
        startSeconds: Math.floor(window.startUs / 1_000_000),
        endSeconds: Math.floor(window.endUs / 1_000_000),
        step,
        timeoutMs: parsedOptions.timeout_ms
      });

      const series = normalizePromResponse(rawResponse, parsedInput.stream);

      return {
        query_type: "promql",
        window: {
          start_us: window.startUs,
          end_us: window.endUs,
          step_seconds: stepSeconds
        },
        series,
        meta: {
          source_api: "prometheus-query-range"
        },
        raw: parsedOptions.raw_response ? rawResponse : undefined
      };
    }

    throw new QueryMetricsError(
      QueryMetricsErrorCode.UNSUPPORTED_QUERY_TYPE,
      `Unsupported query_type: ${parsedInput.query_type}`
    );
  } catch (error) {
    if (error instanceof QueryMetricsError) {
      throw error;
    }
    throw mapUpstreamError(error);
  }
}

function normalizeWindow(start: string | number, end: string | number, step?: string): NormalizedWindow {
  const startUs = normalizeTimestampToMicros(start);
  const endUs = normalizeTimestampToMicros(end);

  if (endUs <= startUs) {
    throw new QueryMetricsError(
      QueryMetricsErrorCode.INVALID_ARGUMENT,
      `Invalid time range: end (${endUs}) must be greater than start (${startUs})`
    );
  }

  if (step === undefined) {
    return { startUs, endUs };
  }

  return {
    startUs,
    endUs,
    stepSeconds: parseStepToSeconds(step)
  };
}

function normalizeTimestampToMicros(value: string | number): number {
  if (typeof value === "number") {
    return normalizeNumericTimestamp(value);
  }

  const asNumber = Number(value);
  if (!Number.isNaN(asNumber) && Number.isFinite(asNumber)) {
    return normalizeNumericTimestamp(asNumber);
  }

  const parsedMs = Date.parse(value);
  if (Number.isNaN(parsedMs)) {
    throw new QueryMetricsError(
      QueryMetricsErrorCode.INVALID_ARGUMENT,
      `Unable to parse timestamp value: ${value}`
    );
  }

  return parsedMs * 1_000;
}

function normalizeNumericTimestamp(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new QueryMetricsError(
      QueryMetricsErrorCode.INVALID_ARGUMENT,
      `Timestamp must be a positive finite number. Received: ${value}`
    );
  }

  if (value < 1e11) {
    return Math.floor(value * 1_000_000);
  }
  if (value < 1e14) {
    return Math.floor(value * 1_000);
  }

  return Math.floor(value);
}

function parseStepToSeconds(step: string): number {
  const trimmed = step.trim();
  const match = /^([0-9]+)(ms|s|m|h)?$/i.exec(trimmed);
  if (!match) {
    throw new QueryMetricsError(
      QueryMetricsErrorCode.INVALID_ARGUMENT,
      `Invalid step format: ${step}. Use values like 30s, 1m, 1h.`
    );
  }

  const amount = Number(match[1]);
  const unit = (match[2] ?? "s").toLowerCase();

  switch (unit) {
    case "ms":
      return amount / 1_000;
    case "s":
      return amount;
    case "m":
      return amount * 60;
    case "h":
      return amount * 3_600;
    default:
      throw new QueryMetricsError(
        QueryMetricsErrorCode.INVALID_ARGUMENT,
        `Invalid step unit: ${unit}`
      );
  }
}

function normalizeSqlResponse(rawResponse: unknown, defaultName?: string): QueryMetricsSeries[] {
  const rows = pickSqlHits(rawResponse);
  const grouped = new Map<string, QueryMetricsSeries>();

  for (const row of rows) {
    if (!isRecord(row)) {
      continue;
    }

    const timestamp = pickTimestamp(row);
    const value = pickValue(row);
    const name = pickSeriesName(row, defaultName);
    const labels = pickLabels(row);
    const groupKey = `${name}|${JSON.stringify(labels)}`;
    const existing = grouped.get(groupKey);

    if (existing === undefined) {
      grouped.set(groupKey, {
        name,
        labels,
        points: [[timestamp, value]]
      });
      continue;
    }

    existing.points.push([timestamp, value]);
  }

  const series = [...grouped.values()];
  for (const entry of series) {
    entry.points.sort((a, b) => a[0] - b[0]);
  }
  return series;
}

function normalizePromResponse(rawResponse: unknown, defaultName?: string): QueryMetricsSeries[] {
  if (!isRecord(rawResponse)) {
    throw new QueryMetricsError(
      QueryMetricsErrorCode.NORMALIZATION_ERROR,
      "PromQL response must be an object."
    );
  }

  const data = rawResponse.data;
  if (!isRecord(data)) {
    throw new QueryMetricsError(
      QueryMetricsErrorCode.NORMALIZATION_ERROR,
      "PromQL response missing data field."
    );
  }

  const result = data.result;
  if (!Array.isArray(result)) {
    throw new QueryMetricsError(
      QueryMetricsErrorCode.NORMALIZATION_ERROR,
      "PromQL response data.result must be an array."
    );
  }

  return result.map((entry) => normalizePromSeriesEntry(entry, defaultName));
}

function normalizePromSeriesEntry(entry: unknown, defaultName?: string): QueryMetricsSeries {
  if (!isRecord(entry)) {
    throw new QueryMetricsError(
      QueryMetricsErrorCode.NORMALIZATION_ERROR,
      "PromQL series entry must be an object."
    );
  }

  const metric = isRecord(entry.metric) ? entry.metric : {};
  const points = entry.values;
  if (!Array.isArray(points)) {
    throw new QueryMetricsError(
      QueryMetricsErrorCode.NORMALIZATION_ERROR,
      "PromQL series entry missing values array."
    );
  }

  const labels: Record<string, string> = {};
  for (const [key, rawValue] of Object.entries(metric)) {
    if (key === "__name__") {
      continue;
    }
    labels[key] = String(rawValue);
  }

  const name = String(metric.__name__ ?? defaultName ?? "promql_series");
  const normalizedPoints = points.map((point) => {
    if (!Array.isArray(point) || point.length !== 2) {
      throw new QueryMetricsError(
        QueryMetricsErrorCode.NORMALIZATION_ERROR,
        "PromQL point must be [timestamp, value]."
      );
    }

    const tsSeconds = Number(point[0]);
    const value = point[1] === null ? null : Number(point[1]);
    if (Number.isNaN(tsSeconds)) {
      throw new QueryMetricsError(
        QueryMetricsErrorCode.NORMALIZATION_ERROR,
        `Invalid PromQL timestamp: ${String(point[0])}`
      );
    }

    if (value !== null && Number.isNaN(value)) {
      throw new QueryMetricsError(
        QueryMetricsErrorCode.NORMALIZATION_ERROR,
        `Invalid PromQL value: ${String(point[1])}`
      );
    }

    return [Math.floor(tsSeconds * 1_000_000), value] as [number, number | null];
  });

  return {
    name,
    labels,
    points: normalizedPoints
  };
}

function pickSqlHits(rawResponse: unknown): unknown[] {
  if (!isRecord(rawResponse)) {
    throw new QueryMetricsError(
      QueryMetricsErrorCode.NORMALIZATION_ERROR,
      "SQL response must be an object."
    );
  }

  if (Array.isArray(rawResponse.hits)) {
    return rawResponse.hits;
  }

  if (isRecord(rawResponse.data) && Array.isArray(rawResponse.data.hits)) {
    return rawResponse.data.hits;
  }

  throw new QueryMetricsError(
    QueryMetricsErrorCode.NORMALIZATION_ERROR,
    "SQL response missing hits array."
  );
}

function pickTimestamp(row: Record<string, unknown>): number {
  const ts = row.ts ?? row._timestamp ?? row.timestamp;
  if (ts === undefined) {
    throw new QueryMetricsError(
      QueryMetricsErrorCode.NORMALIZATION_ERROR,
      "SQL row missing timestamp field (ts/_timestamp/timestamp)."
    );
  }

  return normalizeTimestampToMicros(ts as string | number);
}

function pickValue(row: Record<string, unknown>): number | null {
  const rawValue = row.value ?? row.val ?? null;
  if (rawValue === null) {
    return null;
  }

  const numericValue = Number(rawValue);
  if (Number.isNaN(numericValue)) {
    throw new QueryMetricsError(
      QueryMetricsErrorCode.NORMALIZATION_ERROR,
      `SQL row value is not numeric: ${String(rawValue)}`
    );
  }
  return numericValue;
}

function pickSeriesName(row: Record<string, unknown>, defaultName?: string): string {
  if (row.name !== undefined) {
    return String(row.name);
  }
  if (row.metric !== undefined) {
    return String(row.metric);
  }
  return defaultName ?? "sql_series";
}

function pickLabels(row: Record<string, unknown>): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const [key, value] of Object.entries(row)) {
    if (SQL_RESERVED_COLUMNS.has(key)) {
      continue;
    }

    if (isPrimitive(value)) {
      labels[key] = String(value);
    }
  }

  return labels;
}

function pickScanSize(rawResponse: unknown): number | undefined {
  if (!isRecord(rawResponse)) {
    return undefined;
  }

  const candidate = rawResponse.scan_size ?? (isRecord(rawResponse.data) ? rawResponse.data.scan_size : undefined);
  if (candidate === undefined || candidate === null) {
    return undefined;
  }

  const value = Number(candidate);
  return Number.isNaN(value) ? undefined : value;
}

function mapUpstreamError(error: unknown): QueryMetricsError {
  const status = pickStatusCode(error);
  if (status === 401 || status === 403) {
    return new QueryMetricsError(
      QueryMetricsErrorCode.UPSTREAM_AUTH_FAILED,
      "OpenObserve authentication failed.",
      status
    );
  }
  if (status === 429) {
    return new QueryMetricsError(
      QueryMetricsErrorCode.UPSTREAM_RATE_LIMITED,
      "OpenObserve rate limit reached.",
      status
    );
  }
  if (status === 400) {
    return new QueryMetricsError(
      QueryMetricsErrorCode.UPSTREAM_BAD_REQUEST,
      "OpenObserve rejected the query.",
      status
    );
  }
  if (status === 504) {
    return new QueryMetricsError(
      QueryMetricsErrorCode.UPSTREAM_TIMEOUT,
      "OpenObserve query timed out.",
      status
    );
  }
  if (status !== undefined && status >= 500) {
    return new QueryMetricsError(
      QueryMetricsErrorCode.UPSTREAM_INTERNAL_ERROR,
      "OpenObserve internal server error.",
      status
    );
  }

  if (error instanceof Error && error.name === "AbortError") {
    return new QueryMetricsError(QueryMetricsErrorCode.UPSTREAM_TIMEOUT, "OpenObserve query timed out.");
  }

  return new QueryMetricsError(
    QueryMetricsErrorCode.NORMALIZATION_ERROR,
    error instanceof Error ? error.message : "Unknown query metrics error."
  );
}

function pickStatusCode(error: unknown): number | undefined {
  if (!isRecord(error)) {
    return undefined;
  }

  const candidate = error.status ?? error.statusCode;
  if (typeof candidate === "number") {
    return candidate;
  }
  return undefined;
}

function isPrimitive(value: unknown): value is Primitive {
  const valueType = typeof value;
  return value === null || valueType === "string" || valueType === "number" || valueType === "boolean";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
