# devops-mcps

DevOps-oriented MCP and skill workspace.

## Included

- `openobserve-mcp/`
  - MCP server with `QueryMetrics` tool
  - OpenObserve metrics query support (`sql` + `promql`)
  - Incident triage skill: `../../../skills/devops-skills/openobserve-metrics-triage/SKILL.md`
- `jenkins-mcp/`
  - MCP tools: `TriggerBuild`, `TrackQueueItem`, `GetBuildStatus`, `GetConsoleLog`, `AbortBuild`
  - Jenkins release runbook skill: `../../../skills/devops-skills/jenkins-release-runbook/SKILL.md`

## Skill Index

Centralized skill directory:

- `d:/github-projects/skills/skills/devops-skills/`

Available skills:

- `openobserve-metrics-triage/SKILL.md`
- `jenkins-release-runbook/SKILL.md`

## Codex Setup (`openobserve-mcp`)

Codex config file on Windows:

- `C:/Users/14810/.codex/config.toml`

### 1. Build the MCP server

```bash
cd d:/github-projects/skills/mcps/devops-mcps/openobserve-mcp
npm install
npm run build
```

### 2. Set OpenObserve environment variables

Recommended for multi-environment:

```powershell
$env:OPENOBSERVE_PROFILES_FILE = "D:/path/openobserve.profiles.json"
```

Legacy single-environment:

PowerShell (current session):

```powershell
$env:OPENOBSERVE_BASE_URL = "https://your-openobserve.example.com"
$env:OPENOBSERVE_USERNAME = "your-username"
$env:OPENOBSERVE_PASSWORD = "your-password"
```

Persistent (requires terminal/Codex restart):

```powershell
setx OPENOBSERVE_BASE_URL "https://your-openobserve.example.com"
setx OPENOBSERVE_USERNAME "your-username"
setx OPENOBSERVE_PASSWORD "your-password"
```

### 3. Add server config to `config.toml`

```toml
[mcp_servers."openobserve-mcp"]
command = "node"
args = ["D:/github-projects/skills/mcps/devops-mcps/openobserve-mcp/dist/index.js"]
```

### 4. Restart Codex

After restart, you can call tool `QueryMetrics` in chat.

### OpenObserve CPU Triage Example (`test + iot-core`, recent 1 minute)

```json
{
  "target_env": "default",
  "org": "your-org",
  "query_type": "promql",
  "query": "avg(system_cpu_usage{service_name=\"iot-core\",deployment_environment=\"test\"})",
  "time_range": {
    "start": "2026-03-05T10:00:00Z",
    "end": "2026-03-05T10:01:00Z",
    "step": "30s"
  },
  "options": {
    "timeout_ms": 30000
  }
}
```

No-data handling follows the skill runbook:

1. verify `org`
2. relax label keys (`service_name/service/application`, `deployment_environment/env/environment`)
3. expand window (`1m -> 5m -> 15m`)
4. fallback metric (`system_cpu_usage -> rate(container_cpu_usage_seconds_total[5m])`)

Chart output rule:

- If user asks to show results as chart and does not provide `chart_type`, follow the same chart type used by this metric in OpenObserve (when available).
- If metric chart type cannot be determined, fallback to `line`.

### OpenObserve Log Query Example (`test + iot-core`, keyword `rejected`, recent 1 minute)

```json
{
  "target_env": "default",
  "org": "your-org",
  "query_type": "sql",
  "stream": "logs_app",
  "query": "SELECT _timestamp, level, service_name, deployment_environment, message FROM logs_app WHERE service_name = 'iot-core' AND deployment_environment = 'test' AND lower(message) LIKE '%rejected%' ORDER BY _timestamp DESC LIMIT 200",
  "time_range": {
    "start": "2026-03-05T10:00:00Z",
    "end": "2026-03-05T10:01:00Z"
  },
  "options": {
    "timeout_ms": 30000
  }
}
```

No-data handling for logs:

1. verify `org` and `stream`
2. relax filters (service+keyword first, then environment)
3. expand window (`1m -> 5m -> 15m`)
4. fallback message field (`message/log/content/_raw`)

### Optional: Development mode

If you want to run from TypeScript source directly:

```toml
[mcp_servers."openobserve-mcp-dev"]
command = "npx"
args = ["tsx", "D:/github-projects/skills/mcps/devops-mcps/openobserve-mcp/src/index.ts"]
```

## Codex Setup (`jenkins-mcp`)

### 1. Build the MCP server

```bash
cd d:/github-projects/skills/mcps/devops-mcps/jenkins-mcp
npm install
npm run build
```

### 2. Set Jenkins environment variables

Recommended for multi-environment:

```powershell
$env:JENKINS_PROFILES_FILE = "D:/path/jenkins.profiles.json"
```

Legacy single-environment:

PowerShell (current session):

```powershell
$env:JENKINS_BASE_URL = "https://jenkins.example.com"
$env:JENKINS_USERNAME = "your-username"
$env:JENKINS_API_TOKEN = "your-api-token"
```

Persistent (requires terminal/Codex restart):

```powershell
setx JENKINS_BASE_URL "https://jenkins.example.com"
setx JENKINS_USERNAME "your-username"
setx JENKINS_API_TOKEN "your-api-token"
```

How to get `JENKINS_API_TOKEN`:

1. Log in to Jenkins in browser.
2. Click your user profile (top-right).
3. Open `Configure` (or `Security` in some versions).
4. Find `API Token`.
5. Click `Add new Token` / `Generate`.
6. Copy the token value and use it as `JENKINS_API_TOKEN`.

Notes:

- `JENKINS_API_TOKEN` is different from your Jenkins login password.
- Some Jenkins setups hide token controls unless your account has required permissions.
- `target_env=prod` for Jenkins write operations requires explicit HITL fields:
  - `hitl_confirmed=true` (required)
  - `hitl_confirmation_note` (optional, recommended)

### 3. Add server config to `config.toml`

```toml
[mcp_servers."jenkins-mcp"]
command = "node"
args = ["D:/github-projects/skills/mcps/devops-mcps/jenkins-mcp/dist/index.js"]
```

### 4. Restart Codex

After restart, Jenkins tools are available in chat.

### Optional: Development mode

```toml
[mcp_servers."jenkins-mcp-dev"]
command = "npx"
args = ["tsx", "D:/github-projects/skills/mcps/devops-mcps/jenkins-mcp/src/index.ts"]
```

## Combined `config.toml` Example

```toml
[mcp_servers."openobserve-mcp"]
command = "node"
args = ["D:/github-projects/skills/mcps/devops-mcps/openobserve-mcp/dist/index.js"]

[mcp_servers."jenkins-mcp"]
command = "node"
args = ["D:/github-projects/skills/mcps/devops-mcps/jenkins-mcp/dist/index.js"]
```
