console.log("SortItOut service worker loaded");

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "ONE_CLICK_UNSUBSCRIBE") {
        fetch(message.url,{
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded",},
            body: "List-Unsubscribe=One-Click",
        })
        .then((res) => sendResponse({ success: res.ok, status: res.status }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
        return true; // Indicates that we will send a response asynchronously
    }
});