# Security model and reporting

Use synthetic data in this demonstration environment. Please use GitHub's private vulnerability reporting feature if available, or contact the repository owner privately. Do not put credentials or exploit details in a public issue.

## Implemented controls

- Public lookup exposes only route cities, service, status and scan events. Internal references require operator access.
- Parameterized SQL, strict input validation, random tracking IDs, 8 KiB request limits and constant-time token comparison.
- Transactions, version checks and an append-only event permission model in AWS.
- Non-root application containers, dropped capabilities and read-only application filesystems.
- RDS certificate verification, mandatory database TLS, encryption at rest and isolated database subnets.
- Secrets Manager values generated outside Terraform; no cloud credentials or generated secrets are committed.
- Separate application, migration, delivery, ingress and monitoring IAM roles.
- EKS public API access disabled by default; optional addresses must be individual `/32`s.
- GitHub actions pinned by commit, read-only CI permissions and OIDC delivery scoped to a protected environment.

## Scope of the automated gates

`npm audit` blocks high/critical production dependency findings. Trivy blocks fixable high/critical image vulnerabilities and scans source for secrets. `.checkov.yaml` explicitly lists the Terraform security baseline; it does not claim every upstream Checkov policy passes. Vulnerability databases change over time. Review the actual run output, not just a badge.

The intentionally public local demo password/token are scoped to a loopback-bound Compose stack. AWS bootstrap creates fresh random values. Never expose the local Compose stack to the internet or reuse those credentials elsewhere.

The Checkov Multi-AZ rule has one explicit resource-level exception for the development database. Its default Single-AZ setting is a documented availability/cost trade-off, not a production recommendation. ECR and CloudWatch logs use customer-managed KMS keys.

## Before a real deployment

Replace the shared operator token with individual authentication/authorization; add attribution to audit events; enforce and test workload network isolation; configure global rate controls, alert delivery, backup restore drills and credential rotation. Review third-party images and licenses and confirm cloud resource permissions and costs.

Only trusted maintainers may dispatch deployment. Configure the `aws-demo` environment with required reviewers, prevent self-review where available and restrict deployment branches to `main`. Keep the self-hosted deployment runner dedicated and isolated. It must never execute pull requests from this public repository.

Changing or publishing infrastructure code does not authorize applying it to an AWS account. Terraform plan review and the documented deployment prerequisites remain separate steps.
