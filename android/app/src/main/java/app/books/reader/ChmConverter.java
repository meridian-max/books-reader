package app.books.reader;

import android.content.Context;
import android.util.Base64;
import org.json.JSONObject;
import org.jchmlib.*;
import java.io.*;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.zip.*;

/** Converts a CHM container using the Apache-2.0 jchmlib implementation. */
final class ChmConverter {
 static JSONObject extract(Context context,String encoded) throws Exception {
  byte[] bytes=Base64.decode(encoded,Base64.DEFAULT);
  if(bytes.length>128*1024*1024)throw new IOException("CHM files must be smaller than 128 MB.");
  File input=File.createTempFile("books-chm-",".chm",context.getCacheDir());
  try {
   try(OutputStream stream=new FileOutputStream(input)){stream.write(bytes);}
   try(ChmFile chm=new ChmFile(input.getAbsolutePath())){
    ChmCollectFilesEnumerator enumerator=new ChmCollectFilesEnumerator();
    chm.enumerate(ChmFile.CHM_ENUMERATE_ALL,enumerator);
    if(enumerator.files.size()>10000)throw new IOException("This CHM contains too many entries.");
    ByteArrayOutputStream output=new ByteArrayOutputStream();
    try(ZipOutputStream zip=new ZipOutputStream(output)){
     long total=0;java.util.HashSet<String> seen=new java.util.HashSet<>();
     for(ChmUnitInfo unit:enumerator.files){
      String path=unit.getPath();if(!seen.add(path))continue;
      if(!path.startsWith("/")||path.startsWith("/#")||path.startsWith("/$")||path.endsWith("/")||path.contains(".."))continue;
      if(unit.getLength()<0||unit.getLength()>50*1024*1024||total+unit.getLength()>128*1024*1024)throw new IOException("The extracted CHM exceeds the supported size.");
      ByteBuffer data=chm.retrieveObject(unit);if(data==null)continue;
      byte[] content=new byte[data.remaining()];data.get(content);total+=content.length;
      if(path.matches("(?i).*\\.(html?|hhc|hhk|css)$"))content=new String(content,java.nio.charset.Charset.forName(chm.getEncoding())).getBytes(StandardCharsets.UTF_8);
      zip.putNextEntry(new ZipEntry(path.substring(1)));zip.write(content);zip.closeEntry();
     }
    }
    return new JSONObject().put("title",chm.getTitle()).put("home",chm.getHomeFile()).put("toc",chm.getTopicsFile()).put("zip",Base64.encodeToString(output.toByteArray(),Base64.NO_WRAP));
   }
  } finally {input.delete();}
 }
}
