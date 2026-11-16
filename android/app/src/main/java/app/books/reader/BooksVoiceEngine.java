package app.books.reader;

import android.media.AudioFormat;
import android.speech.tts.*;
import android.util.Log;
import com.k2fsa.sherpa.onnx.*;
import java.io.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicLong;

/** Downloaded model, bundled CPU inference. Android owns the synthesis thread; the WebView never runs the model. */
public final class BooksVoiceEngine extends TextToSpeechService {
 static final String DEFAULT_VOICE = "af_heart";
 private static final String[] SPEAKERS = ("af_alloy af_aoede af_bella af_heart af_jessica af_kore af_nicole af_nova af_river af_sarah af_sky am_adam am_echo am_eric am_fenrir am_liam am_michael am_onyx am_puck am_santa bf_alice bf_emma bf_isabella bf_lily bm_daniel bm_fable bm_george bm_lewis ef_dora em_alex ff_siwis hf_alpha hf_beta hm_omega hm_psi if_sara im_nicola jf_alpha jf_gongitsune jf_nezumi jf_tebukuro jm_kumo pf_dora pm_alex pm_santa zf_xiaobei zf_xiaoni zf_xiaoxiao zf_xiaoyi zm_yunjian zm_yunxi zm_yunxia zm_yunyang em_santa").split(" ");
 private static final Object modelLock = new Object(); // eSpeak has process-global state.
 private final AtomicLong cancellation = new AtomicLong();
 private OfflineTts model;
 private volatile String currentVoice = DEFAULT_VOICE;
 private volatile boolean destroyed;
 private static String language(String voice) {
  switch (voice.charAt(0)) {
   case 'b': return "en-GB"; case 'e': return "es-ES"; case 'f': return "fr-FR";
   case 'h': return "hi-IN"; case 'i': return "it-IT"; case 'p': return "pt-BR"; case 'z': return "zh-CN";
   default: return "en-US";
  }
 }
 private static String phonemes(String voice) {
  String tag = language(voice);
  if (tag.equals("zh-CN")) return ""; // Chinese lexicon; English words use the bundled lexicon.
  if (tag.equals("en-GB")) return "en";
  if (tag.equals("en-US")) return "en-us";
  if (tag.equals("pt-BR")) return "pt-br";
  return tag.substring(0,2);
 }
 private static int speaker(String name) {
  if (name == null) return -1;
  for (int i=0;i<SPEAKERS.length;i++) if (SPEAKERS[i].equals(name) && !name.startsWith("j")) return i;
  return -1; // Japanese requires a different phonemizer and is deliberately not advertised.
 }
 @Override public List<Voice> onGetVoices() {
  List<Voice> list = new ArrayList<>();
  for (String name : SPEAKERS) if (speaker(name)>=0) list.add(new Voice(name, Locale.forLanguageTag(language(name)), Voice.QUALITY_HIGH, Voice.LATENCY_NORMAL, false, VoicePack.installed(this)?Collections.emptySet():Collections.singleton(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED)));
  return list;
 }
 @Override public int onIsValidVoiceName(String name) { return speaker(name)>=0 ? TextToSpeech.SUCCESS : TextToSpeech.ERROR; }
 @Override public int onLoadVoice(String name) {
  if (speaker(name)<0||!VoicePack.installed(this)) return TextToSpeech.ERROR;
  currentVoice=name; return TextToSpeech.SUCCESS;
 }
 @Override protected String[] onGetLanguage() {
  Locale locale=Locale.forLanguageTag(language(currentVoice));
  return new String[]{locale.getISO3Language(),locale.getISO3Country(),""};
 }
 private static String forLanguage(String lang,String country) {
  for (String name:SPEAKERS) if (speaker(name)>=0) {
   Locale l=Locale.forLanguageTag(language(name));
   if ((l.getLanguage().equals(lang)||l.getISO3Language().equals(lang)) && (country.isEmpty()||l.getCountry().equals(country)||l.getISO3Country().equals(country))) return name;
  }
  return null;
 }
 @Override protected int onIsLanguageAvailable(String lang,String country,String variant) {
  if (forLanguage(lang,country)!=null) return TextToSpeech.LANG_COUNTRY_AVAILABLE;
  return forLanguage(lang,"")!=null ? TextToSpeech.LANG_AVAILABLE : TextToSpeech.LANG_NOT_SUPPORTED;
 }
 @Override public String onGetDefaultVoiceNameFor(String lang,String country,String variant) {
  String name=forLanguage(lang,country);
  if (name==null) name=forLanguage(lang,"");
  return name!=null && language(name).equals("en-US") ? DEFAULT_VOICE : name;
 }
 @Override protected int onLoadLanguage(String lang,String country,String variant) {
  String name=onGetDefaultVoiceNameFor(lang,country,variant);
  if (name!=null) currentVoice=name;
  return onIsLanguageAvailable(lang,country,variant);
 }
 private void initialize() throws IOException {
  if (model!=null) return;
  if(!VoicePack.installed(this))throw new IOException("Download offline voices from Read aloud first.");
  File root=VoicePack.root(this);
  String path=root.getAbsolutePath();
  OfflineTtsKokoroModelConfig kokoro=new OfflineTtsKokoroModelConfig();
  kokoro.setModel(path+"/model.int8.onnx"); kokoro.setVoices(path+"/voices.bin"); kokoro.setTokens(path+"/tokens.txt");
  kokoro.setDataDir(new File(root,"espeak-ng-data").getAbsolutePath());
  kokoro.setLexicon(path+"/lexicon-us-en.txt,"+path+"/lexicon-zh.txt");
  OfflineTtsModelConfig models=new OfflineTtsModelConfig();models.setKokoro(kokoro);models.setNumThreads(2);
  OfflineTtsConfig config=new OfflineTtsConfig();config.setModel(models);config.setMaxNumSentences(1);
  model=new OfflineTts(null,config);
  if(model.numSpeakers()<54) { model.release();model=null;throw new IOException("Offline voice files are incomplete"); }
 }
 @Override protected void onStop() { cancellation.incrementAndGet(); }
 @Override protected void onSynthesizeText(SynthesisRequest request,SynthesisCallback callback) {
  android.os.Process.setThreadPriority(android.os.Process.THREAD_PRIORITY_BACKGROUND);
  final long token=cancellation.get();
  synchronized(modelLock) {
   if(destroyed||token!=cancellation.get()) return;
   try {
    initialize();
    if(destroyed||token!=cancellation.get()) return;
    String name=request.getVoiceName();if(name==null||name.isEmpty()) name=currentVoice;
    int sid=speaker(name);if(sid<0) { callback.error(TextToSpeech.ERROR_INVALID_REQUEST);return; }
    float pitch=Math.max(.5f,Math.min(2f,request.getPitch()/100f));
    int rate=Math.round(model.sampleRate()*pitch);
    if(callback.start(rate,AudioFormat.ENCODING_PCM_16BIT,1)!=TextToSpeech.SUCCESS) return;
    GenerationConfig config=new GenerationConfig();config.setSid(sid);config.setSpeed(Math.max(.25f,Math.min(5f,request.getSpeechRate()/100f/pitch)));
    config.setExtra(Collections.singletonMap("lang",phonemes(name)));
    // Bound work and memory even for a long paragraph without punctuation. Each chunk
    // checks cancellation before inference and between PCM buffers; no UI-thread work.
    String text=request.getCharSequenceText().toString().trim();
    int offset=0;
    while(offset<text.length() && token==cancellation.get()&&!destroyed) {
     int end=Math.min(text.length(),offset+180);
     if(end<text.length()) {
      int space=text.lastIndexOf(' ',end);if(space>offset+60) end=space;
      else if(Character.isHighSurrogate(text.charAt(end-1))) end--;
     }
     String chunk=text.substring(offset,end).trim();offset=end;
     if(chunk.isEmpty()) continue;
     GeneratedAudio audio=model.generateWithConfig(chunk,config);
     float[] samples=audio.getSamples();
     if(samples.length==0) { callback.error(TextToSpeech.ERROR_SYNTHESIS);return; }
     byte[] buffer=new byte[Math.max(2,callback.getMaxBufferSize()/2*2)];
     for(int i=0;i<samples.length && token==cancellation.get()&&!destroyed;) {
      int count=Math.min(buffer.length/2,samples.length-i);
      for(int j=0;j<count;j++) { int pcm=Math.round(Math.max(-1f,Math.min(1f,samples[i++]))*32767);buffer[2*j]=(byte)pcm;buffer[2*j+1]=(byte)(pcm>>8); }
      if(callback.audioAvailable(buffer,0,count*2)!=TextToSpeech.SUCCESS) return;
     }
    }
    if(token==cancellation.get()&&!destroyed) callback.done();
   } catch(Exception|LinkageError error) {
    Log.e("BooksVoices","Offline speech failed",error);
    if(token==cancellation.get()&&!destroyed) callback.error(TextToSpeech.ERROR_SYNTHESIS);
   }
  }
 }
 @Override public void onDestroy() {
  destroyed=true;onStop();super.onDestroy();
  new Thread(()->{synchronized(modelLock){if(model!=null){model.release();model=null;}}},"books-voice-release").start();
 }
}
