package app.books.reader;

import android.app.DownloadManager;
import android.content.*;
import android.database.Cursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import org.json.JSONObject;
import org.apache.commons.compress.archivers.tar.*;
import org.apache.commons.compress.compressors.bzip2.BZip2CompressorInputStream;
import java.io.*;
import java.security.MessageDigest;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicLong;

/** Optional data, never executable code. Android owns downloads across app restarts. */
final class VoicePack {
 static final String ARCHIVE_ROOT="kokoro-int8-multi-lang-v1_0";
 static final String SHA="72c347230107ef8a31098ec4d468a605244beef5f1ed00db97efa13518800653";
 static final long BYTES=132353410L;
 private static final String URL="https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/kokoro-int8-multi-lang-v1_0.tar.bz2";
 private static VoicePack instance;
 private final Context context;
 private final DownloadManager downloads;
 private final SharedPreferences prefs;
 private final ExecutorService worker=Executors.newSingleThreadExecutor();
 private final AtomicLong generation=new AtomicLong();
 private long installingToken=-1;
 private volatile String phase="";
 private VoicePack(Context c){context=c.getApplicationContext();downloads=context.getSystemService(DownloadManager.class);prefs=context.getSharedPreferences("voice-pack",0);worker.execute(()->{erase(new File(context.getFilesDir(),"kokoro-1.0-72c34723"));File parent=root(context).getParentFile();File[] files=parent.listFiles();if(files!=null)for(File f:files)if(f.getName().startsWith("preparing-"))erase(f);});}
 static synchronized VoicePack get(Context c){if(instance==null)instance=new VoicePack(c);return instance;}
 static File root(Context c){return new File(c.getNoBackupFilesDir(),"voices/kokoro-1.0-72c34723");}
 static boolean installed(Context c){File r=root(c);return new File(r,"ready").isFile()&&new File(r,"model.int8.onnx").length()==114202993L&&new File(r,"voices.bin").length()>26000000L;}
 synchronized JSONObject status() throws Exception {
  if(installed(context))return result("installed",BYTES,"");
  long id=prefs.getLong("download",-1);
  if(installingToken==generation.get()&&id>=0)return result("installing",BYTES,phase);
  if(id<0)return result(prefs.getString("state","available"),0,prefs.getString("message",""));
  try(Cursor cursor=downloads.query(new DownloadManager.Query().setFilterById(id))){
   if(cursor==null||!cursor.moveToFirst()){prefs.edit().remove("download").putString("state","available").apply();return result("available",0,"");}
   int status=cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
   long bytes=cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR));
   if(bytes>BYTES){cancel();return result("error",0,"The download size changed. Please retry later.");}
   if(status==DownloadManager.STATUS_SUCCESSFUL){
    long token=generation.get();installingToken=token;phase="Checking download…";worker.execute(()->install(id,token));
    return result("installing",BYTES,phase);
   }
   if(status==DownloadManager.STATUS_FAILED){int reason=cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON));return result("error",bytes,reason==DownloadManager.ERROR_INSUFFICIENT_SPACE?"Not enough storage. Free up space and retry.":"Download failed. Check your connection and tap Retry.");}
   if(status==DownloadManager.STATUS_PAUSED)return result("waiting",bytes,"Waiting for a connection. Download will resume automatically.");
   return result("downloading",bytes,"");
  }
 }
 private JSONObject result(String state,long bytes,String message)throws Exception{return new JSONObject().put("state",state).put("bytes",bytes).put("total",BYTES).put("voices",49).put("message",message);}
 synchronized JSONObject start() throws Exception {
  JSONObject current=status();String state=current.getString("state");
  if(state.equals("installed")||state.equals("downloading")||state.equals("waiting")||state.equals("installing"))return current;
  if(context.getNoBackupFilesDir().getUsableSpace()<350L*1024*1024)throw new IOException("Free at least 350 MB of storage to download and prepare the voices.");
  cancel();
  File destination=new File(context.getExternalFilesDir("voice-downloads"),"kokoro-"+java.util.UUID.randomUUID()+".tar.bz2");
  DownloadManager.Request request=new DownloadManager.Request(Uri.parse(URL)).setTitle("Books: offline voices").setDescription("49 voices · 132 MB").setAllowedOverMetered(true).setAllowedOverRoaming(false).setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED).setDestinationUri(Uri.fromFile(destination));
  long id=downloads.enqueue(request);
  prefs.edit().putLong("download",id).putString("state","downloading").remove("message").apply();
  return result("downloading",0,"");
 }
 synchronized JSONObject cancel() throws Exception {
  generation.incrementAndGet();long id=prefs.getLong("download",-1);if(id>=0)downloads.remove(id);
  prefs.edit().remove("download").putString("state","available").remove("message").apply();
  return result(installed(context)?"installed":"available",0,"");
 }
 private void check(long token)throws IOException{if(token!=generation.get()||Thread.currentThread().isInterrupted())throw new InterruptedIOException("Cancelled");}
 private InputStream open(long id)throws IOException{return new ParcelFileDescriptor.AutoCloseInputStream(downloads.openDownloadedFile(id));}
 private void install(long id,long token){
  File destination=root(context), stage=new File(destination.getParentFile(),"preparing-"+token);
  try {
   erase(stage);stage.mkdirs();MessageDigest digest=MessageDigest.getInstance("SHA-256");byte[] buffer=new byte[65536];long count=0;
   try(InputStream in=new BufferedInputStream(open(id))){int n;while((n=in.read(buffer))!=-1){check(token);count+=n;if(count>BYTES)throw new IOException("Unexpected voice pack size");digest.update(buffer,0,n);}}
   StringBuilder hex=new StringBuilder();for(byte b:digest.digest())hex.append(String.format("%02x",b));
   if(count!=BYTES||!hex.toString().equals(SHA))throw new IOException("Voice pack verification failed. Tap Retry to download a fresh copy.");
   phase="Preparing offline voices…";
   try(TarArchiveInputStream archive=new TarArchiveInputStream(new BZip2CompressorInputStream(new BufferedInputStream(open(id),65536)))){
    TarArchiveEntry entry;int files=0;long expanded=0;
    while((entry=archive.getNextEntry())!=null){
     check(token);if(++files>1000)throw new IOException("Unexpected voice pack contents");
     String name=entry.getName();if(!name.startsWith(ARCHIVE_ROOT+"/"))throw new IOException("Unexpected voice pack path");
     String relative=name.substring(ARCHIVE_ROOT.length()+1);if(relative.isEmpty())continue;
     File target=new File(stage,relative);
     if(!target.getCanonicalPath().startsWith(stage.getCanonicalPath()+File.separator)||entry.isSymbolicLink()||entry.isLink()||(!entry.isFile()&&!entry.isDirectory()))throw new IOException("Invalid voice pack entry");
     if(entry.isDirectory()){target.mkdirs();continue;}
     if(entry.getSize()<0||entry.getSize()>160L*1024*1024)throw new IOException("Invalid voice file size");
     target.getParentFile().mkdirs();
     try(OutputStream out=new BufferedOutputStream(new FileOutputStream(target))){int n;while((n=archive.read(buffer))!=-1){check(token);expanded+=n;if(expanded>200L*1024*1024)throw new IOException("Voice pack is too large");out.write(buffer,0,n);}}
    }
   }
   if(new File(stage,"model.int8.onnx").length()!=114202993L||new File(stage,"voices.bin").length()<26000000L||!new File(stage,"tokens.txt").isFile()||!new File(stage,"espeak-ng-data/phontab").isFile())throw new IOException("Voice pack is incomplete");
   try(FileOutputStream out=new FileOutputStream(new File(stage,"ready"))){out.write(SHA.getBytes(java.nio.charset.StandardCharsets.US_ASCII));out.getFD().sync();}
   synchronized(this){
    check(token);erase(destination);if(!stage.renameTo(destination))throw new IOException("Could not save offline voices");
    prefs.edit().remove("download").putString("state","installed").remove("message").apply();downloads.remove(id);
   }
  }catch(Exception error){synchronized(this){if(token==generation.get()){prefs.edit().remove("download").putString("state","error").putString("message",error.getMessage()==null?"Could not prepare voices. Tap Retry.":error.getMessage()).apply();downloads.remove(id);}}}
  finally{erase(stage);synchronized(this){if(installingToken==token){installingToken=-1;phase="";}}}
 }
 private static void erase(File path){if(path.isDirectory()){File[] children=path.listFiles();if(children!=null)for(File child:children)erase(child);}if(path.exists())path.delete();}
}
