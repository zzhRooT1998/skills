---
name: jenkins-release-runbook
description: Run a safe Jenkins release workflow with trigger, queue tracking, status checks, and rollback decision points.
---

# Jenkins Release Runbook

## Purpose

Provide a repeatable release flow using Jenkins MCP tools for controlled deployments.

## Inputs

- `job_path`
- optional `parameters`
- optional `max_wait_minutes`

## Workflow

1. Trigger release build with `TriggerBuild`.
2. Track queue with `TrackQueueItem` until `state=running` and `build_number` exists.
3. Poll `GetBuildStatus` until terminal status.
4. If failed or unstable, fetch logs with `GetConsoleLog` and summarize root cause.
5. If required, abort with `AbortBuild`.

## Success Criteria

- Build status is `SUCCESS`.
- No pending queue item for the run.
- Release note records build number and completion timestamp.

## Failure Criteria

- Status in `FAILURE`, `ABORTED`, or `UNSTABLE`.
- Timeout exceeded without terminal status.

## Output Template

```text
Release job: <job_path>
Queue ID: <queue_id>
Build Number: <build_number>
Final Status: <status>
Duration: <duration_ms>

Summary:
- Key stage result:
- Failure clue (if any):
- Next action:
```
