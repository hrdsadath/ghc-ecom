#!/usr/bin/env bash
set -euo pipefail

: "${BASE_URL:?BASE_URL is required}"
: "${VARIANT_ID:?VARIANT_ID is required}"
: "${ADMIN_TOKEN:?ADMIN_TOKEN is required}"
: "${HDFC_WEBHOOK_USERNAME:?HDFC_WEBHOOK_USERNAME is required}"
: "${HDFC_WEBHOOK_PASSWORD:?HDFC_WEBHOOK_PASSWORD is required}"

mkdir -p artifacts

docker run --rm \
  -i \
  -u "$(id -u):$(id -g)" \
  -v "$PWD/artifacts:/artifacts" \
  -e BASE_URL \
  -e VARIANT_ID \
  -e ADMIN_TOKEN \
  -e HDFC_WEBHOOK_USERNAME \
  -e HDFC_WEBHOOK_PASSWORD \
  -e DURATION \
  -e CATALOGUE_VUS \
  -e CHECKOUT_VUS \
  -e WEBHOOK_RPS \
  -e ADMIN_VUS \
  grafana/k6:latest run \
  --summary-export=/artifacts/k6-summary.json \
  - < test/load/ecommerce.js
