#!/usr/bin/env bash
set -euo pipefail

echo "Using public npm registry..."
npm config set registry https://registry.npmjs.org/

echo "Cleaning stale node_modules..."
rm -rf node_modules

echo "Installing locked dependencies with npm ci..."
npm ci --no-audit --no-fund
