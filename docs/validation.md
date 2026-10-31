# Validation record

## Initial local validation — 2026-10-31

| Check                                   | Result                                                                  |
| --------------------------------------- | ----------------------------------------------------------------------- |
| Domain and input validation tests       | 4 passed                                                                |
| Integration tests against PostgreSQL 17 | 5 passed                                                                |
| Frontend production build               | Passed                                                                  |
| Docker Compose build and startup        | PostgreSQL, API and web healthy; migration job completed                |
| Full HTTP smoke test through Nginx      | Passed: create → four status updates → public tracking with five events |
| Terraform environment validation        | Passed                                                                  |
| Terraform mock-provider plan tests      | 2 passed; no AWS calls or resources                                     |
| Kubernetes render/invariant checks      | Passed                                                                  |
| Production npm dependency audit         | No reported vulnerabilities at validation time                          |
| Browser check                           | Tracking page, sample history and operator login exercised              |

The live [GitHub CI runs](https://github.com/heyiamwahab236/parcelflow/actions/workflows/ci.yml) are the source of truth for checks against each published commit, including Trivy and Checkov. This table is a local validation record, not a substitute for current CI results.

## Not yet verified

- Terraform apply against a real AWS account, quotas and regional add-on behavior.
- EKS admission and scheduling, Pod Identity, ALB provisioning and DNS/TLS in AWS.
- RDS-managed secret retrieval and the AWS-specific database bootstrap job.
- GitHub OIDC, protected environment and private-network deployment runner integration.
- CloudWatch log delivery, filter behavior, alarm notifications and recovery drills.
- Real load capacity, availability, failover and recovery objectives.

The repository therefore describes the AWS configuration as implemented and statically/mock tested, **not live-deployed or production-proven**. Complete and record the deployment guide's verification steps before changing that status.
