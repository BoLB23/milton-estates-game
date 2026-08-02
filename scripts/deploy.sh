#!/usr/bin/env bash
# Deploy one immutable game image to the canonical homelab Kubernetes service.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project_root="$(cd "${script_dir}/.." && pwd)"

readonly namespace="games"
readonly deployment="milton-estates-game"
readonly game_hostname="games.bolblab.org"
readonly image_repository="ghcr.io/bolb23/milton-estates-game"
readonly tunnel_id="3f6e31eb-7a1b-46a6-b8cf-421e33238beb"
readonly tunnel_service="http://${deployment}.${namespace}.svc.cluster.local:80"
readonly tunnel_namespace="cloudflare"
readonly tunnel_configmap="cloudflared"
readonly tunnel_deployment="cloudflared"

usage() {
  cat >&2 <<'EOF'
Usage: scripts/deploy.sh [--dry-run] <immutable-image>

Accepted image forms:
  ghcr.io/bolb23/milton-estates-game:sha-<40-character-git-sha>
  ghcr.io/bolb23/milton-estates-game@sha256:<64-character-image-digest>

--dry-run validates and renders the game manifests locally. It does not contact
the Kubernetes cluster and does not change anything.
EOF
}

dry_run=false
case "${1:-}" in
  --dry-run)
    dry_run=true
    shift
    ;;
  -h|--help)
    usage
    exit 0
    ;;
esac

