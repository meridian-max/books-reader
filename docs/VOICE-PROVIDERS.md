# Books voices — 1.6.1

Books includes the neural inference runtime in the small APK. In Read aloud, tap **Download voices · 132 MB** once to fetch all 49 Kokoro voices. No separate app, account, API key or subscription is required. Phone voices remain available while downloading. Android manages the transfer across app restarts; progress, cancel and retry appear in the sheet. After downloading, checksum verification and extraction happen automatically on a background worker. On first playback the model initializes on the synthesis thread. Downloaded voice text and generated audio stay on the device; inference uses the CPU.

The pack downloads 132,353,410 bytes and occupies about 193 MB on disk after extraction. Allow at least 350 MB free while preparing it; the compressed download is deleted after successful installation. If interrupted while preparing, opening Books resumes preparation. Pack data is private to Books and excluded from backups; restoring settings on another phone offers the download again. Older 1.6.0 voice selections are remembered while Books falls back to phone speech until the optional pack is ready. Network data charges can apply; the button shows the size before starting.

49 selectable voices: 20 American English, 8 British English, 3 Spanish, 1 French, 4 Hindi, 2 Italian, 3 Brazilian Portuguese and 8 Mandarin Chinese. This is seven languages and eight locale groups. After an explicitly requested download finishes, the previous Books voice (or Heart) is selected automatically. Existing explicit phone-provider choices are preserved when the pack was already installed. Named quick choices, language filtering, sample preview, speed, pitch and sleep timer are available. Japanese speakers in the upstream model are not offered: their required phonemization is not implemented.

The official upstream model archive now contains 54 speaker entries (its README adds Spanish `em_santa` at ID 53); older website documentation still lists 53. Books preserves those indices, excludes Japanese IDs 37–41, and checks the model's speaker count before synthesis. The model is quantized; voice quality and pronunciation differ by language. Synthesis completion tests do not establish a human listening quality score or performance on every Android phone.

Technical integration: `BooksVoiceEngine.java` implements an app-private Android TextToSpeechService in a separate process. Initialization and generation run on Android's synthesis thread at background priority, with two inference threads and bounded 180-character chunks. The shared lock serializes eSpeak's process-global state across service lifetimes. PCM is streamed through Android's TTS callback with cancellation checks. Existing SpeechService handles the full-book queue, audio focus, notification controls, pause/resume, chapter position and screen-off playback. Kokoro provides sentence-level progress; it does not supply per-word timing.

Other installed Android voice engines remain selectable under Preview text & voice providers. Online voices are labeled; those providers may receive book text. Optional official provider links remain for languages outside the downloaded set. Availability depends on the chosen provider/device.

## Pinned sources

- Runtime: https://github.com/k2-fsa/sherpa-onnx/releases/tag/v1.12.40
- Model: https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/kokoro-int8-multi-lang-v1_0.tar.bz2
- Model/voice reference: https://huggingface.co/hexgrad/Kokoro-82M
- Android integration: https://developer.android.com/reference/android/speech/tts/TextToSpeechService

Full runtime/model hashes are in `scripts/fetch-voices.py`; licenses, upstream sources and build recipes accompany the APK/source distribution. The app downloads from the fixed official HTTPS model URL, checks SHA-256 `72c347230107ef8a31098ec4d468a605244beef5f1ed00db97efa13518800653`, rejects unsafe archive entries and installs atomically into private `no_backup/voices/` storage. Locally fetched development data in `android/app/voice-assets` is excluded from the APK.
