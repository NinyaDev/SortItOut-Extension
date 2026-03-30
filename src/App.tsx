import { useState, useEffect } from "react";
import { SenderInfo } from "./logic/types";
import { scanEmails } from "./logic/scanner";
import { scanOutlookEmails } from "./logic/outlook-scanner";
import { unsubscribeFromSender, UnsubscribeResult } from "./logic/unsubscribe";
import { trashMessages as gmailTrash, getSenderMessageIds as gmailGetIds } from "./logic/gmail";
import { trashMessages as outlookTrash, getSenderMessageIds as outlookGetIds } from "./logic/outlook";
import { getActiveDismissedEmails, addToDismissed, addMultipleToDismissed } from "./logic/dismissed";
// Outlook auth is handled in the service worker (popup closes during auth flow)
import SenderSkeleton from "./ui/SenderSkeleton";
import { AnimatedList, AnimatedItem } from "./ui/AnimatedList";
import SwipeableCard from "./ui/SwipeableCard";
import InfoPanel from "./ui/InfoPanel";
import DismissedPanel from "./ui/DismissedPanel";

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
    const [showDismissed, setShowDismissed] = useState(false);

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

    // Cache helpers — take explicit provider to avoid state timing issues
    const cacheSendersFor = (provider: Provider, list: SenderInfo[]) => {
        const key = provider === "outlook" ? "outlookSenders" : "gmailSenders";
        const forCache = list.map(({ messageIds, ...rest }) => ({ ...rest, messageIds: [] }));
        chrome.storage.local.set({ [key]: forCache });
    };

    const cacheSenders = (list: SenderInfo[]) => {
        if (activeProvider) cacheSendersFor(activeProvider, list);
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

    // On mount: check for cached tokens and restore last active provider
    useEffect(() => {
        chrome.storage.local.get(
            ["outlookToken", "outlookRefreshToken", "outlookEmail", "lastProvider", "gmailSenders", "outlookSenders"],
            (stored) => {
                const lastProvider = stored.lastProvider as Provider | undefined;
                let hasGmail = false;
                let hasOutlook = false;

                if (stored.outlookToken && stored.outlookEmail) {
                    setOutlookToken(stored.outlookToken as string);
                    setOutlookEmail(stored.outlookEmail as string);
                    hasOutlook = true;
                }

                chrome.identity.getAuthToken({ interactive: false }, (result) => {
                    const accessToken = typeof result === "string" ? result : result?.token;
                    if (accessToken) {
                        fetchGmailEmail(accessToken).then((userEmail) => {
                            if (userEmail) {
                                setGmailToken(accessToken);
                                setGmailEmail(userEmail);
                                hasGmail = true;

                                const providerToUse = lastProvider ?? (hasGmail ? "gmail" : hasOutlook ? "outlook" : null);
                                if (providerToUse) {
                                    setActiveProvider(providerToUse);
                                    const cacheKey = providerToUse === "outlook" ? "outlookSenders" : "gmailSenders";
                                    if (isValidSenderCache(stored[cacheKey])) {
                                        setSenders(stored[cacheKey] as SenderInfo[]);
                                    }
                                }
                            }
                            setLoading(false);
                        }).catch(() => {
                            if (hasOutlook) {
                                setActiveProvider("outlook");
                                if (isValidSenderCache(stored.outlookSenders)) {
                                    setSenders(stored.outlookSenders as SenderInfo[]);
                                }
                            }
                            setLoading(false);
                        });
                    } else {
                        if (hasOutlook) {
                            setActiveProvider("outlook");
                            if (isValidSenderCache(stored.outlookSenders)) {
                                setSenders(stored.outlookSenders as SenderInfo[]);
                            }
                        }
                        setLoading(false);
                    }
                });
            }
        );
    }, []);

    useEffect(() => {
        if (toast) {
            const timer = setTimeout(() => setToast(null), 2000);
            return () => clearTimeout(timer);
        }
    }, [toast]);

    useEffect(() => {
        const count = results.filter((r) => r.success).length;
        if (count > 0) {
            chrome.action.setBadgeText({ text: String(count) });
            chrome.action.setBadgeBackgroundColor({ color: "#7c3aed" });
        } else {
            chrome.action.setBadgeText({ text: "" });
        }
    }, [results]);

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
                        chrome.storage.local.set({ lastProvider: "gmail" });
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

    const handleSignInOutlook = () => {
        setToast("Microsoft sign-in opened...");
        chrome.runtime.sendMessage({ type: "OUTLOOK_SIGN_IN" }, (response) => {
            if (!response?.success) return;

            // Auth succeeded — grab the token from storage and update UI
            chrome.storage.local.get(["outlookToken"], (stored) => {
                if (!stored.outlookToken) return;
                setOutlookToken(stored.outlookToken as string);
                setOutlookEmail(response.email);
                setActiveProvider("outlook");
                chrome.storage.local.set({ lastProvider: "outlook" });
            });
        });
    };

    const switchProvider = (provider: Provider) => {
        if (provider === activeProvider) return;

        if (senders.length > 0 && activeProvider) {
            cacheSendersFor(activeProvider, senders);
        }

        setActiveProvider(provider);
        chrome.storage.local.set({ lastProvider: provider });
        setSenders([]);
        setResults([]);
        setSelected(new Set());
        setError(null);

        const key = provider === "outlook" ? "outlookSenders" : "gmailSenders";
        chrome.storage.local.get(key, (data) => {
            if (isValidSenderCache(data[key])) {
                setSenders(data[key] as SenderInfo[]);
            }
        });
    };

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

        if (activeProvider === "gmail" && outlookToken) {
            switchProvider("outlook");
        } else if (activeProvider === "outlook" && gmailToken) {
            switchProvider("gmail");
        } else {
            setActiveProvider(null);
        }
    };

    const handleScan = async () => {
        const token = getActiveToken();
        if (!token) return;
        setScanning(true);
        setError(null);
        setResults([]);
        setSelected(new Set());
        try {
            // Load the dismissed list once — used to filter both early and final results
            const dismissedSet = await getActiveDismissedEmails(activeProvider!);
            const filterDismissed = (list: SenderInfo[]) =>
                list.filter((s) => !dismissedSet.has(s.email.toLowerCase()));

            if (activeProvider === "outlook") {
                // Progressive loading: show senders as soon as Phase 1 finishes
                // (with sample counts), then silently update with accurate counts
                // when Phase 2 completes. This cuts perceived wait from ~50s to ~3-5s.
                const finalResults = await scanOutlookEmails(token, (phase1Senders) => {
                    const filtered = filterDismissed(phase1Senders);
                    setSenders(filtered);
                    setScanning(false); // Stop skeleton, show results immediately
                });

                // Phase 2 done — update with enriched counts
                const filtered = filterDismissed(finalResults);
                setSenders(filtered);
                cacheSendersFor("outlook", filtered);
            } else {
                // Gmail is already fast (~5s), no progressive loading needed
                const scanResults = await scanEmails(token);
                const filtered = filterDismissed(scanResults);
                setSenders(filtered);
                cacheSendersFor("gmail", filtered);
            }
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

    const handleSwipeLeft = (sender: SenderInfo) => {
        removeSender(sender.email);
        if (activeProvider) addToDismissed(activeProvider, sender.email, "unsubscribed");
        const token = getActiveToken();

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

    const handleSwipeRight = (sender: SenderInfo) => {
        removeSender(sender.email);
        if (activeProvider) addToDismissed(activeProvider, sender.email, "kept");
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

        // Mark all processed senders as dismissed
        if (activeProvider) {
            await addMultipleToDismissed(
                activeProvider,
                toProcess.map((s) => ({ email: s.email, action: "unsubscribed" as const }))
            );
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
            <div className="w-80 p-4 bg-white min-h-[200px] flex items-center justify-center">
                <p className="text-gray-400 animate-pulse">Loading...</p>
            </div>
        );
    }

    // Sign-in screen
    if (!isSignedIn) {
        return (
            <div className="w-80 p-6 bg-white text-center">
                <h1 className="text-2xl font-bold text-gray-800 mb-1">SortItOut</h1>
                <p className="text-sm text-gray-400 mb-8">Your inbox is a mess. Let's fix that.</p>

                <div className="space-y-3">
                    <button
                        onClick={handleSignInGoogle}
                        className="w-full bg-white border border-gray-200 text-gray-700 py-3 px-4 rounded-xl hover:border-violet-300 hover:bg-gray-50 font-medium flex items-center justify-center gap-2 transition-colors"
                    >
                        <span className="text-lg">G</span>
                        Sign in with Google
                    </button>
                    <button
                        onClick={handleSignInOutlook}
                        className="w-full bg-white border border-gray-200 text-gray-700 py-3 px-4 rounded-xl hover:border-violet-300 hover:bg-gray-50 font-medium flex items-center justify-center gap-2 transition-colors"
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
        <div className="w-80 p-4 bg-white relative min-h-[400px]">
            {showInfo && <InfoPanel onClose={() => setShowInfo(false)} />}
            {showDismissed && activeProvider && (
                <DismissedPanel provider={activeProvider} onClose={() => setShowDismissed(false)} />
            )}

            <div>
                {/* Header */}
                <div className="flex justify-between items-center mb-1">
                    <h1 className="text-lg font-bold text-gray-800">SortItOut</h1>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => setShowDismissed(true)}
                            className="w-6 h-6 rounded-full bg-gray-100 text-gray-500 text-xs font-bold hover:bg-violet-100 hover:text-violet-600 flex items-center justify-center transition-colors"
                            title="Dismissed senders"
                        >
                            D
                        </button>
                        <button
                            onClick={() => setShowInfo(true)}
                            className="w-6 h-6 rounded-full bg-gray-100 text-gray-500 text-xs font-bold hover:bg-violet-100 hover:text-violet-600 flex items-center justify-center transition-colors"
                        >
                            ?
                        </button>
                        <button
                            onClick={handleLogout}
                            className="text-xs text-gray-400 hover:text-red-400 px-1 transition-colors"
                        >
                            Logout
                        </button>
                    </div>
                </div>

                {/* Provider tabs */}
                <div className="flex items-center gap-1 mb-2">
                    {gmailEmail && (
                        <button
                            onClick={() => switchProvider("gmail")}
                            className={`text-xs px-3 py-1 rounded-full transition-colors ${
                                activeProvider === "gmail"
                                    ? "bg-violet-500 text-white"
                                    : "bg-gray-100 text-gray-500 hover:bg-gray-200"
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
                                    : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                            }`}
                        >
                            Outlook
                        </button>
                    )}
                    {!gmailEmail && (
                        <button
                            onClick={handleSignInGoogle}
                            className="text-xs px-3 py-1 rounded-full bg-white text-gray-400 border border-dashed border-gray-300 hover:border-violet-300 transition-colors"
                        >
                            + Gmail
                        </button>
                    )}
                    {!outlookEmail && (
                        <button
                            onClick={handleSignInOutlook}
                            className="text-xs px-3 py-1 rounded-full bg-white text-gray-400 border border-dashed border-gray-300 hover:border-violet-300 transition-colors"
                        >
                            + Outlook
                        </button>
                    )}
                </div>

                <p className="text-xs text-gray-400 mb-3">{activeEmail}</p>

                {/* Error banner */}
                {error && (
                    <div className="bg-red-50 border border-red-200 text-red-600 text-xs p-2 rounded-xl mb-3 flex justify-between items-center">
                        <span>{error}</span>
                        <button onClick={() => setError(null)} className="text-red-400 font-bold ml-2">x</button>
                    </div>
                )}

                {/* Toast */}
                {toast && (
                    <div className="bg-violet-50 border border-violet-200 text-violet-600 text-xs p-2 rounded-xl mb-3 text-center">
                        {toast}
                    </div>
                )}

                {/* Scan / Skeleton / Results */}
                {senders.length === 0 && !scanning ? (
                    <div className="text-center py-6">
                        {results.length > 0 && (
                            <div className="mb-4">
                                <p className="text-sm font-semibold text-gray-700 mb-1">
                                    All done! {results.filter((r) => r.success).length} sorted out
                                </p>
                                <p className="text-xs text-gray-400 mb-3">Your inbox thanks you</p>
                                <ul className="space-y-1 text-left max-h-40 overflow-y-auto">
                                    {results.map((r) => (
                                        <li key={r.email} className="text-xs flex justify-between items-center">
                                            <div>
                                                <span className={r.success ? "text-emerald-600" : "text-amber-500"}>
                                                    {r.success ? "Gone!" : r.method === "link" ? "Tab opened" : "Manual"}
                                                </span>
                                                <span className="text-gray-500">{" — "}{r.name}</span>
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
                                                    className="text-violet-500 hover:underline ml-2 whitespace-nowrap"
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
                            className="w-full bg-violet-500 text-white py-3 px-4 rounded-xl hover:bg-violet-600 font-semibold transition-colors"
                        >
                            {results.length > 0 ? "Look for more" : "First cleanup!"}
                        </button>
                    </div>
                ) : scanning ? (
                    <div className="space-y-2">
                        <p className="text-xs text-gray-400 text-center mb-2 animate-pulse">
                            Digging through your {activeProvider === "outlook" ? "Outlook" : "Gmail"}...
                        </p>
                        {Array.from({ length: 5 }).map((_, i) => (
                            <SenderSkeleton key={i} />
                        ))}
                    </div>
                ) : (
                    <div>
                        {/* View toggle + rescan + mode selector */}
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => setViewMode("card")}
                                    className={`text-xs px-3 py-1 rounded-full transition-colors ${
                                        viewMode === "card"
                                            ? "bg-violet-500 text-white"
                                            : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                                    }`}
                                >
                                    Cards
                                </button>
                                <button
                                    onClick={() => setViewMode("list")}
                                    className={`text-xs px-3 py-1 rounded-full transition-colors ${
                                        viewMode === "list"
                                            ? "bg-violet-500 text-white"
                                            : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                                    }`}
                                >
                                    List
                                </button>
                                <button
                                    onClick={handleScan}
                                    className="text-xs px-3 py-1 rounded-full bg-gray-100 text-gray-500 hover:bg-violet-100 hover:text-violet-600 transition-colors"
                                    title="Rescan inbox"
                                >
                                    Rescan
                                </button>
                            </div>
                            <select
                                value={swipeMode}
                                onChange={(e) => setSwipeMode(e.target.value as SwipeMode)}
                                className="text-xs bg-white border border-gray-200 text-gray-600 rounded-lg px-2 py-1"
                            >
                                <option value="unsubscribe">Unsubscribe</option>
                                <option value="unsubscribe-trash">Unsub & Trash</option>
                                <option value="trash">Trash only</option>
                            </select>
                        </div>

                        {/* CARD VIEW */}
                        {viewMode === "card" && currentSender ? (
                            <div>
                                <p className="text-xs text-gray-400 text-center mb-2">
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
                                                <div className="w-16 h-16 bg-violet-50 rounded-full mx-auto mb-3 flex items-center justify-center">
                                                    <span className="text-2xl font-bold text-violet-400">
                                                        {currentSender.name.charAt(0).toUpperCase()}
                                                    </span>
                                                </div>
                                                <h2 className="font-bold text-lg text-gray-800 truncate">
                                                    {currentSender.name}
                                                </h2>
                                                <p className="text-sm text-gray-400 truncate">
                                                    {currentSender.email}
                                                </p>
                                            </div>

                                            <div className="grid grid-cols-2 gap-3 mb-4">
                                                <div className="bg-gray-50 rounded-xl p-3 text-center">
                                                    <p className="text-2xl font-bold text-gray-800">
                                                        {currentSender.count}
                                                    </p>
                                                    <p className="text-xs text-gray-400">emails</p>
                                                </div>
                                                <div className="bg-gray-50 rounded-xl p-3 text-center">
                                                    <p className="text-2xl font-bold text-gray-800">
                                                        {currentSender.openRate}%
                                                    </p>
                                                    <p className="text-xs text-gray-400">opened</p>
                                                </div>
                                            </div>

                                            <div className="text-center">
                                                <span className={`text-xs px-3 py-1 rounded-full font-medium ${
                                                    currentSender.unsubscribe.hasOneClick
                                                        ? "bg-emerald-50 text-emerald-600"
                                                        : currentSender.unsubscribe.httpUrl
                                                        ? "bg-amber-50 text-amber-600"
                                                        : "bg-gray-100 text-gray-500"
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
                                    <span className="text-xs text-gray-400">{selected.size} selected</span>
                                </div>

                                <AnimatedList>
                                    <ul className="space-y-2 max-h-64 overflow-y-auto mb-3">
                                        {senders.map((sender, index) => (
                                            <AnimatedItem key={sender.email} index={index}>
                                                <li
                                                    onClick={() => toggleSelect(sender.email)}
                                                    className={`p-3 rounded-xl cursor-pointer transition-colors ${
                                                        selected.has(sender.email)
                                                            ? "bg-violet-50 border border-violet-200"
                                                            : "bg-gray-50 border border-transparent hover:border-gray-200"
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
                                                                <p className="font-medium text-sm text-gray-800 truncate">{sender.name}</p>
                                                                <p className="text-xs text-gray-400 truncate">{sender.email}</p>
                                                            </div>
                                                        </div>
                                                        <div className="text-right flex-shrink-0 ml-2">
                                                            <span className="text-sm font-bold text-gray-700">{sender.count}</span>
                                                            <p className="text-xs text-gray-400">{sender.openRate}% opened</p>
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
                                    className="w-full bg-violet-500 text-white py-2 px-4 rounded-xl text-sm font-semibold hover:bg-violet-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
