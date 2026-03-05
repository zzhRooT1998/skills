import fs from "node:fs";
import z from "zod/v4";

const JenkinsEnvironmentSchema = z
  .object({
    base_url: z.string().min(1),
    username: z.string().min(1),
    api_token: z.string().min(1),
    allow_jobs: z.array(z.string().min(1)).optional(),
    read_only: z.boolean().optional()
  })
  .strict();

const JenkinsProfilesSchema = z
  .object({
    default_env: z.string().min(1),
    environments: z.record(z.string(), JenkinsEnvironmentSchema)
  })
  .strict();

export type JenkinsEnvironmentProfile = z.infer<typeof JenkinsEnvironmentSchema>;

export interface JenkinsProfilesResolver {
  defaultEnv: string;
  resolve(targetEnv?: string): {
    env: string;
    profile: JenkinsEnvironmentProfile;
  };
}

export function loadJenkinsProfilesResolverFromEnv(): JenkinsProfilesResolver {
  const profilesFile = process.env.JENKINS_PROFILES_FILE;
  if (profilesFile !== undefined && profilesFile.trim() !== "") {
    return loadJenkinsProfilesResolverFromFile(profilesFile);
  }

  const baseUrl = process.env.JENKINS_BASE_URL;
  const username = process.env.JENKINS_USERNAME;
  const apiToken = process.env.JENKINS_API_TOKEN;
  if (baseUrl === undefined || username === undefined || apiToken === undefined) {
    throw new Error(
      "Missing Jenkins configuration. Set JENKINS_PROFILES_FILE or JENKINS_BASE_URL/JENKINS_USERNAME/JENKINS_API_TOKEN."
    );
  }

  const singleProfile = {
    default_env: "default",
    environments: {
      default: {
        base_url: baseUrl,
        username,
        api_token: apiToken
      }
    }
  };
  return createResolver(JenkinsProfilesSchema.parse(singleProfile));
}

export function loadJenkinsProfilesResolverFromFile(path: string): JenkinsProfilesResolver {
  const content = fs.readFileSync(path, "utf8");
  const parsed = JenkinsProfilesSchema.parse(JSON.parse(content));
  return createResolver(parsed);
}

function createResolver(parsed: z.infer<typeof JenkinsProfilesSchema>): JenkinsProfilesResolver {
  if (parsed.environments[parsed.default_env] === undefined) {
    throw new Error(`Jenkins profiles default_env '${parsed.default_env}' was not found in environments.`);
  }

  return {
    defaultEnv: parsed.default_env,
    resolve: (targetEnv?: string) => {
      const selected = targetEnv ?? parsed.default_env;
      const profile = parsed.environments[selected];
      if (profile === undefined) {
        throw new Error(`Unknown Jenkins target_env '${selected}'.`);
      }
      return {
        env: selected,
        profile
      };
    }
  };
}
