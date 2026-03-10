import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadJenkinsProfilesResolverFromEnv, loadJenkinsProfilesResolverFromFile } from "../src/profiles.js";

describe("jenkins profiles", () => {
  afterEach(() => {
    delete process.env.JENKINS_PROFILES_FILE;
    delete process.env.JENKINS_BASE_URL;
    delete process.env.JENKINS_USERNAME;
    delete process.env.JENKINS_API_TOKEN;
  });

  it("loads resolver from profiles file", () => {
    const tempFile = path.join(os.tmpdir(), `jenkins-profiles-${Date.now()}.json`);
    fs.writeFileSync(
      tempFile,
      JSON.stringify({
        default_env: "prod",
        environments: {
          prod: {
            base_url: "https://jenkins.example.com",
            username: "svc",
            api_token: "token",
            allow_jobs: ["folder/release"]
          }
        }
      }),
      "utf8"
    );

    const resolver = loadJenkinsProfilesResolverFromFile(tempFile);
    const selected = resolver.resolve();
    expect(selected.env).toBe("prod");
    expect(selected.profile.allow_jobs).toEqual(["folder/release"]);
  });

  it("falls back to single-environment env vars", () => {
    process.env.JENKINS_BASE_URL = "https://jenkins.example.com";
    process.env.JENKINS_USERNAME = "svc";
    process.env.JENKINS_API_TOKEN = "token";

    const resolver = loadJenkinsProfilesResolverFromEnv();
    const selected = resolver.resolve();
    expect(selected.env).toBe("default");
    expect(selected.profile.base_url).toBe("https://jenkins.example.com");
  });
});
