package app.books.reader;
import android.content.Context;import android.database.Cursor;import android.net.Uri;import android.provider.DocumentsContract;import org.json.*;import java.io.*;import java.util.*;
final class DocumentActions {
 private static Uri uri(JSONObject data,String key)throws Exception{Uri uri=Uri.parse(data.getString(key));if(!Arrays.asList("content","file").contains(uri.getScheme()))throw new IOException("Choose a file from a device folder.");return uri;}
 private static String[] info(Context c,Uri uri)throws Exception{
  if("file".equals(uri.getScheme())){File f=StorageAccess.file(c,uri);if(!f.exists())throw new FileNotFoundException(f.getName());return new String[]{f.getName(),f.isDirectory()?DocumentsContract.Document.MIME_TYPE_DIR:"application/octet-stream"};}
  try(Cursor cursor=c.getContentResolver().query(uri,new String[]{DocumentsContract.Document.COLUMN_DISPLAY_NAME,DocumentsContract.Document.COLUMN_MIME_TYPE},null,null,null)){if(cursor!=null&&cursor.moveToFirst())return new String[]{cursor.getString(0),cursor.getString(1)};}throw new FileNotFoundException("This document is no longer available.");
 }
 private static String validName(String value)throws IOException{String name=value.trim();if(name.isEmpty()||name.equals(".")||name.equals("..")||name.contains("/")||name.contains("\\")||name.indexOf(0)>=0)throw new IOException("Enter a valid file name.");return name;}
 private static Uri create(Context c,Uri parent,String name,String mime)throws Exception{
  name=validName(name);if("file".equals(parent.getScheme())){File root=StorageAccess.file(c,parent);if(!root.isDirectory())throw new IOException("Choose a destination folder.");File out=new File(root,name);int n=1;while(out.exists()){int dot=name.lastIndexOf('.');String base=dot>0?name.substring(0,dot):name,extension=dot>0?name.substring(dot):"";out=new File(root,base+" ("+(n++)+")"+extension);}if(DocumentsContract.Document.MIME_TYPE_DIR.equals(mime)?!out.mkdir():!out.createNewFile())throw new IOException("The destination could not be created.");return Uri.fromFile(out);}
  Uri out=DocumentsContract.createDocument(c.getContentResolver(),parent,mime,name);if(out==null)throw new IOException("The destination provider does not support creating this document.");return out;
 }
 private static List<Uri> children(Context c,Uri uri)throws Exception{ArrayList<Uri> result=new ArrayList<>();if("file".equals(uri.getScheme())){File[] files=StorageAccess.file(c,uri).listFiles();if(files==null)throw new IOException("This folder cannot be read.");for(File f:files)result.add(Uri.fromFile(f));}else{Uri list=DocumentsContract.buildChildDocumentsUriUsingTree(uri,DocumentsContract.getDocumentId(uri));try(Cursor cursor=c.getContentResolver().query(list,new String[]{DocumentsContract.Document.COLUMN_DOCUMENT_ID},null,null,null)){while(cursor!=null&&cursor.moveToNext())result.add(DocumentsContract.buildDocumentUriUsingTree(uri,cursor.getString(0)));}}return result;}
 private static void delete(Context c,Uri uri,int depth)throws Exception{if(depth>30)throw new IOException("This folder is too deeply nested.");if("file".equals(uri.getScheme())){StorageAccess.mutable(c,uri);File f=StorageAccess.file(c,uri);if(f.isDirectory())for(Uri child:children(c,uri))delete(c,child,depth+1);if(!f.delete())throw new IOException("The file could not be removed.");}else if(!DocumentsContract.deleteDocument(c.getContentResolver(),uri))throw new IOException("The provider could not remove this document.");}
 static Object run(Context c,String action,JSONObject data)throws Exception{
  Uri source=uri(data,"uri");switch(action){
   case "makeFolder":return create(c,source,data.getString("name"),DocumentsContract.Document.MIME_TYPE_DIR).toString();
   case "renameFile":{String name=validName(data.getString("name"));if("file".equals(source.getScheme())){StorageAccess.mutable(c,source);File f=StorageAccess.file(c,source),dest=new File(f.getParentFile(),name);if(dest.exists())throw new IOException("A file with that name already exists.");if(!f.renameTo(dest))throw new IOException("The file could not be renamed.");return Uri.fromFile(dest).toString();}Uri result=DocumentsContract.renameDocument(c.getContentResolver(),source,name);if(result==null)throw new IOException("This provider cannot rename the document.");return result.toString();}
   case "deleteFile":delete(c,source,0);return true;
   case "copyFile":case "moveFile":{Uri destination=uri(data,"destination");if(source.getScheme().equals(destination.getScheme())&&Objects.equals(source.getAuthority(),destination.getAuthority())){String src="file".equals(source.getScheme())?StorageAccess.file(c,source).getCanonicalPath():DocumentsContract.getDocumentId(source),dest="file".equals(destination.getScheme())?StorageAccess.file(c,destination).getCanonicalPath():DocumentsContract.getDocumentId(destination);if(dest.equals(src)||dest.startsWith(src+"/"))throw new IOException("Choose a destination outside the source folder.");}
    Uri result=copy(c,source,destination,new long[]{0,0},0);if(action.equals("moveFile"))try{delete(c,source,0);}catch(Exception error){throw new IOException("Copied successfully, but the original could not be removed.",error);}return result.toString();}
   default:throw new IOException("Unknown file operation.");
  }
 }
 private static Uri copy(Context c,Uri source,Uri destination,long[] limits,int depth)throws Exception{
  if(depth>30||++limits[0]>5000)throw new IOException("Copy a smaller folder at a time.");String[] info=info(c,source);Uri result=create(c,destination,info[0],info[1]);try{
   if(DocumentsContract.Document.MIME_TYPE_DIR.equals(info[1]))for(Uri child:children(c,source))copy(c,child,result,limits,depth+1);
   else try(InputStream in=StorageAccess.input(c,source);OutputStream out=StorageAccess.output(c,result)){if(in==null||out==null)throw new IOException("This document cannot be opened.");byte[] buffer=new byte[32768];int n;while((n=in.read(buffer))!=-1){if((limits[1]+=n)>512L*1024*1024)throw new IOException("Copy one folder smaller than 512 MB at a time.");out.write(buffer,0,n);}}
   return result;
  }catch(Exception e){try{delete(c,result,0);}catch(Exception ignored){}throw e;}
 }
}
