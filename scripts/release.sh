#!/bin/bash
# release.sh — bump version across all 3 files, commit, tag, push
# Usage: ./scripts/release.sh 0.7.2

set -e

VERSION="${1:?Usage: ./scripts/release.sh <version> (e.g. 0.7.2)}"
TAG="v${VERSION}"

echo "Bumping to ${VERSION}..."

# Bump package.json
sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"${VERSION}\"/" package.json

# Bump src-tauri/tauri.conf.json
sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"${VERSION}\"/" src-tauri/tauri.conf.json

# Bump src-tauri/Cargo.toml
sed -i "s/^version = \"[^\"]*\"/version = \"${VERSION}\"/" src-tauri/Cargo.toml

# Verify parity
pkg=$(grep '"version"' package.json | sed 's/.*"version": "\(.*\)".*/\1/')
tauri=$(grep '"version"' src-tauri/tauri.conf.json | sed 's/.*"version": "\(.*\)".*/\1/')
cargo=$(grep '^version' src-tauri/Cargo.toml | sed 's/.*"\(.*\)".*/\1/')

echo "package.json=${pkg}  tauri.conf.json=${tauri}  Cargo.toml=${cargo}"

if [ "$pkg" != "$VERSION" ] || [ "$tauri" != "$VERSION" ] || [ "$cargo" != "$VERSION" ]; then
  echo "ERROR: Version mismatch after bump!"
  exit 1
fi

echo "All 3 files match: ${VERSION}"
echo "Run: git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml"
echo "Then: git commit -m 'chore(release): ${TAG}'"
echo "Then: git push && git tag ${TAG} && git push origin ${TAG}"
