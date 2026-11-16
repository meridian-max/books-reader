import { isNative, native } from "./native";
import { icon, toast } from "./ui";
import { escapeHTML as E, type Settings } from "./types";
const BUNDLED = "app.books.reader";
const favorites = ["af_heart","af_bella","af_nicole","am_michael","bf_emma","bm_george"];
const voiceName=(name: string, engine: string)=>engine===BUNDLED ? name.slice(3,4).toUpperCase()+name.slice(4) : name;

type Voice = { name: string; language: string; network: boolean; quality: number; installed?: boolean };
type PackStatus = {state: "available"|"downloading"|"waiting"|"installing"|"installed"|"error";bytes:number;total:number;message:string};
type Engine = { name: string; label: string; default: boolean };
const samples: Record<string, string> = {
  en: "Every book opens a door. Find a voice that feels right for your next chapter.",
  hi: "हर किताब एक नई दुनिया का दरवाज़ा खोलती है। अपनी पसंद की आवाज़ में अगला अध्याय सुनिए।",
  es: "Cada libro abre una puerta. Encuentra una voz que te acompañe en el próximo capítulo.",
  fr: "Chaque livre ouvre une porte. Trouvez une voix qui vous accompagne dans le prochain chapitre.",
  de: "Jedes Buch öffnet eine Tür. Finde eine Stimme, die dich durch das nächste Kapitel begleitet.",
  pt: "Cada livro abre uma porta. Encontre uma voz para acompanhar você no próximo capítulo.",
  it: "Ogni libro apre una porta. Trova una voce che ti accompagni nel prossimo capitolo.",
  ru: "Каждая книга открывает дверь в новый мир. Выберите голос для следующей главы.",
  zh: "每一本书都打开了一扇门。选择你喜欢的声音，一起聆听下一个章节。",
  ja: "本を開くと、新しい世界が広がります。好きな声で、次の章を聞いてみましょう。",
  ko: "책은 새로운 세상을 열어 줍니다. 마음에 드는 목소리로 다음 장을 들어 보세요.",
  ar: "كل كتاب يفتح بابًا إلى عالم جديد. اختر صوتًا يناسبك للاستماع إلى الفصل التالي.",
  bn: "প্রতিটি বই একটি নতুন জগতের দরজা খুলে দেয়। আপনার পছন্দের কণ্ঠে পরের অধ্যায় শুনুন।",
  ta: "ஒவ்வொரு புத்தகமும் ஒரு புதிய உலகத்தைத் திறக்கிறது. உங்களுக்குப் பிடித்த குரலில் அடுத்த அத்தியாயத்தைக் கேளுங்கள்.",
  te: "ప్రతి పుస్తకం ఒక కొత్త ప్రపంచానికి తలుపు తెరుస్తుంది. మీకు నచ్చిన స్వరంలో తరువాతి అధ్యాయాన్ని వినండి.",
  mr: "प्रत्येक पुस्तक एका नव्या जगाचे दार उघडते. तुमच्या आवडत्या आवाजात पुढचा अध्याय ऐका.",
  id: "Setiap buku membuka pintu baru. Temukan suara yang cocok untuk menemani bab berikutnya.",
  tr: "Her kitap yeni bir kapı açar. Sonraki bölüm için sevdiğiniz bir ses seçin.",
  nl: "Elk boek opent een deur. Kies een stem die bij het volgende hoofdstuk past.",
  pl: "Każda książka otwiera nowe drzwi. Wybierz głos do następnego rozdziału.",
  uk: "Кожна книга відкриває двері у новий світ. Виберіть голос для наступного розділу.",
};

