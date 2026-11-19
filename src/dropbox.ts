import { network } from "./native";

export interface DropboxCredentials {
  token: string;
  appKey?: string;
  refreshToken?: string;
}

// Access tokens stay in memory; the refresh credential is kept by Android Keystore.
let cached: { key: string; token: string; expires: number } | undefined;
let pending: { key: string; result: Promise<string> } | undefined;
let generation = 0;

export function clearDropboxSession() {
  generation++;
  cached = undefined;
  pending = undefined;
}

export async function dropboxAccessToken(c: DropboxCredentials, force = false): Promise<string> {
  if (!c.refreshToken) return c.token;
  if (!c.appKey) throw Error("Enter the Dropbox app key for this refresh token.");
  const key = JSON.stringify([c.appKey, c.refreshToken]);
  if (pending?.key === key) return pending.result;
  if (!force && cached?.key === key && cached.expires > Date.now()) return cached.token;
  const started = generation;
  const request = (async () => {
    const response = await network("https://api.dropboxapi.com/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: c.refreshToken!,
        client_id: c.appKey!,
      }).toString(),
    });
    if (!response.ok) {
      if ([400, 401, 403].includes(response.status))
        throw Error("Dropbox authorization has expired or was revoked. Reconnect Dropbox in Settings.");
      throw Error(`Dropbox could not renew access (${response.status}). Try again later.`);
    }
    const result = await response.json();
    if (started !== generation)
      throw Error("The cloud connection changed. Try syncing with the current connection.");
    if (typeof result.access_token !== "string" || !result.access_token)
      throw Error("Dropbox returned an invalid access token. Try reconnecting.");
    // A missing or invalid lifetime is usable for this call, but is never cached.
    const seconds = Number(result.expires_in);
    if (started === generation) cached = {
      key,
      token: result.access_token,
      expires: Date.now() + (Number.isFinite(seconds) ? Math.max(0, seconds - 60) * 1000 : 0),
    };
    return result.access_token;
  })();
  pending = { key, result: request };
  try {
    return await request;
  } finally {
    if (pending?.result === request) pending = undefined;
  }
}
