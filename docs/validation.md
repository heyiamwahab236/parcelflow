# Validation record

## Initial local validation — 2026-10-31

| Check                                   | Result                                                                                       |
| --------------------------------------- | -------------------------------------------------------------------------------------------- |
| Domain and input validation tests       | 4 passed                                                                                     |
| Integration tests against PostgreSQL 17 | 5 passed                                                                                     |
| Frontend production build               | Passed                                                                                       |
| Docker Compose build and startup        | PostgreSQL, API and web healthy; migration job completed                                     |
| Full HTTP smoke test through Nginx      | Passed: create → four status updates → public tracking with five events                      |
| Terraform environment validation        | Passed                                                                                       |
| Terraform mock-provider plan tests      | 2 passed; no AWS calls or resources                                                          |
| Kubernetes render/invariant checks      | Passed                                                                                       |
| Production npm dependency audit         | No reported vulnerabilities at validation time                                               |
| Browser check                           | Tracking, operator login and shipment creation exercised; desktop and mobile layouts checked |
| Checkov 3.4.0 baseline                  | 18 passed, 0 failed; 1 documented development Single-AZ exception                            |
| Trivy 0.76.1 API image                  | 0 fixable HIGH/CRITICAL vulnerabilities after runtime cleanup                                |
| Trivy 0.76.1 web image                  | 0 fixable HIGH/CRITICAL vulnerabilities after base package updates                           |
| Trivy source secret scan                | No findings                                                                                  |

Hosted GitHub Actions jobs have not yet executed successfully. The results above were obtained locally, including the security checks defined in the workflow. Inspect [GitHub CI runs](https://github.com/heyiamwahab236/parcelflow/actions/workflows/ci.yml) for the status of each published commit. No green hosted-CI result is claimed.

Image scans use `--severity HIGH,CRITICAL --ignore-unfixed`. This records the configured gate, not an absence of lower-severity or unfixed vulnerabilities. Rebuild and rescan when base images or vulnerability databases change.

## Not yet verified

- Terraform apply against a real AWS account, quotas and regional add-on behavior.
- EKS admission and scheduling, Pod Identity, ALB provisioning and DNS/TLS in AWS.
- RDS-managed secret retrieval and the AWS-specific database bootstrap job.
- GitHub OIDC, protected environment and private-network deployment runner integration.
- CloudWatch log delivery, filter behavior, alarm notifications and recovery drills.
- Real load capacity, availability, failover and recovery objectives.

The repository therefore describes the AWS configuration as implemented and statically/mock tested, **not live-deployed or production-proven**. Complete and record the deployment guide's verification steps before changing that status.
