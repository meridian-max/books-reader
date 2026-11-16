#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p releases
books_version="$(node -p 'JSON.parse(require("fs").readFileSync("package.json", "utf8")).version')"
books_source_target="releases/Books-${books_version}-source.tar.gz"
books_source_tmp="$(mktemp releases/.Books-source.XXXXXX)"
trap 'rm -f -- "$books_source_tmp"' EXIT
tar -czf "$books_source_tmp" \
 --exclude='vendor/foliate-js/.git' \
 --exclude='android/.gradle' --exclude='android/build' --exclude='android/app/build' \
 --exclude='android/app/voice-assets' --exclude='android/app/src/main/assets' --exclude='android/local.properties' \
 --exclude='public/engines' --exclude='public/foliate' \
 README.md DESIGN.md LICENSE THIRD-PARTY-NOTICES.md .gitignore \
 package.json package-lock.json tsconfig.json vite.config.ts playwright.config.ts index.html \
 src scripts public vendor android tests docs
mv -- "$books_source_tmp" "$books_source_target"
sha256sum "releases/Books-${books_version}-debug.apk" "releases/Books-${books_version}-32bit.apk" "releases/Books-${books_version}-x86_64.apk" "$books_source_target" > releases/SHA256SUMS.tmp
mv releases/SHA256SUMS.tmp releases/SHA256SUMS
