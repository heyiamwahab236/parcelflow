"""Render non-secret AWS outputs and digest-pinned images into deployment files."""
import argparse
import json
import pathlib
import re
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[1]


def render(outputs, api_image, web_image, hostname, certificate):
    digest = r"[a-z0-9./:_-]+@sha256:[a-f0-9]{64}"
    if not all(re.fullmatch(digest, image) for image in [api_image, web_image]):
        raise ValueError("Both images must be pinned by sha256 digest")
    if not re.fullmatch(r"[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?", hostname) or "." not in hostname:
        raise ValueError("A valid lowercase DNS hostname is required")
    if not re.fullmatch(r"arn:aws:acm:[a-z0-9-]+:\d{12}:certificate/[a-zA-Z0-9-]+", certificate):
        raise ValueError("An ACM certificate ARN is required")
    replacements = {
        "API_IMAGE_PLACEHOLDER": api_image, "WEB_IMAGE_PLACEHOLDER": web_image,
        "HOSTNAME_PLACEHOLDER": hostname, "CERTIFICATE_ARN_PLACEHOLDER": certificate,
        "REGION_PLACEHOLDER": outputs["region"]["value"],
        "DATABASE_HOST_PLACEHOLDER": outputs["database_host"]["value"],
        "DATABASE_SECRET_PLACEHOLDER": outputs["database_secret_arn"]["value"],
        "OPERATOR_SECRET_PLACEHOLDER": outputs["operator_secret_arn"]["value"],
        "MASTER_SECRET_PLACEHOLDER": outputs["master_secret_arn"]["value"],
    }
    for value in replacements.values():
        if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9./:@_-]+", value):
            raise ValueError("Unexpected characters in deployment configuration")
    sources = {
        "foundation.yaml": subprocess.check_output(["kubectl", "kustomize", "deploy/k8s/foundation"], cwd=ROOT, text=True),
        "app.yaml": subprocess.check_output(["kubectl", "kustomize", "deploy/k8s"], cwd=ROOT, text=True),
        "migration.yaml": (ROOT / "deploy/migration.yaml").read_text(),
    }
    for name, content in sources.items():
        for key, value in replacements.items():
            content = content.replace(key, value)
        if "_PLACEHOLDER" in content:
            raise ValueError(f"Unresolved configuration in {name}")
        yield name, content


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for argument in ["outputs", "api-image", "web-image", "hostname", "certificate"]:
        parser.add_argument(f"--{argument}", required=True)
    parser.add_argument("--directory", default="work/rendered")
    args = parser.parse_args()
    target = pathlib.Path(args.directory)
    target.mkdir(parents=True, exist_ok=True)
    outputs = json.loads(pathlib.Path(args.outputs).read_text(encoding="utf-8-sig"))
    for name, content in render(outputs, args.api_image, args.web_image, args.hostname, args.certificate):
        (target / name).write_text(content, encoding="utf-8")
    print(f"Rendered foundation, migration and application manifests into {target}")
