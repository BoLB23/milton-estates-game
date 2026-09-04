#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project_root="$(cd "${script_dir}/.." && pwd)"
docker_bin="${DOCKER_BIN:-docker}"
image="${NGINX_TEST_IMAGE:-nginxinc/nginx-unprivileged:1.29-alpine}"
port="${NGINX_TEST_PORT:-18080}"

test -f "${project_root}/dist/index.html"
test -f "${project_root}/nginx.conf"
"${docker_bin}" run --rm \
  -v "${project_root}/nginx.conf:/etc/nginx/conf.d/default.conf:ro" \
  -v "${project_root}/dist:/usr/share/nginx/html:ro" \
  "${image}" nginx -t

container="$(${docker_bin} run -d -p "${port}:8080" \
  -v "${project_root}/nginx.conf:/etc/nginx/conf.d/default.conf:ro" \
  -v "${project_root}/dist:/usr/share/nginx/html:ro" \
  "${image}")"
cleanup() { "${docker_bin}" rm -f "${container}" >/dev/null; }
trap cleanup EXIT

curl_args=(curl -fsS --retry 10 --retry-delay 1 --retry-connrefused)
base="http://127.0.0.1:${port}"
hash_asset="$(find "${project_root}/dist/assets" -maxdepth 1 -type f -name 'index-*.js' -print -quit | sed "s#${project_root}/dist##")"
test -n "${hash_asset}"

headers="$("${curl_args[@]}" -D - -o /dev/null "${base}${hash_asset}")"
grep -qi '^Cache-Control: public, immutable' <<<"${headers}"
headers="$("${curl_args[@]}" -D - -o /dev/null "${base}/games/milton-estates${hash_asset}")"
grep -qi '^Cache-Control: public, immutable' <<<"${headers}"

stable="/assets/creek-clubhouse/clubhouse-complete.png"
headers="$("${curl_args[@]}" -D - -o /dev/null "${base}${stable}")"
grep -qi '^Cache-Control: no-cache' <<<"${headers}"
headers="$("${curl_args[@]}" -D - -o /dev/null "${base}/games/milton-estates${stable}")"
grep -qi '^Cache-Control: no-cache' <<<"${headers}"

status_code() { curl -sS --retry 10 --retry-delay 1 --retry-connrefused -o /dev/null -w '%{http_code}' "$@"; }
test "$(status_code "${base}/missing.json")" = 404
test "$(status_code "${base}/missing.mp3")" = 404
test "$(status_code "${base}/games/milton-estates/missing.json")" = 404
test "$(status_code -H 'Accept: text/html' "${base}/games/milton-estates/quest/intro")" = 200
test "$(status_code -H 'Accept: application/json' "${base}/games/milton-estates/quest/intro")" = 404

echo "NGINX asset and navigation integration checks passed"
