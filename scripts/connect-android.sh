#!/usr/bin/env bash
set -euo pipefail
books_sdk="${ANDROID_HOME:-/home/divyansh/Downloads/Rishikes/rishikesh-mobile/native-builds/local-toolchain/android-sdk}"
books_serial="${BOOKS_ADB_SERIAL:-emulator-5570}"
books_socket=""
for books_attempt in {1..50}; do
 books_pid="$("$books_sdk/platform-tools/adb" -s "$books_serial" shell pidof app.books.reader | tr -d '\r' || true)"
 books_socket="$("$books_sdk/platform-tools/adb" -s "$books_serial" shell cat /proc/net/unix | rg -o "@webview_devtools_remote_${books_pid}$" || true)"
 [[ -n "$books_socket" ]] && break
 sleep .1
done
[[ -n "$books_socket" ]] || { echo 'Open the Books debug app before connecting.' >&2; exit 1; }
"$books_sdk/platform-tools/adb" -s "$books_serial" forward tcp:9228 "localabstract:${books_socket#@}"
