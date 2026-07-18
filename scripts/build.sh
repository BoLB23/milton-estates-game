#!/usr/bin/env bash
# Build Milton Estates without using an npm package-script wrapper.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project_root="$(cd "${script_dir}/.." && pwd)"
cd "${project_root}"

if [[ ! -x node_modules/.bin/tsc || ! -x node_modules/.bin/vite ]]; then
  echo "Project dependencies are missing. Install them first with: npm install" >&2
  exit 1
fi

node_modules/.bin/tsc -b
node_modules/.bin/vite build
