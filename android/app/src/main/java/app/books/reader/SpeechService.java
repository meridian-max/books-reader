package app.books.reader;

import android.app.*;
import android.content.*;
import android.media.*;
import android.media.session.*;
import android.os.*;
import android.speech.tts.*;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.text.BreakIterator;
import java.util.*;

/** Owns the complete speech queue so playback does not depend on WebView timers. */
public class SpeechService extends Service {
 public static volatile boolean active=false;
 private static final class Chunk { final String text;final int location;Chunk(String t,int l){text=t;location=l;} }
 private final ArrayList<Chunk> chunks=new ArrayList<>();
 private final Handler main=new Handler(Looper.getMainLooper());
 private TextToSpeech tts;private boolean ready,paused=true,voiceConfigured;private int index,generation,engineGeneration;private String engine="";private Runnable initTimeout;
 private float rate=1,pitch=1;private String title="Books",voice="",bookId="";private long sleepAt;
 private MediaSession media;private PowerManager.WakeLock wake;private AudioManager audio;private AudioFocusRequest focus;
 private final Runnable sleep=()->stopSelf();
 @Override public void onCreate(){
  super.onCreate();getSystemService(NotificationManager.class).createNotificationChannel(new NotificationChannel("books-speech","Read aloud",NotificationManager.IMPORTANCE_LOW));
  media=new MediaSession(this,"Books");media.setCallback(new MediaSession.Callback(){
   @Override public void onPlay(){control("resume");}@Override public void onPause(){control("pause");}
   @Override public void onSkipToNext(){control("next");}@Override public void onSkipToPrevious(){control("previous");}@Override public void onStop(){stopSelf();}
  });media.setActive(true);
  wake=((PowerManager)getSystemService(POWER_SERVICE)).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"Books:speech");
  audio=(AudioManager)getSystemService(AUDIO_SERVICE);
  focus=new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN).setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build()).setOnAudioFocusChangeListener(change->{if(change<0)control("pause");}).build();
 }
 private void initialize(String selected){
  ready=false;engine=selected;final int token=++engineGeneration;
  if(tts!=null){tts.stop();tts.shutdown();}
  if(initTimeout!=null)main.removeCallbacks(initTimeout);
  initTimeout=()->{if(token==engineGeneration){broadcast("error","Voice provider did not respond. Open its app to finish setup, then try again.");stopSelf();}};
  main.postDelayed(initTimeout,30000);
  tts=new TextToSpeech(this,status->main.post(()->{if(token!=engineGeneration)return;main.removeCallbacks(initTimeout);ready=status==TextToSpeech.SUCCESS;if(!ready){broadcast("error","Android could not initialize the text-to-speech engine.");stopSelf();return;}
   tts.setOnUtteranceProgressListener(new UtteranceProgressListener(){
    @Override public void onStart(String id){main.post(()->{if(current(id)&&!paused)update("playing");});}
    @Override public void onRangeStart(String id,int start,int end,int frame){main.post(()->{if(current(id)&&!paused&&index<chunks.size()){Chunk c=chunks.get(index);sendBroadcast(new Intent("app.books.reader.SPEECH_EVENT").setPackage(getPackageName()).putExtra("state","range").putExtra("bookId",bookId).putExtra("location",c.location).putExtra("text",c.text).putExtra("rangeStart",start).putExtra("rangeEnd",end));}});}
    @Override public void onDone(String id){main.post(()->{if(current(id)&&!paused){index++;speak();}});}
    @Override public void onError(String id){onError(id,TextToSpeech.ERROR);}
    @Override public void onError(String id,int error){main.post(()->{if(current(id)){broadcast("error","Speech engine error "+error+". Choose an installed voice in Android text-to-speech settings.");stopSelf();}});}
   });if(!chunks.isEmpty()&&!paused)speak();
  }),engine);
 }
 private boolean current(String id){return (generation+":"+index).equals(id);}
 @Override public int onStartCommand(Intent intent,int flags,int start){
  if(intent==null)return START_NOT_STICKY;
  if(!"speak".equals(intent.getAction())){control(intent.getAction());return START_NOT_STICKY;}
  generation++;if(tts!=null)tts.stop();chunks.clear();voiceConfigured=false;index=0;paused=false;active=true;
  title=intent.getStringExtra("title");voice=intent.getStringExtra("voice");bookId=intent.getStringExtra("bookId");rate=intent.getFloatExtra("rate",1);pitch=intent.getFloatExtra("pitch",1);sleepAt=intent.getLongExtra("sleepAt",0);
  startForeground(1,notification());
  try{
   String path=intent.getStringExtra("queueFile");
   if(path!=null){File file=new File(path);if(!file.getCanonicalPath().startsWith(getCacheDir().getCanonicalPath()+File.separator))throw new IOException("Invalid speech queue.");JSONArray sections;try(InputStream in=new FileInputStream(file)){sections=new JSONArray(new String(readAll(in,32*1024*1024),StandardCharsets.UTF_8));}finally{file.delete();}for(int i=0;i<sections.length();i++){JSONObject s=sections.getJSONObject(i);append(s.optString("text"),s.optInt("location",i));}}
   else append(intent.getStringExtra("text"),intent.getIntExtra("location",0));
   if(chunks.isEmpty()){broadcast("error","This book has no text to read aloud.");stopSelf();return START_NOT_STICKY;}
   main.removeCallbacks(sleep);if(sleepAt>0)main.postDelayed(sleep,Math.max(0,sleepAt-System.currentTimeMillis()));
   update("loading");String selected=SpeechVoices.engine(this,intent.getStringExtra("engine"));if(tts==null||!selected.equals(engine))initialize(selected);else if(ready)speak();
  }catch(Exception error){broadcast("error",error.getMessage());stopSelf();}
  return START_NOT_STICKY;
 }
 private static byte[] readAll(InputStream in,int limit)throws IOException{ByteArrayOutputStream bytes=new ByteArrayOutputStream();byte[] buffer=new byte[32768];int n;while((n=in.read(buffer))!=-1){if(bytes.size()+n>limit)throw new IOException("Speech queue exceeds 32 MB.");bytes.write(buffer,0,n);}return bytes.toByteArray();}
 private void append(String text,int location){
  if(text==null||text.isBlank())return;
  BreakIterator sentences=BreakIterator.getSentenceInstance();sentences.setText(text);int begin=sentences.first();
  for(int end=sentences.next();end!=BreakIterator.DONE;begin=end,end=sentences.next()){
   String sentence=text.substring(begin,end).trim();for(int offset=0;offset<sentence.length();){int stop=Math.min(offset+3000,sentence.length());if(stop<sentence.length()&&Character.isHighSurrogate(sentence.charAt(stop-1)))stop--;chunks.add(new Chunk(sentence.substring(offset,stop),location));offset=stop;}
   if(chunks.size()>200000)throw new IllegalArgumentException("This book has too many speech segments.");
  }
 }
 private void control(String action){
  if(action==null)return;
  switch(action){
   case "stop":stopSelf();return;
   case "pause":paused=true;generation++;if(tts!=null)tts.stop();if(wake.isHeld())wake.release();update("paused");return;
   case "toggle":control(paused?"resume":"pause");return;
   case "resume":if(index>=chunks.size())index=0;paused=false;speak();return;
   case "next":generation++;if(tts!=null)tts.stop();index=Math.min(index+1,chunks.size());paused=false;speak();return;
   case "previous":generation++;if(tts!=null)tts.stop();index=Math.max(0,index-1);paused=false;speak();return;
   case "nextChapter":case "previousChapter":int location=index<chunks.size()?chunks.get(index).location:-1;int direction=action.equals("nextChapter")?1:-1;do{index+=direction;}while(index>=0&&index<chunks.size()&&chunks.get(index).location==location);index=Math.max(0,index);generation++;if(tts!=null)tts.stop();paused=false;speak();return;
  }
 }
 private void speak(){
  if(!ready||paused)return;
  if(sleepAt>0&&System.currentTimeMillis()>=sleepAt){stopSelf();return;}
  if(index>=chunks.size()){broadcast("finished",null);stopSelf();return;}
  if(audio.requestAudioFocus(focus)!=AudioManager.AUDIOFOCUS_REQUEST_GRANTED){paused=true;update("paused");return;}
  if(!wake.isHeld())wake.acquire(6*60*60*1000L);
  tts.setSpeechRate(rate);tts.setPitch(pitch);
  try{if(!voiceConfigured){SpeechVoices.selectVoice(tts,voice);voiceConfigured=true;}}catch(IOException error){broadcast("error",error.getMessage());stopSelf();return;}
  int result=tts.speak(chunks.get(index).text,TextToSpeech.QUEUE_FLUSH,null,generation+":"+index);
  if(result==TextToSpeech.ERROR){broadcast("error","The speech engine could not start. Install a voice in Android settings.");stopSelf();}
 }
 private PendingIntent intent(String action,int code){return PendingIntent.getService(this,code,new Intent(this,SpeechService.class).setAction(action),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);}
 private Notification notification(){return new Notification.Builder(this,"books-speech").setSmallIcon(R.drawable.ic_books).setContentTitle(title==null?"Books":title).setContentText((paused?"Paused · ":"Reading aloud · ")+Math.min(index+1,chunks.size())+" / "+chunks.size()).setContentIntent(PendingIntent.getActivity(this,0,new Intent(this,MainActivity.class).putExtra("book",bookId),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE)).setOngoing(!paused).addAction(new Notification.Action.Builder(null,"Previous",intent("previous",1)).build()).addAction(new Notification.Action.Builder(null,paused?"Play":"Pause",intent("toggle",2)).build()).addAction(new Notification.Action.Builder(null,"Next",intent("next",3)).build()).addAction(new Notification.Action.Builder(null,"Stop",intent("stop",4)).build()).setStyle(new Notification.MediaStyle().setMediaSession(media.getSessionToken()).setShowActionsInCompactView(0,1,2)).build();}
 private void broadcast(String state,String error){Chunk c=index<chunks.size()?chunks.get(index):null;Intent event=new Intent("app.books.reader.SPEECH_EVENT").setPackage(getPackageName()).putExtra("state",state).putExtra("index",index).putExtra("count",chunks.size()).putExtra("location",c==null?-1:c.location).putExtra("bookId",bookId).putExtra("text",c==null?"":c.text).putExtra("error",error);sendBroadcast(event);}
 private void update(String state){broadcast(state,null);getSystemService(NotificationManager.class).notify(1,notification());media.setPlaybackState(new PlaybackState.Builder().setActions(PlaybackState.ACTION_PLAY|PlaybackState.ACTION_PAUSE|PlaybackState.ACTION_SKIP_TO_NEXT|PlaybackState.ACTION_SKIP_TO_PREVIOUS|PlaybackState.ACTION_STOP).setState(paused?PlaybackState.STATE_PAUSED:PlaybackState.STATE_PLAYING,index,1).build());media.setMetadata(new MediaMetadata.Builder().putString(MediaMetadata.METADATA_KEY_TITLE,title==null?"Books":title).build());}
 @Override public void onDestroy(){active=false;generation++;engineGeneration++;main.removeCallbacksAndMessages(null);broadcast("stopped",null);if(tts!=null){tts.stop();tts.shutdown();}if(wake!=null&&wake.isHeld())wake.release();if(media!=null){media.setActive(false);media.release();}if(audio!=null&&focus!=null)audio.abandonAudioFocusRequest(focus);stopForeground(STOP_FOREGROUND_REMOVE);super.onDestroy();}
 @Override public IBinder onBind(Intent intent){return null;}
}
