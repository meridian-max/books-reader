# Pro reference inspection

On 2026-11-14, the developer's regional ARM64 Moon+ Reader Pro 10.8 APK was acquired from the official download page and statically inspected. Its APK signature verifies and the certificate matches the free reference. This is a regional distribution for paid Russian/Belarusian users, not a claim that the Google Play APK was acquired.

The [detailed report](../reference-pro/ANALYSIS.md) and [checked results](../reference-pro/analysis/verification.json) cover 27,168 DEX/smali class definitions, 12,847 approximate Java files, 108 high-level decompiler errors, lower-level fallback for all 75 listed problem entries, and 460 layout XML files. All eight native objects match the free input byte-for-byte; the prior native analysis was explicitly reused after hash checks. Pro has 575 native declarations, with 560 static associations and 15 unresolved.

The selected original smali comparison found the same normalized text in 2,585 of 2,628 shared class names; 43 class texts and 31 same-signature method texts differ. Several core reader classes are shared, while Pro changes configuration, ad/startup integration and TTS notification/service behavior. It also adds 26 bundled assets. Apparent differences in 28 decoded layout files all reflect unresolved free-split resource placeholders, so they do not establish rendered UI differences.

This pass did not change Books' APK or add proprietary reference source/assets to the app. It does not restore the original source project, establish all runtime behavior, or prove exact Pro parity. The local analysis archive and its read-back verification are in `releases/MoonReader-Pro-10.8-analysis.tar.gz` and `releases/MoonReader-Pro-10.8-analysis-verification.json`.
