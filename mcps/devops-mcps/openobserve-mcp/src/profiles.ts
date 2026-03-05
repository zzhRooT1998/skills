import fs from "node:fs";
import z from "zod/v4";

const OpenObserveEnvironmentSchema = z
  .object({
    base_url: z.string().min(1),
    username: z.string().min(1),
    password: z.string().min(1),
    org: z.string().min(1).optional(),
    allow_streams: z.array(z.string().min(1)).optional(),
    read_only: z.boolean().optional()
  })
  .strict();

const OpenObserveProfilesSchema = z
  .object({
    default_env: z.string().min(1),
    environments: z.record(z.string(), OpenObserveEnvironmentSchema)
  })
  .strict();

export type OpenObserveEnvironmentProfile = z.infer<typeof OpenObserveEnvironmentSchema>;

export interface OpenObserveProfilesResolver {
  defaultEnv: string;
  resolve(targetEnv?: string): {
    env: string;
    profile: OpenObserveEnvironmentProfile;
  };
}

export function loadOpenObserveProfilesResolverFromEnv(): OpenObserveProfilesResolver {
  const profilesFile = process.env.OPENOBSERVE_PROFILES_FILE;
  if (profilesFile !== undefined && profilesFile.trim() !== "") {
    return loadOpenObserveProfilesResolverFromFile(profilesFile);
  }

  const baseUrl = process.env.OPENOBSERVE_BASE_URL;
  const username = process.env.OPENOBSERVE_USERNAME;
  const password = process.env.OPENOBSERVE_PASSWORD;
  if (baseUrl === undefined || username === undefined || password === undefined) {
    throw new Error(
      "Missing OpenObserve configuration. Set OPENOBSERVE_PROFILES_FILE or OPENOBSERVE_BASE_URL/OPENOBSERVE_USERNAME/OPENOBSERVE_PASSWORD."
    );
  }

  const singleProfile = {
    default_env: "default",
    environments: {
      default: {
        base_url: baseUrl,
        username,
        password
      }
    }
  };
  return createResolver(OpenObserveProfilesSchema.parse(singleProfile));
}

export function loadOpenObserveProfilesResolverFromFile(path: string): OpenObserveProfilesResolver {
  const content = fs.readFileSync(path, "utf8");
  const parsed = OpenObserveProfilesSchema.parse(JSON.parse(content));
  return createResolver(parsed);
}

function createResolver(parsed: z.infer<typeof OpenObserveProfilesSchema>): OpenObserveProfilesResolver {
  if (parsed.environments[parsed.default_env] === undefined) {
    throw new Error(`OpenObserve profiles default_env '${parsed.default_env}' was not found in environments.`);
  }

  return {
    defaultEnv: parsed.default_env,
    resolve: (targetEnv?: string) => {
      const selected = targetEnv ?? parsed.default_env;
      const profile = parsed.environments[selected];
      if (profile === undefined) {
        throw new Error(`Unknown OpenObserve target_env '${selected}'.`);
      }
      return {
        env: selected,
        profile
      };
    }
  };
}
