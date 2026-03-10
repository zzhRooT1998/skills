import { describe, expect, it } from "vitest";
import {
  AbortBuildInputSchema,
  JenkinsToolErrorCode,
  TriggerBuildInputSchema,
  runAbortBuild,
  runGetBuildStatus,
  runGetConsoleLog,
  runTrackQueueItem,
  runTriggerBuild
} from "../src/tools/jenkinsTools.js";

describe("runTriggerBuild", () => {
  it("accepts hitl fields in trigger schema", () => {
    const parsed = TriggerBuildInputSchema.parse({
      target_env: "prod",
      job_path: "folder/my-job",
      hitl_confirmed: true,
      hitl_confirmation_note: "approved by ops, change-123"
    });
    expect(parsed.hitl_confirmed).toBe(true);
  });

  it("uses build endpoint and parses queue id from location", async () => {
    const result = await runTriggerBuild(
      {
        job_path: "folder/my-job"
      },
      {
        triggerBuild: async ({ jobPath }) => {
          expect(jobPath).toBe("folder/my-job");
          return { location: "https://jenkins.local/queue/item/245/" };
        },
        triggerBuildWithParameters: async () => {
          throw new Error("should not call");
        },
        getQueueItem: async () => {
          throw new Error("should not call");
        },
        getBuild: async () => {
          throw new Error("should not call");
        },
        getConsoleLog: async () => {
          throw new Error("should not call");
        },
        stopBuild: async () => {
          throw new Error("should not call");
        }
      }
    );

    expect(result).toMatchObject({
      queue_id: 245,
      location: "https://jenkins.local/queue/item/245/"
    });
  });

  it("uses buildWithParameters when parameters provided", async () => {
    await runTriggerBuild(
      {
        job_path: "my-job",
        parameters: {
          ENV: "prod",
          RETRY: 1
        }
      },
      {
        triggerBuild: async () => {
          throw new Error("should not call");
        },
        triggerBuildWithParameters: async ({ parameters }) => {
          expect(parameters).toEqual({
            ENV: "prod",
            RETRY: "1"
          });
          return { location: "https://jenkins.local/queue/item/10/" };
        },
        getQueueItem: async () => {
          throw new Error("should not call");
        },
        getBuild: async () => {
          throw new Error("should not call");
        },
        getConsoleLog: async () => {
          throw new Error("should not call");
        },
        stopBuild: async () => {
          throw new Error("should not call");
        }
      }
    );
  });
});

describe("runTrackQueueItem", () => {
  it("returns running state with executable build number", async () => {
    const result = await runTrackQueueItem(
      {
        queue_id: 12
      },
      {
        triggerBuild: async () => {
          throw new Error("should not call");
        },
        triggerBuildWithParameters: async () => {
          throw new Error("should not call");
        },
        getQueueItem: async ({ queueId }) => {
          expect(queueId).toBe(12);
          return {
            id: 12,
            blocked: false,
            buildable: false,
            cancelled: false,
            executable: {
              number: 77,
              url: "https://jenkins.local/job/my-job/77/"
            }
          };
        },
        getBuild: async () => {
          throw new Error("should not call");
        },
        getConsoleLog: async () => {
          throw new Error("should not call");
        },
        stopBuild: async () => {
          throw new Error("should not call");
        }
      }
    );

    expect(result).toEqual({
      queue_id: 12,
      state: "running",
      build_number: 77,
      build_url: "https://jenkins.local/job/my-job/77/"
    });
  });
});

describe("runGetBuildStatus", () => {
  it("normalizes build payload", async () => {
    const result = await runGetBuildStatus(
      {
        job_path: "my-job",
        build_number: 98
      },
      {
        triggerBuild: async () => {
          throw new Error("should not call");
        },
        triggerBuildWithParameters: async () => {
          throw new Error("should not call");
        },
        getQueueItem: async () => {
          throw new Error("should not call");
        },
        getBuild: async ({ jobPath, buildNumber }) => {
          expect(jobPath).toBe("my-job");
          expect(buildNumber).toBe(98);
          return {
            building: true,
            result: null,
            duration: 10_000,
            timestamp: 1_772_700_000_000
          };
        },
        getConsoleLog: async () => {
          throw new Error("should not call");
        },
        stopBuild: async () => {
          throw new Error("should not call");
        }
      }
    );

    expect(result).toEqual({
      job_path: "my-job",
      build_number: 98,
      status: "RUNNING",
      result: null,
      duration_ms: 10_000,
      started_at_ms: 1_772_700_000_000
    });
  });
});

describe("runGetConsoleLog", () => {
  it("returns progressive log output", async () => {
    const result = await runGetConsoleLog(
      {
        job_path: "my-job",
        build_number: 3,
        start: 20
      },
      {
        triggerBuild: async () => {
          throw new Error("should not call");
        },
        triggerBuildWithParameters: async () => {
          throw new Error("should not call");
        },
        getQueueItem: async () => {
          throw new Error("should not call");
        },
        getBuild: async () => {
          throw new Error("should not call");
        },
        getConsoleLog: async ({ start }) => {
          expect(start).toBe(20);
          return {
            text: "line-1\nline-2\n",
            nextStart: 44,
            moreData: true
          };
        },
        stopBuild: async () => {
          throw new Error("should not call");
        }
      }
    );

    expect(result).toEqual({
      job_path: "my-job",
      build_number: 3,
      start: 20,
      next_start: 44,
      more_data: true,
      text: "line-1\nline-2\n"
    });
  });
});

describe("runAbortBuild", () => {
  it("accepts hitl fields in abort schema", () => {
    const parsed = AbortBuildInputSchema.parse({
      target_env: "prod",
      job_path: "my-job",
      build_number: 4,
      hitl_confirmed: true,
      hitl_confirmation_note: "approved by release manager"
    });
    expect(parsed.hitl_confirmed).toBe(true);
  });

  it("maps auth failures to UPSTREAM_AUTH_FAILED", async () => {
    await expect(
      runAbortBuild(
        {
          job_path: "my-job",
          build_number: 4
        },
        {
          triggerBuild: async () => {
            throw new Error("should not call");
          },
          triggerBuildWithParameters: async () => {
            throw new Error("should not call");
          },
          getQueueItem: async () => {
            throw new Error("should not call");
          },
          getBuild: async () => {
            throw new Error("should not call");
          },
          getConsoleLog: async () => {
            throw new Error("should not call");
          },
          stopBuild: async () => {
            const error = new Error("forbidden");
            (error as { status?: number }).status = 403;
            throw error;
          }
        }
      )
    ).rejects.toMatchObject({
      code: JenkinsToolErrorCode.UPSTREAM_AUTH_FAILED
    });
  });
});
