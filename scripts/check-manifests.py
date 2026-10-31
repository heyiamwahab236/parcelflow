"""Check rendered manifests against the repository's deployment invariants."""
import subprocess
import yaml

docs = list(yaml.safe_load_all(subprocess.check_output(["kubectl", "kustomize", "deploy/k8s"], text=True)))
deployments = [d for d in docs if d["kind"] == "Deployment"]
assert len(deployments) == 2
for deployment in deployments:
    pod = deployment["spec"]["template"]["spec"]
    assert pod["automountServiceAccountToken"] is False
    assert pod["securityContext"]["runAsNonRoot"] is True
    assert deployment["spec"]["strategy"]["rollingUpdate"]["maxUnavailable"] == 0
    for container in pod["containers"]:
        assert container["securityContext"]["readOnlyRootFilesystem"] is True
        assert container["securityContext"]["allowPrivilegeEscalation"] is False
        assert "ALL" in container["securityContext"]["capabilities"]["drop"]
        assert "readinessProbe" in container and "livenessProbe" in container
        assert "requests" in container["resources"] and "limits" in container["resources"]
ingress = next(d for d in docs if d["kind"] == "Ingress")
assert ingress["metadata"]["annotations"]["alb.ingress.kubernetes.io/ssl-redirect"] == "443"
assert not any(d["kind"] == "Secret" for d in docs)
print("PASS: deployment security, health probes, resources, TLS and absence of embedded secrets")
