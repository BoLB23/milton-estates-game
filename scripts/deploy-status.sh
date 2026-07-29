#!/usr/bin/env bash
# Show the workload and externally reachable URL after a deployment.
set -euo pipefail

namespace="${NAMESPACE:-games}"
command -v kubectl >/dev/null || { echo "kubectl is required." >&2; exit 1; }

kubectl -n "${namespace}" get deployment,pods,service,ingress -l app.kubernetes.io/name=milton-estates-game
echo "URL: https://games.bolblab.org"
