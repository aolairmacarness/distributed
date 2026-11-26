---
description: Run a read-only security review of Jobber (optionally scoped, e.g. auth, jobs, executor, ci, deps, secrets)
argument-hint: "[scope: all | auth | jobs | products | executor | ci | helm | deps | secrets | diff]"
allowed-tools: Agent, Read, Grep, Glob, Bash(git diff:*), Bash(git log:*), Bash(git ls-files:*), Bash(grep:*), Bash(npm audit:*), Bash(npm ls:*)
---

Use the **security-reviewer** subagent to audit this repository.

**Scope:** `$ARGUMENTS` (if empty, review everything in the agent's priority order)

Scope rules:
- `auth`, `jobs`, `products`, `executor`: focus on `apps/<scope>` and the shared `libs/` it imports, and follow calls across gRPC and Pulsar boundaries.
- `ci`: `.github/workflows/`, `apps/*/Dockerfile`, `.dockerignore`, `docker-compose.yaml`, `docker-compose.apps.yaml`
- `helm`: `charts/jobber`
- `deps`: `package.json`, the lockfile, and `npm audit --json`
- `secrets`: `.env*` (tracked status only, never values), compose, Helm values, CI, and git history
- `diff`: only files changed in `git diff main...HEAD`, plus any code those changes reach

Context:
- Current branch changes: !`git diff --stat main...HEAD 2>/dev/null | tail -n 20`
- Tracked env/secret-looking files: !`git ls-files | grep -Ei '(\.env|secret|credential|\.pem|\.key)' || echo "none"`

Rules:
- Read-only. Do not edit, install, upgrade, commit, or push.
- Never print secret values.
- Return only the report in the format the agent defines (Summary, Findings, Dependency risk, Not vulnerable).
- After the report, ask whether I want any finding fixed, and fix only the ones I name.
