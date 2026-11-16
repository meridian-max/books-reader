package app.books.reader;
import android.content.*;import android.net.Uri;import android.os.*;import java.io.*;import java.util.*;
final class StorageAccess {
 static boolean allowed(Context context){return Build.VERSION.SDK_INT>=30?Environment.isExternalStorageManager():context.checkSelfPermission("android.permission.READ_EXTERNAL_STORAGE")==android.content.pm.PackageManager.PERMISSION_GRANTED;}
 static File file(Context context,Uri uri)throws IOException{
  if(!allowed(context))throw new IOException("Enable All files access in Android settings first.");
  if(!"file".equals(uri.getScheme())||uri.getPath()==null)throw new IOException("Invalid device path.");File file=new File(uri.getPath()).getCanonicalFile();
  ArrayList<String> roots=new ArrayList<>();roots.add(Environment.getExternalStorageDirectory().getCanonicalPath());for(File dir:context.getExternalFilesDirs(null))if(dir!=null){String path=dir.getCanonicalPath();int at=path.indexOf("/Android/");if(at>0)roots.add(path.substring(0,at));}
  String path=file.getCanonicalPath();for(String root:roots)if(path.equals(root)||path.startsWith(root+File.separator))return file;throw new IOException("Choose a file in shared device storage.");
 }
 static void mutable(Context context,Uri uri)throws IOException{File file=file(context,uri);if(file.getParentFile()==null||file.equals(Environment.getExternalStorageDirectory().getCanonicalFile()))throw new IOException("The storage root cannot be renamed or removed.");}
 static InputStream input(Context context,Uri uri)throws IOException{return "file".equals(uri.getScheme())?new FileInputStream(file(context,uri)):context.getContentResolver().openInputStream(uri);}
 static OutputStream output(Context context,Uri uri)throws IOException{return "file".equals(uri.getScheme())?new FileOutputStream(file(context,uri)):context.getContentResolver().openOutputStream(uri,"wt");}
}
