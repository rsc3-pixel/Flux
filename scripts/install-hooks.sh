#!/usr/bin/env bash
# Installs a pre-commit hook that scans staged changes for common secret
# patterns and aborts the commit if any are found. Pure bash + git grep —
# no npm package, no gitleaks install required.
#
# Usage (run once after cloning):
#   bash scripts/install-hooks.sh
#
# To skip the check for one commit (NOT recommended):
#   git commit --no-verify ...

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
if [[ -z "$REPO_ROOT" ]]; then
  echo "✗ Run from inside the git repo." >&2
  exit 1
fi

HOOK_PATH="$REPO_ROOT/.git/hooks/pre-commit"

cat > "$HOOK_PATH" <<'HOOK_EOF'
#!/usr/bin/env bash
# Auto-installed by scripts/install-hooks.sh.
# Blocks commits that contain secret patterns. Edit the regex below to add
# or remove providers.

set -euo pipefail

# Regex patterns of common API keys / tokens. Add new providers here.
PATTERNS=(
  're_[A-Za-z0-9_]{20,}'                               # Resend
  'sk-[A-Za-z0-9]{20,}'                                # OpenAI
  'sk-ant-[A-Za-z0-9_-]{20,}'                          # Anthropic
  'ghp_[A-Za-z0-9]{36,}'                               # GitHub PAT (classic)
  'github_pat_[A-Za-z0-9_]{60,}'                       # GitHub fine-grained PAT
  'AKIA[0-9A-Z]{16}'                                   # AWS Access Key ID
  'xox[baprs]-[A-Za-z0-9-]{10,}'                       # Slack token
  '-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----'    # SSH/TLS private keys
)

# Files staged for commit (added/modified, not deleted)
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM)
if [[ -z "$STAGED_FILES" ]]; then
  exit 0
fi

FOUND=0
for pat in "${PATTERNS[@]}"; do
  # -E extended regex, -n line numbers, -I skip binary files
  matches=$(echo "$STAGED_FILES" | xargs --no-run-if-empty grep -EnIH "$pat" 2>/dev/null || true)
  if [[ -n "$matches" ]]; then
    if [[ $FOUND -eq 0 ]]; then
      echo "✗ Pre-commit: secret patterns found in staged files:" >&2
      echo "" >&2
    fi
    echo "  Pattern: $pat" >&2
    echo "$matches" | sed 's/^/    /' >&2
    echo "" >&2
    FOUND=1
  fi
done

if [[ $FOUND -ne 0 ]]; then
  echo "Aborting commit. To bypass (NOT recommended), use: git commit --no-verify" >&2
  exit 1
fi

exit 0
HOOK_EOF

chmod +x "$HOOK_PATH"
echo "✓ Installed pre-commit hook at $HOOK_PATH"
echo "  Scans staged files for: Resend, OpenAI, Anthropic, GitHub PAT, AWS, Slack, private keys."
echo "  Run 'git commit --no-verify ...' to bypass (use sparingly)."
