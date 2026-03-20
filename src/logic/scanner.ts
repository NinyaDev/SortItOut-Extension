import { SenderInfo } from "./types";
import { listMessageIds, getMessageHeaders, countSenderMessages, countUnreadFromSender } from "./gmail";
import { parseFrom, parseUnsubscribe, getHeaderValue } from "./parser";

// Processes items in chunks to avoid rate limits. Runs chunkSize items in parallel, waits, then next chunk.
async function processInChunks<T>(items: string[], fn: (item: string) => Promise<T>, chunkSize: number = 15): Promise<T[]> {
    const results: T[] = [];
    for (let i = 0; i < items.length; i += chunkSize) {
        const chunk = items.slice(i, i + chunkSize);
        const chunkResults = await Promise.all(chunk.map(fn));
        results.push(...chunkResults);
    }
    return results;
}

// Function that scans emails based on the token and then returns a list of senders with their information,
// including the count of emails, open rates, unsubscribe options, and message IDs.
// Phase 1: Quick scan of 200 recent emails to find unique senders with unsubscribe headers.
// Phase 2: Enrich each sender with accurate total counts and open rates (IDs fetched on-demand when trashing).
// The results are sorted by the best unsubscribe method and then by the count of emails.
export async function scanEmails(token: string): Promise<SenderInfo[]> {
    // Phase 1: Quick scan — get 200 recent emails with "unsubscribe"
    const ids = await listMessageIds(token);

    const messageResults = await processInChunks(ids, (id) =>
        getMessageHeaders(token, id).then((data) => ({ id, ...data }))
    );

    const senderMap = new Map<string, SenderInfo>();

    for (const { id, headers } of messageResults) {
        const fromRaw = getHeaderValue(headers, "From");
        const unsubRaw = getHeaderValue(headers, "List-Unsubscribe");

        // Skip if they don't have the headers that allow unsubscribing or if From is empty/whitespace
        if (!fromRaw || !fromRaw.trim()) continue;
        if (!unsubRaw) continue;

        const { name, email } = parseFrom(fromRaw);
        const unsubPostRaw = getHeaderValue(headers, "List-Unsubscribe-Post");

        const existing = senderMap.get(email);
        if (existing) {
            existing.messageIds.push(id);
        } else {
            senderMap.set(email, {
                email,
                name,
                count: 1,
                openRate: 0,
                unsubscribe: parseUnsubscribe(unsubRaw, unsubPostRaw),
                messageIds: [id],
            });
        }
    }

    // Phase 2: Enrich — get accurate total counts and open rates per sender.
    // We DON'T fetch all IDs here — just counts. IDs are fetched on-demand when trashing.
    // Open rate = (total - unread) / total, calculated across ALL emails from that sender.
    const senderEmails = Array.from(senderMap.keys());

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
    }, 10);

    // Filter out senders with 0 emails (could have been deleted between Phase 1 and Phase 2)
    const validSenders = Array.from(senderMap.values()).filter((s) => s.count > 0);

    // Sort: one-click senders first (easiest to unsubscribe), then by email count (spammiest first)
    return validSenders.sort((a, b) => {
        const methodRank = (s: SenderInfo) =>
            s.unsubscribe.hasOneClick ? 0 : s.unsubscribe.httpUrl ? 1 : 2;

        const rankDiff = methodRank(a) - methodRank(b);
        if (rankDiff !== 0) return rankDiff;
        return b.count - a.count;
    });
}
