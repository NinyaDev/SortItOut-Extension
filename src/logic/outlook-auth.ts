const CLIENT_ID = "79e08a8e-3a9b-4de5-96d5-7ac2d8f4e382"
const REDIRECT_URI = `https://${chrome.runtime.id}.chromiumapp.org/`
const SCOPES = "openid User.Read Mail.Read Mail.ReadWrite"

const AUTH_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize"
const TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token"

export async function outlookSignIn(): Promise<{ accessToken: string; refreshToken: string }> {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    // Random state token to prevent CSRF attacks during the OAuth flow
    const state = generateCodeVerifier();

    const authUrl = new URL(AUTH_URL);
    authUrl.searchParams.set("client_id", CLIENT_ID);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
    authUrl.searchParams.set("scope", SCOPES);
    authUrl.searchParams.set("code_challenge", codeChallenge);
    authUrl.searchParams.set("code_challenge_method", "S256");
    authUrl.searchParams.set("prompt", "select_account");
    authUrl.searchParams.set("state", state);

    const responseUrl = await chrome.identity.launchWebAuthFlow({ url: authUrl.toString(), interactive: true });

    if (!responseUrl) throw new Error("Auth flow cancelled");

    const response = new URL(responseUrl);

    // Validate state matches to prevent CSRF
    if (response.searchParams.get("state") !== state) {
        throw new Error("State mismatch — possible CSRF attack");
    }

    const code = response.searchParams.get("code");
    if (!code) throw new Error("No code returned");

    const tokenResponse = await fetch(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            client_id: CLIENT_ID, code,
            redirect_uri: REDIRECT_URI,
            grant_type: "authorization_code",
            code_verifier: codeVerifier,
            scope: SCOPES,
        }),
    });

    if (!tokenResponse.ok) {
        const err = await tokenResponse.json();
        throw new Error(`Token exchange failed: ${err.error_description || err.error}`);
    }

    const data = await tokenResponse.json();
    return { accessToken: data.access_token, refreshToken: data.refresh_token };

}

export async function refreshOutlookToken(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    const response = await fetch(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            client_id: CLIENT_ID,
            grant_type: "refresh_token",
            refresh_token: refreshToken,
            scope: SCOPES,
        }),
    });

    if (!response.ok) throw new Error("Failed to refresh token");

    const data = await response.json();
    return { accessToken: data.access_token, refreshToken: data.refresh_token ?? refreshToken};
}

export async function getOutlookUserEmail(accessToken: string): Promise<string | null> {
    const res = await fetch("https://graph.microsoft.com/v1.0/me", {
        headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) return null;

    const data = await res.json();
    return data.mail ?? data.userPrincipalName ?? null;
}

// Helper functions for PKCE
function generateCodeVerifier(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return btoa(String.fromCharCode(...array)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function generateCodeChallenge(verifier: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const hash = await crypto.subtle.digest("SHA-256", data);
    return btoa(String.fromCharCode(...new Uint8Array(hash))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}