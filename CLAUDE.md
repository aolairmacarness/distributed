# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

"Jobber" is an Nx monorepo (npm workspaces) of NestJS 11 microservices for distributed job processing. Services talk over gRPC. Jobs go to workers through Apache Pulsar. Data lives in PostgreSQL (Prisma 7 for `auth` and `jobs`, Drizzle for `products`).

## Commands

```bash
npm run docker:infra              # Postgres :5432 + Pulsar :6650 (docker-compose.yaml)
npm start                         # serve auth, jobs, executor, products in parallel
npm stop                          # kill processes on ports 3000-3003
npm run docker:apps               # build + run all apps in containers; needs JWT_SECRET exported

npx nx serve <app>                # auth | jobs | executor | products
npx nx build <project>
npx nx lint <project>
npx nx test <project>                                   # Jest via @nx/jest plugin
npx nx test auth --testFile=auth.service.spec.ts        # single test file
npx nx test auth -t "name of test"                      # filter by test name
npx nx affected -t lint test build                      # what CI runs

npx nx generate-prisma <auth|jobs>    # prisma generate -> apps/<app>/src/generated/prisma
npx nx migrate-prisma <auth|jobs>     # prisma migrate dev
npx nx generate-drizzle products      # drizzle-kit generate
npx nx migrate-drizzle products       # drizzle-kit migrate
npx nx generate-ts-proto grpc         # regenerate TS from .proto (needs `protoc` installed)

node scripts/fibonacci.mjs <authGqlUrl> <jobsGqlUrl> <count>   # end-to-end smoke test
```

Most `build`/`lint`/`test`/`serve` targets are inferred by Nx plugins (`nx.json`). Only custom targets appear in `project.json`. To see every target, run `npx nx show project <name>`. A pre-commit hook (husky + lint-staged) runs `nx affected:lint --fix` and `nx format:write` (Prettier) on staged files.

## Architecture

### Services

| App | Exposes | Notes |
|---|---|---|
| `auth` | GraphQL at `/auth`, gRPC `AuthService` | Users, login, JWT in an `Authentication` cookie. Prisma. |
| `jobs` | GraphQL at `/jobs`, REST `POST /jobs/uploads/upload`, gRPC `JobsService` | Creates job records and publishes messages to Pulsar. Prisma. |
| `products` | REST under `/api`, gRPC `ProductsService` | No GraphQL. Drizzle ORM, schemas in `src/app/**/schema.ts`. |
| `executor` | none (HTTP shell only) | Consumes Pulsar topics and calls other services over gRPC. |

The README says GraphQL is served at `/graphql` and that `products` has a GraphQL API. Both are out of date. The real paths are set in each `app.module.ts`, and each app's global prefix comes from `init()` in `libs/nestjs`.

### Job lifecycle (spans jobs → pulsar → executor → jobs)

1. **Definition (jobs app):** a job is a class in `apps/jobs/src/app/jobs/` that extends `AbstractJob<TMessage>` and has the `@Job({ name, description })` decorator. `JobsService` finds all such providers at startup using `@golevelup/nestjs-discovery`. The class must also be listed in `providers` in `jobs.module.ts`.
2. **Execution:** the `executeJob` GraphQL mutation calls `AbstractJob.execute(data, name, userId)`. It validates **every** message against `messageClass` first (with a placeholder `jobId`), and only then creates the Prisma `Job` row (`userId` = caller, `size` = number of messages, status `IN_PROGRESS`) and publishes each message to a Pulsar topic named after the job (`Jobs` enum in `libs/nestjs/src/lib/jobs.ts`). If the input contains `fileName`, the payload is read from `apps/jobs/uploads/<fileName>`, which is where the upload endpoint saves files. `resolveUploadPath` (`apps/jobs/src/app/uploads/upload.ts`) only accepts a bare `name.json`. The uploads path is resolved from `process.cwd()`.
3. **Consumption (executor):** each topic has a consumer that extends `JobConsumer<T>` (which in turn extends `PulsarConsumer<T>` from `libs/pulsar`) and implements `execute(data)`. `PulsarConsumer` re-validates every message against the message class passed to its constructor, with `whitelist: true`. Invalid payloads are logged and acked (dropped). A failed `execute` is negative-acked and redelivered up to `MAX_REDELIVER_COUNT` (3, `libs/pulsar/src/lib/constants.ts`), then routed to the `<topic>-DLQ` dead-letter topic.
4. **Acknowledgement:** after `execute`, `JobConsumer` calls `JobsService.acknowledge` over gRPC. The jobs app increments `completed` and marks the job `COMPLETED` once `completed >= size`. On a message's last failed delivery, `JobConsumer.onFinalFailure` calls the `Fail` RPC, which marks the job `FAILED`. Delivery is at-least-once, so `execute` can run more than once for a message.

**To add a new job type:** add an entry to the `Jobs` enum. Add a message DTO to `libs/pulsar/src/lib/messages/` that extends `JobMessage`. Give **every** field a class-validator decorator: the executor validates with `whitelist: true`, so undecorated fields are silently stripped. Add an `@Job` class in `apps/jobs` and register it as a provider. Add a `JobConsumer` in `apps/executor`, pass the message class as the 4th `super(...)` argument, and register it.

### Auth across services

`GqlAuthGuard` in `libs/graphql` reads the `Authentication` cookie and validates it by calling `auth` over gRPC (`authenticate`). It works on both GraphQL resolvers and REST controllers (the upload endpoint uses it). Any module that uses it must import a gRPC client named `Packages.AUTH`; in `jobs` that is `AuthClientModule` (`apps/jobs/src/app/auth-client.module.ts`). `@CurrentUser()` from `@jobber/graphql` returns the gRPC response `{ id, email }`.