export function voicePickerHTML() {
  return `${isNative()?`<section class="voice-pack" aria-label="Optional offline voices"><div><strong>Natural voices</strong><p>49 voices · 7 languages · 132 MB</p></div><p id="voice-pack-status" role="status">Optional download. Use your phone’s voices below.</p><progress id="voice-pack-progress" aria-label="Voice pack download progress" max="132353410" value="0" hidden></progress><div class="voice-pack-actions"><button class="secondary" id="download-voice-pack">${icon("download",16)} Download voices</button><button class="subtle" id="cancel-voice-pack" hidden>Cancel</button></div></section>`:''}<div class="voice-focus"><span class="voice-monogram" aria-hidden="true">♪</span><div><strong id="voice-focus-name">Choose your voice</strong><small id="voice-focus-caption">A voice for every chapter</small></div></div>
    <div class="voice-fields"><label class="select-field"><span>Language</span><select id="tts-language"><option value="">All languages</option></select></label>
    <label class="select-field"><span>Voice</span><select id="tts-voice"><option value="">System default</option></select></label></div>
    <div class="voice-suggestions" role="group" aria-label="Quick voice choices"></div>
    <p class="voice-detail small" role="status" aria-live="polite">Loading installed voices…</p>
    <div class="speech-voice-actions"><button class="secondary" id="preview-voice" disabled>${icon("play",16)} Preview voice</button></div>
    <details class="voice-advanced voice-setup"><summary>Preview text &amp; voice providers ${icon("down",16)}</summary>
    <label class="voice-sample"><span>Try a sentence</span><textarea id="voice-sample" rows="3" maxlength="500" aria-label="Voice preview text">${samples.en}</textarea></label>
    ${isNative() ? '<label class="select-field"><span>Voice provider</span><select id="tts-engine"><option value="">Phone default</option></select></label><p class="small">Download the optional voice pack once to listen offline. First playback may take a few seconds to prepare. Your phone’s other providers remain available.</p><div class="voice-provider-tools"><button class="subtle" id="manage-voices">Download voice data</button><button class="subtle" id="refresh-voices">Refresh voices</button></div>' : ""}
    ${isNative() ? `<details class="free-voices"><summary>Add free voices</summary><p>Install a provider, open it to download voices, then return here and tap Refresh voices. Books has no voice subscription or API key.</p>
      <a href="https://github.com/speech-central/sc-voices-android" target="_blank" rel="noopener"><strong>SC Kokoro</strong><span>28 English neural voices, including Heart. Offline after a roughly 179 MB download. Requires Android 11+, ARM64 and a compatible GPU. Installation &amp; compatibility</span>${icon("external-link",16)}</a>
      <a href="https://play.google.com/store/apps/details?id=com.google.android.tts" target="_blank" rel="noopener"><strong>Google Speech</strong><span>Many languages and accents. Choose an offline voice after downloading its language data. Open Google Play</span>${icon("external-link",16)}</a>
      <a href="https://rhvoice.org/installation/" target="_blank" rel="noopener"><strong>RHVoice</strong><span>Free, open-source voices in multiple languages. Install the provider, then download a voice inside it. Installation guide</span>${icon("external-link",16)}</a>
      <a href="https://k2-fsa.github.io/sherpa/onnx/tts/apk-engine.html" target="_blank" rel="noopener"><strong>Sherpa / Kokoro / Piper</strong><span>Offline speech models for many languages. Choose an engine APK for your phone. Some speakers are chosen inside the provider app. Browse voice packs</span>${icon("external-link",16)}</a>
      <p>Availability, download size and speed depend on the provider, language and phone. Online voices send text to their provider. Keep pitch at 1 for the voice’s original sound.</p></details>` : ""}</details>`;
}

