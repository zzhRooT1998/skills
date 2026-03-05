import z from "zod/v4";

export const TriggerBuildInputSchema = z.object({
  target_env: z.string().min(1).optional(),
  job_path: z.string().min(1),
  parameters: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  token: z.string().optional(),
  hitl_confirmed: z.boolean().optional(),
  hitl_confirmation_note: z.string().min(1).optional()
});

export const TrackQueueItemInputSchema = z.object({
  target_env: z.string().min(1).optional(),
  queue_id: z.number().int().positive()
});

export const GetBuildStatusInputSchema = z.object({
  target_env: z.string().min(1).optional(),
  job_path: z.string().min(1),
  build_number: z.number().int().positive()
});

export const GetConsoleLogInputSchema = z.object({
  target_env: z.string().min(1).optional(),
  job_path: z.string().min(1),
  build_number: z.number().int().positive(),
  start: z.number().int().min(0).default(0)
});

export const AbortBuildInputSchema = z.object({
  target_env: z.string().min(1).optional(),
  job_path: z.string().min(1),
  build_number: z.number().int().positive(),
  hitl_confirmed: z.boolean().optional(),
  hitl_confirmation_note: z.string().min(1).optional()
});

export type TriggerBuildInput = z.infer<typeof TriggerBuildInputSchema>;
export type TrackQueueItemInput = z.infer<typeof TrackQueueItemInputSchema>;
export type GetBuildStatusInput = z.infer<typeof GetBuildStatusInputSchema>;
export type GetConsoleLogInput = z.infer<typeof GetConsoleLogInputSchema>;
export type AbortBuildInput = z.infer<typeof AbortBuildInputSchema>;

export enum JenkinsToolErrorCode {
  INVALID_ARGUMENT = "INVALID_ARGUMENT",
  UPSTREAM_AUTH_FAILED = "UPSTREAM_AUTH_FAILED",
  UPSTREAM_NOT_FOUND = "UPSTREAM_NOT_FOUND",
  UPSTREAM_RATE_LIMITED = "UPSTREAM_RATE_LIMITED",
  UPSTREAM_BAD_REQUEST = "UPSTREAM_BAD_REQUEST",
  UPSTREAM_TIMEOUT = "UPSTREAM_TIMEOUT",
  UPSTREAM_INTERNAL_ERROR = "UPSTREAM_INTERNAL_ERROR",
  NORMALIZATION_ERROR = "NORMALIZATION_ERROR"
}

export class JenkinsToolError extends Error {
  public readonly code: JenkinsToolErrorCode;
  public readonly status?: number;

  public constructor(code: JenkinsToolErrorCode, message: string, status?: number) {
    super(message);
    this.name = "JenkinsToolError";
    this.code = code;
    this.status = status;
  }
}

export interface JenkinsToolDeps {
  triggerBuild(request: { jobPath: string; token?: string }): Promise<{ location?: string }>;
  triggerBuildWithParameters(request: {
    jobPath: string;
    parameters: Record<string, string>;
    token?: string;
  }): Promise<{ location?: string }>;
  getQueueItem(request: { queueId: number }): Promise<unknown>;
  getBuild(request: { jobPath: string; buildNumber: number }): Promise<unknown>;
  getConsoleLog(request: {
    jobPath: string;
    buildNumber: number;
    start: number;
  }): Promise<{ text: string; nextStart: number; moreData: boolean }>;
  stopBuild(request: { jobPath: string; buildNumber: number }): Promise<void>;
}

export async function runTriggerBuild(
  input: TriggerBuildInput,
  deps: JenkinsToolDeps
): Promise<{ job_path: string; location?: string; queue_id?: number }> {
  const parsed = TriggerBuildInputSchema.parse(input);

  try {
    const response =
      parsed.parameters === undefined
        ? await deps.triggerBuild({
            jobPath: parsed.job_path,
            token: parsed.token
          })
        : await deps.triggerBuildWithParameters({
            jobPath: parsed.job_path,
            token: parsed.token,
            parameters: stringifyParameters(parsed.parameters)
          });

    return {
      job_path: parsed.job_path,
      location: response.location,
      queue_id: extractQueueId(response.location)
    };
  } catch (error) {
    throw mapUpstreamError(error);
  }
}

export async function runTrackQueueItem(
  input: TrackQueueItemInput,
  deps: JenkinsToolDeps
): Promise<{
  queue_id: number;
  state: "waiting" | "running" | "cancelled" | "unknown";
  why?: string;
  build_number?: number;
  build_url?: string;
}> {
  const parsed = TrackQueueItemInputSchema.parse(input);

  try {
    const queueItem = await deps.getQueueItem({ queueId: parsed.queue_id });
    if (!isRecord(queueItem)) {
      throw new JenkinsToolError(
        JenkinsToolErrorCode.NORMALIZATION_ERROR,
        "Queue item response must be an object."
      );
    }

    if (queueItem.cancelled === true) {
      return {
        queue_id: parsed.queue_id,
        state: "cancelled"
      };
    }

    if (isRecord(queueItem.executable)) {
      return {
        queue_id: parsed.queue_id,
        state: "running",
        build_number: toSafePositiveInt(queueItem.executable.number),
        build_url:
          queueItem.executable.url === undefined ? undefined : String(queueItem.executable.url)
      };
    }

    if (queueItem.blocked === true || queueItem.buildable === true || queueItem.stuck === true) {
      return {
        queue_id: parsed.queue_id,
        state: "waiting",
        why: queueItem.why === undefined ? undefined : String(queueItem.why)
      };
    }

    return {
      queue_id: parsed.queue_id,
      state: "unknown",
      why: queueItem.why === undefined ? undefined : String(queueItem.why)
    };
  } catch (error) {
    throw mapUpstreamError(error);
  }
}

