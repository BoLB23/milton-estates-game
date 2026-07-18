#!/usr/bin/env bash
# Start the local Vite development server without using an npm package-script wrapper.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project_root="$(cd "${script_dir}/.." && pwd)"
cd "${project_root}"

if [[ ! -x node_modules/.bin/vite ]]; then
  echo "Project dependencies are missing. Install them first with: npm install" >&2
  exit 1
fi

host="${HOST:-127.0.0.1}"
port="${PORT:-5173}"

echo "Starting Milton Estates at http://${host}:${port}"
exec node_modules/.bin/vite --host "${host}" --port "${port}" --strictPort
