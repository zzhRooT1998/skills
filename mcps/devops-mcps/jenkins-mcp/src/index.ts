#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import z from "zod/v4";
import { JenkinsClient } from "./jenkinsClient.js";
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
  const client = new JenkinsClient({
    baseUrl: getRequiredEnv("JENKINS_BASE_URL"),
    username: getRequiredEnv("JENKINS_USERNAME"),
    apiToken: getRequiredEnv("JENKINS_API_TOKEN"),
    timeoutMs: getOptionalNumberEnv("JENKINS_TIMEOUT_MS", 30_000)
  });

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
    async (args) => asToolResult(await runTriggerBuild(args, client))
  );

  server.registerTool(
    "TrackQueueItem",
    {
      title: "Track Queue Item",
      description: "Track Jenkins queue item and return queue/build state.",
      inputSchema: TrackQueueItemInputSchema,
      outputSchema: TrackQueueItemOutputSchema
    },
    async (args) => asToolResult(await runTrackQueueItem(args, client))
  );

  server.registerTool(
    "GetBuildStatus",
    {
      title: "Get Build Status",
      description: "Get Jenkins build status details by job and build number.",
      inputSchema: GetBuildStatusInputSchema,
      outputSchema: GetBuildStatusOutputSchema
    },
    async (args) => asToolResult(await runGetBuildStatus(args, client))
  );

  server.registerTool(
    "GetConsoleLog",
    {
      title: "Get Console Log",
      description: "Get Jenkins progressive console log output.",
      inputSchema: GetConsoleLogInputSchema,
      outputSchema: GetConsoleLogOutputSchema
    },
    async (args) => asToolResult(await runGetConsoleLog(args, client))
  );

  server.registerTool(
    "AbortBuild",
    {
      title: "Abort Build",
      description: "Abort a running Jenkins build.",
      inputSchema: AbortBuildInputSchema,
      outputSchema: AbortBuildOutputSchema
    },
    async (args) => asToolResult(await runAbortBuild(args, client))
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

main().catch((error) => {
  if (error instanceof JenkinsToolError) {
    console.error(`[${error.code}] ${error.message}`);
  } else {
    console.error("jenkins-mcp failed to start", error);
  }
  process.exit(1);
});
