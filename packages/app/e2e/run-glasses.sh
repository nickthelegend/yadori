#!/usr/bin/env bash
# Uses the existing managed server; its caller owns the heavy-run slot.
set -euo pipefail
cd "$(dirname "$0")/.."
exec node e2e/run-glasses.mjs
