import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  loadOpenObserveProfilesResolverFromEnv,
  loadOpenObserveProfilesResolverFromFile
} from "../src/profiles.js";

describe("openobserve profiles", () => {
  afterEach(() => {
    delete process.env.OPENOBSERVE_PROFILES_FILE;
    delete process.env.OPENOBSERVE_BASE_URL;
    delete process.env.OPENOBSERVE_USERNAME;
    delete process.env.OPENOBSERVE_PASSWORD;
  });

  it("loads resolver from profiles file", () => {
    const tempFile = path.join(os.tmpdir(), `openobserve-profiles-${Date.now()}.json`);
    fs.writeFileSync(
      tempFile,
      JSON.stringify({
        default_env: "staging",
        environments: {
          staging: {
            base_url: "https://oo-staging.example.com",
            username: "svc",
            password: "pwd",
            allow_streams: ["logs_app"]
          }
        }
      }),
      "utf8"
    );

    const resolver = loadOpenObserveProfilesResolverFromFile(tempFile);
    const selected = resolver.resolve();
    expect(selected.env).toBe("staging");
    expect(selected.profile.allow_streams).toEqual(["logs_app"]);
  });

  it("falls back to single-environment env vars", () => {
    process.env.OPENOBSERVE_BASE_URL = "https://oo.example.com";
    process.env.OPENOBSERVE_USERNAME = "svc";
    process.env.OPENOBSERVE_PASSWORD = "pwd";

    const resolver = loadOpenObserveProfilesResolverFromEnv();
    const selected = resolver.resolve();
    expect(selected.env).toBe("default");
    expect(selected.profile.base_url).toBe("https://oo.example.com");
  });
});
