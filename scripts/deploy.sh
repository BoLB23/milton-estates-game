#!/usr/bin/env bash
# Deploy the published game image to the homelab Kubernetes cluster.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project_root="$(cd "${script_dir}/.." && pwd)"
namespace="${NAMESPACE:-games}"
deployment="milton-estates-game"
image="${1:-${IMAGE:-}}"

if [[ -z "${image}" ]]; then
  echo "Usage: $0 <image>" >&2
  echo "Example: $0 ghcr.io/OWNER/milton-estates-game:latest" >&2
  exit 64
fi

command -v kubectl >/dev/null || { echo "kubectl is required." >&2; exit 1; }

kubectl apply -f "${project_root}/k8s/namespace.yaml"
kubectl apply -f "${project_root}/k8s/service.yaml"
kubectl apply -f "${project_root}/k8s/ingress.yaml"
kubectl apply -f "${project_root}/k8s/deployment.yaml"
kubectl -n "${namespace}" set image "deployment/${deployment}" "game=${image}"
kubectl -n "${namespace}" rollout status "deployment/${deployment}" --timeout="${ROLLOUT_TIMEOUT:-180s}"
kubectl -n "${namespace}" get ingress "${deployment}"