The `auth` app has its **own**, different `GqlAuthGuard` and `CurrentUser` in `apps/auth/src/app/auth/`. These are passport-jwt based and yield the token payload `{ userId }`. Don't mix the two up. Inside `auth`, `login` and `createUser` are rate-limited with `GqlThrottlerGuard` (`@nestjs/throttler`). Any spec for a resolver that uses that guard must call `overrideGuard(GqlThrottlerGuard)`.

Jobs are owner-scoped: `jobs` and `job` filter by `userId`. The `auth` app exposes `me`, not a list of users.

### Shared libraries and runtime resolution

The libs are `@jobber/grpc`, `@jobber/graphql`, `@jobber/nestjs`, `@jobber/pulsar` and `@jobber/prisma`. During compilation, TS path aliases in `tsconfig.base.json` point them at `libs/*/src`. At runtime they are **not** bundled into the apps. Each lib is built on its own to `dist/libs/<lib>/main`, and each app's `main.ts` starts with `require('module-alias/register')`, which maps the import to that path (`_moduleAliases` in the root `package.json`). As a result, `serve`/`build` depend on the libs' `^build`. If a lib change seems to have no effect, rebuild that lib.

### gRPC

- The `.proto` files in `libs/grpc/src/lib/proto/` are the source of truth. The TS types and Nest decorators (`*ServiceControllerMethods`, `*_SERVICE_NAME`, clients) in `libs/grpc/src/lib/types/proto/` are generated by `ts-proto`. Don't edit those files by hand; regenerate them.
- The lib build copies the protos to `dist/libs/grpc/proto`. Apps load them at runtime with `join(__dirname, '../../libs/grpc/proto/<name>.proto')`.
- Package names come from the `Packages` enum (`libs/grpc/src/lib/types/packages.ts`).
- The `grpc` lib's `build` runs `generate-ts-proto`, which rewrites the `protoc` version header in every generated file. If you didn't change that file's `.proto`, the diff is noise: `git checkout` it.
- Every gRPC server (`apps/*/src/main.ts`) and client module passes `credentials: grpcServerCredentials(...)` or `credentials: grpcClientCredentials(...)` from `libs/grpc/src/lib/tls.ts`. When `GRPC_TLS_*` is unset these return `undefined` (plaintext). Wire the same thing into any new server or client.
- There is no auth on gRPC itself. The Helm `NetworkPolicy` (`charts/jobber/templates/networkpolicy.yaml`) allows each gRPC port only from its known caller. If you add a new gRPC caller, update that policy.

### Prisma

`auth` and `jobs` each have their own `prisma/schema.prisma`, using the `prisma-client` generator with `moduleFormat = "cjs"` and output to `src/generated/prisma`. The generated output is committed. `prisma.config.ts` reads `DATABASE_URL` from the app's `.env`. The `build` and `test` targets depend on `generate-prisma`. `migrate-prisma` (`migrate dev`) needs a running database. In Docker, `docker-entrypoint.sh` runs `prisma migrate deploy` before starting the app.

## Configuration

Each app reads `apps/<app>/.env` through `@nestjs/config`. These files are git-ignored. Copy `apps/<app>/.env.example`, which lists that app's keys.

The core keys are `PORT`, `DATABASE_URL`, `PULSAR_SERVICE_URL`, `AUTH_GRPC_SERVICE_URL`, `JOBS_GRPC_SERVICE_URL`, `PRODUCTS_GRPC_SERVICE_URL`, `JWT_SECRET` and `JWT_EXPIRATION_MS`. Optional keys:

- `SECURE_COOKIE`: the cookie is Secure unless this is `false`.
- `MAX_UPLOAD_BYTES`: upload size cap, default 10 MiB.
- `GRPC_TLS_CA_FILE`, `GRPC_TLS_CERT_FILE`, `GRPC_TLS_KEY_FILE`: mutual TLS. Set all three or none; a partial set fails at startup.
- `PULSAR_AUTH_TOKEN`, `PULSAR_TLS_TRUST_CERTS_FILE`: Pulsar token auth and TLS.

Logging uses `nestjs-pino`, configured in `libs/nestjs`, with cookie and authorization headers redacted. `GqlLoggingPlugin` and `GrpcLoggingInterceptor` deliberately skip request variables and args, so keep it that way.

## Deployment

CI (`.github/workflows/ci.yml`, Node 20, actions pinned to commit SHAs) runs `nx affected -t lint test build` with `npm ci --legacy-peer-deps`. The ECR image build and push steps are currently commented out.

The Dockerfiles build from the repo root, use `npm ci` without `--legacy-peer-deps`, and run as the non-root `node` user. When an app starts importing a new lib, add the matching `COPY` lines to that app's Dockerfile.

The Helm chart is in `charts/jobber` (`values.yaml`, `values-aws.yaml`). It refuses to render without secrets: pass `--set auth.jwt.secret=… --set postgresql.auth.password=…` (URL-safe, because it is embedded in `DATABASE_URL`), or set `secrets.existingSecret`. Verify chart changes with `helm template t charts/jobber --set auth.jwt.secret=x --set postgresql.auth.password=y` and with `helm lint`.

## Conventions

- Read secrets from environment variables only. Never commit them, and never print their values in output. A hook blocks shell commands that read `.env` files. For key names, read the `.env.example` files instead.
- Don't upgrade dependencies, change CI, or change Helm values unless asked.

## Claude tooling

- Agent `security-reviewer` (`.claude/agents/security-reviewer.md`): read-only security audit.
- Command `/security-review [scope]` (`.claude/commands/security-review.md`): runs that agent. Scopes: `all`, `auth`, `jobs`, `products`, `executor`, `ci`, `helm`, `deps`, `secrets`, `diff`.
