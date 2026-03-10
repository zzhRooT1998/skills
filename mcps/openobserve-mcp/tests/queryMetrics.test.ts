import { describe, expect, it } from "vitest";
import {
  QueryMetricsError,
  QueryMetricsErrorCode,
  runQueryMetrics,
  type QueryMetricsInput
} from "../src/tools/queryMetrics.js";

const baseInput: QueryMetricsInput = {
  org: "prod",
  query_type: "sql",
  query: "SELECT * FROM prometheus",
  time_range: {
    start: "2026-03-05T08:00:00Z",
    end: "2026-03-05T09:00:00Z"
  }
};

describe("runQueryMetrics", () => {
  it("returns INVALID_ARGUMENT when end <= start", async () => {
    await expect(
      runQueryMetrics(
        {
          ...baseInput,
          time_range: {
            start: "2026-03-05T09:00:00Z",
            end: "2026-03-05T08:00:00Z"
          }
        },
        {
          search: async () => {
            throw new Error("should not call");
          },
          promQueryRange: async () => {
            throw new Error("should not call");
          }
        }
      )
    ).rejects.toMatchObject<QueryMetricsError>({
      code: QueryMetricsErrorCode.INVALID_ARGUMENT
    });
  });

  it("routes sql query to search api and normalizes rows", async () => {
    const result = await runQueryMetrics(baseInput, {
      search: async (request) => {
        expect(request.org).toBe("prod");
        expect(request.query.sql).toContain("SELECT");
        expect(request.query.start_time).toBeTypeOf("number");
        expect(request.query.end_time).toBeTypeOf("number");

        return {
          hits: [
            {
              ts: 1_700_000_000_000_000,
              value: 10,
              name: "cpu_usage",
              service: "api"
            },
            {
              ts: 1_700_000_060_000_000,
              value: 11,
              name: "cpu_usage",
              service: "api"
            }
          ],
          scan_size: 12.6
        };
      },
      promQueryRange: async () => {
        throw new Error("should not call");
      }
    });

    expect(result.query_type).toBe("sql");
    expect(result.series).toHaveLength(1);
    expect(result.series[0]).toMatchObject({
      name: "cpu_usage",
      labels: { service: "api" }
    });
    expect(result.series[0].points).toEqual([
      [1_700_000_000_000_000, 10],
      [1_700_000_060_000_000, 11]
    ]);
    expect(result.meta?.scan_size_mb).toBe(12.6);
  });

  it("routes promql query to query_range and normalizes matrix response", async () => {
    const result = await runQueryMetrics(
      {
        ...baseInput,
        query_type: "promql",
        query: 'sum(rate(http_requests_total{service="api"}[5m])) by (service)',
        time_range: {
          start: "2026-03-05T08:00:00Z",
          end: "2026-03-05T09:00:00Z",
          step: "30s"
        }
      },
      {
        search: async () => {
          throw new Error("should not call");
        },
        promQueryRange: async (request) => {
          expect(request.step).toBe("30s");
          return {
            status: "success",
            data: {
              resultType: "matrix",
              result: [
                {
                  metric: {
                    __name__: "http_requests_total",
                    service: "api"
                  },
                  values: [
                    [1_700_000_000, "0.12"],
                    [1_700_000_030, "0.10"]
                  ]
                }
              ]
            }
          };
        }
      }
    );

    expect(result.query_type).toBe("promql");
    expect(result.window.step_seconds).toBe(30);
    expect(result.series).toHaveLength(1);
    expect(result.series[0]).toEqual({
      name: "http_requests_total",
      labels: { service: "api" },
      points: [
        [1_700_000_000_000_000, 0.12],
        [1_700_000_030_000_000, 0.1]
      ]
    });
  });

  it("maps upstream auth failures to UPSTREAM_AUTH_FAILED", async () => {
    await expect(
      runQueryMetrics(baseInput, {
        search: async () => {
          const err = new Error("401 unauthorized");
          (err as { status?: number }).status = 401;
          throw err;
        },
        promQueryRange: async () => {
          throw new Error("should not call");
        }
      })
    ).rejects.toMatchObject<QueryMetricsError>({
      code: QueryMetricsErrorCode.UPSTREAM_AUTH_FAILED
    });
  });
});
