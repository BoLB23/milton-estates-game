#!/usr/bin/env bash
# Deploy the published game image to the homelab Kubernetes cluster.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project_root="$(cd "${script_dir}/.." && pwd)"
namespace="${NAMESPACE:-games}"
deployment="milton-estates-game"
image="${1:-${IMAGE:-}}"
game_hostname="${GAME_HOSTNAME:-games.bolblab.org}"
tunnel_service="http://${deployment}.${namespace}.svc.cluster.local:80"
cloudflare_tunnel_id="${CLOUDFLARE_TUNNEL_ID:-3f6e31eb-7a1b-46a6-b8cf-421e33238beb}"
cloudflare_zone_id="${CLOUDFLARE_ZONE_ID:-9c49241a4b2254b0fb05d7a90270ce10}"
cloudflare_account_id="${CLOUDFLARE_ACCOUNT_ID:-}"
cloudflare_api_token="${CLOUDFLARE_TUNNEL_API_TOKEN:-}"

if [[ -z "${image}" ]]; then
  echo "Usage: $0 <image>" >&2
  echo "Example: $0 ghcr.io/OWNER/milton-estates-game:latest" >&2
  exit 64
fi

command -v kubectl >/dev/null || { echo "kubectl is required." >&2; exit 1; }
command -v jq >/dev/null || { echo "jq is required to update the Cloudflare Tunnel route." >&2; exit 1; }
command -v curl >/dev/null || { echo "curl is required to update the Cloudflare Tunnel route." >&2; exit 1; }

configure_tunnel_route() {
  local account_id config response

  if [[ -z "${cloudflare_api_token}" ]]; then
    echo "CLOUDFLARE_TUNNEL_API_TOKEN with Cloudflare Tunnel:Edit permission is required." >&2
    return 1
  fi

  account_id="${cloudflare_account_id}"
  if [[ -z "${account_id}" ]]; then
    account_id="$(curl --fail --silent --show-error \
      -H "Authorization: Bearer ${cloudflare_api_token}" \
      "https://api.cloudflare.com/client/v4/zones/${cloudflare_zone_id}" \
      | jq -er '.result.account.id')"
  fi

  response="$(curl --fail --silent --show-error \
    -H "Authorization: Bearer ${cloudflare_api_token}" \
    "https://api.cloudflare.com/client/v4/accounts/${account_id}/cfd_tunnel/${cloudflare_tunnel_id}/configurations")"
  config="$(jq -ce --arg hostname "${game_hostname}" --arg service "${tunnel_service}" '
    .result.config as $config
    | ($config.ingress | map(select(.hostname != $hostname))) as $remaining
    | ($remaining | map(select(.service == "http_status:404" and .hostname? == null)) | last) as $catch_all
    | if $catch_all == null then
        error("Cloudflare Tunnel configuration has no http_status:404 catch-all rule")
      else
        ($remaining | map(select(. != $catch_all))) as $routes
        | {config: ($config + {ingress: ($routes + [{hostname: $hostname, service: $service, originRequest: {}}] + [$catch_all])})}
      end
  ' <<<"${response}")"

  curl --fail --silent --show-error --request PUT \
    -H "Authorization: Bearer ${cloudflare_api_token}" \
    -H 'Content-Type: application/json' \
    --data "${config}" \
    "https://api.cloudflare.com/client/v4/accounts/${account_id}/cfd_tunnel/${cloudflare_tunnel_id}/configurations" \
    | jq -e '.success == true' >/dev/null
  echo "Cloudflare Tunnel route for ${game_hostname} configured."
}

kubectl apply -f "${project_root}/k8s/namespace.yaml"
kubectl apply -f "${project_root}/k8s/service.yaml"
kubectl apply -f "${project_root}/k8s/deployment.yaml"
kubectl -n "${namespace}" set image "deployment/${deployment}" "game=${image}"
configure_tunnel_route
kubectl apply -f "${project_root}/k8s/ingress.yaml"
kubectl -n "${namespace}" rollout status "deployment/${deployment}" --timeout="${ROLLOUT_TIMEOUT:-180s}"
kubectl -n "${namespace}" get ingress "${deployment}"
