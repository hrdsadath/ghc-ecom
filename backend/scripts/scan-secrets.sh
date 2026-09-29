#!/usr/bin/env bash
set -euo pipefail

repository_root="$(git rev-parse --show-toplevel)"
cd "$repository_root"

if git grep -n -I -E \
  '(SUPABASE_SERVICE_ROLE_KEY|HDFC_API_KEY|HDFC_WEBHOOK_PASSWORD)[[:space:]]*[:=][[:space:]]*[^"$<{[:space:]]{8,}' \
  -- 'src/**' 'public/**' ':!**/*.map'; then
  echo "Potential backend secret found in frontend source."
  exit 1
fi

if git grep -n -I -E \
  '(service_role[[:space:]]*:[[:space:]]*eyJ[A-Za-z0-9._-]{40,}|rzp_live_[A-Za-z0-9]{14,})' \
  -- . ':!**/package-lock.json' ':!**/*.map'; then
  echo "Potential production credential found in tracked files."
  exit 1
fi

if git log -p --all -- . ':!**/package-lock.json' ':!**/*.map' |
  grep -E '(rzp_live_[A-Za-z0-9]{14,}|service_role[^[:space:]]{0,20}eyJ[A-Za-z0-9._-]{40,})' >/dev/null; then
  echo "Potential production credential found in Git history."
  exit 1
fi

echo "No frontend service secrets or tracked live-key patterns found."
