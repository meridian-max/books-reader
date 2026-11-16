package app.books.reader;

import android.accounts.Account;
import android.app.Activity;
import android.content.Intent;
import android.os.CancellationSignal;
import android.util.Base64;
import androidx.credentials.*;
import androidx.credentials.exceptions.*;
import com.google.android.libraries.identity.googleid.*;
import com.google.android.gms.auth.api.identity.*;
import com.google.android.gms.auth.api.identity.Identity;
import com.google.android.gms.common.api.Scope;
import org.json.*;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.security.spec.RSAPublicKeySpec;
import java.math.BigInteger;
import java.util.*;

/** Google credentials stay on the Android side. The WebView receives profile data only. */
final class GoogleAccount {
    private static final String DRIVE = "https://www.googleapis.com/auth/drive.appdata";
    private static final int REQUEST_DRIVE = 204;
    private final MainActivity host;
    private final CredentialManager credentials;
    private String token, pending;
    private CancellationSignal signInSignal;
    GoogleAccount(MainActivity host) { this.host = host; credentials = CredentialManager.create(host); }
    JSONObject profile() throws Exception {
        String value = host.prefs().getString("googleProfile", null);
        return value == null ? null : new JSONObject(host.decrypt(value));
    }
    void signIn(String id) {
        if (pending != null || signInSignal != null) { host.result(id,false,"Finish the current Google request first."); return; }
        String client = host.getString(R.string.google_web_client_id);
        if (client.isBlank()) { host.result(id,false,"Google sign-in has not been configured for this build."); return; }
        String nonce = UUID.randomUUID().toString();
        GetSignInWithGoogleOption option = new GetSignInWithGoogleOption.Builder(client).setNonce(nonce).build();
        GetCredentialRequest request = new GetCredentialRequest.Builder().addCredentialOption(option).build();
        signInSignal = new CancellationSignal();
        credentials.getCredentialAsync(host, request, signInSignal, host.getMainExecutor(), new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
            @Override public void onResult(GetCredentialResponse response) {
                signInSignal = null;
                host.pool.execute(() -> {
                    try {
                        if (!(response.getCredential() instanceof CustomCredential)) throw new Exception("Google returned an unsupported sign-in response.");
                        GoogleIdTokenCredential credential = GoogleIdTokenCredential.createFrom(response.getCredential().getData());
                        JSONObject claims = verify(credential.getIdToken(), client, nonce);
                        JSONObject user = new JSONObject().put("id",claims.getString("sub")).put("email",claims.getString("email"))
                            .put("name",claims.optString("name",claims.getString("email"))).put("picture",claims.optString("picture"));
                        token = null;
                        host.prefs().edit().putString("googleProfile",host.encrypt(user.toString())).apply();
                        host.result(id,true,user);
                    } catch (Exception e) { host.result(id,false,"Google sign-in could not be verified. " + e.getMessage()); }
                });
            }
            @Override public void onError(GetCredentialException error) {
                signInSignal = null;
                host.result(id,false,error instanceof GetCredentialCancellationException ? "Sign-in cancelled. You can keep reading offline." : "Google sign-in failed. Check your connection and Google Play services, then try again.");
            }
        });
    }
    // There is no Books account server. Verify the device's ID token against Google's
    // public signing keys before displaying an authenticated profile on this device.
    private JSONObject verify(String jwt, String audience, String nonce) throws Exception {
        String[] parts = jwt.split("\\.");
        if (parts.length != 3) throw new Exception("Invalid identity token.");
        JSONObject header = decode(parts[0]), claims = decode(parts[1]);
        long now = System.currentTimeMillis()/1000;
        if (!"RS256".equals(header.optString("alg")) || !audience.equals(claims.optString("aud")) || !nonce.equals(claims.optString("nonce"))
            || !Arrays.asList("accounts.google.com","https://accounts.google.com").contains(claims.optString("iss"))
            || claims.optLong("exp") <= now || claims.optLong("iat") > now+60 || !claims.optBoolean("email_verified") || claims.optString("sub").isEmpty())
            throw new Exception("Identity checks failed.");
        JSONObject response = host.http(new JSONObject().put("url","https://www.googleapis.com/oauth2/v3/certs"));
        if (response.getInt("status") != 200) throw new Exception("Could not check Google's signing keys.");
        JSONArray keys = new JSONObject(new String(Base64.decode(response.getString("body"),Base64.DEFAULT),StandardCharsets.UTF_8)).getJSONArray("keys");
        for (int i=0;i<keys.length();i++) {
            JSONObject key = keys.getJSONObject(i);
            if (!header.getString("kid").equals(key.optString("kid"))) continue;
            PublicKey publicKey = KeyFactory.getInstance("RSA").generatePublic(new RSAPublicKeySpec(new BigInteger(1,decode64(key.getString("n"))),new BigInteger(1,decode64(key.getString("e")))));
            Signature signature=Signature.getInstance("SHA256withRSA"); signature.initVerify(publicKey); signature.update((parts[0]+"."+parts[1]).getBytes(StandardCharsets.US_ASCII));
            if (!signature.verify(decode64(parts[2]))) throw new Exception("Invalid Google signature.");
            return claims;
        }
        throw new Exception("Google signing key was not found. Please try again.");
    }
    private static byte[] decode64(String s) { return Base64.decode(s,Base64.URL_SAFE|Base64.NO_WRAP|Base64.NO_PADDING); }
    private static JSONObject decode(String s) throws Exception { return new JSONObject(new String(decode64(s),StandardCharsets.UTF_8)); }
    void authorize(String id, boolean interactive) throws Exception {
        if (pending != null) throw new Exception("A Drive request is already open.");
        JSONObject user = profile(); if (user == null) throw new Exception("Sign in with Google first.");
        pending = id;
        AuthorizationRequest request = AuthorizationRequest.builder().setAccount(new Account(user.getString("email"),"com.google"))
            .setRequestedScopes(Collections.singletonList(new Scope(DRIVE))).build();
        Identity.getAuthorizationClient(host).authorize(request).addOnSuccessListener(result -> {
            if (result.hasResolution()) {
                if (!interactive) { complete(false,"Open You and reconnect Google Drive to continue backups."); return; }
                try { host.startIntentSenderForResult(result.getPendingIntent().getIntentSender(),REQUEST_DRIVE,null,0,0,0); }
                catch(Exception e) { complete(false,"Could not open Google's permission screen."); }
            } else authorized(result);
        }).addOnFailureListener(error -> complete(false,"Google Drive connection failed. Please try again."));
    }
    private void authorized(AuthorizationResult result) {
        if (!result.getGrantedScopes().contains(DRIVE) || result.getAccessToken() == null) { complete(false,"Drive permission was not granted. Your local library is unchanged."); return; }
        token = result.getAccessToken(); complete(true,true);
    }
    boolean activityResult(int request, int code, Intent data) {
        if(request != REQUEST_DRIVE) return false;
        if(code != Activity.RESULT_OK || data == null) { complete(false,"Drive connection cancelled."); return true; }
        try { authorized(Identity.getAuthorizationClient(host).getAuthorizationResultFromIntent(data)); }
        catch(Exception e) { complete(false,"Drive permission was not granted."); }
        return true;
    }
    private void complete(boolean ok,Object value) { String id=pending; pending=null; if(id!=null)host.result(id,ok,value); }
    void request(String id, JSONObject args) throws Exception {
        if(token==null || profile()==null)throw new Exception("Connect Google Drive before backing up.");
        java.net.URI uri = new java.net.URI(args.getString("url"));
        if(!"https".equals(uri.getScheme()) || !"www.googleapis.com".equals(uri.getHost()) || uri.getPort()!=-1 || uri.getUserInfo()!=null
            || !(uri.getPath().startsWith("/drive/v3/") || uri.getPath().startsWith("/upload/drive/v3/"))) throw new Exception("Unrecognised Drive address.");
        String current = token;
        host.pool.execute(() -> {
            try {
                JSONObject headers=args.optJSONObject("headers"); if(headers==null)headers=new JSONObject();
                args.put("headers",headers.put("Authorization","Bearer "+current));
                args.put("noRedirect",true);
                JSONObject response=host.http(args);
                if(response.getInt("status")==401){
                    token=null;
                    Identity.getAuthorizationClient(host).clearToken(ClearTokenRequest.builder().setToken(current).build());
                }
                host.result(id,true,response);
            } catch(Exception e) { host.result(id,false,"Could not reach Google Drive. Check your connection and retry."); }
        });
    }
    void signOut(String id) {
        token=null;
        host.prefs().edit().remove("googleProfile").apply();
        credentials.clearCredentialStateAsync(new ClearCredentialStateRequest(),null,host.getMainExecutor(),new CredentialManagerCallback<Void,ClearCredentialException>() {
            @Override public void onResult(Void result) { host.result(id,true,true); }
            @Override public void onError(ClearCredentialException error) { host.result(id,true,true); }
        });
    }
    void destroy() { token=null; if(signInSignal!=null)signInSignal.cancel(); }
}
