"""Exercise a synthetic shipment through the HTTP API without printing credentials."""
import argparse
import json
import os
import urllib.error
import urllib.request


def run(base, token):
    def call(path, body=None, authenticated=False):
        headers = {"Content-Type": "application/json"}
        if authenticated:
            headers["Authorization"] = "Bearer " + token
        req = urllib.request.Request(base.rstrip("/") + "/api" + path,
            data=json.dumps(body).encode() if body is not None else None, headers=headers)
        with urllib.request.urlopen(req, timeout=15) as response:
            return json.load(response)

    shipment = call("/shipments", {"origin": "Berlin", "destination": "Munich", "service": "express", "reference": "Synthetic smoke test"}, True)
    number = shipment["trackingNumber"]
    for version, status in enumerate(["picked_up", "in_transit", "out_for_delivery", "delivered"], 1):
        call(f"/shipments/{number}/events", {"status": status, "location": "Munich", "expectedVersion": version}, True)
    final = call(f"/shipments/{number}")
    assert final["status"] == "delivered" and len(final["events"]) == 5
    assert "reference" not in final
    print(f"PASS: {number} created, updated and publicly tracked with 5 consistent events")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="http://127.0.0.1:8080")
    args = parser.parse_args()
    token = os.environ.get("ADMIN_TOKEN")
    if not token:
        parser.error("Set ADMIN_TOKEN in the environment")
    run(args.url, token)
