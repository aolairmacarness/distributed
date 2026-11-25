# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

"Jobber" is an Nx monorepo (npm workspaces) of NestJS 11 microservices for distributed job processing. Services talk over gRPC. Jobs go to workers through Apache Pulsar. Data lives in PostgreSQL (Prisma 7 for `auth` and `jobs`, Drizzle for `products`).

## Commands

```bash
npm run docker:infra              # Postgres :5432 + Pulsar :6650 (docker-compose.yaml)
npm start                         # serve auth, jobs, executor, products in parallel
npm stop                          # kill processes on ports 3000-3003
npm run docker:apps               # build + run all apps in containers (docker-compose.apps.yaml)

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
2. **Execution:** the `executeJob` GraphQL mutation calls `AbstractJob.execute()`. That method creates a Prisma `Job` row (`size` = number of messages, status `IN_PROGRESS`). It then checks each message against the `messageClass` with class-validator and publishes it to a Pulsar topic named after the job (`Jobs` enum in `libs/nestjs/src/lib/jobs.ts`). If the input contains `fileName`, the payload is read from `apps/jobs/uploads/<fileName>`, which is where the upload endpoint saves files. That path is resolved from `process.cwd()`.
3. **Consumption (executor):** each topic has a consumer that extends `JobConsumer<T>` (which in turn extends `PulsarConsumer<T>` from `libs/pulsar`). It implements `execute(data)`. Every message is acked to Pulsar in a `finally` block, so a failed message is logged and never retried.
4. **Acknowledgement:** after `execute`, `JobConsumer` calls `JobsService.acknowledge` over gRPC. The jobs app increments `completed` and marks the job `COMPLETED` when `completed === size`.

**To add a new job type:** add an entry to the `Jobs` enum. Add a message DTO with class-validator decorators to `libs/pulsar/src/lib/messages/`; it must include `jobId`, because it extends `JobMessage`/`AcknowledgeRequest`. Add an `@Job` class in `apps/jobs` and register it as a provider. Add a `JobConsumer` in `apps/executor` and register it.

### Auth across services

`GqlAuthGuard` in `libs/graphql` reads the `Authentication` cookie and validates it by calling `auth` over gRPC (`authenticate`). Any app that uses the guard must register a gRPC client named `Packages.AUTH` (see `apps/jobs/src/app/jobs.module.ts`).

### Shared libraries and runtime resolution

The libs are `@jobber/grpc`, `@jobber/graphql`, `@jobber/nestjs`, `@jobber/pulsar` and `@jobber/prisma`. During compilation, TS path aliases in `tsconfig.base.json` point them at `libs/*/src`. At runtime they are **not** bundled into the apps. Each lib is built on its own to `dist/libs/<lib>/main`, and each app's `main.ts` starts with `require('module-alias/register')`, which maps the import to that path (`_moduleAliases` in the root `package.json`). As a result, `serve`/`build` depend on the libs' `^build`. If a lib change seems to have no effect, rebuild that lib.

### gRPC

- The `.proto` files in `libs/grpc/src/lib/proto/` are the source of truth. The TS types and Nest decorators (`*ServiceControllerMethods`, `*_SERVICE_NAME`, clients) in `libs/grpc/src/lib/types/proto/` are generated by `ts-proto`. Don't edit those files by hand; regenerate them.
- The lib build copies the protos to `dist/libs/grpc/proto`. Apps load them at runtime with `join(__dirname, '../../libs/grpc/proto/<name>.proto')`.
- Package names come from the `Packages` enum (`libs/grpc/src/lib/types/packages.ts`).

### Prisma

`auth` and `jobs` each have their own `prisma/schema.prisma`, using the `prisma-client` generator with `moduleFormat = "cjs"` and output to `src/generated/prisma`. The generated output is committed. `prisma.config.ts` reads `DATABASE_URL` from the app's `.env`. The `build` and `test` targets depend on `generate-prisma`. In Docker, `docker-entrypoint.sh` runs `prisma migrate deploy` before starting the app.

## Configuration

Each app reads `apps/<app>/.env` through `@nestjs/config`. The keys are `PORT`, `DATABASE_URL`, `PULSAR_SERVICE_URL`, `AUTH_GRPC_SERVICE_URL`, `JOBS_GRPC_SERVICE_URL`, `PRODUCTS_GRPC_SERVICE_URL`, `JWT_SECRET` and `JWT_EXPIRATION_MS`. Logging uses `nestjs-pino`, configured in `libs/nestjs`.

## Deployment

CI (`.github/workflows/ci.yml`, Node 20) runs `nx affected -t lint test build`. It then builds each `apps/<app>/Dockerfile` from the repo root and pushes the images to ECR. The Helm chart for Kubernetes is in `charts/jobber` (`values.yaml`, `values-aws.yaml`). When an app starts importing a new lib, add the matching `COPY` lines to that app's Dockerfile.
