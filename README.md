# ParcelFlow

**A working parcel-tracking application with an AWS EKS deployment platform.**

[![CI](https://github.com/heyiamwahab236/parcelflow/actions/workflows/ci.yml/badge.svg)](https://github.com/heyiamwahab236/parcelflow/actions/workflows/ci.yml)
![Node.js 24](https://img.shields.io/badge/Node.js-24-43853d)
![React](https://img.shields.io/badge/React-19-149eca)
![AWS EKS](https://img.shields.io/badge/AWS-EKS-ff9900)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

ParcelFlow follows a shipment from label creation to delivery. Customers can look up a tracking number; an operator can create a shipment and record new scans. PostgreSQL stores the event history, and concurrent updates are checked before a scan is accepted.

The infrastructure demonstrates the engineering around that application: private EKS nodes, an HTTPS Application Load Balancer, RDS, separate workload identities, Secrets Manager, container security checks, controlled database migrations, rolling deployments and CloudWatch monitoring.

> **Project status:** The application is implemented and tested locally using Docker and real PostgreSQL. Terraform is validated and tested with a mocked AWS provider. The AWS deployment path is implemented but has **not been deployed or verified in an AWS account**. The demo uses synthetic data and has no live carrier integration. See [validation evidence](docs/validation.md).

![ParcelFlow tracking screen using synthetic local data](docs/preview.jpg)

## Run locally

Install Docker Desktop with Linux containers (or Docker Engine + Compose).

```bash
git clone https://github.com/heyiamwahab236/parcelflow.git
cd parcelflow
docker compose up --build -d --wait
```

Open **http://localhost:8080** and select **Try a sample shipment**.

| Local demo setting     | Value                                         |
| ---------------------- | --------------------------------------------- |
| Sample tracking number | `PF-A1B2C3D4E5F60708`                         |
| Operations token       | `local-demo-operator-token-change-before-use` |
| API                    | `http://localhost:3000`                       |
| PostgreSQL             | `localhost:54329`                             |

These intentionally public credentials are for the loopback-bound local demo only. AWS creates fresh random secrets. To override local values, copy `.env.example` to `.env` before starting; do not commit `.env`.

Try the full flow: open Operations, sign in with the local token, create a shipment, record a pickup scan, and use its new number on the public tracking page.

```bash
docker compose logs -f api
docker compose stop           # keep the demo database
docker compose down           # remove containers; keep the data volume
```

`docker compose down -v` deliberately deletes the local demo database. Use it only when you want to reset the demo. Changing `POSTGRES_PASSWORD` after initialization also requires updating the database password or resetting this local volume.

## What is implemented

- Responsive React tracking page, event timeline and operator workspace.
- Express API with request validation, random tracking IDs, bounded request bodies, rate limiting, structured logs and health probes.
- PostgreSQL transactions, row locking and optimistic version checks. An outdated or invalid transition returns `409`; delivered shipments cannot be moved backwards.
- Repeatable, checksum-verified SQL migrations and synthetic seed data.
- Separate application and migration database roles in AWS. The application cannot delete shipment history or modify the database schema.
- Multi-stage Docker builds, non-root containers and read-only application filesystems.
- Terraform modules for networking, EKS and RDS; ECR, workload IAM roles, GitHub OIDC delivery role, CloudWatch and an encrypted, versioned S3 state bootstrap.
- Kubernetes readiness/liveness probes, rolling updates, disruption budgets, HPA, HTTPS ingress and digest-pinned deployment rendering.
- CI application/database tests, container smoke test, npm audit, Trivy image/secret scans, a documented Checkov baseline and Terraform mock-plan tests.
- An **opt-in** GitHub Actions deployment workflow that scans and publishes release images, runs migrations and checks rollout. It requires AWS/environment/runner setup first.

## Architecture

```mermaid
flowchart LR
  customer[Customer / operator] -->|HTTPS| alb[Application Load Balancer]
  subgraph vpc[AWS VPC — two availability zones]
    alb -->|/| web[React / Nginx pods]
    alb -->|/api| api[Node.js API pods]
    subgraph eks[EKS — private worker nodes]
      web
      api
      migration[Migration job]
    end
    api -->|Verified TLS, restricted role| db[(RDS PostgreSQL\nisolated subnets)]
    migration -->|Schema changes| db
    api -. Pod Identity .-> secrets[Secrets Manager]
    migration -. Separate identity .-> secrets
    eks --> cw[CloudWatch logs and metrics]
  end
  git[GitHub Actions] -->|Tests + scans| ecr[ECR images]
  ecr -->|Immutable digest| eks
  tf[Terraform] -. provisions .-> vpc
```

The diagram describes the implemented **target AWS configuration**, not a running cloud deployment. [Architecture decisions and limitations →](docs/architecture.md)

## Test it

Node.js 24 is required for application development.

```bash
npm ci --ignore-scripts
npm test
npm run build
docker compose -f compose.test.yaml up -d --wait
```

Run the integration suite against the separate disposable database:

```bash
# Bash
TEST_DATABASE_URL=postgresql://test:test_only_password@127.0.0.1:54330/parcelflow_test npm run test:integration
ADMIN_TOKEN=local-demo-operator-token-change-before-use python3 scripts/smoke.py
```

```powershell
# PowerShell
$env:TEST_DATABASE_URL='postgresql://test:test_only_password@127.0.0.1:54330/parcelflow_test'
npm run test:integration
$env:ADMIN_TOKEN='local-demo-operator-token-change-before-use'
python scripts/smoke.py
```

The integration suite verifies actual SQL persistence, public/private data boundaries, authentication, invalid transitions, concurrent writers, readiness failure and throttling. The smoke script goes through Nginx → API → PostgreSQL. Test data is synthetic. Stop the disposable test database with `docker compose -f compose.test.yaml down`.

For live editing, copy `.env.example` to `.env`, start the local database, then run `npm run dev:api` and `npm run dev:web` in separate terminals. Stop the Compose API first to free port 3000. Vite proxies API requests on port 5173.

## AWS deployment

Follow the [AWS deployment guide](docs/aws-deployment.md). It covers the prerequisites, reviewed Terraform plan, EKS controller setup, TLS/DNS, separate database bootstrap and GitHub environment configuration. **A push to this repository never creates cloud infrastructure or triggers deployment.**

EKS, EC2, NAT Gateway, ALB, RDS and CloudWatch incur charges. The dev profile uses two worker nodes, one NAT Gateway and a Single-AZ database. It is not a free-tier design or a highly available production environment.

## Repository map

```text
apps/api/                  API, migrations, AWS bootstrap and tests
apps/web/                  React UI and Nginx configuration
infra/bootstrap/           Versioned, encrypted S3 Terraform state
infra/environments/dev/    AWS environment, IAM and observability
infra/modules/             Network, EKS and database modules
deploy/                    Kubernetes workloads and migration job
scripts/                   Deployment rendering, smoke and policy checks
.github/workflows/         CI and optional AWS delivery
docs/                      Architecture, API, deployment and operations
```

## Read more

- [API and shipment lifecycle](docs/api.md)
- [Architecture and trade-offs](docs/architecture.md)
- [AWS setup and delivery](docs/aws-deployment.md)
- [Operations, rollback and recovery](docs/operations.md)
- [Security model](SECURITY.md)
- [Verification and remaining gaps](docs/validation.md)
- [Contributing](CONTRIBUTING.md)

Built with AI-assisted development; the repository includes executable checks and explicitly records what was and was not validated. Original code is MIT licensed; the upstream load balancer policy is Apache-2.0 licensed as recorded in [NOTICE](NOTICE).
