#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import z from "zod/v4";
import { JenkinsClient } from "./jenkinsClient.js";
import { loadJenkinsProfilesResolverFromEnv } from "./profiles.js";
import { assertWriteOperationAllowed } from "./writeGuards.js";
import {
  AbortBuildInputSchema,
  GetBuildStatusInputSchema,
  GetConsoleLogInputSchema,
  JenkinsToolError,
  TrackQueueItemInputSchema,
  TriggerBuildInputSchema,
  runAbortBuild,
  runGetBuildStatus,
  runGetConsoleLog,
  runTrackQueueItem,
  runTriggerBuild
} from "./tools/jenkinsTools.js";

const TriggerBuildOutputSchema = z.object({
  job_path: z.string(),
  location: z.string().optional(),
  queue_id: z.number().int().positive().optional()
});

const TrackQueueItemOutputSchema = z.object({
  queue_id: z.number().int().positive(),
  state: z.enum(["waiting", "running", "cancelled", "unknown"]),
  why: z.string().optional(),
  build_number: z.number().int().positive().optional(),
  build_url: z.string().optional()
});

const GetBuildStatusOutputSchema = z.object({
  job_path: z.string(),
  build_number: z.number().int().positive(),
  status: z.enum(["RUNNING", "SUCCESS", "FAILURE", "ABORTED", "UNSTABLE", "UNKNOWN"]),
  result: z.string().nullable(),
  duration_ms: z.number().int().nonnegative(),
  started_at_ms: z.number().int().nonnegative()
});

const GetConsoleLogOutputSchema = z.object({
  job_path: z.string(),
  build_number: z.number().int().positive(),
  start: z.number().int().nonnegative(),
  next_start: z.number().int().nonnegative(),
  more_data: z.boolean(),
  text: z.string()
});

const AbortBuildOutputSchema = z.object({
  job_path: z.string(),
  build_number: z.number().int().positive(),
  aborted: z.boolean()
});

async function main(): Promise<void> {
  const profileResolver = loadJenkinsProfilesResolverFromEnv();
  const clients = new Map<string, JenkinsClient>();
  const defaultTimeoutMs = getOptionalNumberEnv("JENKINS_TIMEOUT_MS", 30_000);

  const server = new McpServer({
    name: "jenkins-mcp",
    version: "0.1.0"
  });

  server.registerTool(
    "TriggerBuild",
    {
      title: "Trigger Build",
      description: "Trigger Jenkins build for a job (with optional parameters).",
      inputSchema: TriggerBuildInputSchema,
      outputSchema: TriggerBuildOutputSchema
    },
    async (args) => {
      const { profile } = profileResolver.resolve(args.target_env);
      ensureJobAllowed(profile.allow_jobs, args.job_path);
      assertWriteOperationAllowed({
        targetEnv: args.target_env,
        readOnly: profile.read_only,
        hitlConfirmed: args.hitl_confirmed
      });
      return asToolResult(
        await runTriggerBuild(args, getClient(clients, profile, defaultTimeoutMs))
      );
    }
  );

  server.registerTool(
    "TrackQueueItem",
    {
      title: "Track Queue Item",
      description: "Track Jenkins queue item and return queue/build state.",
      inputSchema: TrackQueueItemInputSchema,
      outputSchema: TrackQueueItemOutputSchema
    },
    async (args) => {
      const { profile } = profileResolver.resolve(args.target_env);
      return asToolResult(
        await runTrackQueueItem(args, getClient(clients, profile, defaultTimeoutMs))
      );
    }
  );

  server.registerTool(
    "GetBuildStatus",
    {
      title: "Get Build Status",
      description: "Get Jenkins build status details by job and build number.",
      inputSchema: GetBuildStatusInputSchema,
      outputSchema: GetBuildStatusOutputSchema
    },
    async (args) => {
      const { profile } = profileResolver.resolve(args.target_env);
      ensureJobAllowed(profile.allow_jobs, args.job_path);
      return asToolResult(
        await runGetBuildStatus(args, getClient(clients, profile, defaultTimeoutMs))
      );
    }
  );

  server.registerTool(
    "GetConsoleLog",
    {
      title: "Get Console Log",
      description: "Get Jenkins progressive console log output.",
      inputSchema: GetConsoleLogInputSchema,
      outputSchema: GetConsoleLogOutputSchema
    },
    async (args) => {
      const { profile } = profileResolver.resolve(args.target_env);
      ensureJobAllowed(profile.allow_jobs, args.job_path);
      return asToolResult(
        await runGetConsoleLog(args, getClient(clients, profile, defaultTimeoutMs))
      );
    }
  );

  server.registerTool(
    "AbortBuild",
    {
      title: "Abort Build",
      description: "Abort a running Jenkins build.",
      inputSchema: AbortBuildInputSchema,
      outputSchema: AbortBuildOutputSchema
    },
    async (args) => {
      const { profile } = profileResolver.resolve(args.target_env);
      ensureJobAllowed(profile.allow_jobs, args.job_path);
      assertWriteOperationAllowed({
        targetEnv: args.target_env,
        readOnly: profile.read_only,
        hitlConfirmed: args.hitl_confirmed
      });
      return asToolResult(
        await runAbortBuild(args, getClient(clients, profile, defaultTimeoutMs))
      );
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("jenkins-mcp server running on stdio");
}

function asToolResult(result: unknown): {
  content: Array<{ type: "text"; text: string }>;
  structuredContent: Record<string, unknown>;
} {
  const structuredContent = result as Record<string, unknown>;
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result, null, 2)
      }
    ],
    structuredContent
  };
}

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getOptionalNumberEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    return fallback;
  }
  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive number.`);
  }
  return parsed;
}

function getClient(
  clients: Map<string, JenkinsClient>,
  profile: {
    base_url: string;
    username: string;
    api_token: string;
  },
  timeoutMs: number
): JenkinsClient {
  const key = `${profile.base_url}|${profile.username}`;
  let client = clients.get(key);
  if (client === undefined) {
    client = new JenkinsClient({
      baseUrl: profile.base_url,
      username: profile.username,
      apiToken: profile.api_token,
      timeoutMs
    });
    clients.set(key, client);
  }
  return client;
}

function ensureJobAllowed(allowJobs: string[] | undefined, jobPath: string): void {
  if (allowJobs === undefined) {
    return;
  }
  if (!allowJobs.includes(jobPath)) {
    throw new Error(`Job '${jobPath}' is not allowed by the active Jenkins profile.`);
  }
}

main().catch((error) => {
  if (error instanceof JenkinsToolError) {
    console.error(`[${error.code}] ${error.message}`);
  } else {
    console.error("jenkins-mcp failed to start", error);
  }
  process.exit(1);
});
