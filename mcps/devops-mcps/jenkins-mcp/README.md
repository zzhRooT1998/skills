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

Required environment variables:

```bash
JENKINS_BASE_URL=https://jenkins.example.com
JENKINS_USERNAME=your-username
JENKINS_API_TOKEN=your-api-token
```

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
  "job_path": "folder-a/my-job",
  "parameters": {
    "ENV": "prod",
    "RETRY": 1
  }
}
```

### TrackQueueItem

```json
{
  "queue_id": 245
}
```

### GetBuildStatus

```json
{
  "job_path": "folder-a/my-job",
  "build_number": 102
}
```

### GetConsoleLog

```json
{
  "job_path": "folder-a/my-job",
  "build_number": 102,
  "start": 0
}
```

### AbortBuild

```json
{
  "job_path": "folder-a/my-job",
  "build_number": 102
}
```

## Notes

- `job_path` supports nested folders, for example: `folder-a/folder-b/my-job`.
- Build trigger returns `queue_id` when Jenkins responds with queue location.
- Console log uses Jenkins progressive endpoint and returns `next_start`.

## Included Skill

- `../../../skills/devops-skills/jenkins-release-runbook/SKILL.md`
  - A reusable release runbook workflow based on Jenkins MCP tools.

## Verification

```bash
npm test
npm run build
```
