#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import z from "zod/v4";
import { OpenObserveClient } from "./openobserveClient.js";
import { loadOpenObserveProfilesResolverFromEnv } from "./profiles.js";
import {
  QueryMetricsError,
  QueryMetricsErrorCode,
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
  const profileResolver = loadOpenObserveProfilesResolverFromEnv();
  const clients = new Map<string, OpenObserveClient>();

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
        const { env, profile } = profileResolver.resolve(args.target_env);
        if (args.stream !== undefined && profile.allow_streams !== undefined) {
          if (!profile.allow_streams.includes(args.stream)) {
            throw new QueryMetricsError(
              QueryMetricsErrorCode.INVALID_ARGUMENT,
              `Stream '${args.stream}' is not allowed in environment '${env}'.`
            );
          }
        }

        let client = clients.get(env);
        if (client === undefined) {
          client = new OpenObserveClient({
            baseUrl: profile.base_url,
            username: profile.username,
            password: profile.password
          });
          clients.set(env, client);
        }

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
