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
        const tokens = await refreshOutlookToken(stored.outlookRefreshToken as string);

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
    const safeEmail = senderEmail.replace(/'/g, "''");

    const initialUrl = new URL(`${GRAPH_BASE}/messages`);
    initialUrl.searchParams.set("$filter", `from/emailAddress/address eq '${safeEmail}'`);
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
    const safeEmail = senderEmail.replace(/'/g, "''");

    const initialUrl = new URL(`${GRAPH_BASE}/messages`);
    initialUrl.searchParams.set("$filter", `from/emailAddress/address eq '${safeEmail}'`);
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
    const safeEmail = senderEmail.replace(/'/g, "''");

    const initialUrl = new URL(`${GRAPH_BASE}/messages`);
    initialUrl.searchParams.set("$filter", `from/emailAddress/address eq '${safeEmail}' and isRead eq false`);
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

// Types for the generalized batch API - used by countSendersBatch and getMessageDataBatch
export interface BatchRequestItem {
    id: string;
    method: "GET" | "POST";
    url: string;               // Relative URL like /me/messages/123
    headers?: Record<string, string>;
    body?: unknown;
}

export interface BatchResponseItem {
    id: string;
    status: number;
    body: Record<string, unknown>;
}

// Generalized $batch function - sends up to 20 requests in a single HTTP call.
// This is the same pattern as trashMessages below, but generalized for any request type.
// Handles token refresh on 401 (which trashMessages doesn't).
export async function batchRequest(token: string, requests: BatchRequestItem[]): Promise<BatchResponseItem[]> {
    const BATCH_SIZE = 20; // Microsoft Graph $batch limit
    const allResponses: BatchResponseItem[] = [];

    for (let i = 0; i < requests.length; i += BATCH_SIZE) {
        const chunk = requests.slice(i, i + BATCH_SIZE);

        const batchBody = { requests: chunk };

        let res = await fetch("https://graph.microsoft.com/v1.0/$batch", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(batchBody),
        });

        // Handle token refresh - if the outer batch request gets 401,
        // refresh the token and retry this chunk once
        if (res.status === 401) {
            const stored = await chrome.storage.local.get("outlookRefreshToken");
            if (!stored.outlookRefreshToken) throw new Error("No refresh token available");

            const { refreshOutlookToken } = await import("./outlook-auth");
            const tokens = await refreshOutlookToken(stored.outlookRefreshToken as string);

            await chrome.storage.local.set({
                outlookToken: tokens.accessToken,
                outlookRefreshToken: tokens.refreshToken,
            });

            token = tokens.accessToken;

            res = await fetch("https://graph.microsoft.com/v1.0/$batch", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${tokens.accessToken}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(batchBody),
            });
        }

        if (!res.ok) throw new Error(`Outlook batch failed: ${res.status}`);

        const data = await res.json();
        const responses: BatchResponseItem[] = data.responses ?? [];
        allResponses.push(...responses);

        // Small delay between batch chunks to avoid rate limiting
        if (i + BATCH_SIZE < requests.length) {
            await new Promise((resolve) => setTimeout(resolve, 300));
        }
    }

    return allResponses;
}

// Fetch messages WITH headers inline from the list endpoint.
// Instead of fetching 200 IDs then getting each message individually,
// we ask for from + internetMessageHeaders directly in the list query.
// This turns ~50 individual GETs into ~4 paginated requests.
// Returns the same shape as getMessageData so the scanner can use either.
export async function listMessagesWithHeaders(token: string, maxResults: number = 200): Promise<OutlookMessageData[]> {
    const results: OutlookMessageData[] = [];
    let nextLink: string | undefined;
    let pages = 0;

    const initialUrl = new URL(`${GRAPH_BASE}/messages`);
    initialUrl.searchParams.set("$search", '"unsubscribe"');
    // Request headers inline - MS Graph docs say internetMessageHeaders is
    // "Returned only on applying a $select query option"
    initialUrl.searchParams.set("$select", "id,from,isRead,internetMessageHeaders");
    initialUrl.searchParams.set("$top", String(Math.min(50, maxResults)));

    let url: string = initialUrl.toString();

    while (results.length < maxResults && pages < MAX_PAGES) {
        const res = await outlookFetch(url, token);
        if (!res.ok) throw new Error(`Outlook list+headers failed: ${res.status}`);

        const data = await res.json();
        const messages: Array<{
            id: string;
            from?: { emailAddress?: { name?: string; address?: string } };
            isRead?: boolean;
            internetMessageHeaders?: { name: string; value: string }[];
        }> = data.value ?? [];

        // Check if headers actually came back on the first page -
        // if $search doesn't support $select=internetMessageHeaders,
        // the array will be missing or empty on every message
        if (pages === 0 && messages.length > 0) {
            const firstHeaders = messages[0].internetMessageHeaders;
            if (!firstHeaders || firstHeaders.length === 0) {
                throw new Error("Headers not returned in list response - use fallback");
            }
        }

        for (const msg of messages) {
            const headers = msg.internetMessageHeaders ?? [];
            const getHeader = (name: string) =>
                headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? null;

            // Build the "Name <email>" format from the structured from object,
            // same as getMessageData does, so parseFrom works on both paths
            const fromObj = msg.from?.emailAddress;
            const from = fromObj
                ? `"${fromObj.name ?? ""}" <${fromObj.address ?? ""}>`
                : null;

            results.push({
                from,
                subject: null, // Not needed for scanning
                unsubscribeHeader: getHeader("List-Unsubscribe"),
                unsubscribePostHeader: getHeader("List-Unsubscribe-Post"),
                isRead: msg.isRead ?? false,
            });
        }

        nextLink = data["@odata.nextLink"];
        pages++;
        if (!nextLink) break;
        url = nextLink;
    }

    return results.slice(0, maxResults);
}

// Batch-fetch individual message details - fallback for when listMessagesWithHeaders
// doesn't return headers (some $search + $select combinations fail).
// Uses batchRequest to send up to 20 GETs per HTTP call instead of 4 individual requests.
export async function getMessageDataBatch(token: string, messageIds: string[]): Promise<Map<string, OutlookMessageData>> {
    const requests: BatchRequestItem[] = messageIds.map((id, index) => ({
        id: String(index),
        method: "GET" as const,
        url: `/me/messages/${id}?$select=from,subject,isRead,internetMessageHeaders`,
    }));

    const responses = await batchRequest(token, requests);
    const results = new Map<string, OutlookMessageData>();

    for (const resp of responses) {
        const index = parseInt(resp.id);
        const msgId = messageIds[index];

        if (resp.status !== 200 || !msgId) continue;

        const body = resp.body;
        const headers = (body.internetMessageHeaders as { name: string; value: string }[]) ?? [];
        const getHeader = (name: string) =>
            headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? null;

        const fromObj = body.from as { emailAddress?: { name?: string; address?: string } } | undefined;
        const emailAddr = fromObj?.emailAddress;
        const from = emailAddr
            ? `"${emailAddr.name ?? ""}" <${emailAddr.address ?? ""}>`
            : null;

        results.set(msgId, {
            from,
            subject: (body.subject as string) ?? null,
            unsubscribeHeader: getHeader("List-Unsubscribe"),
            unsubscribePostHeader: getHeader("List-Unsubscribe-Post"),
            isRead: (body.isRead as boolean) ?? false,
        });
    }

    return results;
}

// Batch count queries for multiple senders at once using $count=true + $batch.
// Instead of paginating through all messages per sender to count them (old approach),
// each count is a single request that returns @odata.count directly.
// We batch 20 of these per HTTP call - so 50 senders x 2 queries = 5 batch calls.
export async function countSendersBatch(
    token: string,
    senderEmails: string[]
): Promise<Map<string, { total: number; unread: number }>> {
    // Build batch requests - 2 per sender (total + unread)
    // Escape single quotes in email addresses to prevent OData injection
    const requests: BatchRequestItem[] = [];
    for (let i = 0; i < senderEmails.length; i++) {
        const safeEmail = senderEmails[i].replace(/'/g, "''");

        requests.push({
            id: `total-${i}`,
            method: "GET",
            url: `/me/messages?$filter=from/emailAddress/address eq '${safeEmail}'&$count=true&$top=1&$select=id`,
            headers: { ConsistencyLevel: "eventual" },
        });

        requests.push({
            id: `unread-${i}`,
            method: "GET",
            url: `/me/messages?$filter=from/emailAddress/address eq '${safeEmail}' and isRead eq false&$count=true&$top=1&$select=id`,
            headers: { ConsistencyLevel: "eventual" },
        });
    }

    const responses = await batchRequest(token, requests);

    // Parse responses back into a map keyed by email
    const results = new Map<string, { total: number; unread: number }>();
    for (const email of senderEmails) {
        results.set(email, { total: 0, unread: 0 });
    }

    for (const resp of responses) {
        if (resp.status !== 200) continue;

        const [type, indexStr] = resp.id.split("-");
        const index = parseInt(indexStr);
        const email = senderEmails[index];
        if (!email) continue;

        const entry = results.get(email)!;
        // Prefer @odata.count (accurate), fall back to value array length
        const count = (resp.body["@odata.count"] as number)
            ?? (resp.body.value as unknown[] | undefined)?.length
            ?? 0;

        if (type === "total") {
            entry.total = count;
        } else {
            entry.unread = count;
        }
    }

    return results;
}

// Trash messages - moves to Deleted Items folder (recoverable)
// Uses the move endpoint instead of DELETE, which would permanently remove messages
export async function trashMessages(token: string, messageIds: string[]): Promise<void> {
    for (let i = 0; i < messageIds.length; i += 20) {
        const chunk = messageIds.slice(i, i + 20);

        const batchBody = {
            requests: chunk.map((id, index) => ({
                id: String(index),
                method: "POST",
                url: `/me/messages/${id}/move`,
                headers: { "Content-Type": "application/json" },
                body: { destinationId: "deleteditems" },
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
