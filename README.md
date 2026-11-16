# Books for Android

Books is an offline ebook reader for Android 9 or later. Package: `app.books.reader`. Version: 1.9.1 (10901).

Read DRM-free EPUB, PDF, comics and documents; keep highlights and bookmarks; customise fonts, themes and controls; listen with Android text-to-speech or an optional offline neural voice pack. The optional model pack is downloaded only on request. Reading requires no account. Google sign-in and Drive are not configured in this release.

## Build

Requires Node 22+, Java 17, Android SDK 36 and Build Tools 36. Set `ANDROID_HOME` and `JAVA_HOME` for your environment.

```sh
npm ci
npm run android
```

If needed, `python3 scripts/fetch-voices.py` restores the pinned Android voice runtime. Model weights are optional and are not needed to build the app. Debug APKs are placed in `releases/`.

For Google Play, supply your own upload key in a private properties file **outside this repository**:

```properties
storeFile=/absolute/path/to/your-upload-key.p12
storePassword=YOUR_PASSWORD
keyAlias=YOUR_ALIAS
keyPassword=YOUR_PASSWORD
```

```sh
BOOKS_SIGNING_PROPERTIES=/absolute/path/to/signing.properties bash scripts/build-play.sh
```

This produces `releases/Books-1.9.1-play.aab`. Release builds are not debuggable and use Android's document/folder picker, without all-files permission. Never commit or share signing keys or credentials. Google Play creates and manages its distribution signing key separately.

## Source and licenses

Original application code: AGPL-3.0-or-later. See [LICENSE](LICENSE) and [third-party notices](THIRD-PARTY-NOTICES.md) for full source locations and revisions of the reading and voice engines. Pinned modified Foliate and CHM sources, runtime build sources and the Gradle wrapper are included. Reference application code and assets are not included. This app is not affiliated with Moon+ Reader.

The four sample EPUBs retain Project Gutenberg notices. Optional online catalogs and downloaded books are subject to their providers' terms. Users should import books they are authorised to read.

## Privacy and support

[Privacy policy](https://meridian-max.github.io/books-reader/privacy.html). Support: developerg675@gmail.com.

Google Play listing and release approval are separate from local build validation. A production listing is not claimed by this repository.
