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
