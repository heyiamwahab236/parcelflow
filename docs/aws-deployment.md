# Deploying to AWS

The Terraform and Kubernetes configuration is implemented, but has not been applied to a live AWS account as part of the initial validation. The workflow below is the deployment procedure to validate in your own account. Review plans, costs and permissions before executing it.

## Prerequisites

- An AWS account and an operator IAM role with permissions for the resources in `infra/`.
- AWS CLI v2, Terraform 1.17.1, kubectl compatible with EKS 1.35, Helm 3 and Python 3.
- A domain you control and an **issued ACM certificate in the same region as the ALB**.
- An existing GitHub Actions IAM OIDC provider (`token.actions.githubusercontent.com`, audience `sts.amazonaws.com`). Create this once per account according to [GitHub's AWS OIDC guide](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws).
- A trusted operator machine and deployment runner that can reach the EKS API. It is private by default. Use a VPC-connected runner/VPN, or explicitly allow fixed public IPv4 `/32` addresses through `operator_cidrs`. This repository does not provision the runner or VPN.
- A reviewed budget for EKS, two EC2 nodes, NAT Gateway, ALB, RDS, ECR and CloudWatch. The resources are not free; no live cost estimate is included.

The examples below use Bash. Work from the repository root. Never commit state, `terraform.tfvars`, `backend.hcl`, credentials or rendered configuration.

## 1. Bootstrap Terraform state

```bash
aws sts get-caller-identity
terraform -chdir=infra/bootstrap init
terraform -chdir=infra/bootstrap plan -var='bucket_name=YOUR-GLOBALLY-UNIQUE-STATE-BUCKET' -out=state.tfplan
# Review the plan before applying it.
terraform -chdir=infra/bootstrap apply state.tfplan
```

Bootstrap uses local Terraform state. Keep a secure copy of that small bootstrap state or migrate it into a separate state key after bucket creation. The bucket is versioned, encrypted, blocks public access, denies non-TLS traffic and is protected from Terraform destruction. Environment state uses S3's native lockfile, not the deprecated DynamoDB locking configuration.

## 2. Review and provision the environment

```bash
cp infra/environments/dev/terraform.tfvars.example infra/environments/dev/terraform.tfvars
cp infra/environments/dev/backend.hcl.example infra/environments/dev/backend.hcl
# Edit both files: bucket, role ARN, OIDC provider, region, addresses and repository.
terraform -chdir=infra/environments/dev init -backend-config=backend.hcl
terraform -chdir=infra/environments/dev plan -out=dev.tfplan
# Review resource creation, network access, IAM and charges.
terraform -chdir=infra/environments/dev apply dev.tfplan
mkdir -p work
terraform -chdir=infra/environments/dev output -json > work/aws-outputs.json
```

`work/aws-outputs.json` contains resource identifiers, not secret values. Keep it out of source control. Review compatible add-on versions selected by the provider; defaults do not imply they have been exercised in your account. Multi-AZ RDS is optional and disabled in the dev profile. RDS deletion protection is enabled.

## 3. Bootstrap Kubernetes

Run as the configured operator role, from a host with EKS API connectivity:

```bash
aws eks update-kubeconfig --name parcelflow-dev --region eu-central-1
kubectl get nodes
kubectl apply -f deploy/namespace.yaml

helm repo add eks https://aws.github.io/eks-charts
helm repo update
helm upgrade --install aws-load-balancer-controller eks/aws-load-balancer-controller \
  --version 3.6.2 --namespace kube-system \
  --set clusterName=parcelflow-dev \
  --set region=eu-central-1 \
  --set vpcId=YOUR_VPC_ID \
  --set serviceAccount.create=true \
  --set serviceAccount.name=aws-load-balancer-controller \
  --wait --timeout 5m

kubectl get pods -n kube-system
kubectl get pods -n amazon-cloudwatch
kubectl top nodes
```

Terraform configures Pod Identity associations for the controller, API, migration job and observability agents. It also installs the Pod Identity agent, metrics-server and CloudWatch add-ons. The Helm controller version matches the vendored IAM policy. For controller upgrades, follow upstream CRD upgrade instructions as well as the chart release notes.

## 4. Configure GitHub delivery

Create an environment named **`aws-demo`** in repository settings. Restrict its deployment branches to `main` and enable required reviewers. The OIDC role trusts that environment; branch enforcement is a GitHub environment setting, not a condition available in this environment-style OIDC subject.

Add these environment variables:

| Variable                | Source                               |
| ----------------------- | ------------------------------------ |
| `AWS_REGION`            | Terraform `region` output            |
| `AWS_DELIVERY_ROLE_ARN` | `delivery_role_arn` output           |
| `EKS_CLUSTER_NAME`      | `cluster_name` output                |
| `ECR_API_URL`           | `ecr_api_url` output                 |
| `ECR_WEB_URL`           | `ecr_web_url` output                 |
| `APP_HOSTNAME`          | DNS name covered by your certificate |
| `ACM_CERTIFICATE_ARN`   | Issued regional ACM certificate      |
| `TF_OUTPUTS_JSON`       | Contents of `work/aws-outputs.json`  |

Register a **dedicated trusted Linux runner** with label `parcelflow`, AWS CLI, Python 3 and kubectl. It needs network access to the private EKS API (and AWS endpoints). Never run untrusted pull-request workflows on it. CI and image builds use GitHub-hosted runners.

No AWS access keys are required by the workflows. Credentials are short-lived OIDC sessions. The delivery role has no Terraform apply permissions.

## 5. First release and DNS

Dispatch **Deploy to AWS EKS** from `main`. It runs CI, builds and scans images, publishes them to ECR, and deploys immutable digests. The deployment script:

1. Applies ConfigMap, service accounts and internal Services.
2. Runs `bootstrap-aws.js` in a dedicated Job. It generates missing secrets, applies schema migrations and provisions the restricted PostgreSQL role.
3. Waits for migration success before applying workloads and ingress.
4. Waits for both deployments to become ready.

Get the ALB hostname:

```bash
kubectl get ingress parcelflow -n parcelflow
```

Create a Route 53 alias or your DNS provider's CNAME pointing the application hostname to the ALB. DNS and ACM validation are deliberately external prerequisites; this repository does not purchase a domain. On the first run, the final public endpoint check can fail until DNS is configured. After DNS propagates, check both the website and a complete shipment lifecycle.

To obtain the generated operator token, an authorized operator can read the `operator_secret_arn` output using Secrets Manager in their own terminal. Do not paste it into GitHub logs, issues or committed files. Set it as `ADMIN_TOKEN` only for the local smoke process:

```bash
python3 scripts/smoke.py --url https://YOUR_APP_HOSTNAME
```

No demo records are inserted automatically into AWS. The smoke script creates a synthetic record. Optionally run `src/seed.js` as the API identity with `ALLOW_DEMO_SEED=true` if you want the fixed demo tracking numbers.

## 6. Verify before declaring the deployment complete

- Record the deployed commit and image digests.
- Confirm HTTPS, redirect behavior and API ALB target health.
- Verify unauthorized mutations fail and a complete shipment lifecycle succeeds.
- Inspect API logs in CloudWatch and exercise a controlled error to validate the alarm filter.
- Test pod restart and deployment rollback.
- Configure alarm notifications and validate their delivery.
- Perform a database snapshot restore drill into a separate instance.
- Record date, region, evidence and limitations in a deployment report. Do not mark cloud validation complete based only on Terraform validation or mock tests.

## Local manual deployment alternative

After building, scanning and pushing images yourself, set `CLUSTER_NAME`, `AWS_REGION`, `API_IMAGE`, `WEB_IMAGE`, `APP_HOSTNAME`, `ACM_CERTIFICATE_ARN` and `TF_OUTPUTS_FILE`, then run `bash scripts/deploy.sh`. Both image references must have `@sha256:<64 hex characters>`. The script refuses mutable tag-only references. Use the same operator/deployment permissions and network requirements as above.
