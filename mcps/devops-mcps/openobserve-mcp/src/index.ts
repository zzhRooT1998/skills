#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import z from "zod/v4";
import { OpenObserveClient } from "./openobserveClient.js";
import {
  QueryMetricsError,
  QueryMetricsInputSchema,
  runQueryMetrics
} from "./tools/queryMetrics.js";

const QueryMetricsOutputSchema = z.object({
  query_type: z.enum(["sql", "promql"]),
  window: z.object({
    start_us: z.number().int(),
    end_us: z.number().int(),
    step_seconds: z.number().optional()
  }),
  series: z.array(
    z.object({
      name: z.string(),
      labels: z.record(z.string(), z.string()),
      points: z.array(z.tuple([z.number().int(), z.number().nullable()]))
    })
  ),
  meta: z
    .object({
      source_api: z.string(),
      scan_size_mb: z.number().optional(),
      warnings: z.array(z.string()).optional()
    })
    .optional(),
  raw: z.unknown().optional()
});

async function main(): Promise<void> {
  const client = new OpenObserveClient({
    baseUrl: getRequiredEnv("OPENOBSERVE_BASE_URL"),
    username: getRequiredEnv("OPENOBSERVE_USERNAME"),
    password: getRequiredEnv("OPENOBSERVE_PASSWORD")
  });

  const server = new McpServer({
    name: "openobserve-mcp",
    version: "0.1.0"
  });

  server.registerTool(
    "QueryMetrics",
    {
      title: "Query Metrics",
      description:
        "Query OpenObserve metrics using SQL or PromQL, returning normalized time-series output.",
      inputSchema: QueryMetricsInputSchema,
      outputSchema: QueryMetricsOutputSchema
    },
    async (args) => {
      try {
        const result = await runQueryMetrics(args, client);
        const structuredContent = result as unknown as Record<string, unknown>;
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2)
            }
          ],
          structuredContent
        };
      } catch (error) {
        if (error instanceof QueryMetricsError) {
          throw new Error(`[${error.code}] ${error.message}`);
        }
        throw error;
      }
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("openobserve-mcp server running on stdio");
}

main().catch((error) => {
  console.error("openobserve-mcp failed to start", error);
  process.exit(1);
});

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
