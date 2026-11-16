#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
: "${BOOKS_SIGNING_PROPERTIES:?Set BOOKS_SIGNING_PROPERTIES to the private signing properties file}"
if [[ ! -f "$BOOKS_SIGNING_PROPERTIES" ]]; then echo 'Signing properties file not found.' >&2; exit 1; fi
npm run build
rm -rf android/app/src/main/assets
mkdir -p android/app/src/main/assets
cp -R dist/. android/app/src/main/assets/
if [[ -z "${ANDROID_HOME:-}" ]]; then
  candidate="/home/divyansh/Downloads/Rishikes/rishikesh-mobile/native-builds/local-toolchain/android-sdk"
  if [[ -d "$candidate" ]]; then export ANDROID_HOME="$candidate"; else echo 'Set ANDROID_HOME to an Android SDK with API 36.' >&2; exit 1; fi
fi
if [[ -z "${JAVA_HOME:-}" ]] && [[ -d /home/divyansh/Downloads/Rishikes/rishikesh-mobile/native-builds/local-toolchain/java/jdk-17.0.20.1+1 ]]; then
 export JAVA_HOME="/home/divyansh/Downloads/Rishikes/rishikesh-mobile/native-builds/local-toolchain/java/jdk-17.0.20.1+1"
fi
(cd android && ./gradlew --no-daemon --max-workers=2 bundleRelease lintRelease)
books_version="$(node -p 'JSON.parse(require("fs").readFileSync("package.json", "utf8")).version')"
mkdir -p releases
cp android/app/build/outputs/bundle/release/app-release.aab "releases/Books-${books_version}-play.aab"
sha256sum "releases/Books-${books_version}-play.aab"