export async function runGetBuildStatus(
  input: GetBuildStatusInput,
  deps: JenkinsToolDeps
): Promise<{
  job_path: string;
  build_number: number;
  status: "RUNNING" | "SUCCESS" | "FAILURE" | "ABORTED" | "UNSTABLE" | "UNKNOWN";
  result: string | null;
  duration_ms: number;
  started_at_ms: number;
}> {
  const parsed = GetBuildStatusInputSchema.parse(input);

  try {
    const build = await deps.getBuild({
      jobPath: parsed.job_path,
      buildNumber: parsed.build_number
    });

    if (!isRecord(build)) {
      throw new JenkinsToolError(
        JenkinsToolErrorCode.NORMALIZATION_ERROR,
        "Build payload must be an object."
      );
    }

    const building = build.building === true;
    const rawResult = build.result === undefined || build.result === null ? null : String(build.result);

    return {
      job_path: parsed.job_path,
      build_number: parsed.build_number,
      status: deriveBuildStatus(building, rawResult),
      result: rawResult,
      duration_ms: toNonNegativeInt(build.duration),
      started_at_ms: toNonNegativeInt(build.timestamp)
    };
  } catch (error) {
    throw mapUpstreamError(error);
  }
}

export async function runGetConsoleLog(
  input: GetConsoleLogInput,
  deps: JenkinsToolDeps
): Promise<{
  job_path: string;
  build_number: number;
  start: number;
  next_start: number;
  more_data: boolean;
  text: string;
}> {
  const parsed = GetConsoleLogInputSchema.parse(input);

  try {
    const log = await deps.getConsoleLog({
      jobPath: parsed.job_path,
      buildNumber: parsed.build_number,
      start: parsed.start
    });

    return {
      job_path: parsed.job_path,
      build_number: parsed.build_number,
      start: parsed.start,
      next_start: log.nextStart,
      more_data: log.moreData,
      text: log.text
    };
  } catch (error) {
    throw mapUpstreamError(error);
  }
}

export async function runAbortBuild(
  input: AbortBuildInput,
  deps: JenkinsToolDeps
): Promise<{ job_path: string; build_number: number; aborted: boolean }> {
  const parsed = AbortBuildInputSchema.parse(input);

  try {
    await deps.stopBuild({
      jobPath: parsed.job_path,
      buildNumber: parsed.build_number
    });
    return {
      job_path: parsed.job_path,
      build_number: parsed.build_number,
      aborted: true
    };
  } catch (error) {
    throw mapUpstreamError(error);
  }
}

function stringifyParameters(parameters: Record<string, string | number | boolean>): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(parameters)) {
    normalized[key] = String(value);
  }
  return normalized;
}

function extractQueueId(location?: string): number | undefined {
  if (location === undefined) {
    return undefined;
  }
  const match = /\/queue\/item\/(\d+)\/?$/.exec(location);
  return match === null ? undefined : Number(match[1]);
}

function deriveBuildStatus(
  building: boolean,
  result: string | null
): "RUNNING" | "SUCCESS" | "FAILURE" | "ABORTED" | "UNSTABLE" | "UNKNOWN" {
  if (building) {
    return "RUNNING";
  }
  switch (result) {
    case "SUCCESS":
      return "SUCCESS";
    case "FAILURE":
      return "FAILURE";
    case "ABORTED":
      return "ABORTED";
    case "UNSTABLE":
      return "UNSTABLE";
    default:
      return "UNKNOWN";
  }
}

function mapUpstreamError(error: unknown): JenkinsToolError {
  if (error instanceof JenkinsToolError) {
    return error;
  }

  const status = pickStatusCode(error);
  if (status === 401 || status === 403) {
    return new JenkinsToolError(
      JenkinsToolErrorCode.UPSTREAM_AUTH_FAILED,
      "Jenkins authentication failed.",
      status
    );
  }
  if (status === 404) {
    return new JenkinsToolError(
      JenkinsToolErrorCode.UPSTREAM_NOT_FOUND,
      "Jenkins resource was not found.",
      status
    );
  }
  if (status === 429) {
    return new JenkinsToolError(
      JenkinsToolErrorCode.UPSTREAM_RATE_LIMITED,
      "Jenkins rate limit reached.",
      status
    );
  }
  if (status === 400) {
    return new JenkinsToolError(
      JenkinsToolErrorCode.UPSTREAM_BAD_REQUEST,
      "Jenkins rejected the request.",
      status
    );
  }
  if (status === 408 || status === 504) {
    return new JenkinsToolError(
      JenkinsToolErrorCode.UPSTREAM_TIMEOUT,
      "Jenkins request timed out.",
      status
    );
  }
  if (status !== undefined && status >= 500) {
    return new JenkinsToolError(
      JenkinsToolErrorCode.UPSTREAM_INTERNAL_ERROR,
      "Jenkins internal server error.",
      status
    );
  }

  if (error instanceof Error && error.name === "AbortError") {
    return new JenkinsToolError(JenkinsToolErrorCode.UPSTREAM_TIMEOUT, "Jenkins request timed out.");
  }

  return new JenkinsToolError(
    JenkinsToolErrorCode.NORMALIZATION_ERROR,
    error instanceof Error ? error.message : "Unknown Jenkins tool error."
  );
}

function pickStatusCode(error: unknown): number | undefined {
  if (!isRecord(error)) {
    return undefined;
  }
  const candidate = error.status ?? error.statusCode;
  return typeof candidate === "number" ? candidate : undefined;
}

function toSafePositiveInt(value: unknown): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : undefined;
}

function toNonNegativeInt(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return 0;
  }
  return Math.floor(numeric);
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null;
}
