import { UnsubscribeInfo } from "./types";

// Function to parse the From header and get name and email
// Handles two formats: "Name <email>" and plain "email@domain.com"
export function parseFrom(fromHeader: string): { name: string; email: string } {
    const match = fromHeader.match(/^(.+?)\s*<(.+?)>$/); // Regex to capture name and email from "Name <email>" format
    if (match) {
        return { name: match[1].replace(/"/g, "").trim(), email: match[2] };
    }
    return { name: fromHeader, email: fromHeader };
}

// Function to parse the List-Unsubscribe header and extract HTTP and mailto links,
// as well as check for one-click unsubscribe (RFC 8058: has both httpUrl AND List-Unsubscribe-Post header)
export function parseUnsubscribe(unsubHeader: string | null, unsubPostHeader: string | null): UnsubscribeInfo {
    const info: UnsubscribeInfo = {
        httpUrl: null,
        mailto: null,
        hasOneClick: false,
    };
    if (!unsubHeader) return info;

    // Only accept HTTPS URLs — prevents MITM attacks and SSRF via http:// links
    const httpMatch = unsubHeader.match(/<(https:\/\/[^>]+)>/);
    if (httpMatch) info.httpUrl = httpMatch[1];

    const mailtoMatch = unsubHeader.match(/<mailto:([^>]+)>/);
    if (mailtoMatch) info.mailto = mailtoMatch[1];

    if (info.httpUrl && unsubPostHeader) {
        info.hasOneClick = true;
    }
    return info;
}

// Utility function to get a specific header value from the list of headers, case-insensitive
export function getHeaderValue(headers: { name: string; value: string }[], name: string): string | null {
    return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? null;
}
