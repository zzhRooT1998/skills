import { URLSearchParams } from "node:url";
import type { QueryMetricsDeps } from "./tools/queryMetrics.js";

export interface OpenObserveClientConfig {
  baseUrl: string;
  username: string;
  password: string;
}

interface HttpError extends Error {
  status?: number;
  responseBody?: unknown;
}

export class OpenObserveClient implements QueryMetricsDeps {
  private readonly baseUrl: string;
  private readonly username: string;
  private readonly password: string;

  public constructor(config: OpenObserveClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.username = config.username;
    this.password = config.password;
  }

  public async search(request: {
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
  }): Promise<unknown> {
    const endpoint = `${this.baseUrl}/api/${encodeURIComponent(request.org)}/_search`;
    return this.fetchJson(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        query: {
          sql: request.query.sql,
          start_time: request.query.start_time,
          end_time: request.query.end_time,
          from: request.query.from,
          size: request.query.size,
          sql_mode: "full"
        },
        search_type: request.query.search_type
      }),
      timeoutMs: request.timeoutMs
    });
  }

  public async promQueryRange(request: {
    org: string;
    query: string;
    startSeconds: number;
    endSeconds: number;
    step: string;
    timeoutMs: number;
  }): Promise<unknown> {
    const params = new URLSearchParams({
      query: request.query,
      start: request.startSeconds.toString(),
      end: request.endSeconds.toString(),
      step: request.step
    });
    const endpoint = `${this.baseUrl}/api/${encodeURIComponent(
      request.org
    )}/prometheus/api/v1/query_range?${params.toString()}`;
    return this.fetchJson(endpoint, {
      method: "GET",
      timeoutMs: request.timeoutMs
    });
  }

  private async fetchJson(
    url: string,
    options: {
      method: "GET" | "POST";
      headers?: Record<string, string>;
      body?: string;
      timeoutMs: number;
    }
  ): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, options.timeoutMs);

    try {
      const response = await fetch(url, {
        method: options.method,
        headers: {
          ...options.headers,
          authorization: `Basic ${Buffer.from(`${this.username}:${this.password}`).toString("base64")}`
        },
        body: options.body,
        signal: controller.signal
      });

      const text = await response.text();
      const payload = safeJsonParse(text);

      if (!response.ok) {
        const httpError = new Error(`OpenObserve request failed: HTTP ${response.status}`) as HttpError;
        httpError.status = response.status;
        httpError.responseBody = payload;
        throw httpError;
      }

      return payload;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        const timeoutError = new Error("OpenObserve request timeout") as HttpError;
        timeoutError.status = 504;
        throw timeoutError;
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}

function safeJsonParse(value: string): unknown {
  if (value.trim() === "") {
    return {};
  }

  try {
    return JSON.parse(value);
  } catch {
    return { raw: value };
  }
}
