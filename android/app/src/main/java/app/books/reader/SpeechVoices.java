package app.books.reader;

import android.content.*;
import android.content.pm.*;
import android.os.*;
import android.provider.Settings;
import android.speech.tts.*;
import org.json.*;
import java.io.IOException;
import java.util.*;

/** Short-lived discovery/preview clients, independent of background book playback. */
final class SpeechVoices {
 private final MainActivity activity;
 private final Handler main = new Handler(Looper.getMainLooper());
 private final Set<Request> requests = new HashSet<>();
 private Request preview, discovery;
 SpeechVoices(MainActivity activity) { this.activity = activity; }

 static List<ResolveInfo> engines(Context context) {
  return context.getPackageManager().queryIntentServices(new Intent(TextToSpeech.Engine.INTENT_ACTION_TTS_SERVICE), PackageManager.MATCH_DEFAULT_ONLY);
 }
 static String engine(Context context, String requested) throws IOException {
  List<ResolveInfo> available=engines(context);
  if(requested!=null&&!requested.isEmpty()){
   for(ResolveInfo info:available)if(info.serviceInfo.packageName.equals(requested))return requested;
   throw new IOException("This voice provider is not installed. Choose another provider or install it and refresh voices.");
  }
  String phone=Settings.Secure.getString(context.getContentResolver(),Settings.Secure.TTS_DEFAULT_SYNTH);
  for(ResolveInfo info:available)if(info.serviceInfo.packageName.equals(phone)&&(!phone.equals(context.getPackageName())||VoicePack.installed(context)))return phone;
  for(ResolveInfo info:available)if(!info.serviceInfo.packageName.equals(context.getPackageName()))return info.serviceInfo.packageName;
  if(!available.isEmpty())return available.get(0).serviceInfo.packageName;
  throw new IOException("No voice provider is available.");
 }
 static void selectVoice(TextToSpeech tts, String name) throws IOException {
  if (name == null || name.isEmpty()) return;
  if (tts.getVoices() != null) for (Voice voice : tts.getVoices()) if (name.equals(voice.getName())) {
   if (voice.getFeatures().contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED)) throw new IOException("Download this voice in its provider app first.");
   if (tts.setVoice(voice) == TextToSpeech.SUCCESS) return;
   break;
  }
  throw new IOException("This voice is unavailable. Refresh voices and choose an installed voice.");
 }
 void listEngines(String id) throws Exception {
  JSONArray list = new JSONArray();
  String defaultEngine = Settings.Secure.getString(activity.getContentResolver(), Settings.Secure.TTS_DEFAULT_SYNTH);
  Set<String> seen = new HashSet<>();
  for (ResolveInfo info : engines(activity)) if (seen.add(info.serviceInfo.packageName)) list.put(new JSONObject()
   .put("name", info.serviceInfo.packageName).put("label", info.loadLabel(activity.getPackageManager()).toString())
   .put("default", info.serviceInfo.packageName.equals(defaultEngine)));
  activity.result(id, true, list);
 }
 void manage(String requested) throws Exception {
  String selected = engine(activity, requested);
  if(selected.equals(activity.getPackageName())){VoicePack.get(activity).start();return;}
  Intent install = new Intent(TextToSpeech.Engine.ACTION_INSTALL_TTS_DATA).setPackage(selected);
  if (install.resolveActivity(activity.getPackageManager()) != null) activity.startActivity(install);
  else {
   Intent launch = activity.getPackageManager().getLaunchIntentForPackage(selected);
   activity.startActivity(launch != null ? launch : new Intent("com.android.settings.TTS_SETTINGS"));
  }
 }
 void load(String id, JSONObject args, boolean isPreview) throws Exception {
  if (isPreview) stopPreview(); else if (discovery != null) discovery.finish(true, new JSONArray());
  String selected = engine(activity, args.optString("engine"));
  Request request = new Request(id);
  requests.add(request);
  if (isPreview) preview = request; else discovery = request;
  request.timeout = () -> request.finish(false, "The voice provider took too long. Open its app to finish downloading voices, then retry.");
  main.postDelayed(request.timeout, isPreview ? 90000 : 30000);
  // Posting also handles providers that call onInit before the constructor returns.
  request.tts = new TextToSpeech(activity, status -> main.post(() -> {
   if (request.done) return;
   try {
    if (status != TextToSpeech.SUCCESS) throw new IOException("The voice provider could not start. Open its app or choose another provider.");
    TextToSpeech tts = request.tts;
    if (!isPreview) {
     JSONArray list = new JSONArray();
     if (tts.getVoices() != null) for (Voice voice : tts.getVoices()) list.put(new JSONObject()
      .put("name", voice.getName()).put("language", voice.getLocale().toLanguageTag())
      .put("network", voice.isNetworkConnectionRequired()).put("quality", voice.getQuality()).put("latency", voice.getLatency())
      .put("installed", !voice.getFeatures().contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED)));
     request.finish(true, list);
    } else {
     if(selected.equals(activity.getPackageName())&&!VoicePack.installed(activity))throw new IOException("Tap Download voices in Read aloud first.");
     selectVoice(tts, args.optString("voice"));
     tts.setSpeechRate((float) args.optDouble("rate", 1));
     tts.setPitch((float) args.optDouble("pitch", 1));
     tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
      @Override public void onStart(String utterance) {}
      @Override public void onDone(String utterance) { main.post(() -> request.finish(true, true)); }
      @Override public void onError(String utterance) { main.post(() -> request.finish(false, "This voice could not play. Check its download or connection and try again.")); }
     });
     if (tts.speak(args.optString("text"), TextToSpeech.QUEUE_FLUSH, null, "books-preview") == TextToSpeech.ERROR)
      throw new IOException("This voice could not play. Choose another voice.");
    }
   } catch (Exception error) { request.finish(false, error.getMessage()); }
  }), selected);
 }
 void stopPreview() { if (preview != null) preview.finish(true, false); }
 void destroy() { for (Request request : new ArrayList<>(requests)) request.finish(true, false); }
 private final class Request {
  final String id; TextToSpeech tts; Runnable timeout; boolean done;
  Request(String id) { this.id = id; }
  void finish(boolean ok, Object value) {
   if (done) return;
   done = true; main.removeCallbacks(timeout); requests.remove(this);
   if (preview == this) preview = null;
   if (discovery == this) discovery = null;
   if (tts != null) { tts.stop(); tts.shutdown(); }
   activity.result(id, ok, value);
  }
 }
}
