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

## Human-in-the-Loop Gate

Before triggering deployment, validate deployment parameters with user unless skip condition is met.

Run this gate in order:

1. Check required parameter set for target job/environment.
2. If user provides `environment/target_env` but does not provide other deployment parameters:
   - find the most recent successful deployment in the same environment
   - extract its parameter set as `candidate_parameters`
   - enter human-in-the-loop confirmation:
     - "Use the following parameters for deployment?"
     - show full `candidate_parameters`
     - proceed only after explicit user confirmation
   - if user rejects, request manual parameter input and stop auto-trigger
3. If required parameters are incomplete or ambiguous:
   - stop execution
   - ask user to fill missing values
   - continue only after user confirmation
4. If user has deployed the same environment before and historical parameters are available:
   - present the previous parameter set
   - ask user to confirm reuse or provide overrides
5. If target environment is `prod`:
   - ALWAYS require human confirmation before deployment, even when parameters are complete
   - after confirmation, write operation request must include:
     - `hitl_confirmed=true`
     - optional `hitl_confirmation_note` (recommended for audit)
6. If user already provides a complete and unambiguous parameter set in the current request:
   - for non-`prod`, skip human-in-the-loop confirmation
   - proceed directly to trigger

Parameter alignment checklist (before `TriggerBuild`):

- `environment` (prod/staging/dev)
- `version` or `image_tag`
- `region` or cluster
- rollout strategy (if applicable)
- canary/traffic percentage (if applicable)
- rollback target/version (if applicable)
- change ticket/reason (if required by team policy)

## Workflow

1. Run `Human-in-the-Loop Gate` for deployment parameter alignment.
2. Trigger release build with `TriggerBuild`.
3. Track queue with `TrackQueueItem` until `state=running` and `build_number` exists.
4. Poll `GetBuildStatus` until terminal status.
5. If failed or unstable, fetch logs with `GetConsoleLog` and summarize root cause.
6. If required, abort with `AbortBuild`.

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
