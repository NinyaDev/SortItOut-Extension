import { SenderInfo } from "./types";
import { listMessageIds, getMessageHeaders } from "./gmail";
import { parseFrom, parseUnsubscribe, getHeaderValue } from "./parser";

//Function that scans emails based on the token and then returns a list of senders with their information, 
// including the count of emails, unsubscribe options, and message IDs. 
// The results are sorted by the best unsubscribe method and then by the count of emails.

async function processInChunks<T>(items: string[], fn:(item:string)=> Promise<T>, chunkSize: number = 15): Promise<T[]> {
    const results: T[] = [];
    for (let i = 0; i < items.length; i += chunkSize) {
        const chunk = items.slice(i, i + chunkSize);
        const chunkResults = await Promise.all(chunk.map(fn));
        results.push(...chunkResults);
    }
    return results;
}

export async function scanEmails(token: string): Promise<SenderInfo[]> {
    const ids = await listMessageIds(token);
    console.log("Message IDs found:", ids.length);

    const headerResults = await processInChunks(ids, (id) => getMessageHeaders(token, id).then(headers => ({id, headers})));
    console.log("Headers retrieved for messages:", headerResults.length);

    const senderMap = new Map<string, SenderInfo>();

    let skippedNoFrom = 0;
    let skippedNoUnsub = 0;

    for (const {id , headers} of headerResults) {
        const fromRaw = getHeaderValue(headers, "From");
        const unsubRaw = getHeaderValue(headers, "List-Unsubscribe");

        if (!fromRaw) { skippedNoFrom++; continue; }
        if (!unsubRaw) { skippedNoUnsub++; continue; }

        // if(!fromRaw || !unsubRaw) continue; //Skip if they don't have the headers that allow unsubscribing

        const { name, email } = parseFrom(fromRaw);
        const unsubPostRaw = getHeaderValue(headers, "List-Unsubscribe-Post");

        const existing = senderMap.get(email);
        if (existing) {
            existing.count++;
            existing.messageIds.push(id);
        } else {
            senderMap.set(email, {
                email,
                name,
                count: 1,
                unsubscribe: parseUnsubscribe(unsubRaw, unsubPostRaw),
                messageIds: [id],
            });
        }
    }
    console.log("Skipped (no From):", skippedNoFrom);
    console.log("Skipped (no Unsubscribe):", skippedNoUnsub);
    console.log("Unique senders found:", senderMap.size);

    return Array.from(senderMap.values()).sort((a, b) => {
        const methodRank = (s: SenderInfo) =>
            s.unsubscribe.hasOneClick ? 0 : s.unsubscribe.httpUrl ? 1 : 2;

        const rankDiff = methodRank(a) - methodRank(b);
        if (rankDiff !== 0) return rankDiff;
        return b.count - a.count;
    });
}