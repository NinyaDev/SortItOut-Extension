// Gmail OAuth via PKCE - used on browsers without chrome.identity.getAuthToken (Firefox/Zen).
// Chrome continues to use its native getAuthToken flow from App.tsx for a smoother UX.
// This module mirrors the structure of outlook-auth.ts so the two providers stay symmetric.

// "Web application" OAuth client created in Google Cloud Console for the Firefox/Zen PKCE flow.
// The Chrome Extension client_id in manifest.oauth2 stays put and is used only on Chrome.
const CLIENT_ID = "967825888472-5goe7i65lflq4vco1uqke69ceplkhus2.apps.googleusercontent.com"

// Google's "Web application" client type requires client_secret at /token even with PKCE.
// Injected at build time from .env.local (gitignored), so the secret stays out of source control.
// It still ends up in the compiled bundle in dist/, which is the same place a Chrome extension's
// manifest.oauth2 secret lives - unavoidable for browser-extension OAuth distribution.
const CLIENT_SECRET = import.meta.env.VITE_FIREFOX_GOOGLE_CLIENT_SECRET

// chrome.identity.getRedirectURL() returns the per-browser redirect URI.
// On Firefox this becomes the value you register in Google Cloud Console.
const REDIRECT_URI = chrome.identity.getRedirectURL()

// gmail.modify covers reading and trashing messages; profile/email are exposed
// through the Gmail API itself so no extra Google profile scope is needed.
const SCOPES = "https://www.googleapis.com/auth/gmail.modify"

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
const TOKEN_URL = "https://oauth2.googleapis.com/token"

export async function gmailSignInPKCE(): Promise<{ accessToken: string; refreshToken: string }> {
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
    // access_type=offline tells Google to issue a refresh_token alongside the access_token.
    // prompt=consent forces the consent screen even on re-sign-in so we reliably get the refresh_token.
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("prompt", "consent");
    authUrl.searchParams.set("state", state);

    const responseUrl = await chrome.identity.launchWebAuthFlow({ url: authUrl.toString(), interactive: true });

    if (!responseUrl) throw new Error("Auth flow cancelled");

    const response = new URL(responseUrl);

    // Validate state matches to prevent CSRF
    if (response.searchParams.get("state") !== state) {
        throw new Error("State mismatch - possible CSRF attack");
    }

    const code = response.searchParams.get("code");
    if (!code) throw new Error("No code returned");

    const tokenResponse = await fetch(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            code,
            redirect_uri: REDIRECT_URI,
            grant_type: "authorization_code",
            code_verifier: codeVerifier,
        }),
    });

    if (!tokenResponse.ok) {
        const err = await tokenResponse.json();
        throw new Error(`Token exchange failed: ${err.error_description || err.error}`);
    }

    const data = await tokenResponse.json();
    return { accessToken: data.access_token, refreshToken: data.refresh_token };
}

export async function refreshGmailToken(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    const response = await fetch(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            grant_type: "refresh_token",
            refresh_token: refreshToken,
        }),
    });

    if (!response.ok) throw new Error("Failed to refresh Gmail token");

    const data = await response.json();
    // Google typically returns the same refresh_token unless rotation is enabled.
    // Keep the existing one if a new one isn't issued.
    return { accessToken: data.access_token, refreshToken: data.refresh_token ?? refreshToken };
}

export async function getGmailUserEmail(accessToken: string): Promise<string | null> {
    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
        headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) return null;

    const data = await res.json();
    return data.emailAddress ?? null;
}

// Helper functions for PKCE - same implementation as outlook-auth.ts
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
