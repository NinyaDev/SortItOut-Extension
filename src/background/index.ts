console.log("SortItOut service worker loaded");

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
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
});