if (( $# > 1 )); then
  usage
  exit 64
fi

image_input="${1:-${IMAGE:-}}"
rollout_timeout="${ROLLOUT_TIMEOUT:-180s}"

if [[ -z "${image_input}" ]]; then
  usage
  exit 64
fi

immutable_image_pattern='^ghcr\.io/[Bb][Oo][Ll][Bb]23/milton-estates-game(:sha-[a-f0-9]{40}|@sha256:[a-f0-9]{64})$'
if [[ ! "${image_input}" =~ ${immutable_image_pattern} ]]; then
  echo "Refusing an image outside ${image_repository} or without an immutable full-SHA reference: ${image_input}" >&2
  echo "Deploy ${image_repository}:sha-<40-character-git-sha> or pin its sha256 digest." >&2
  exit 64
fi
# GitHub account names are case-insensitive, but OCI repository names are not.
# Reconstruct the reference with the one canonical lowercase repository path.
image="${image_repository}${BASH_REMATCH[1]}"
if [[ "${BASH_REMATCH[1]}" == :sha-* ]]; then
  image_pull_policy="Always"
else
  image_pull_policy="IfNotPresent"
fi

timeout_pattern='^([1-9][0-9]*(ms|s|m|h))+$'
if [[ ! "${rollout_timeout}" =~ ${timeout_pattern} ]]; then
  echo "ROLLOUT_TIMEOUT must be a positive Kubernetes duration such as 180s or 3m." >&2
  exit 64
fi

command -v kubectl >/dev/null || { echo "kubectl is required." >&2; exit 1; }

rendered_deployment=""
current_tunnel_config=""
desired_tunnel_config=""
current_tunnel_object=""
desired_tunnel_object=""
updated_tunnel_object=""
rollback_tunnel_object=""
tunnel_deployment_object=""
health_response=""
preserve_recovery_files=false
tunnel_config_applied=false
release_complete=false
rollback_in_progress=false

cleanup() {
  [[ -z "${rendered_deployment}" ]] || rm -f -- "${rendered_deployment}"
  [[ -z "${health_response}" ]] || rm -f -- "${health_response}"
  [[ -z "${desired_tunnel_config}" ]] || rm -f -- "${desired_tunnel_config}"
  [[ -z "${desired_tunnel_object}" ]] || rm -f -- "${desired_tunnel_object}"
  [[ -z "${updated_tunnel_object}" ]] || rm -f -- "${updated_tunnel_object}"
  [[ -z "${tunnel_deployment_object}" ]] || rm -f -- "${tunnel_deployment_object}"
  if [[ "${preserve_recovery_files}" == false ]]; then
    [[ -z "${current_tunnel_config}" ]] || rm -f -- "${current_tunnel_config}"
    [[ -z "${current_tunnel_object}" ]] || rm -f -- "${current_tunnel_object}"
    [[ -z "${rollback_tunnel_object}" ]] || rm -f -- "${rollback_tunnel_object}"
  fi
}
on_exit() {
  local status=$?
  local recovery_status=0

  trap - EXIT
  trap '' HUP INT TERM
  set +e
  if [[ "${status}" -ne 0 && "${tunnel_config_applied}" == true && "${release_complete}" == false && "${rollback_in_progress}" == false ]]; then
    restore_tunnel_config
    recovery_status=$?
    if [[ "${recovery_status}" -ne 0 ]]; then
      preserve_recovery_files=true
      echo "Automatic tunnel recovery failed. Recovery files were preserved:" >&2
      echo "  ${current_tunnel_object}" >&2
      echo "  ${current_tunnel_config}" >&2
      echo "  ${rollback_tunnel_object}" >&2
    fi
  fi
  cleanup
  exit "${status}"
}
trap on_exit EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

rendered_deployment="$(mktemp "${TMPDIR:-/tmp}/milton-estates-deployment.XXXXXX")"
rollout_id="$(date -u '+%Y%m%dT%H%M%SZ')-$$-${RANDOM}"
rollout_patch="{\"spec\":{\"template\":{\"metadata\":{\"annotations\":{\"games.bolblab.org/deploy-id\":\"${rollout_id}\"}},\"spec\":{\"containers\":[{\"name\":\"game\",\"imagePullPolicy\":\"${image_pull_policy}\"}]}}}}"

kubectl set image \
  --local \
  --filename "${project_root}/k8s/deployment.yaml" \
  "game=${image}" \
  --output yaml \
  | kubectl patch \
      --local \
      --filename - \
      --type strategic \
      --patch "${rollout_patch}" \
      --output yaml \
  > "${rendered_deployment}"

manifest_value() {
  kubectl create --dry-run=client --validate=false \
    --filename "$1" \
    --output "jsonpath=$2"
}

assert_manifest_value() {
  local manifest="$1"
  local expression="$2"
  local expected="$3"
  local description="$4"
  local actual

  actual="$(manifest_value "${manifest}" "${expression}")"
  if [[ "${actual}" != "${expected}" ]]; then
    echo "Manifest mismatch for ${description}: expected ${expected}, found ${actual:-<empty>}." >&2
    exit 1
  fi
}

# Keep the checked-in resources aligned with the canonical route owned by this
# script. These checks are offline and catch unsupported namespace/host edits.
assert_manifest_value "${project_root}/k8s/namespace.yaml" \
  '{.metadata.name}' "${namespace}" "Namespace name"
assert_manifest_value "${project_root}/k8s/service.yaml" \
  '{.metadata.namespace}' "${namespace}" "Service namespace"
assert_manifest_value "${rendered_deployment}" \
  '{.metadata.namespace}' "${namespace}" "Deployment namespace"
assert_manifest_value "${rendered_deployment}" \
  '{.spec.template.spec.containers[0].image}' "${image}" "Deployment image"
assert_manifest_value "${rendered_deployment}" \
  '{.spec.template.spec.containers[0].imagePullPolicy}' "${image_pull_policy}" "Deployment image pull policy"
assert_manifest_value "${project_root}/k8s/ingress.yaml" \
  '{.metadata.namespace}' "${namespace}" "Ingress namespace"
assert_manifest_value "${project_root}/k8s/ingress.yaml" \
  '{.metadata.labels.app\.kubernetes\.io/name}' "${deployment}" "Ingress status label"
assert_manifest_value "${project_root}/k8s/ingress.yaml" \
  '{.metadata.annotations.external-dns\.alpha\.kubernetes\.io/target}' \
  "${tunnel_id}.cfargotunnel.com" "Ingress tunnel target"
assert_manifest_value "${project_root}/k8s/ingress.yaml" \
  '{.spec.rules[0].host}' "${game_hostname}" "Ingress hostname"
assert_manifest_value "${project_root}/k8s/ingress.yaml" \
  '{.spec.tls[0].hosts[0]}' "${game_hostname}" "Ingress TLS hostname"
assert_manifest_value "${project_root}/k8s/ingress.yaml" \
  '{.spec.rules[0].http.paths[0].backend.service.name}' "${deployment}" "Ingress backend"

# This is deliberately offline: validation must finish before credentials or
# cluster state can be touched. The same rendered Deployment is applied below.
kubectl create --dry-run=client --validate=false \
  --filename "${project_root}/k8s/namespace.yaml" \
  --filename "${project_root}/k8s/service.yaml" \
  --filename "${project_root}/k8s/ingress.yaml" \
  --filename "${rendered_deployment}" \
  >/dev/null

if [[ "${dry_run}" == true ]]; then
  echo "Deployment manifests validated locally for ${image}. No changes made."
  exit 0
fi

command -v jq >/dev/null || { echo "jq is required to patch the Cloudflare Tunnel ConfigMap." >&2; exit 1; }
command -v ruby >/dev/null || { echo "Ruby is required to safely update the tunnel YAML." >&2; exit 1; }
command -v cloudflared >/dev/null || { echo "cloudflared is required to validate the tunnel ingress rules." >&2; exit 1; }
command -v curl >/dev/null || { echo "curl is required to verify public availability." >&2; exit 1; }

current_tunnel_config="$(mktemp "${TMPDIR:-/tmp}/milton-estates-tunnel-current.XXXXXX")"
desired_tunnel_config="$(mktemp "${TMPDIR:-/tmp}/milton-estates-tunnel-desired.XXXXXX")"
current_tunnel_object="$(mktemp "${TMPDIR:-/tmp}/milton-estates-tunnel-object-current.XXXXXX")"
desired_tunnel_object="$(mktemp "${TMPDIR:-/tmp}/milton-estates-tunnel-object-desired.XXXXXX")"
updated_tunnel_object="$(mktemp "${TMPDIR:-/tmp}/milton-estates-tunnel-object-updated.XXXXXX")"
rollback_tunnel_object="$(mktemp "${TMPDIR:-/tmp}/milton-estates-tunnel-object-rollback.XXXXXX")"
tunnel_deployment_object="$(mktemp "${TMPDIR:-/tmp}/milton-estates-tunnel-deployment.XXXXXX")"
health_response="$(mktemp "${TMPDIR:-/tmp}/milton-estates-health.XXXXXX")"
chmod 600 \
  "${current_tunnel_config}" \
  "${desired_tunnel_config}" \
  "${current_tunnel_object}" \
  "${desired_tunnel_object}" \
  "${updated_tunnel_object}" \
  "${rollback_tunnel_object}" \
  "${tunnel_deployment_object}" \
  "${health_response}"

# Verify cluster credentials and reachability before the first external write.
kubectl config current-context >/dev/null
kubectl cluster-info >/dev/null
# Exercise authorization and admission against the exact rendered resources
# without persisting them. This catches an unusable context before the tunnel
# route or workload is changed.
kubectl apply --dry-run=server \
  --filename "${project_root}/k8s/namespace.yaml" \
  --filename "${project_root}/k8s/service.yaml" \
  --filename "${project_root}/k8s/ingress.yaml" \
  --filename "${rendered_deployment}" \
  >/dev/null

# This tunnel is locally managed: fetch the complete shared ConfigMap once so
# its resourceVersion can make the eventual update conditional. A concurrent
# edit will produce a conflict instead of being overwritten.
kubectl --namespace "${tunnel_namespace}" get "configmap/${tunnel_configmap}" \
  --output json \
  > "${current_tunnel_object}"
jq --exit-status --join-output '.data["config.yaml"]' \
  "${current_tunnel_object}" \
  > "${current_tunnel_config}"

# Parse the YAML structure instead of editing matching lines. Psych exposes the
# source ranges for complete route mappings, so quoted hostnames and nested
# route options (including originRequest) are removed as one unit while every
# unrelated route and comment remains byte-for-byte intact.
ruby -rpsych -e '
  source_path, destination_path, expected_tunnel, hostname, service = ARGV
  source = File.binread(source_path)

  begin
    stream = Psych.parse_stream(source, filename: source_path)
  rescue Psych::SyntaxError => error
    warn "Cloudflare Tunnel config is invalid YAML: #{error.message}"
    exit 1
  end

  if stream.children.length != 1 || !stream.children.first.root.is_a?(Psych::Nodes::Mapping)
    warn "Cloudflare Tunnel config must contain one YAML document with a mapping root."
    exit 1
  end
  root = stream.children.first.root

  top_level = root.children.each_slice(2).to_a
  tunnel_pairs = top_level.select { |key, _| key.is_a?(Psych::Nodes::Scalar) && key.value == "tunnel" }
  ingress_pairs = top_level.select { |key, _| key.is_a?(Psych::Nodes::Scalar) && key.value == "ingress" }
  if tunnel_pairs.length != 1 || !tunnel_pairs.first.last.is_a?(Psych::Nodes::Scalar) || tunnel_pairs.first.last.value != expected_tunnel
    warn "Cloudflare Tunnel ConfigMap does not target the expected tunnel #{expected_tunnel}."
    exit 1
  end
  if ingress_pairs.length != 1 || !ingress_pairs.first.last.is_a?(Psych::Nodes::Sequence)
    warn "Cloudflare Tunnel config must contain exactly one block-style ingress sequence."
    exit 1
  end

  ingress = ingress_pairs.first.last
  if ingress.style != Psych::Nodes::Sequence::BLOCK
    warn "Cloudflare Tunnel ingress must use block sequence syntax."
    exit 1
  end

  scalar_value = lambda do |route, name|
    pairs = route.children.each_slice(2).select do |key, _|
      key.is_a?(Psych::Nodes::Scalar) && key.value == name
    end
    if pairs.length > 1
      warn "Tunnel route contains duplicate #{name} keys."
      exit 1
    end
    return nil if pairs.empty?
    value = pairs.first.last
    unless value.is_a?(Psych::Nodes::Scalar)
      warn "Tunnel route #{name} must be a scalar value."
      exit 1
    end
    value.value
  end

  routes = ingress.children
  unless !routes.empty? && routes.all? { |route| route.is_a?(Psych::Nodes::Mapping) }
    warn "Every Cloudflare Tunnel ingress rule must be a mapping."
    exit 1
  end

  catch_alls = []
  target_routes = []
  routes.each_with_index do |route, index|
    route_hostname = scalar_value.call(route, "hostname")
    route_path = scalar_value.call(route, "path")
    route_service = scalar_value.call(route, "service")
    target_routes << route if route_hostname == hostname
    if route_hostname.nil? && route_path.nil? && route_service == "http_status:404"
      catch_alls << [index, route]
    end
  end
  if catch_alls.length != 1 || catch_alls.first.first != routes.length - 1
    warn "Tunnel config must end with exactly one hostname-free http_status:404 catch-all rule."
    exit 1
  end

  lines = source.lines
  newline = source.include?("\r\n") ? "\r\n" : "\n"
  catch_all = catch_alls.first.last
  catch_all_line = lines.fetch(catch_all.start_line)
  indent = catch_all_line[/\A[ \t]*/]
  insertion_line = catch_all.start_line
  while insertion_line.positive? && lines[insertion_line - 1].match?(/\A[ \t]*(?:#.*)?(?:\r?\n)?\z/)
    insertion_line -= 1
  end

  removed_lines = {}
  content_end = lambda do |node|
    children = node.respond_to?(:children) ? node.children : nil
    if children.nil? || children.empty?
      [node.end_line, node.start_line + 1].max
    else
      ([node.start_line + 1] + children.map { |child| content_end.call(child) }).max
    end
  end
  target_routes.each do |route|
    end_exclusive = content_end.call(route)
    (route.start_line...end_exclusive).each { |line_number| removed_lines[line_number] = true }
  end

  output = String.new
  lines.each_with_index do |line, line_number|
    if line_number == insertion_line
      output << indent << "- hostname: " << hostname << newline
      output << indent << "  service: " << service << newline
    end
    output << line unless removed_lines[line_number]
  end
  File.binwrite(destination_path, output)
' "${current_tunnel_config}" "${desired_tunnel_config}" \
  "${tunnel_id}" "${game_hostname}" "${tunnel_service}"

# Cloudflare requires a terminal catch-all and evaluates routes in order. Its
# own validator is the final authority before the shared ConfigMap is touched.
cloudflared tunnel --config "${desired_tunnel_config}" ingress validate >/dev/null

jq --rawfile config "${desired_tunnel_config}" '
  .data["config.yaml"] = $config
  | del(.metadata.managedFields)
' "${current_tunnel_object}" > "${desired_tunnel_object}"

if ! jq --exit-status '.immutable != true' "${current_tunnel_object}" >/dev/null; then
  echo "Cloudflare Tunnel ConfigMap is immutable and cannot be safely updated." >&2
  exit 1
fi

kubectl --namespace "${tunnel_namespace}" get "deployment/${tunnel_deployment}" \
  --output json \
  > "${tunnel_deployment_object}"
if ! jq --exit-status --arg configmap "${tunnel_configmap}" '
  def unavailable($replicas):
    if type == "number" then .
    elif endswith("%") then (($replicas * (rtrimstr("%") | tonumber) / 100) | floor)
    else tonumber
    end;
  (.spec.replicas // 0) as $replicas
  | (.spec.strategy.rollingUpdate.maxUnavailable // "25%") as $max_unavailable
  | $replicas >= 2
    and (.status.availableReplicas // 0) >= 2
    and .spec.strategy.type == "RollingUpdate"
    and (($max_unavailable | unavailable($replicas)) < $replicas)
    and any(
      .spec.template.spec.volumes[]?;
      .name == "config"
        and .configMap.name == $configmap
        and any(.configMap.items[]?; .key == "config.yaml" and .path == "config.yaml")
    )
    and any(
      .spec.template.spec.containers[]?;
      .name == "cloudflared"
        and (.args | index("/etc/cloudflared/config/config.yaml")) != null
        and any(
          .volumeMounts[]?;
          .name == "config"
            and .mountPath == "/etc/cloudflared/config"
            and .readOnly == true
        )
    )
' "${tunnel_deployment_object}" >/dev/null; then
  echo "cloudflare/cloudflared must have two available rolling replicas mounting cloudflared/config.yaml read-only at the expected path." >&2
  exit 1
fi

kubectl auth can-i update "configmap/${tunnel_configmap}" --namespace "${tunnel_namespace}" \
  | grep -qx yes
kubectl auth can-i patch "deployment/${tunnel_deployment}" --namespace "${tunnel_namespace}" \
  | grep -qx yes

# Verify the exact conditional ConfigMap replacement and restart patch against
# admission before changing the game workload.
kubectl replace --dry-run=server --filename "${desired_tunnel_object}" >/dev/null
restart_preflight_patch="$(jq --null-input --arg restarted_at "${rollout_id}" '
  {spec: {template: {metadata: {annotations: {"kubectl.kubernetes.io/restartedAt": $restarted_at}}}}}
')"
kubectl --namespace "${tunnel_namespace}" patch "deployment/${tunnel_deployment}" \
  --type merge \
  --patch "${restart_preflight_patch}" \
  --dry-run=server \
  >/dev/null

build_rollback_tunnel_object() {
  jq --rawfile config "${current_tunnel_config}" '
    .data["config.yaml"] = $config
    | del(.metadata.managedFields)
  ' "${updated_tunnel_object}" > "${rollback_tunnel_object}"
}

restart_tunnel_connectors() {
  kubectl --namespace "${tunnel_namespace}" rollout restart \
    "deployment/${tunnel_deployment}" || return 1
  kubectl --namespace "${tunnel_namespace}" rollout status \
    "deployment/${tunnel_deployment}" \
    --timeout "${rollout_timeout}" || return 1
}

restore_tunnel_config() {
  rollback_in_progress=true
  echo "Release failed after changing the shared tunnel; restoring its previous ConfigMap." >&2

  if [[ ! -s "${rollback_tunnel_object}" ]] && ! build_rollback_tunnel_object; then
    echo "Could not build the conditional tunnel rollback object." >&2
    return 1
  fi
  if ! kubectl replace --filename "${rollback_tunnel_object}" >/dev/null; then
    echo "Could not restore the tunnel ConfigMap. It may have changed concurrently; no external edits were overwritten." >&2
    return 1
  fi
  tunnel_config_applied=false

  if ! restart_tunnel_connectors; then
    echo "The previous tunnel ConfigMap was restored, but the connector rollout did not recover." >&2
    return 1
  fi
  echo "Previous Cloudflare Tunnel configuration restored and reloaded." >&2
  return 0
}

verify_public_health() {
  local attempt
  local http_code=""

  for (( attempt = 1; attempt <= 12; attempt += 1 )); do
    if http_code="$(curl --silent --show-error \
      --connect-timeout 5 \
      --max-time 10 \
      --output "${health_response}" \
      --write-out '%{http_code}' \
      "https://${game_hostname}/healthz")" \
      && [[ "${http_code}" == "200" ]] \
      && grep -qx 'ok' "${health_response}"; then
      return 0
    fi
    if (( attempt < 12 )); then
      sleep 5
    fi
  done

  echo "Public health check failed: expected HTTP 200 with body 'ok', last status was ${http_code:-unavailable}." >&2
  return 1
}

kubectl apply --filename "${project_root}/k8s/namespace.yaml"
kubectl apply --filename "${project_root}/k8s/service.yaml"
kubectl apply --filename "${project_root}/k8s/ingress.yaml"
# The checked-in placeholder is never applied. The requested immutable image
# and rerun nonce enter the pod template together, producing exactly one rollout.
kubectl apply --filename "${rendered_deployment}"

kubectl --namespace "${namespace}" rollout status \
  "deployment/${deployment}" \
  --timeout "${rollout_timeout}"

deployed_image="$(kubectl --namespace "${namespace}" get "deployment/${deployment}" \
  --output "jsonpath={.spec.template.spec.containers[?(@.name=='game')].image}")"
if [[ "${deployed_image}" != "${image}" ]]; then
  echo "Deployment image mismatch: expected ${image}, found ${deployed_image}." >&2
  exit 1
fi

if cmp -s "${current_tunnel_config}" "${desired_tunnel_config}"; then
  echo "Cloudflare Tunnel route for ${game_hostname} is already present."
else
  if ! kubectl replace --filename "${desired_tunnel_object}" \
    --output json > "${updated_tunnel_object}"; then
    echo "Cloudflare Tunnel ConfigMap changed after preflight; refusing to overwrite the concurrent edit." >&2
    exit 1
  fi
  tunnel_config_applied=true
  build_rollback_tunnel_object
  echo "Cloudflare Tunnel route for ${game_hostname} configured."
fi
# cloudflared does not hot-reload its ingress rules. A two-replica rolling
# restart activates the preserved shared config without dropping the tunnel.
restart_tunnel_connectors

kubectl --namespace "${namespace}" get deployment,pods,service,ingress \
  --selector "app.kubernetes.io/name=${deployment}"

# A successful Kubernetes rollout is not enough when the public tunnel is part
# of the release path. Verify the exact public health endpoint before claiming
# that the game is available. Redirects are deliberately rejected, each attempt
# has bounded connection/transfer time, and the expected body is checked.
verify_public_health
release_complete=true
echo "Deployed ${image}"
echo "URL: https://${game_hostname}"
