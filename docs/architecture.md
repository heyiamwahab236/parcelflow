# Architecture and decisions

## Application boundary

ParcelFlow is a synthetic parcel-tracking service. It does not call carrier APIs, estimate arrival times, accept payments or store recipient names/street addresses. A random 64-bit tracking identifier permits public lookup of city-level scan history. Treat it as a bearer reference; it is not authentication for sensitive delivery information.

Operator-only APIs list the latest 100 shipments, create shipments and append status updates. References are deliberately excluded from the public detail response. An operator token is retained in browser memory and disappears on refresh/sign-out. The API compares token hashes in constant time.

## Data consistency

Each shipment has a monotonically increasing version. A scan includes `expectedVersion`. The API acquires a PostgreSQL row lock, compares versions, verifies the transition, updates the shipment and appends an event in one transaction. Concurrent clients cannot silently overwrite each other. Public detail reads use a single statement so the status and event history share a database snapshot.

Migrations use a transaction-level advisory lock and a checksum ledger. An applied migration must never be edited; add another migration instead. This approach targets small, transactional schema changes. Large tables and concurrent-index builds need a separate migration strategy.

## Why EKS

This implements the ParcelFlow EKS architecture. Kubernetes provides a visible example of Deployments, Services, Ingress, probes, disruption budgets, workload identity and HPA. ECS Fargate would simplify operations for this small application; it is not implemented here. The project is designed to demonstrate the EKS operating model, not to claim EKS is the cheapest solution.

## Network and identity

- Public subnets: ALB and one NAT Gateway.
- Private subnets: managed EKS nodes; no public IPs.
- Isolated subnets: PostgreSQL, with no default internet route. Its security group accepts port 5432 only from the EKS node security group.
- EKS API: private by default; optional individual `/32` operator/runner addresses. GitHub-hosted dynamic IP ranges are not automatically permitted.
- API Pod Identity: reads only the application DB secret and operator secret, plus their KMS key.
- Migration Pod Identity: additionally reads the RDS master secret and can initialize/update the two application secrets.
- Delivery identity: GitHub OIDC bound to `heyiamwahab236/parcelflow` and the `aws-demo` environment; ECR publishing and namespace-scoped EKS editing. It cannot provision infrastructure.
- Load balancer controller: its own Pod Identity using the upstream v3.6.2 IAM policy, checked into the repository for review.
- Observability: dedicated identities for the CloudWatch agent and Fluent Bit.

The migration job creates a `parcelflow_app` PostgreSQL role with only the grants needed by the API. Passwords are generated at execution time and never placed in Terraform state. The API verifies the RDS server certificate using the official RDS CA bundle. Its connection factory fetches the current password for each new database connection.

## Delivery sequence

1. CI tests application behavior against PostgreSQL and builds both images.
2. Terraform is checked without AWS access, and an explicit Checkov policy subset is enforced.
3. An operator dispatches the deployment workflow on `main` after configuring AWS.
4. CI runs again; the exact release images are scanned, then pushed to ECR with unique immutable tags.
5. A trusted, network-connected runner deploys by image digest.
6. Foundation configuration is applied, a migration job completes, then rolling deployments proceed.
7. Rollout and endpoint checks report success or failure. No automatic database rollback is attempted.

## Deliberate trade-offs and remaining hardening

| Choice                                              | Consequence / next step                                                                                                                   |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Single-AZ RDS by default                            | Database outage on AZ failure; enable Multi-AZ and test failover before stronger availability claims.                                     |
| One NAT Gateway                                     | Outbound connectivity depends on its AZ; production may need per-AZ NAT or VPC endpoints.                                                 |
| Two managed nodes; HPA 2–4 API pods                 | HPA scales pods, **not nodes**. Node group `max_size` is only a limit; no cluster autoscaler is installed.                                |
| One shared operator token                           | Suitable for a private demonstration; add OIDC users, RBAC and actor-level auditing before real operation.                                |
| In-memory rate limiter                              | Per API replica, not a global quota; use a shared store or edge policy for real abuse controls.                                           |
| Namespace and security-group isolation              | No Kubernetes NetworkPolicies are installed; add/enforce them with the chosen CNI after testing controller, DNS and Pod Identity traffic. |
| Latest compatible EKS add-ons selected at plan time | Review version changes in each plan; pin tested add-on versions for controlled production upgrades.                                       |
| Retained RDS snapshots and state bucket             | Teardown is intentionally not a one-command delete; inspect retention costs.                                                              |
| CloudWatch alarms without notification targets      | Alarm state is visible but nobody is paged; add and test SNS/on-call delivery.                                                            |
| Trivy fixes-only gate                               | Fails fixable HIGH/CRITICAL image vulnerabilities; does not claim no unfixed CVEs exist.                                                  |

## Primary references

- [Amazon EKS version lifecycle](https://docs.aws.amazon.com/eks/latest/userguide/kubernetes-versions.html)
- [EKS Pod Identity](https://docs.aws.amazon.com/eks/latest/userguide/pod-id-association.html)
- [AWS Load Balancer Controller installation](https://kubernetes-sigs.github.io/aws-load-balancer-controller/latest/deploy/installation/)
- [CloudWatch Observability add-on](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/install-CloudWatch-Observability-EKS-addon.html)
- [Terraform S3 backend and native locking](https://developer.hashicorp.com/terraform/language/backend/s3)