export function bindVoicePicker(m: HTMLElement, settings: Settings, persist: () => Promise<unknown>) {
  const voice = m.querySelector<HTMLSelectElement>("#tts-voice")!;
  const language = m.querySelector<HTMLSelectElement>("#tts-language")!;
  const engine = m.querySelector<HTMLSelectElement>("#tts-engine");
  const detail = m.querySelector<HTMLElement>(".voice-detail")!;
  const sample = m.querySelector<HTMLTextAreaElement>("#voice-sample")!;
  const preview = m.querySelector<HTMLButtonElement>("#preview-voice")!;
  const start = m.querySelector<HTMLButtonElement>("#start-speech")!;
  let voices: Voice[] = [], generation = 0, previewGeneration = 0, previewing = false, closed = false, customized = false;
  let pack: PackStatus | undefined, packTimer: ReturnType<typeof setTimeout> | undefined;
  const packButton=m.querySelector<HTMLButtonElement>('#download-voice-pack');
  const packCancel=m.querySelector<HTMLButtonElement>('#cancel-voice-pack');
  const packProgress=m.querySelector<HTMLProgressElement>('#voice-pack-progress');
  const packMessage=m.querySelector<HTMLElement>('#voice-pack-status');
  const names = new Intl.DisplayNames([navigator.language], { type: "language" });
  const languageName = (code: string) => { try { return names.of(code) ?? code; } catch { return code; } };
  const save = () => { void persist().catch(error => toast(error.message, true)); };
  const stop = async () => {
    previewGeneration++;
    if (previewing) { previewing = false; if (isNative()) await native("stopVoicePreview").catch(() => {}); else speechSynthesis.cancel(); }
    preview.innerHTML = `${icon("play", 16)} Preview voice`;
  };
  const describe = () => {
    const selected = voices.find(v => v.name === voice.value);
    const bundled = settings.ttsEngine===BUNDLED;
    m.querySelector('#voice-focus-name')!.textContent=selected ? voiceName(selected.name,settings.ttsEngine) : 'Default voice';
    m.querySelector('#voice-focus-caption')!.textContent=selected ? `${languageName(selected.language)} · ${bundled ? (pack?.state==='installed'?'Downloaded voice':'Download required') : selected.network ? 'Online voice' : 'Offline voice'}` : 'Your provider’s preferred voice';
    m.querySelector('.voice-monogram')!.textContent=selected ? voiceName(selected.name,settings.ttsEngine).slice(0,1) : '♪';
    m.querySelectorAll<HTMLElement>('[data-quick-voice]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.quickVoice===voice.value)));
    m.querySelector<HTMLButtonElement>('#manage-voices')?.toggleAttribute('hidden',bundled);
    detail.textContent = selected ? `${languageName(selected.language)} · ${selected.installed === false ? "Download required" : selected.network ? "Needs internet; text is sent to the provider" : "Works offline"}${bundled ? " · Neural voice" : selected.quality >= 400 ? " · High quality (provider rating)" : ""}` : `${voices.length} voices available. Uses this provider’s default voice.`;
    preview.disabled = start.disabled = selected?.installed === false || (bundled && pack?.state!=='installed') || (!!voices.length && !voices.some(v=>v.installed!==false));
    if (!customized) {
      const code = (selected?.language || language.value || navigator.language).split(/[-_]/)[0];
      sample.value = samples[code] || "";
      sample.placeholder = sample.value ? "" : "Type a sentence in this voice’s language to try it.";
    }
  };
  const refresh = (chooseFirst = false) => {
    const filtered = voices.filter(v => !language.value || v.language === language.value);
    voice.replaceChildren(new Option("System default", ""));
    for (const v of filtered) voice.add(new Option(`${voiceName(v.name,settings.ttsEngine)}${language.value ? "" : ` · ${languageName(v.language)}`}${v.installed === false ? " · Download required" : v.network ? " · Online" : ""}`, v.name));
    voice.value = settings.ttsVoice;
    if (voice.selectedIndex < 0 || chooseFirst) {
      voice.value = chooseFirst ? (filtered.find(v => v.installed !== false && favorites.includes(v.name))?.name ?? filtered.find(v => v.installed !== false)?.name ?? "") : "";
      settings.ttsVoice = voice.value; save();
    }
    const featured=[...filtered].sort((a,b)=>(favorites.includes(a.name)?favorites.indexOf(a.name):99)-(favorites.includes(b.name)?favorites.indexOf(b.name):99)).filter(v=>v.installed!==false).slice(0,6);
    const quick=m.querySelector<HTMLElement>('.voice-suggestions')!;
    quick.hidden=settings.ttsEngine!==BUNDLED;
    quick.innerHTML=quick.hidden ? '' : featured.map(v=>`<button data-quick-voice="${E(v.name)}" aria-pressed="${voice.value===v.name}">${E(voiceName(v.name,settings.ttsEngine))}</button>`).join('');
    quick.querySelectorAll<HTMLElement>('[data-quick-voice]').forEach(b=>b.onclick=()=>{voice.value=b.dataset.quickVoice!;voice.dispatchEvent(new Event('change',{bubbles:true}))});
    describe();
    renderPack();
  };
  language.onchange = () => { void stop(); refresh(true); };
  voice.onchange = () => { void stop(); settings.ttsVoice = voice.value;if(settings.ttsEngine===BUNDLED)settings.ttsPackVoice=voice.value; save(); describe(); };
  sample.oninput = () => { customized = !!sample.value; };
  preview.onclick = async () => {
    if (previewing) { await stop(); return; }
    if (!sample.value.trim()) { sample.focus(); toast("Enter a sentence to preview this voice."); return; }
    previewing = true; const token = ++previewGeneration;
    preview.innerHTML = `${icon("square",16)} Stop preview`;
    try {
      if (isNative()) await native("previewVoice", { text: sample.value, engine: settings.ttsEngine, voice: settings.ttsVoice, rate: settings.ttsRate, pitch: settings.ttsPitch });
      else await new Promise<void>((resolve, reject) => {
        speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(sample.value);
        utterance.voice = speechSynthesis.getVoices().find(v => v.name === settings.ttsVoice) ?? null;
        utterance.rate = settings.ttsRate; utterance.pitch = settings.ttsPitch;
        utterance.onend = () => resolve(); utterance.onerror = event => event.error === "canceled" || event.error === "interrupted" ? resolve() : reject(Error("This voice could not play. Try another voice."));
        speechSynthesis.speak(utterance);
      });
    } catch (error) { if (!closed && token === previewGeneration) toast((error as Error).message, true); }
    finally { if (token === previewGeneration) { previewing = false; preview.innerHTML = `${icon("play",16)} Preview voice`; } }
  };
  const load = async (reloadEngines = false) => {
    const token = ++generation;
    await stop(); start.disabled = preview.disabled = voice.disabled = language.disabled = true;
    detail.textContent = "Loading installed voices…";
    try {
      if (isNative() && reloadEngines && engine) {
        const engines: Engine[] = await native("voiceEngines");
        if (closed || token !== generation) return;
        if(pack?.state==='installed'&&(!settings.ttsEngine&&!settings.ttsVoice||settings.ttsPackAutoUse)&&engines.some(e=>e.name===BUNDLED)) { settings.ttsEngine=BUNDLED;settings.ttsVoice=settings.ttsPackVoice||'af_heart';settings.ttsPackAutoUse=false;save(); }
        if(pack?.state!=='installed'&&settings.ttsEngine===BUNDLED){settings.ttsPackVoice=settings.ttsVoice||settings.ttsPackVoice||'af_heart';settings.ttsEngine='';settings.ttsVoice='';save();}
        const label = engines.find(e => e.default)?.label;
        engine.replaceChildren(new Option(label ? `Phone default (${label})` : "Phone default", ""));
        for (const e of engines.sort((a,b) => a.label.localeCompare(b.label))) engine.add(new Option(e.label, e.name));
        if (settings.ttsEngine && !engines.some(e => e.name === settings.ttsEngine)) engine.add(new Option("Saved provider — not installed", settings.ttsEngine));
        engine.value = settings.ttsEngine || "";
      }
      if (!isNative() && !speechSynthesis.getVoices().length) await new Promise<void>(resolve => {
        const done = () => { clearTimeout(timer); speechSynthesis.removeEventListener("voiceschanged", done); resolve(); };
        const timer = setTimeout(done, 1200); speechSynthesis.addEventListener("voiceschanged", done);
      });
      const loaded: Voice[] = isNative() ? await native("voices", { engine: settings.ttsEngine }) : speechSynthesis.getVoices().map(v => ({ name:v.name, language:v.lang, network:!v.localService, quality:0 }));
      if (closed || token !== generation) return;
      voices = loaded.sort((a,b) => (a.name==='af_heart'?-1:b.name==='af_heart'?1:0) || Number(a.installed === false) - Number(b.installed === false) || b.quality - a.quality || Number(a.network) - Number(b.network) || a.name.localeCompare(b.name));
      const previousLanguage = voices.find(v => v.name === settings.ttsVoice)?.language ?? language.value;
      language.replaceChildren(new Option("All languages", ""));
      for (const code of [...new Set(voices.map(v => v.language))].sort((a,b) => languageName(a).localeCompare(languageName(b)))) language.add(new Option(languageName(code), code));
      language.value = previousLanguage; if (language.selectedIndex < 0) language.value = "";
      voice.disabled = language.disabled = false; refresh();
      if (!voices.length) detail.textContent = "No voices reported. Download voice data, then refresh. The provider’s default may still work.";
    } catch (error) { if (!closed && token === generation) detail.textContent = (error as Error).message; }
  };
  if (engine) engine.onchange = () => { settings.ttsPackAutoUse=false;settings.ttsEngine = engine.value; settings.ttsVoice = engine.value===BUNDLED ? (settings.ttsPackVoice||"af_heart") : ""; language.value = ""; save(); void load(); };
  m.querySelector("#refresh-voices")?.addEventListener("click", () => void load(true));
  m.querySelector("#manage-voices")?.addEventListener("click", async () => { await stop(); void native("voiceData", { engine: settings.ttsEngine }).catch(error => toast(error.message, true)); });
  m.addEventListener("modalclose", () => { clearTimeout(packTimer);closed = true; generation++; void stop(); }, { once:true });
  const renderPack=()=>{
    if(!packButton||!packCancel||!packProgress||!packMessage)return;
    const state=pack?.state??'available',busy=['downloading','waiting','installing'].includes(state);
    packButton.hidden=busy||(state==='installed'&&settings.ttsEngine===BUNDLED);
    packCancel.hidden=!busy;
    packProgress.hidden=!busy;
    if(state==='installing')packProgress.removeAttribute('value');else{packProgress.max=pack?.total||132353410;packProgress.value=pack?.bytes||0;}
    packButton.textContent=state==='installed'?'Use downloaded voices':state==='error'?'Retry download':'Download voices · 132 MB';
    packMessage.textContent=state==='installed'?'All 49 voices are ready offline.':state==='downloading'?`Downloading ${(Math.max(0,pack?.bytes||0)/1e6).toFixed(1)} / 132 MB…`:state==='available'?'Optional download. Use your phone’s voices below.':pack?.message||'Preparing offline voices…';
  };
  const activatePack=async()=>{settings.ttsEngine=BUNDLED;settings.ttsVoice=settings.ttsPackVoice||'af_heart';settings.ttsPackAutoUse=false;await persist();await load(true);};
  const schedulePack=()=>{clearTimeout(packTimer);if(!closed&&['downloading','waiting','installing'].includes(pack?.state??''))packTimer=setTimeout(()=>void readPack(),1500);};
  const readPack=async(initial=false)=>{
    try{
      const previous=pack?.state;
      const status: PackStatus=await native('voicePackStatus');
      if(closed)return;
      if(!status||typeof status.state!=='string')throw Error('Voice download information is unavailable. Try again.');
      pack=status;renderPack();
      if(!initial&&status.state==='installed'&&previous!=='installed'){
        if(settings.ttsPackAutoUse)await activatePack();else await load(true);
      }
    }catch(error){if(!closed){pack={state:'error',bytes:0,total:132353410,message:(error as Error).message};renderPack();}}
    schedulePack();
  };
  if(packButton)packButton.onclick=async()=>{
    if(pack?.state==='installed'){await activatePack();return;}
    packButton.disabled=true;
    try{settings.ttsPackAutoUse=true;await persist();pack=await native('voicePackDownload');if(!closed){renderPack();schedulePack();}}
    catch(error){if(!closed){pack={state:'error',bytes:0,total:132353410,message:(error as Error).message};renderPack();}}
    finally{packButton.disabled=false;}
  };
  if(packCancel)packCancel.onclick=async()=>{
    packCancel.disabled=true;
    try{settings.ttsPackAutoUse=false;await persist();pack=await native('voicePackCancel');if(!closed){renderPack();schedulePack();}}
    catch(error){toast((error as Error).message,true);}finally{packCancel.disabled=false;}
  };
  return { ready: (async()=>{if(isNative())await readPack(true);await load(true)})(), stop };

}
