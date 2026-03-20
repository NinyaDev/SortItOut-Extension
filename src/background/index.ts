import { outlookSignIn, getOutlookUserEmail } from "../logic/outlook-auth";

console.log("SortItOut service worker loaded");

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    // One-click unsubscribe POST — works for both Gmail and Outlook senders
    if (message.type === "ONE_CLICK_UNSUBSCRIBE") {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        fetch(message.url, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: "List-Unsubscribe=One-Click",
            signal: controller.signal,
        })
        .then((res) => {
            clearTimeout(timeout);
            sendResponse({ success: res.ok, status: res.status });
        })
        .catch((err) => {
            clearTimeout(timeout);
            sendResponse({
                success: false,
                error: err.name === "AbortError" ? "Request timed out" : err.message,
            });
        });

        return true;
    }

    // Outlook sign-in — runs in service worker because the popup closes during auth
    if (message.type === "OUTLOOK_SIGN_IN") {
        outlookSignIn()
            .then(async (tokens) => {
                const email = await getOutlookUserEmail(tokens.accessToken);
                if (!email) throw new Error("Could not get Outlook email");

                // Save tokens and email to storage — popup reads these on next open
                await chrome.storage.local.set({
                    outlookToken: tokens.accessToken,
                    outlookRefreshToken: tokens.refreshToken,
                    outlookEmail: email,
                });

                sendResponse({ success: true, email });
            })
            .catch((err) => {
                sendResponse({ success: false, error: err.message });
            });

        return true;
    }
});
