#!/usr/bin/env bash
# Create (or update) the GitHub release for TAG from its CHANGELOG.md section and upload the files in DIR.
# Only the newest version is marked "Latest", so publishing or backfilling an older one never moves it.
#   .github/scripts/github-release.sh cli-v0.5.3 dist
set -euo pipefail
tag="$1"; dir="$2"
echo "$tag" | grep -Eqx 'cli-v[0-9]+\.[0-9]+\.[0-9]+' || { echo "::error::bad tag $tag"; exit 1; }
v="${tag#cli-v}"
newest=$(git tag -l 'cli-v*' | sed 's/^cli-v//' | sort -V | tail -1)
latest=false
[ "$v" = "$newest" ] && latest=true
if ! gh release view "$tag" >/dev/null 2>&1; then
  awk -v v="$v" '$0 ~ "^## "v" " {on=1; next} /^## / {on=0} on' CHANGELOG.md > notes.md
  printf '\n`pip install -U verfy` or `verfy update`. Check a file: `sha256sum -c SHA256SUMS --ignore-missing`, then `python -m sigstore verify github FILE --bundle FILE.sigstore.json --repository %s`.\n' "$GITHUB_REPOSITORY" >> notes.md
  gh release create "$tag" --title "Verfy CLI $v" --notes-file notes.md --verify-tag --latest="$latest"
elif [ "$latest" = true ]; then
  gh release edit "$tag" --latest
fi
ls -l "$dir"
gh release upload "$tag" "$dir"/* --clobber
