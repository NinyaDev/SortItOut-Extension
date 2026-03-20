const GRAPH_BASE = "https://graph.microsoft.com/v1.0/me";
const MAX_IDS_PER_SENDER = 2000; // Same cap as Gmail to prevent memory issues
const MAX_PAGES = 20; // Safety limit on pagination loops

// Wrapper that retries once on 401 by refreshing the Outlook token
async function outlookFetch(url: string, token: string): Promise<Response> {
    const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 401) {
        // Try refreshing from stored refresh token
        const stored = await chrome.storage.local.get("outlookRefreshToken");
        if (!stored.outlookRefreshToken) throw new Error("No refresh token available");

        const { refreshOutlookToken } = await import("./outlook-auth");
        const tokens = await refreshOutlookToken(stored.outlookRefreshToken);

        // Save the new tokens
        await chrome.storage.local.set({
            outlookToken: tokens.accessToken,
            outlookRefreshToken: tokens.refreshToken,
        });

        return fetch(url, {
            headers: { Authorization: `Bearer ${tokens.accessToken}` },
        });
    }

    return res;
}

// Search for messages containing "unsubscribe", returns message IDs
export async function listMessageIds(token: string, maxResults: number = 200): Promise<string[]> {
    const ids: string[] = [];
    let nextLink: string | undefined;
    let pages = 0;

    const initialUrl = new URL(`${GRAPH_BASE}/messages`);
    initialUrl.searchParams.set("$search", '"unsubscribe"');
    initialUrl.searchParams.set("$select", "id");
    initialUrl.searchParams.set("$top", String(Math.min(50, maxResults)));

    let url: string = initialUrl.toString();

    while (ids.length < maxResults && pages < MAX_PAGES) {
        const res = await outlookFetch(url, token);
        if (!res.ok) throw new Error(`Outlook list failed: ${res.status}`);

        const data = await res.json();
        const messages: { id: string }[] = data.value ?? [];
        ids.push(...messages.map((m) => m.id));

        nextLink = data["@odata.nextLink"];
        pages++;
        if (!nextLink) break;
        url = nextLink;
    }

    return ids.slice(0, maxResults);
}

// Get headers and read status for a specific message
export interface OutlookMessageData {
    from: string | null;
    subject: string | null;
    unsubscribeHeader: string | null;
    unsubscribePostHeader: string | null;
    isRead: boolean;
}

export async function getMessageData(token: string, messageId: string): Promise<OutlookMessageData> {
    const url = new URL(`${GRAPH_BASE}/messages/${messageId}`);
    url.searchParams.set("$select", "from,subject,isRead,internetMessageHeaders");

    const res = await outlookFetch(url.toString(), token);
    if (!res.ok) throw new Error(`Outlook get message failed: ${res.status}`);

    const data = await res.json();
    const headers: { name: string; value: string }[] = data.internetMessageHeaders ?? [];

    // Helper to find a header by name, case-insensitive
    const getHeader = (name: string) =>
        headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? null;

    // Reconstruct From as "Name <email>" format so parseFrom works on both Gmail and Outlook
    return {
        from: data.from?.emailAddress
            ? `"${data.from.emailAddress.name}" <${data.from.emailAddress.address}>`
            : null,
        subject: data.subject ?? null,
        unsubscribeHeader: getHeader("List-Unsubscribe"),
        unsubscribePostHeader: getHeader("List-Unsubscribe-Post"),
        isRead: data.isRead ?? false,
    };
}

// Fetch message IDs from a specific sender, capped at MAX_IDS_PER_SENDER
export async function getSenderMessageIds(token: string, senderEmail: string): Promise<string[]> {
    const ids: string[] = [];
    let nextLink: string | undefined;
    let pages = 0;

    const initialUrl = new URL(`${GRAPH_BASE}/messages`);
    initialUrl.searchParams.set("$filter", `from/emailAddress/address eq '${senderEmail}'`);
    initialUrl.searchParams.set("$select", "id");
    initialUrl.searchParams.set("$top", "100");

    let url: string = initialUrl.toString();

    while (ids.length < MAX_IDS_PER_SENDER && pages < MAX_PAGES) {
        const res = await outlookFetch(url, token);
        if (!res.ok) throw new Error(`Outlook sender search failed: ${res.status}`);

        const data = await res.json();
        const messages: { id: string }[] = data.value ?? [];
        ids.push(...messages.map((m) => m.id));

        nextLink = data["@odata.nextLink"];
        pages++;
        if (!nextLink) break;
        url = nextLink;
    }

    return ids.slice(0, MAX_IDS_PER_SENDER);
}

// Count total messages from a sender
export async function countSenderMessages(token: string, senderEmail: string): Promise<number> {
    let count = 0;
    let nextLink: string | undefined;
    let pages = 0;

    const initialUrl = new URL(`${GRAPH_BASE}/messages`);
    initialUrl.searchParams.set("$filter", `from/emailAddress/address eq '${senderEmail}'`);
    initialUrl.searchParams.set("$select", "id");
    initialUrl.searchParams.set("$top", "100");

    let url: string = initialUrl.toString();

    while (pages < MAX_PAGES) {
        const res = await outlookFetch(url, token);
        if (!res.ok) throw new Error(`Outlook count failed: ${res.status}`);

        const data = await res.json();
        count += (data.value ?? []).length;

        nextLink = data["@odata.nextLink"];
        pages++;
        if (!nextLink) break;
        url = nextLink;
    }

    return count;
}

// Count unread messages from a sender
export async function countUnreadFromSender(token: string, senderEmail: string): Promise<number> {
    let count = 0;
    let nextLink: string | undefined;
    let pages = 0;

    const initialUrl = new URL(`${GRAPH_BASE}/messages`);
    initialUrl.searchParams.set("$filter", `from/emailAddress/address eq '${senderEmail}' and isRead eq false`);
    initialUrl.searchParams.set("$select", "id");
    initialUrl.searchParams.set("$top", "100");

    let url: string = initialUrl.toString();

    while (pages < MAX_PAGES) {
        const res = await outlookFetch(url, token);
        if (!res.ok) throw new Error(`Outlook unread count failed: ${res.status}`);

        const data = await res.json();
        count += (data.value ?? []).length;

        nextLink = data["@odata.nextLink"];
        pages++;
        if (!nextLink) break;
        url = nextLink;
    }

    return count;
}

// Trash messages — Microsoft Graph batch endpoint, max 20 requests per batch
// Each DELETE moves the message to Deleted Items folder (recoverable)
export async function trashMessages(token: string, messageIds: string[]): Promise<void> {
    for (let i = 0; i < messageIds.length; i += 20) {
        const chunk = messageIds.slice(i, i + 20);

        const batchBody = {
            requests: chunk.map((id, index) => ({
                id: String(index),
                method: "DELETE",
                url: `/me/messages/${id}`,
            })),
        };

        const res = await fetch("https://graph.microsoft.com/v1.0/$batch", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(batchBody),
        });

        if (!res.ok) throw new Error(`Outlook batch delete failed: ${res.status}`);
    }
}
