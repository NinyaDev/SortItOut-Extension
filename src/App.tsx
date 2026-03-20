import { useState, useEffect } from "react";
import { SenderInfo } from "./logic/types";
import { scanEmails } from "./logic/scanner";
import { scanOutlookEmails } from "./logic/outlook-scanner";
import { unsubscribeFromSender, UnsubscribeResult } from "./logic/unsubscribe";
import { trashMessages as gmailTrash, getSenderMessageIds as gmailGetIds } from "./logic/gmail";
import { trashMessages as outlookTrash, getSenderMessageIds as outlookGetIds } from "./logic/outlook";
// Outlook auth is handled in the service worker (popup closes during auth flow)
import SenderSkeleton from "./ui/SenderSkeleton";
import { AnimatedList, AnimatedItem } from "./ui/AnimatedList";
import SwipeableCard from "./ui/SwipeableCard";
import InfoPanel from "./ui/InfoPanel";

type SwipeMode = "unsubscribe" | "unsubscribe-trash" | "trash";
type ViewMode = "card" | "list";
type Provider = "gmail" | "outlook";

function App() {
    // Auth state — separate per provider so both can be signed in simultaneously
    const [gmailToken, setGmailToken] = useState<string | null>(null);
    const [gmailEmail, setGmailEmail] = useState<string | null>(null);
    const [outlookToken, setOutlookToken] = useState<string | null>(null);
    const [outlookEmail, setOutlookEmail] = useState<string | null>(null);

    // Active provider determines which senders/token the UI uses
    const [activeProvider, setActiveProvider] = useState<Provider | null>(null);
    const [loading, setLoading] = useState(true);

    // Shared UI state — applies to whichever provider is active
    const [senders, setSenders] = useState<SenderInfo[]>([]);
    const [scanning, setScanning] = useState(false);
    const [results, setResults] = useState<UnsubscribeResult[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [swipeMode, setSwipeMode] = useState<SwipeMode>("unsubscribe");
    const [viewMode, setViewMode] = useState<ViewMode>("card");
    const [showInfo, setShowInfo] = useState(false);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [processing, setProcessing] = useState(false);
    const [toast, setToast] = useState<string | null>(null);

    // Helper: validate cached sender data before loading
    const isValidSenderCache = (data: unknown): data is SenderInfo[] => {
        if (!Array.isArray(data)) return false;
        if (data.length === 0) return false;
        const first = data[0];
        return typeof first.email === "string"
            && typeof first.count === "number"
            && typeof first.openRate === "number"
            && first.unsubscribe !== undefined;
    };

    // Helper: get the right API functions based on active provider
    const getTrashFn = () => activeProvider === "outlook" ? outlookTrash : gmailTrash;
    const getIdsFn = () => activeProvider === "outlook" ? outlookGetIds : gmailGetIds;
    const getActiveToken = () => activeProvider === "outlook" ? outlookToken : gmailToken;
    const getCacheKey = () => activeProvider === "outlook" ? "outlookSenders" : "gmailSenders";

    // Strip messageIds from cache to save storage space — IDs are fetched fresh when needed
    const cacheSenders = (list: SenderInfo[]) => {
        const forCache = list.map(({ messageIds, ...rest }) => ({ ...rest, messageIds: [] }));
        chrome.storage.local.set({ [getCacheKey()]: forCache });
    };

    // Fetch Gmail user email using Gmail profile endpoint
    const fetchGmailEmail = (accessToken: string) => {
        return fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
            headers: { Authorization: `Bearer ${accessToken}` },
        })
        .then((res) => {
            if (res.status === 401) {
                chrome.identity.removeCachedAuthToken({ token: accessToken });
                return null;
            }
            return res.json();
        })
        .then((data) => data?.emailAddress ?? null);
    };

    // On mount: check for cached Gmail token and Outlook token
    useEffect(() => {
        let resolved = false;

        // Check Gmail
        chrome.identity.getAuthToken({ interactive: false }, (result) => {
            const accessToken = typeof result === "string" ? result : result?.token;
            if (accessToken) {
                fetchGmailEmail(accessToken).then((userEmail) => {
                    if (userEmail) {
                        setGmailToken(accessToken);
                        setGmailEmail(userEmail);
                        // If no provider is set yet, default to Gmail
                        setActiveProvider((prev) => prev ?? "gmail");
                        chrome.storage.local.get("gmailSenders", (data) => {
                            if (isValidSenderCache(data.gmailSenders)) {
                                // Only load Gmail cache if Gmail is the active provider
                                setSenders((prev) => prev.length === 0 ? data.gmailSenders : prev);
                            }
                        });
                    }
                }).catch((err) => console.error("Gmail auth check failed:", err));
            }
            if (!resolved) { resolved = true; }
        });

        // Check Outlook — load from chrome.storage.local
        chrome.storage.local.get(["outlookToken", "outlookRefreshToken", "outlookEmail"], (data) => {
            if (data.outlookToken && data.outlookEmail) {
                setOutlookToken(data.outlookToken);
                setOutlookEmail(data.outlookEmail);
                // If Gmail didn't set a provider, use Outlook
                setActiveProvider((prev) => prev ?? "outlook");
            }
            // Both checks done
            setLoading(false);
        });
    }, []);

    // Auto-dismiss toast after 2 seconds
    useEffect(() => {
        if (toast) {
            const timer = setTimeout(() => setToast(null), 2000);
            return () => clearTimeout(timer);
        }
    }, [toast]);

    // Update badge count when results change
    useEffect(() => {
        const count = results.filter((r) => r.success).length;
        if (count > 0) {
            chrome.action.setBadgeText({ text: String(count) });
            chrome.action.setBadgeBackgroundColor({ color: "#8b5cf6" });
        } else {
            chrome.action.setBadgeText({ text: "" });
        }
    }, [results]);

    // Sign in with Google — uses Chrome's built-in OAuth
    const handleSignInGoogle = () => {
        setLoading(true);
        chrome.identity.getAuthToken({ interactive: true }, (result) => {
            const accessToken = typeof result === "string" ? result : result?.token;

            if (chrome.runtime.lastError || !accessToken) {
                console.error("Error obtaining token:", chrome.runtime.lastError);
                setLoading(false);
                return;
            }

            fetchGmailEmail(accessToken)
                .then((userEmail) => {
                    if (userEmail) {
                        setGmailToken(accessToken);
                        setGmailEmail(userEmail);
                        setActiveProvider("gmail");
                        chrome.storage.local.get("gmailSenders", (data) => {
                            if (isValidSenderCache(data.gmailSenders)) {
                                setSenders(data.gmailSenders);
                            }
                        });
                    }
                })
                .catch((err) => console.error("Failed to fetch user info:", err))
                .finally(() => setLoading(false));
        });
    };

    // Sign in with Microsoft — sends message to service worker which handles the OAuth flow.
    // The popup may close during auth, so the service worker saves tokens to storage.
    // When the popup reopens, useEffect finds the tokens and loads Outlook state.
    const handleSignInOutlook = () => {
        chrome.runtime.sendMessage({ type: "OUTLOOK_SIGN_IN" });
        setToast("Microsoft sign-in opened...");
    };

    // Switch between Gmail and Outlook (both stay signed in)
    const switchProvider = (provider: Provider) => {
        if (provider === activeProvider) return;

        // Save current senders before switching
        if (senders.length > 0) {
            cacheSenders(senders);
        }

        setActiveProvider(provider);
        setSenders([]);
        setResults([]);
        setSelected(new Set());
        setError(null);

        // Load cached senders for the new provider
        const key = provider === "outlook" ? "outlookSenders" : "gmailSenders";
        chrome.storage.local.get(key, (data) => {
            if (isValidSenderCache(data[key])) {
                setSenders(data[key]);
            }
        });
    };

    // Logout from the active provider only
    const handleLogout = () => {
        if (activeProvider === "gmail" && gmailToken) {
            chrome.identity.removeCachedAuthToken({ token: gmailToken });
            setGmailToken(null);
            setGmailEmail(null);
            chrome.storage.local.remove("gmailSenders");
        } else if (activeProvider === "outlook") {
            setOutlookToken(null);
            setOutlookEmail(null);
            chrome.storage.local.remove(["outlookToken", "outlookRefreshToken", "outlookEmail", "outlookSenders"]);
        }

        setSenders([]);
        setResults([]);
        setSelected(new Set());
        setError(null);

        // If the other provider is still signed in, switch to it
        if (activeProvider === "gmail" && outlookToken) {
            switchProvider("outlook");
        } else if (activeProvider === "outlook" && gmailToken) {
            switchProvider("gmail");
        } else {
            setActiveProvider(null);
        }
    };

    // Scan emails using the active provider's scanner
    const handleScan = async () => {
        const token = getActiveToken();
        if (!token) return;
        setScanning(true);
        setError(null);
        setResults([]);
        setSelected(new Set());
        try {
            const scanResults = activeProvider === "outlook"
                ? await scanOutlookEmails(token)
                : await scanEmails(token);
            setSenders(scanResults);
            cacheSenders(scanResults);
        } catch (err) {
            console.error("Scan Failed:", err);
            setError("Scan failed. Check your connection and try again.");
        } finally {
            setScanning(false);
        }
    };

    const removeSender = (senderEmail: string) => {
        setSenders((prev) => {
            const updated = prev.filter((s) => s.email !== senderEmail);
            cacheSenders(updated);
            return updated;
        });
    };

    // Swipe left: unsubscribe and/or trash, then remove card immediately
    const handleSwipeLeft = (sender: SenderInfo) => {
        removeSender(sender.email);
        const token = getActiveToken();

        // Run unsubscribe in background
        if (swipeMode === "unsubscribe" || swipeMode === "unsubscribe-trash") {
            unsubscribeFromSender(sender).then((result) => {
                setResults((prev) => [...prev, result]);
                if (result.success) {
                    setToast(`Unsubscribed from ${sender.name}`);
                } else if (result.method === "link") {
                    setToast(`Tab opened for ${sender.name}`);
                } else {
                    setToast(`Manual: ${sender.name}`);
                }
            });
        } else {
            setToast(`Trashing ${sender.count} emails from ${sender.name}...`);
        }

        // Run trash in background — fetch fresh IDs then trash
        if ((swipeMode === "trash" || swipeMode === "unsubscribe-trash") && token) {
            const getIds = getIdsFn();
            const trash = getTrashFn();
            getIds(token, sender.email)
                .then((ids) => trash(token, ids))
                .then(() => setToast(`Trashed emails from ${sender.name}`))
                .catch((err) => {
                    console.error("Failed to trash:", err);
                    setError("Couldn't trash emails from " + sender.name);
                });
        }
    };

    // Swipe right: keep/dismiss
    const handleSwipeRight = (sender: SenderInfo) => {
        removeSender(sender.email);
        setToast(`Kept ${sender.name}`);
    };

    const toggleSelect = (senderEmail: string) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(senderEmail)) {
                next.delete(senderEmail);
            } else {
                next.add(senderEmail);
            }
            return next;
        });
    };

    // Batch action for list view — processes selected senders sequentially
    const handleBatchAction = async () => {
        const toProcess = senders.filter((s) => selected.has(s.email));
        if (toProcess.length === 0) return;
        setProcessing(true);
        setError(null);

        const token = getActiveToken();
        const getIds = getIdsFn();
        const trash = getTrashFn();
        let failCount = 0;

        for (const sender of toProcess) {
            try {
                if (swipeMode === "unsubscribe" || swipeMode === "unsubscribe-trash") {
                    const result = await unsubscribeFromSender(sender);
                    setResults((prev) => [...prev, result]);
                }

                if ((swipeMode === "trash" || swipeMode === "unsubscribe-trash") && token) {
                    const ids = await getIds(token, sender.email);
                    await trash(token, ids);
                }
            } catch (err) {
                console.error(`Failed for ${sender.email}:`, err);
                failCount++;
            }
        }

        if (failCount > 0) {
            setError(`${failCount} sender${failCount > 1 ? "s" : ""} failed. Try again or rescan.`);
        }

        const updated = senders.filter((s) => !selected.has(s.email));
        setSenders(updated);
        setSelected(new Set());
        cacheSenders(updated);
        setProcessing(false);
    };

    const swipeLabel: Record<SwipeMode, string> = {
        "unsubscribe": "Unsubscribe",
        "unsubscribe-trash": "Unsub & Trash",
        "trash": "Trash",
    };

    const currentSender = senders[0];
    const remaining = senders.length;
    const isSignedIn = gmailEmail || outlookEmail;
    const activeEmail = activeProvider === "outlook" ? outlookEmail : gmailEmail;

    if (loading) {
        return (
            <div className="w-80 p-4 bg-violet-50 min-h-[200px] flex items-center justify-center">
                <p className="text-violet-400 animate-pulse">Loading...</p>
            </div>
        );
    }

    // Sign-in screen — shown when no provider is signed in
    if (!isSignedIn) {
        return (
            <div className="w-80 p-6 bg-violet-50 text-center">
                <h1 className="text-2xl font-bold text-yellow-500 mb-1">SortItOut</h1>
                <p className="text-sm text-violet-500 mb-8">Your inbox is a mess. Let's fix that.</p>

                <div className="space-y-3">
                    <button
                        onClick={handleSignInGoogle}
                        className="w-full bg-white border-2 border-violet-200 text-violet-700 py-3 px-4 rounded-xl hover:border-violet-400 hover:bg-violet-50 font-medium flex items-center justify-center gap-2 transition-colors"
                    >
                        <span className="text-lg">G</span>
                        Sign in with Google
                    </button>
                    <button
                        onClick={handleSignInOutlook}
                        className="w-full bg-white border-2 border-violet-200 text-violet-700 py-3 px-4 rounded-xl hover:border-violet-400 hover:bg-violet-50 font-medium flex items-center justify-center gap-2 transition-colors"
                    >
                        <span className="text-lg">M</span>
                        Sign in with Microsoft
                    </button>
                </div>
            </div>
        );
    }

    // Main app screen
    return (
        <div className="w-80 p-4 bg-violet-50 relative min-h-[400px]">
            {showInfo && <InfoPanel onClose={() => setShowInfo(false)} />}

            <div>
                {/* Header */}
                <div className="flex justify-between items-center mb-1">
                    <div className="flex items-center gap-2">
                        <h1 className="text-lg font-bold text-yellow-500">SortItOut</h1>
                    </div>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => setShowInfo(true)}
                            className="w-6 h-6 rounded-full bg-violet-200 text-violet-600 text-xs font-bold hover:bg-violet-300 flex items-center justify-center transition-colors"
                        >
                            ?
                        </button>
                        <button
                            onClick={handleLogout}
                            className="text-xs text-violet-400 hover:text-red-400 px-1 transition-colors"
                        >
                            Logout
                        </button>
                    </div>
                </div>

                {/* Provider tabs — only show if at least one provider is signed in */}
                <div className="flex items-center gap-1 mb-2">
                    {gmailEmail && (
                        <button
                            onClick={() => switchProvider("gmail")}
                            className={`text-xs px-3 py-1 rounded-full transition-colors ${
                                activeProvider === "gmail"
                                    ? "bg-violet-500 text-white"
                                    : "bg-white text-violet-500 border border-violet-200"
                            }`}
                        >
                            Gmail
                        </button>
                    )}
                    {outlookEmail && (
                        <button
                            onClick={() => switchProvider("outlook")}
                            className={`text-xs px-3 py-1 rounded-full transition-colors ${
                                activeProvider === "outlook"
                                    ? "bg-violet-500 text-white"
                                    : "bg-white text-violet-500 border border-violet-200"
                            }`}
                        >
                            Outlook
                        </button>
                    )}
                    {/* Button to add the other provider if only one is signed in */}
                    {!gmailEmail && (
                        <button
                            onClick={handleSignInGoogle}
                            className="text-xs px-3 py-1 rounded-full bg-white text-violet-400 border border-dashed border-violet-300 hover:border-violet-400 transition-colors"
                        >
                            + Gmail
                        </button>
                    )}
                    {!outlookEmail && (
                        <button
                            onClick={handleSignInOutlook}
                            className="text-xs px-3 py-1 rounded-full bg-white text-violet-400 border border-dashed border-violet-300 hover:border-violet-400 transition-colors"
                        >
                            + Outlook
                        </button>
                    )}
                </div>

                <p className="text-xs text-violet-400 mb-3">{activeEmail}</p>

                {/* Error banner */}
                {error && (
                    <div className="bg-red-50 border border-red-200 text-red-600 text-xs p-2 rounded-xl mb-3 flex justify-between items-center">
                        <span>{error}</span>
                        <button onClick={() => setError(null)} className="text-red-400 font-bold ml-2">x</button>
                    </div>
                )}

                {/* Toast notification */}
                {toast && (
                    <div className="bg-violet-100 border border-violet-200 text-violet-700 text-xs p-2 rounded-xl mb-3 text-center animate-pulse">
                        {toast}
                    </div>
                )}

                {/* Scan button / Skeleton / Results */}
                {senders.length === 0 && !scanning ? (
                    <div className="text-center py-6">
                        {results.length > 0 && (
                            <div className="mb-4">
                                <p className="text-sm font-bold text-violet-700 mb-1">
                                    All done! {results.filter((r) => r.success).length} sorted out
                                </p>
                                <p className="text-xs text-violet-400 mb-3">Your inbox thanks you</p>
                                <ul className="space-y-1 text-left max-h-40 overflow-y-auto">
                                    {results.map((r) => (
                                        <li key={r.email} className="text-xs flex justify-between items-center">
                                            <div>
                                                <span className={r.success ? "text-emerald-600" : "text-yellow-600"}>
                                                    {r.success ? "Gone!" : r.method === "link" ? "Tab opened" : "Manual"}
                                                </span>
                                                <span className="text-violet-500">{" — "}{r.name}</span>
                                            </div>
                                            {r.method === "link" && !r.success && (
                                                <button
                                                    onClick={() => {
                                                        setResults((prev) =>
                                                            prev.map((item) =>
                                                                item.email === r.email ? { ...item, success: true } : item
                                                            )
                                                        );
                                                    }}
                                                    className="text-yellow-500 hover:underline ml-2 whitespace-nowrap"
                                                >
                                                    Did it?
                                                </button>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                        <button
                            onClick={handleScan}
                            className="w-full bg-violet-500 text-white py-3 px-4 rounded-xl hover:bg-violet-600 font-bold transition-colors"
                        >
                            {results.length > 0 ? "Look for more" : "First cleanup!"}
                        </button>
                    </div>
                ) : scanning ? (
                    <div className="space-y-2">
                        <p className="text-xs text-violet-400 text-center mb-2 animate-pulse">
                            Digging through your {activeProvider === "outlook" ? "Outlook" : "Gmail"}...
                        </p>
                        {Array.from({ length: 5 }).map((_, i) => (
                            <SenderSkeleton key={i} />
                        ))}
                    </div>
                ) : (
                    <div>
                        {/* View toggle + mode selector */}
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => setViewMode("card")}
                                    className={`text-xs px-3 py-1 rounded-full transition-colors ${
                                        viewMode === "card"
                                            ? "bg-violet-500 text-white"
                                            : "bg-white text-violet-500 border border-violet-200"
                                    }`}
                                >
                                    Cards
                                </button>
                                <button
                                    onClick={() => setViewMode("list")}
                                    className={`text-xs px-3 py-1 rounded-full transition-colors ${
                                        viewMode === "list"
                                            ? "bg-violet-500 text-white"
                                            : "bg-white text-violet-500 border border-violet-200"
                                    }`}
                                >
                                    List
                                </button>
                            </div>
                            <select
                                value={swipeMode}
                                onChange={(e) => setSwipeMode(e.target.value as SwipeMode)}
                                className="text-xs bg-white border border-violet-200 text-violet-600 rounded-lg px-2 py-1"
                            >
                                <option value="unsubscribe">Unsubscribe</option>
                                <option value="unsubscribe-trash">Unsub & Trash</option>
                                <option value="trash">Trash only</option>
                            </select>
                        </div>

                        {/* CARD VIEW */}
                        {viewMode === "card" && currentSender ? (
                            <div>
                                <p className="text-xs text-violet-400 text-center mb-2">
                                    {remaining} sender{remaining !== 1 ? "s" : ""} left
                                </p>

                                <AnimatedList>
                                    <SwipeableCard
                                        key={currentSender.email}
                                        onSwipeLeft={() => handleSwipeLeft(currentSender)}
                                        onSwipeRight={() => handleSwipeRight(currentSender)}
                                        leftLabel={swipeLabel[swipeMode]}
                                    >
                                        <div className="p-6">
                                            <div className="text-center mb-4">
                                                <div className="w-16 h-16 bg-violet-100 rounded-full mx-auto mb-3 flex items-center justify-center">
                                                    <span className="text-2xl font-bold text-violet-500">
                                                        {currentSender.name.charAt(0).toUpperCase()}
                                                    </span>
                                                </div>
                                                <h2 className="font-bold text-lg text-violet-800 truncate">
                                                    {currentSender.name}
                                                </h2>
                                                <p className="text-sm text-violet-400 truncate">
                                                    {currentSender.email}
                                                </p>
                                            </div>

                                            <div className="grid grid-cols-2 gap-3 mb-4">
                                                <div className="bg-violet-50 rounded-xl p-3 text-center">
                                                    <p className="text-2xl font-bold text-yellow-500">
                                                        {currentSender.count}
                                                    </p>
                                                    <p className="text-xs text-violet-400">emails</p>
                                                </div>
                                                <div className="bg-violet-50 rounded-xl p-3 text-center">
                                                    <p className="text-2xl font-bold text-yellow-500">
                                                        {currentSender.openRate}%
                                                    </p>
                                                    <p className="text-xs text-violet-400">opened</p>
                                                </div>
                                            </div>

                                            <div className="text-center">
                                                <span className={`text-xs px-3 py-1 rounded-full font-medium ${
                                                    currentSender.unsubscribe.hasOneClick
                                                        ? "bg-emerald-100 text-emerald-700"
                                                        : currentSender.unsubscribe.httpUrl
                                                        ? "bg-yellow-100 text-yellow-700"
                                                        : "bg-violet-100 text-violet-500"
                                                }`}>
                                                    {currentSender.unsubscribe.hasOneClick
                                                        ? "One-click"
                                                        : currentSender.unsubscribe.httpUrl
                                                        ? "Link"
                                                        : "Manual"}
                                                </span>
                                            </div>
                                        </div>
                                    </SwipeableCard>
                                </AnimatedList>

                                <div className="flex justify-between mt-4 text-xs">
                                    <span className="text-red-400">← {swipeLabel[swipeMode]}</span>
                                    <span className="text-emerald-500">Keep →</span>
                                </div>
                            </div>

                        /* LIST VIEW */
                        ) : viewMode === "list" ? (
                            <div>
                                <div className="flex justify-between items-center mb-2">
                                    <button
                                        onClick={() => {
                                            if (selected.size === senders.length) {
                                                setSelected(new Set());
                                            } else {
                                                setSelected(new Set(senders.map((s) => s.email)));
                                            }
                                        }}
                                        className="text-xs text-violet-500 hover:underline"
                                    >
                                        {selected.size === senders.length ? "Deselect all" : "Select all"}
                                    </button>
                                    <span className="text-xs text-violet-400">{selected.size} selected</span>
                                </div>

                                <AnimatedList>
                                    <ul className="space-y-2 max-h-64 overflow-y-auto mb-3">
                                        {senders.map((sender, index) => (
                                            <AnimatedItem key={sender.email} index={index}>
                                                <li
                                                    onClick={() => toggleSelect(sender.email)}
                                                    className={`p-3 rounded-xl cursor-pointer transition-colors ${
                                                        selected.has(sender.email)
                                                            ? "bg-violet-100 border-2 border-violet-300"
                                                            : "bg-white border-2 border-transparent hover:border-violet-200"
                                                    }`}
                                                >
                                                    <div className="flex justify-between items-center">
                                                        <div className="flex items-center gap-2 min-w-0 flex-1">
                                                            <input
                                                                type="checkbox"
                                                                checked={selected.has(sender.email)}
                                                                onChange={(e) => { e.stopPropagation(); toggleSelect(sender.email); }}
                                                                className="accent-violet-500 flex-shrink-0"
                                                            />
                                                            <div className="min-w-0">
                                                                <p className="font-medium text-sm text-violet-800 truncate">{sender.name}</p>
                                                                <p className="text-xs text-violet-400 truncate">{sender.email}</p>
                                                            </div>
                                                        </div>
                                                        <div className="text-right flex-shrink-0 ml-2">
                                                            <span className="text-sm font-bold text-yellow-500">{sender.count}</span>
                                                            <p className="text-xs text-violet-400">{sender.openRate}% opened</p>
                                                        </div>
                                                    </div>
                                                </li>
                                            </AnimatedItem>
                                        ))}
                                    </ul>
                                </AnimatedList>

                                <button
                                    onClick={handleBatchAction}
                                    disabled={selected.size === 0 || processing}
                                    className="w-full bg-violet-500 text-white py-2 px-4 rounded-xl text-sm font-bold hover:bg-violet-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                >
                                    {processing
                                        ? "Working on it..."
                                        : `${swipeLabel[swipeMode]} (${selected.size})`}
                                </button>
                            </div>
                        ) : null}
                    </div>
                )}
            </div>
        </div>
    );
}

export default App;
