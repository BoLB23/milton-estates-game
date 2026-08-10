#!/usr/bin/env bash
# Show the workload and externally reachable URL after a deployment.
set -euo pipefail

readonly namespace="games"
readonly deployment="milton-estates-game"
command -v kubectl >/dev/null || { echo "kubectl is required." >&2; exit 1; }

kubectl --namespace "${namespace}" get deployment,pods,service,ingress \
  --selector "app.kubernetes.io/name=${deployment}"
kubectl --namespace "${namespace}" get "deployment/${deployment}" \
  --output "custom-columns=NAME:.metadata.name,IMAGE:.spec.template.spec.containers[0].image"
echo "URL: https://games.bolblab.org/games/milton-estates/"
