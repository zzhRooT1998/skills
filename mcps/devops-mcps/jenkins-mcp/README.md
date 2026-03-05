# jenkins-mcp

MCP server for Jenkins operations.

## Tools

- `TriggerBuild`
- `TrackQueueItem`
- `GetBuildStatus`
- `GetConsoleLog`
- `AbortBuild`

## Prerequisites

- Node.js 22+
- Jenkins URL, user, and API token

## Installation

```bash
npm install
```

## Configuration

Multi-environment mode (recommended):

1. Create `jenkins.profiles.json`:

```json
{
  "default_env": "staging",
  "environments": {
    "staging": {
      "base_url": "https://jenkins-staging.example.com",
      "username": "svc_jenkins_stg",
      "api_token": "xxx",
      "read_only": false
    },
    "prod": {
      "base_url": "https://jenkins-prod.example.com",
      "username": "svc_jenkins_prod",
      "api_token": "yyy",
      "allow_jobs": ["folder-a/release", "folder-b/deploy"],
      "read_only": false
    }
  }
}
```

2. Set:

```bash
JENKINS_PROFILES_FILE=/path/to/jenkins.profiles.json
```

Single-environment fallback (legacy):

```bash
JENKINS_BASE_URL=https://jenkins.example.com
JENKINS_USERNAME=your-username
JENKINS_API_TOKEN=your-api-token
```

How to get `JENKINS_API_TOKEN`:

1. Log in to Jenkins in browser.
2. Open your user profile.
3. Go to `Configure` / `Security`.
4. Find `API Token`.
5. Click `Add new Token` / `Generate`.
6. Copy token value and use it for `JENKINS_API_TOKEN`.

Notes:

- API token is not the same as your Jenkins login password.
- If token controls are missing, ask Jenkins admin for token permission.

Optional:

```bash
JENKINS_TIMEOUT_MS=30000
```

## Run

Development:

```bash
npm run dev
```

Build and run:

```bash
npm run build
npm start
```

## Tool Examples

### TriggerBuild

```json
{
  "target_env": "staging",
  "job_path": "folder-a/my-job",
  "parameters": {
    "ENV": "prod",
    "RETRY": 1
  }
}
```

Prod trigger example (explicit HITL confirmation required):

```json
{
  "target_env": "prod",
  "job_path": "folder-a/my-job",
  "parameters": {
    "ENV": "prod",
    "RETRY": 1
  },
  "hitl_confirmed": true,
  "hitl_confirmation_note": "approved by release manager, CR-2026-0312"
}
```

### TrackQueueItem

```json
{
  "target_env": "staging",
  "queue_id": 245
}
```

### GetBuildStatus

```json
{
  "target_env": "staging",
  "job_path": "folder-a/my-job",
  "build_number": 102
}
```

### GetConsoleLog

```json
{
  "target_env": "staging",
  "job_path": "folder-a/my-job",
  "build_number": 102,
  "start": 0
}
```

### AbortBuild

```json
{
  "target_env": "staging",
  "job_path": "folder-a/my-job",
  "build_number": 102
}
```

Prod abort example (explicit HITL confirmation required):

```json
{
  "target_env": "prod",
  "job_path": "folder-a/my-job",
  "build_number": 102,
  "hitl_confirmed": true,
  "hitl_confirmation_note": "approved by incident commander, INC-2026-0312"
}
```

## Prod HITL Enforcement

For `target_env=prod`, write operations require explicit human confirmation fields:

- `hitl_confirmed=true` (required)
- `hitl_confirmation_note` (optional, recommended for audit)

Enforced operations:

- `TriggerBuild`
- `AbortBuild`

## Notes

- `job_path` supports nested folders, for example: `folder-a/folder-b/my-job`.
- Build trigger returns `queue_id` when Jenkins responds with queue location.
- Console log uses Jenkins progressive endpoint and returns `next_start`.
- `target_env` selects profile/environment. If omitted, `default_env` is used.
- `allow_jobs` (optional) restricts allowed job paths for that environment.
- `read_only=true` blocks write operations (`TriggerBuild`, `AbortBuild`) for that environment.
- `read_only` check is evaluated before prod HITL validation.

## Included Skill

- `../../../skills/devops-skills/jenkins-release-runbook/SKILL.md`
  - A reusable release runbook workflow based on Jenkins MCP tools.

## Verification

```bash
npm test
npm run build
```
