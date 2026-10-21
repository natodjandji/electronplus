#!/usr/bin/env bash
# Deploys Electron Plus with the deploy service account's key. Run by the
# "Deploy" GitHub Actions workflow (.github/workflows/deploy.yml), or from
# any shell that holds the key.
#
#   scripts/deploy.sh check   sign in and show what the account can reach
#   scripts/deploy.sh api     the API, to Cloud Run (built by Cloud Build)
#   scripts/deploy.sh web     the storefront, to Firebase Hosting
#   scripts/deploy.sh rules   Firestore rules and indexes, Storage rules
#
# Needs the service account's JSON key, as is in GCP_SA_KEY_JSON (how the
# workflow passes its GitHub secret) or base64-encoded on one line in
# GCP_SA_KEY_BASE64. The web deploy also needs the storefront's production
# VITE_* values, from the environment or frontend/.env.production.
set -euo pipefail

PROJECT_ID="electronplus-ve"
REGION="us-central1"
API_SERVICE="electronplus-api"
FIREBASE_TOOLS="firebase-tools@15.32.1"
WEB_VARS=(
  VITE_API_BASE_URL
  VITE_FIREBASE_API_KEY
  VITE_FIREBASE_AUTH_DOMAIN
  VITE_FIREBASE_PROJECT_ID
  VITE_FIREBASE_STORAGE_BUCKET
  VITE_FIREBASE_MESSAGING_SENDER_ID
  VITE_FIREBASE_APP_ID
  VITE_PAYPAL_CLIENT_ID
  VITE_PUBLIC_SITE_URL
)

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

fail() {
  echo "deploy: $*" >&2
  exit 1
}

authenticate() {
  # Outside the repo, readable only by this user, so it can't be committed.
  local key_dir="$HOME/.config/electronplus"
  KEY_FILE="$key_dir/deploy-key.json"
  mkdir -p "$key_dir"
  if [[ -n "${GCP_SA_KEY_JSON:-}" ]]; then
    (umask 077 && printf '%s' "$GCP_SA_KEY_JSON" > "$KEY_FILE")
  elif [[ -n "${GCP_SA_KEY_BASE64:-}" ]]; then
    (umask 077 && printf '%s' "$GCP_SA_KEY_BASE64" | base64 -d > "$KEY_FILE") ||
      fail "GCP_SA_KEY_BASE64 is not valid base64."
  else
    fail "no deploy key — set GCP_SA_KEY_JSON or GCP_SA_KEY_BASE64."
  fi
  # A cloud session can set a placeholder access token, which gcloud would
  # use instead of the service account.
  unset CLOUDSDK_AUTH_ACCESS_TOKEN
  export GOOGLE_APPLICATION_CREDENTIALS="$KEY_FILE"
  gcloud auth activate-service-account --key-file="$KEY_FILE" --quiet >/dev/null
  gcloud config set project "$PROJECT_ID" --quiet >/dev/null 2>&1
  echo "deploy: signed in as $(gcloud config get-value account 2>/dev/null) on $PROJECT_ID"
}

firebase() {
  npx -y "$FIREBASE_TOOLS" --project "$PROJECT_ID" --non-interactive "$@"
}

check() {
  gcloud run services describe "$API_SERVICE" --region "$REGION" \
    --format="value(status.url,status.latestReadyRevisionName)"
  firebase hosting:sites:list
}

deploy_api() {
  # Cloud Build builds the Dockerfile; settings the command leaves out
  # (env vars, secrets, service account, scaling) stay as they are.
  gcloud run deploy "$API_SERVICE" --source . --region "$REGION" --quiet
}

deploy_web() {
  local env_file="frontend/.env.production" missing=()
  for name in "${WEB_VARS[@]}"; do
    if [[ -z "${!name:-}" ]] && ! grep -qE "^${name}=.+" "$env_file" 2>/dev/null; then
      missing+=("$name")
    fi
  done
  # A build without them still succeeds, and ships a storefront pointed at
  # localhost or without PayPal.
  ((${#missing[@]} == 0)) || fail "missing for the storefront build: ${missing[*]}"
  npm --prefix frontend ci --no-audit --no-fund
  npm --prefix frontend run build
  firebase deploy --only hosting
}

deploy_rules() {
  firebase deploy --only firestore:rules,firestore:indexes,storage
}

case "${1:-}" in
  check) authenticate && check ;;
  api) authenticate && deploy_api ;;
  web) authenticate && deploy_web ;;
  rules) authenticate && deploy_rules ;;
  *) fail "usage: scripts/deploy.sh check|api|web|rules" ;;
esac
