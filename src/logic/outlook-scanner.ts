import { SenderInfo } from "./types";
import {
    listMessageIds,
    getMessageData,
    countSenderMessages,
    countUnreadFromSender,
    listMessagesWithHeaders,
    getMessageDataBatch,
    countSendersBatch,
    OutlookMessageData,
} from "./outlook";
import { parseFrom, parseUnsubscribe } from "./parser";

// Processes items in chunks with a delay between chunks to avoid Microsoft Graph rate limits.
// KEPT as the ultimate fallback — only used if both the inline and batch approaches fail.
async function processInChunks<T>(items: string[], fn: (item: string) => Promise<T>, chunkSize: number = 4, delayMs: number = 1000): Promise<T[]> {
    const results: T[] = [];
    for (let i = 0; i < items.length; i += chunkSize) {
        const chunk = items.slice(i, i + chunkSize);
        const chunkResults = await Promise.all(chunk.map(fn));
        results.push(...chunkResults);
        // Wait between chunks to stay under Microsoft's rate limits
        if (i + chunkSize < items.length) {
            await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
    }
    return results;
}

// Builds the sender map from an array of message data — shared by all Phase 1 paths.
// Deduplicates by email address, collecting message IDs per sender.
function buildSenderMap(
    messages: Array<{ id?: string; data: OutlookMessageData }>
): Map<string, SenderInfo> {
    const senderMap = new Map<string, SenderInfo>();

    for (const { id, data } of messages) {
        const { from, unsubscribeHeader, unsubscribePostHeader } = data;

        // Skip if they don't have the headers that allow unsubscribing or if From is empty
        if (!from || !from.trim()) continue;
        if (!unsubscribeHeader) continue;

        const { name, email } = parseFrom(from);
        const unsubscribe = parseUnsubscribe(unsubscribeHeader, unsubscribePostHeader);

        const existing = senderMap.get(email);
        if (existing) {
            if (id) existing.messageIds.push(id);
        } else {
            senderMap.set(email, {
                email,
                name,
                count: 1,
                openRate: 0,
                unsubscribe,
                messageIds: id ? [id] : [],
            });
        }
    }

    return senderMap;
}

// Sort senders: one-click first (easiest to unsubscribe), then by count (spammiest)
function sortSenders(senders: SenderInfo[]): SenderInfo[] {
    return senders.sort((a, b) => {
        const methodRank = (s: SenderInfo) =>
            s.unsubscribe.hasOneClick ? 0 : s.unsubscribe.httpUrl ? 1 : 2;

        const rankDiff = methodRank(a) - methodRank(b);
        if (rankDiff !== 0) return rankDiff;
        return b.count - a.count;
    });
}

// Phase 1: Get message data using the fastest available method.
// Path A (fastest): Fetch messages with headers inline via $select on the list endpoint (~4 requests)
// Path B (fallback): Fetch IDs, then batch-fetch details via $batch (~3 batch calls)
// Path C (last resort): Original approach — individual GETs in chunks of 4 with delays
async function phase1(token: string): Promise<Map<string, SenderInfo>> {
    // Path A: Try inline $select — headers returned directly in the list response
    try {
        const messagesWithHeaders = await listMessagesWithHeaders(token);
        const messages = messagesWithHeaders.map((data) => ({ data }));
        return buildSenderMap(messages);
    } catch {
        // Headers not returned inline — expected on some tenants, fall through to Path B
    }

    // Path B: List IDs, then batch-fetch message details (20 per batch call)
    try {
        const ids = await listMessageIds(token);
        const batchResults = await getMessageDataBatch(token, ids);
        const messages = ids
            .filter((id) => batchResults.has(id))
            .map((id) => ({ id, data: batchResults.get(id)! }));
        return buildSenderMap(messages);
    } catch {
        // Batch failed — fall through to Path C
    }

    // Path C: Original individual-fetch approach (slowest, but proven to work)
    const ids = await listMessageIds(token);
    const messageResults = await processInChunks(ids, (id) =>
        getMessageData(token, id).then((data) => ({ id, ...data }))
    );
    const messages = messageResults.map((r) => ({
        id: r.id,
        data: {
            from: r.from,
            subject: null,
            unsubscribeHeader: r.unsubscribeHeader,
            unsubscribePostHeader: r.unsubscribePostHeader,
            isRead: r.isRead,
        } as OutlookMessageData,
    }));
    return buildSenderMap(messages);
}

// Phase 2: Enrich senders with accurate counts and open rates.
// Path A (fast): Batch $count=true queries via $batch (~5 batch calls for 50 senders)
// Path B (fallback): Original individual paginated counts in chunks of 4
async function phase2(token: string, senderMap: Map<string, SenderInfo>): Promise<void> {
    const senderEmails = Array.from(senderMap.keys());
    if (senderEmails.length === 0) return;

    // Path A: Batch counts — $count=true returns the count in a single request per query
    try {
        const counts = await countSendersBatch(token, senderEmails);

        for (const [email, { total, unread }] of counts) {
            const sender = senderMap.get(email);
            if (!sender) continue;
            sender.count = total;
            sender.openRate = total > 0
                ? Math.round(((total - unread) / total) * 100)
                : 0;
        }
        return;
    } catch {
        // Batch counts failed — fall through to Path B
    }

    // Path B: Original individual counts (slow but reliable)
    await processInChunks(senderEmails, async (email) => {
        try {
            const [totalCount, unreadCount] = await Promise.all([
                countSenderMessages(token, email),
                countUnreadFromSender(token, email),
            ]);

            const sender = senderMap.get(email)!;
            sender.count = totalCount;
            sender.openRate = totalCount > 0
                ? Math.round(((totalCount - unreadCount) / totalCount) * 100)
                : 0;
        } catch {
            // Keep sender with sample data rather than crashing the whole scan
        }

        return email;
    }, 4);
}

// Scans Outlook emails and returns a list of senders with unsubscribe info.
// Phase 1: Quick scan to find unique senders with unsubscribe headers.
// Phase 2: Enrich each sender with accurate total counts and open rates.
//
// The optional onPhase1Complete callback enables progressive loading:
// App.tsx can show senders immediately with sample counts while Phase 2
// fetches accurate counts in the background.
export async function scanOutlookEmails(
    token: string,
    onPhase1Complete?: (senders: SenderInfo[]) => void
): Promise<SenderInfo[]> {
    // Phase 1: Find senders
    const senderMap = await phase1(token);

    // Deliver early results if callback provided — senders have sample counts
    // (how many times they appeared in the 200-email sample) which is enough
    // for users to start making decisions while Phase 2 runs
    if (onPhase1Complete) {
        const earlySenders = sortSenders(
            Array.from(senderMap.values()).filter((s) => s.count > 0)
        );
        onPhase1Complete(earlySenders);
    }

    // Phase 2: Enrich with accurate counts
    await phase2(token, senderMap);

    // Filter out senders with 0 emails (could have been deleted between phases)
    const validSenders = Array.from(senderMap.values()).filter((s) => s.count > 0);

    return sortSenders(validSenders);
}
