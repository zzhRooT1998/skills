import type { JenkinsToolDeps } from "./tools/jenkinsTools.js";

export interface JenkinsClientConfig {
  baseUrl: string;
  username: string;
  apiToken: string;
  timeoutMs?: number;
}

interface HttpError extends Error {
  status?: number;
  responseBody?: unknown;
}

interface CrumbResponse {
  crumbRequestField: string;
  crumb: string;
}

export class JenkinsClient implements JenkinsToolDeps {
  private readonly baseUrl: string;
  private readonly username: string;
  private readonly apiToken: string;
  private readonly timeoutMs: number;
  private crumb?: CrumbResponse;

  public constructor(config: JenkinsClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.username = config.username;
    this.apiToken = config.apiToken;
    this.timeoutMs = config.timeoutMs ?? 30_000;
  }

  public async triggerBuild(request: {
    jobPath: string;
    token?: string;
  }): Promise<{ location?: string }> {
    const endpoint = this.withQuery(
      `${this.baseUrl}${toJenkinsJobPath(request.jobPath)}/build`,
      request.token === undefined ? {} : { token: request.token }
    );

    const response = await this.request(endpoint, {
      method: "POST",
      requireCrumb: true
    });

    return { location: response.headers.get("location") ?? undefined };
  }

  public async triggerBuildWithParameters(request: {
    jobPath: string;
    parameters: Record<string, string>;
    token?: string;
  }): Promise<{ location?: string }> {
    const endpoint = `${this.baseUrl}${toJenkinsJobPath(request.jobPath)}/buildWithParameters`;
    const response = await this.request(endpoint, {
      method: "POST",
      requireCrumb: true,
      form: {
        ...request.parameters,
        ...(request.token === undefined ? {} : { token: request.token })
      }
    });

    return { location: response.headers.get("location") ?? undefined };
  }

  public async getQueueItem(request: { queueId: number }): Promise<unknown> {
    const endpoint = `${this.baseUrl}/queue/item/${request.queueId}/api/json`;
    const response = await this.request(endpoint, {
      method: "GET"
    });
    return readJson(response);
  }

  public async getBuild(request: { jobPath: string; buildNumber: number }): Promise<unknown> {
    const endpoint = this.withQuery(
      `${this.baseUrl}${toJenkinsJobPath(request.jobPath)}/${request.buildNumber}/api/json`,
      {
        tree: "building,result,duration,timestamp,estimatedDuration,url,displayName,number"
      }
    );
    const response = await this.request(endpoint, {
      method: "GET"
    });
    return readJson(response);
  }

  public async getConsoleLog(request: {
    jobPath: string;
    buildNumber: number;
    start: number;
  }): Promise<{ text: string; nextStart: number; moreData: boolean }> {
    const endpoint = this.withQuery(
      `${this.baseUrl}${toJenkinsJobPath(request.jobPath)}/${request.buildNumber}/logText/progressiveText`,
      {
        start: request.start.toString()
      }
    );
    const response = await this.request(endpoint, { method: "GET" });
    const text = await response.text();
    const nextStart = Number(response.headers.get("x-text-size") ?? request.start);
    const moreData = (response.headers.get("x-more-data") ?? "false").toLowerCase() === "true";
    return {
      text,
      nextStart: Number.isNaN(nextStart) ? request.start : nextStart,
      moreData
    };
  }

  public async stopBuild(request: { jobPath: string; buildNumber: number }): Promise<void> {
    const endpoint = `${this.baseUrl}${toJenkinsJobPath(request.jobPath)}/${request.buildNumber}/stop`;
    await this.request(endpoint, {
      method: "POST",
      requireCrumb: true
    });
  }

  private async request(
    url: string,
    options: {
      method: "GET" | "POST";
      requireCrumb?: boolean;
      form?: Record<string, string>;
    }
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const headers: Record<string, string> = {
        authorization: `Basic ${Buffer.from(`${this.username}:${this.apiToken}`).toString("base64")}`
      };

      let body: URLSearchParams | undefined;
      if (options.form !== undefined) {
        body = new URLSearchParams(options.form);
        headers["content-type"] = "application/x-www-form-urlencoded";
      }

      if (options.method === "POST" && options.requireCrumb) {
        const crumb = await this.getCrumb();
        if (crumb !== undefined) {
          headers[crumb.crumbRequestField] = crumb.crumb;
        }
      }

      const response = await fetch(url, {
        method: options.method,
        headers,
        body,
        signal: controller.signal
      });

      if (!response.ok) {
        const text = await response.text();
        const error = new Error(`Jenkins request failed: HTTP ${response.status}`) as HttpError;
        error.status = response.status;
        error.responseBody = safeJsonParse(text);
        throw error;
      }

      return response;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        const timeoutError = new Error("Jenkins request timeout") as HttpError;
        timeoutError.status = 504;
        throw timeoutError;
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  private async getCrumb(): Promise<CrumbResponse | undefined> {
    if (this.crumb !== undefined) {
      return this.crumb;
    }

    const url = `${this.baseUrl}/crumbIssuer/api/json`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          authorization: `Basic ${Buffer.from(`${this.username}:${this.apiToken}`).toString("base64")}`
        },
        signal: controller.signal
      });

      if (!response.ok) {
        return undefined;
      }

      const payload = (await response.json()) as Partial<CrumbResponse>;
      if (
        typeof payload.crumb === "string" &&
        payload.crumb.length > 0 &&
        typeof payload.crumbRequestField === "string" &&
        payload.crumbRequestField.length > 0
      ) {
        this.crumb = {
          crumb: payload.crumb,
          crumbRequestField: payload.crumbRequestField
        };
        return this.crumb;
      }

      return undefined;
    } catch {
      return undefined;
    } finally {
      clearTimeout(timer);
    }
  }

  private withQuery(url: string, query: Record<string, string>): string {
    const entries = Object.entries(query).filter(([, value]) => value.trim() !== "");
    if (entries.length === 0) {
      return url;
    }
    const params = new URLSearchParams(entries);
    return `${url}?${params.toString()}`;
  }
}

export function toJenkinsJobPath(jobPath: string): string {
  const segments = jobPath
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  if (segments.length === 0) {
    throw new Error("jobPath must contain at least one segment.");
  }

  return segments.map((segment) => `/job/${encodeURIComponent(segment)}`).join("");
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  return safeJsonParse(text);
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
