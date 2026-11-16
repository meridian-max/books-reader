package app.books.reader;

import android.content.Context;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.time.Duration;
import java.util.UUID;
import javax.net.ssl.TrustManager;
import javax.net.ssl.TrustManagerFactory;
import javax.net.ssl.X509TrustManager;
import org.apache.commons.net.ftp.*;
import org.json.*;

/** Short-lived passive connections; runs only on the Activity's I/O executor. */
final class FtpAccess {
    private static final long MAX_BYTES = 128L * 1024 * 1024;

    private static String safe(String value) throws IOException {
        if (value.indexOf('\r') >= 0 || value.indexOf('\n') >= 0 || value.indexOf('\0') >= 0)
            throw new IOException("Server fields and paths must not contain control characters.");
        return value;
    }

    static Object run(Context context, JSONObject request, JSONObject config) throws Exception {
        String host = safe(config.getString("host").trim());
        if (host.isEmpty() || host.contains("://") || host.contains("/"))
            throw new IOException("Enter the server hostname, without a URL or folder.");
        int port = config.optInt("port", 21);
        if (port < 1 || port > 65535) throw new IOException("Port must be between 1 and 65535.");
        FTPClient client;
        if (config.optBoolean("tls", true)) {
            FTPSClient tls = new FTPSClient(false);
            // Commons Net's default trust manager does not establish system trust.
            TrustManagerFactory factory = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
            factory.init((KeyStore) null);
            X509TrustManager trusted = null;
            for (TrustManager manager : factory.getTrustManagers())
                if (manager instanceof X509TrustManager) trusted = (X509TrustManager) manager;
            if (trusted == null) throw new IOException("System TLS trust store is unavailable.");
            tls.setTrustManager(trusted);
            tls.setEndpointCheckingEnabled(true);
            client = tls;
        } else client = new FTPClient();
        client.setConnectTimeout(15000);
        client.setDefaultTimeout(20000);
        client.setDataTimeout(Duration.ofSeconds(30));
        client.setControlEncoding(StandardCharsets.UTF_8.name());
        client.setAutodetectUTF8(true);
        try {
            client.connect(host, port);
            if (!FTPReply.isPositiveCompletion(client.getReplyCode())) throw new IOException("The FTP server refused the connection.");
            if (!client.login(safe(config.optString("username", "anonymous")), safe(config.optString("password", ""))))
                throw new IOException("FTP login failed. Check your username and password.");
            if (client instanceof FTPSClient) {
                ((FTPSClient) client).execPBSZ(0);
                ((FTPSClient) client).execPROT("P");
            }
            client.enterLocalPassiveMode();
            client.setFileType(FTP.BINARY_FILE_TYPE);
            String path = safe(request.optString("path", config.optString("path", "/")));
            if (path.isEmpty()) path = "/";
            String operation = request.optString("operation", "list");
            switch (operation) {
                case "list": {
                    if (!client.changeWorkingDirectory(path)) throw new IOException("The server folder could not be opened.");
                    FTPFile[] files = client.listFiles();
                    if (!FTPReply.isPositiveCompletion(client.getReplyCode())) throw new IOException("The server folder could not be listed.");
                    JSONArray entries = new JSONArray();
                    String current = client.printWorkingDirectory();
                    if (current == null) current = path;
                    for (FTPFile file : files) {
                        String name = file.getName();
                        if (name.equals(".") || name.equals("..") || name.contains("/") || name.contains("\r") || name.contains("\n")) continue;
                        entries.put(new JSONObject().put("name", name).put("path", (current.endsWith("/") ? current : current + "/") + name)
                            .put("directory", file.isDirectory()).put("size", file.getSize()));
                    }
                    return new JSONObject().put("path", current).put("entries", entries);
                }
                case "download": {
                    String name = path.substring(path.lastIndexOf('/') + 1);
                    if (name.isEmpty()) throw new IOException("Select a file to download.");
                    File target = new File(context.getCacheDir(), UUID.randomUUID().toString());
                    boolean complete = false;
                    try {
                        InputStream stream = client.retrieveFileStream(path);
                        if (stream == null) throw new IOException("The file could not be downloaded.");
                        try (InputStream in = stream; OutputStream out = new FileOutputStream(target)) {
                            byte[] buffer = new byte[32768]; int count; long total = 0;
                            while ((count = in.read(buffer)) != -1) {
                                total += count;
                                if (total > MAX_BYTES) throw new IOException("FTP downloads must be smaller than 128 MB.");
                                out.write(buffer, 0, count);
                            }
                        }
                        if (!client.completePendingCommand()) throw new IOException("FTP download did not finish. Please retry.");
                        complete = true;
                        return new JSONObject().put("name", name).put("url", "https://appassets.androidplatform.net/imports/" + target.getName());
                    } finally { if (!complete) target.delete(); }
                }
                case "mkdir":
                    if (!client.makeDirectory(path)) throw new IOException("The folder could not be created.");
                    return true;
                case "rename":
                    if (!client.rename(path, safe(request.getString("destination")))) throw new IOException("The item could not be renamed.");
                    return true;
                case "delete":
                    boolean removed = request.optBoolean("directory") ? client.removeDirectory(path) : client.deleteFile(path);
                    if (!removed) throw new IOException("The item could not be removed. Folders must be empty.");
                    return true;
                case "upload": {
                    byte[] bytes = android.util.Base64.decode(request.getString("base64"), android.util.Base64.DEFAULT);
                    if (bytes.length > MAX_BYTES) throw new IOException("FTP uploads must be smaller than 128 MB.");
                    if (client.mlistFile(path) != null) throw new IOException("A file with that name already exists. Rename it first.");
                    if (!client.storeFile(path, new ByteArrayInputStream(bytes))) throw new IOException("The file could not be uploaded.");
                    return true;
                }
                default: throw new IOException("Unknown FTP operation.");
            }
        } finally {
            if (client.isConnected()) { try { client.logout(); } catch (Exception ignored) {} try { client.disconnect(); } catch (Exception ignored) {} }
        }
    }
}
