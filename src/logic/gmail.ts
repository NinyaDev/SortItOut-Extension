const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
const MAX_IDS_PER_SENDER = 2000; // Cap per sender to prevent memory issues — user can rescan to get more
const MAX_PAGES = 20; // Safety limit on pagination loops to prevent infinite requests

const HEADERS_TO_FETCH = [
    "From",
    "Subject",
    "List-Unsubscribe",
    "List-Unsubscribe-Post",
];

// Wrapper that retries once on 401 by refreshing the token
async function gmailFetch(url: string, token: string): Promise<Response> {
    const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 401) {
        chrome.identity.removeCachedAuthToken({ token });
        const newToken = await new Promise<string | null>((resolve) => {
            chrome.identity.getAuthToken({ interactive: false }, (result) => {
                const t = typeof result === "string" ? result : result?.token;
                resolve(t ?? null);
            });
        });

        if (!newToken) throw new Error("Token refresh failed");

        return fetch(url, {
            headers: { Authorization: `Bearer ${newToken}` },
        });
    }

    return res;
}

// Gets message IDs from Gmail API based on the query, with pagination support
export async function listMessageIds(token: string, query: string = "unsubscribe", maxResults: number = 200): Promise<string[]> {
    const ids: string[] = [];
    let pageToken: string | undefined;
    let pages = 0;

    while (ids.length < maxResults && pages < MAX_PAGES) {
        const url = new URL(`${GMAIL_BASE}/messages`);
        url.searchParams.set("q", query);
        url.searchParams.set("maxResults", String(Math.min(100, maxResults - ids.length)));
        if (pageToken) url.searchParams.set("pageToken", pageToken);

        const res = await gmailFetch(url.toString(), token);
        if (!res.ok) throw new Error(`Gmail list failed: ${res.status}`);

        const data = await res.json();
        const messages: { id: string }[] = data.messages ?? [];
        ids.push(...messages.map((m) => m.id));

        pageToken = data.nextPageToken;
        pages++;
        if (!pageToken) break;
    }
    return ids;
}

// Get headers for a specific message ID
interface MessageData {
    headers: { name: string; value: string }[];
    isRead: boolean;
}

export async function getMessageHeaders(token: string, messageId: string): Promise<MessageData> {
    const url = new URL(`${GMAIL_BASE}/messages/${messageId}`);
    url.searchParams.set("format", "metadata");
    for (const header of HEADERS_TO_FETCH) {
        url.searchParams.append("metadataHeaders", header);
    }

    const res = await gmailFetch(url.toString(), token);
    if (!res.ok) throw new Error(`Gmail get message failed: ${res.status}`);

    const data = await res.json();
    const labelIds: string[] = data.labelIds ?? [];
    return {
        headers: data.payload?.headers ?? [],
        isRead: !labelIds.includes("UNREAD"),
    };
}

// Fetch message IDs from a specific sender, capped at MAX_IDS_PER_SENDER
export async function getSenderMessageIds(token: string, senderEmail: string): Promise<string[]> {
    const ids: string[] = [];
    let pageToken: string | undefined;
    let pages = 0;

    while (ids.length < MAX_IDS_PER_SENDER && pages < MAX_PAGES) {
        const url = new URL(`${GMAIL_BASE}/messages`);
        url.searchParams.set("q", `from:${senderEmail}`);
        url.searchParams.set("maxResults", "500");
        if (pageToken) url.searchParams.set("pageToken", pageToken);

        const res = await gmailFetch(url.toString(), token);
        if (!res.ok) throw new Error(`Gmail sender search failed: ${res.status}`);

        const data = await res.json();
        const messages: { id: string }[] = data.messages ?? [];
        ids.push(...messages.map((m) => m.id));

        pageToken = data.nextPageToken;
        pages++;
        if (!pageToken) break;
    }

    return ids.slice(0, MAX_IDS_PER_SENDER);
}

// Count total messages from a sender (just the count, not all IDs)
export async function countSenderMessages(token: string, senderEmail: string): Promise<number> {
    let count = 0;
    let pageToken: string | undefined;
    let pages = 0;

    while (pages < MAX_PAGES) {
        const url = new URL(`${GMAIL_BASE}/messages`);
        url.searchParams.set("q", `from:${senderEmail}`);
        url.searchParams.set("maxResults", "500");
        if (pageToken) url.searchParams.set("pageToken", pageToken);

        const res = await gmailFetch(url.toString(), token);
        if (!res.ok) throw new Error(`Gmail count failed: ${res.status}`);

        const data = await res.json();
        count += (data.messages ?? []).length;

        pageToken = data.nextPageToken;
        pages++;
        if (!pageToken) break;
    }

    return count;
}

// Count unread messages from a specific sender
export async function countUnreadFromSender(token: string, senderEmail: string): Promise<number> {
    let count = 0;
    let pageToken: string | undefined;
    let pages = 0;

    while (pages < MAX_PAGES) {
        const url = new URL(`${GMAIL_BASE}/messages`);
        url.searchParams.set("q", `from:${senderEmail} is:unread`);
        url.searchParams.set("maxResults", "500");
        if (pageToken) url.searchParams.set("pageToken", pageToken);

        const res = await gmailFetch(url.toString(), token);
        if (!res.ok) throw new Error(`Gmail unread count failed: ${res.status}`);

        const data = await res.json();
        count += (data.messages ?? []).length;

        pageToken = data.nextPageToken;
        pages++;
        if (!pageToken) break;
    }

    return count;
}

// Trash messages in chunks of 1000 (batchModify limit)
export async function trashMessages(token: string, messageIds: string[]): Promise<void> {
    for (let i = 0; i < messageIds.length; i += 1000) {
        const chunk = messageIds.slice(i, i + 1000);
        const url = `${GMAIL_BASE}/messages/batchModify`;

        const res = await fetch(url, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                ids: chunk,
                addLabelIds: ["TRASH"],
            }),
        });
        if (!res.ok) throw new Error(`Batch trash failed: ${res.status}`);
    }
}
