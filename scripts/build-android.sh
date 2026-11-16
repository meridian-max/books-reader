#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
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
cd android
./gradlew --no-daemon --max-workers=2 assembleDebug
mkdir -p ../releases
books_version="$(node -p 'JSON.parse(require("fs").readFileSync("../package.json", "utf8")).version')"
cp app/build/outputs/apk/debug/app-arm64-v8a-debug.apk "../releases/Books-${books_version}-debug.apk"
cp app/build/outputs/apk/debug/app-armeabi-v7a-debug.apk "../releases/Books-${books_version}-32bit.apk"
cp app/build/outputs/apk/debug/app-x86_64-debug.apk "../releases/Books-${books_version}-x86_64.apk"
sha256sum "../releases/Books-${books_version}-debug.apk"
