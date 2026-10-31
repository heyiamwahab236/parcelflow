#!/usr/bin/env bash
set -euo pipefail
: "${CLUSTER_NAME:?Set CLUSTER_NAME}"
: "${AWS_REGION:?Set AWS_REGION}"
: "${API_IMAGE:?Set the API image digest}"
: "${WEB_IMAGE:?Set the web image digest}"
: "${APP_HOSTNAME:?Set the application DNS hostname}"
: "${ACM_CERTIFICATE_ARN:?Set an issued ACM certificate ARN}"
: "${TF_OUTPUTS_FILE:?Set the path to terraform output -json}"
export KUBECONFIG="$(mktemp)"
trap 'rm -f "$KUBECONFIG"' EXIT
aws eks update-kubeconfig --name "$CLUSTER_NAME" --region "$AWS_REGION"
python3 scripts/render.py --outputs "$TF_OUTPUTS_FILE" --api-image "$API_IMAGE" --web-image "$WEB_IMAGE" \
  --hostname "$APP_HOSTNAME" --certificate "$ACM_CERTIFICATE_ARN"
# The namespace and cluster controllers must already exist (see docs/aws-deployment.md).
kubectl apply -f work/rendered/foundation.yaml
kubectl delete job parcelflow-migrate -n parcelflow --ignore-not-found --wait=true
kubectl apply -f work/rendered/migration.yaml
if ! kubectl wait --for=condition=complete job/parcelflow-migrate -n parcelflow --timeout=300s; then
  kubectl logs -n parcelflow job/parcelflow-migrate --all-containers=true
  exit 1
fi
kubectl apply -f work/rendered/app.yaml
kubectl rollout status deployment/api -n parcelflow --timeout=300s
kubectl rollout status deployment/web -n parcelflow --timeout=300s
kubectl get ingress parcelflow -n parcelflow
echo 'Rollout complete. Run scripts/smoke.py after DNS points to the ingress.'
