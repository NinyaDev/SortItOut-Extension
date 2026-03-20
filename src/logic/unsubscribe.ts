import { SenderInfo } from "./types";

export interface UnsubscribeResult {
    email: string;
    name: string;
    success: boolean;
    method: "one-click" | "link" | "manual";
    url?: string;
}

// Unsubscribing function that handles one-click, link-based, and manual unsubscribes.
// For one-click: sends POST request to the sender's server via the service worker (background script).
// For link-based: opens the unsubscribe page in a new tab, marked as false until user confirms with "Did it?" button.
// For manual: returns the mailto address so the user can handle it themselves.
export async function unsubscribeFromSender(sender: SenderInfo): Promise<UnsubscribeResult> {
    const {unsubscribe} = sender;

    if (unsubscribe.hasOneClick && unsubscribe.httpUrl) {
        const response = await chrome.runtime.sendMessage({
            type: "ONE_CLICK_UNSUBSCRIBE",
            url: unsubscribe.httpUrl,
        });

        return {
            email: sender.email,
            name: sender.name,
            success: response?.success ?? false,
            method: "one-click",
        }
    }

    if (unsubscribe.httpUrl) {
        // For link-based unsubscribes, we can't automate the process, but we can mark it as "false" in terms of being able to attempt it.
        // It will later be confirmed by the user with a button to set it to true
        chrome.tabs.create({ url: unsubscribe.httpUrl, active: false });
        return {
            email: sender.email,
            name: sender.name,
            success: false,
            method: "link",
            url: unsubscribe.httpUrl,
        };
    }
    // This is the manual case where we don't have link or mailto, so we just return the sender info and mark it as not successful since we can't automate it.
    return {
        email: sender.email,
        name: sender.name,
        success: false,
        method: "manual",
        url: unsubscribe.mailto ? `mailto:${unsubscribe.mailto}` : undefined,
    }

}