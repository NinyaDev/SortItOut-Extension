const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

const HEADERS_TO_FETCH = [
    "From",
    "Subject",
    "List-Unsubscribe",
    "List-Unsubscribe-Post",
];

// Gets message IDs from Gmail API based on the query, with pagination support
export async function listMessageIds(token: string, query: string ="unsubscribe", maxResults: number = 200): Promise<string[]> {
    const ids: string[] = [];
    let pageToken: string | undefined;

    while (ids.length < maxResults) {
        const url = new URL(`${GMAIL_BASE}/messages`);
        url.searchParams.set("q", query);
        url.searchParams.set("maxResults", String(Math.min(100, maxResults - ids.length)));
        if(pageToken) url.searchParams.set("pageToken", pageToken);

        const res = await fetch(url.toString(), {
            headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) throw new Error(`Gmail list failed: ${res.status}`);

        const data = await res.json();
        const messages: { id: string}[] = data.messages ?? [];
        ids.push(...messages.map((m)=> m.id));

        pageToken = data.nextPageToken;
        if(!pageToken) break;
    }
    return ids;
}

// Get headers for a specific message ID
export async function getMessageHeaders(token: string, messageId: string): Promise<{name: string; value: string}[]> {
    const url = new URL(`${GMAIL_BASE}/messages/${messageId}`);
    url.searchParams.set("format", "metadata");
    url.searchParams.set("metadataHeaders", HEADERS_TO_FETCH.join(","));

    const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) throw new Error(`Gmail get message failed: ${res.status}`);

    const data = await res.json();
    return data.payload?.headers ?? [];

}