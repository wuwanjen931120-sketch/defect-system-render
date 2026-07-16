#!/usr/bin/env bash
set -euo pipefail

echo "Cleaning stale node_modules..."
rm -rf node_modules

echo "Installing locked dependencies with npm ci..."
npm ci --no-audit --no-fund
