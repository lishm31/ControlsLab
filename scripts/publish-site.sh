#!/usr/bin/env bash
# Build Controls Lab and copy it into the portfolio site, which Vercel serves at
# https://lishamaganti.com/controls-lab/
#
# Expects the portfolio repo checked out next to this one:
#   ../lishamaganti-portfolio
# Afterwards, commit and push the portfolio repo to make it live.
set -euo pipefail

here="$(cd "$(dirname "$0")/.." && pwd)"
site="${PORTFOLIO_DIR:-$here/../lishamaganti-portfolio}"

if [ ! -f "$site/index.html" ]; then
  echo "Portfolio repo not found at $site" >&2
  echo "Clone it next to this repo, or set PORTFOLIO_DIR=/path/to/lishamaganti-portfolio" >&2
  exit 1
fi

cd "$here"
npm run build
rm -rf "$site/controls-lab"
cp -r dist "$site/controls-lab"
echo "Copied build to $site/controls-lab"
echo "Next: cd $site && git add controls-lab && git commit -m 'Update Controls Lab' && git push"
