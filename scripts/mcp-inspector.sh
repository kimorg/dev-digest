#!/usr/bin/env bash
#
# MCP Inspector for devdigest-mcp — manual, optional, never used by tests or CI.
#
#   ./scripts/mcp-inspector.sh          # web UI on 127.0.0.1:6274 (open the URL with the token it prints)
#   ./scripts/mcp-inspector.sh --tui    # any extra flags are passed to Inspector as is
#
# Launches mcp/inspector.json (tsx src/index.ts, requestTimeout 150 s). Installs mcp/ deps if missing and
# warns when the API is down. Starts only the MCP side: bring the API up first with ./scripts/dev.sh.
# Ctrl-C stops Inspector and the MCP server it spawned.

set -euo pipefail

INSPECTOR_VERSION="2.13.0"   # pinned: bare npx would resolve latest
API_URL="http://localhost:3001"   # must match env.DEVDIGEST_API_URL in mcp/inspector.json

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

case "${1:-}" in
  -h|--help) sed -n '2,10p' "$ROOT/scripts/mcp-inspector.sh" | sed 's/^# \{0,1\}//'; exit 0 ;;
esac

cd "$ROOT/mcp"

log()  { printf '\033[1;36m▸ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m! %s\033[0m\n' "$*"; }

# --- prerequisites: Inspector needs Node >= 22.19 ----------------------------
command -v node >/dev/null || { echo "node not found (need >= 22.19)"; exit 1; }
if ! node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>22||(a===22&&b>=19)?0:1)'; then
  echo "MCP Inspector needs Node >= 22.19 (found $(node -v))"; exit 1
fi

# --- mcp deps ----------------------------------------------------------------
if [ ! -x node_modules/.bin/tsx ]; then
  log "installing mcp/ dependencies (npm ci)"
  npm ci --no-audit --no-fund
fi

# --- API (tools need it; the UI itself starts without it) --------------------
if curl -fsS --max-time 2 "$API_URL/health" >/dev/null 2>&1; then
  log "API is up at $API_URL"
else
  warn "API is not reachable at $API_URL — tools will return errors. Start it with ./scripts/dev.sh --no-client"
fi

# --- Inspector ---------------------------------------------------------------
# Never DANGEROUSLY_OMIT_AUTH, never bind 0.0.0.0, no --catalog. run_agent_on_pr spends LLM credits.
log "MCP Inspector $INSPECTOR_VERSION — open the URL with the token printed below"
exec npx --yes "@modelcontextprotocol/inspector@$INSPECTOR_VERSION" --config inspector.json "$@"
