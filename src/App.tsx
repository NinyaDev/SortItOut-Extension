import { useState, useEffect} from "react";
import { SenderInfo } from "./logic/types";
import { scanEmails } from "./logic/scanner";
import { unsubscribeFromSender, UnsubscribeResult } from "./logic/unsubscribe";
import { trashMessages } from "./logic/gmail";
import SenderSkeleton from "./ui/SenderSkeleton";
import { AnimatedList, AnimatedItem } from "./ui/AnimatedList";


function App() {
    const [token, setToken] = useState<string | null>(null);
    const [email, setEmail] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [senders, setSenders] = useState<SenderInfo[]>([]);
    const [scanning, setScanning] = useState(false);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [results, setResults] = useState<UnsubscribeResult[]>([]);
    const [processing, setProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchUserEmail = (accessToken: string) => {
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

    useEffect(() => {
        chrome.identity.getAuthToken({ interactive: false }, (result) => {
            const accessToken = typeof result === "string" ? result : result?.token;
            if (!accessToken) {
                setLoading(false);
                return;
            }

            fetchUserEmail(accessToken)
                .then((userEmail) => {
                    if (userEmail) {
                        setToken(accessToken);
                        setEmail(userEmail);
                        chrome.storage.local.get("senders", (data) => {
                            const cached = data.senders as SenderInfo[] | undefined;
                            if (cached && cached.length > 0) {
                                setSenders(cached);
                            }
                        });
                    }
                })
                .catch((err) => console.error("Failed to fetch user info:", err))
                .finally(() => setLoading(false));
        });
    }, []);

    useEffect(() => {
        const count = results.filter((r) => r.success).length;
        if (count > 0){
            chrome.action.setBadgeText({ text: String(count) });
            chrome.action.setBadgeBackgroundColor({ color: "#22c55e" });
        } else {
            chrome.action.setBadgeText({ text: "" });
        }
    }, [results]);

    const handleSignIn = () => {
        setLoading(true);
        chrome.identity.getAuthToken({ interactive: true }, (result) => {
            const accessToken = typeof result === "string" ? result : result?.token;

            if (chrome.runtime.lastError || !accessToken) {
                console.error("Error obtaining token:", chrome.runtime.lastError);
                setLoading(false);
                return;
            }

            fetchUserEmail(accessToken)
                .then((userEmail) => {
                    if (userEmail) {
                        setToken(accessToken);
                        setEmail(userEmail);
                        chrome.storage.local.get("senders", (data) => {
                            const cached = data.senders as SenderInfo[] | undefined;
                            if (cached && cached.length > 0) {
                                setSenders(cached);
                            }
                        });
                    }
                })
                .catch((err) => console.error("Failed to fetch user info:", err))
                .finally(() => setLoading(false));
        });
    };

    const handleScan = async () => {
        if (!token) return;
        setScanning(true);
        setError(null);
        try {
            const results = await scanEmails(token);
            setSenders(results);
            chrome.storage.local.set({senders: results});
        } catch (err) {
            console.error("Scan Failed:", err);
            setError("Failed to scan emails. Please try again.");
        } finally {
            setScanning(false);
        }
        
    };

    const toggleSelect = (email: string) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(email)) {
                next.delete(email);
            } else {
                next.add(email);
            }
            return next;
        });
    }

    // Select all / deselect all functionality
    const toggleSelectAll = () => {
        if (selected.size === senders.length) {
            setSelected(new Set());
        } else {
            setSelected(new Set(senders.map((s) => s.email)));
        }
    };

    const handleUnsubscribe = async () => {
        const toProcess = senders.filter((s) => selected.has(s.email));
        if (toProcess.length === 0) return;
        setProcessing(true);
        setError(null);
        const unsubResults: UnsubscribeResult[] = [];

        for (const sender of toProcess) {
            const result = await unsubscribeFromSender(sender);
            unsubResults.push(result);
        }
        setResults(unsubResults);
        setProcessing(false);
    }

    //Trash emails from selected senders
    const handleTrash = async () => {
        if (!token) return;
        const toTrash = senders.filter((s) => selected.has(s.email));
        const allIds = toTrash.flatMap((s) => s.messageIds);

        if (allIds.length === 0) return;
        setProcessing(true);
        setError(null);
        try {
            await trashMessages(token, allIds);
            // After trashing, we can optimistically update the UI by removing the trashed senders
            const updated = senders.filter((s) => !selected.has(s.email));
            setSenders(updated);
            setSelected(new Set());
            chrome.storage.local.set({senders: updated});
        } catch (err) {
            console.error("Failed to trash messages:", err);
            setError("Failed to move messages to trash. Please try again.");
        } finally {
            setProcessing(false);
        }
    };

    const handleUnsubscribeAndTrash = async () => {
        await handleUnsubscribe();
        await handleTrash();
    };

    if (loading) {
        return <div className="w-80 p-4"><p>Loading...</p></div>;
    }

    return (
        <div className="w-80 p-4">
            {email ? (
                <div>
                    <h1 className="text-lg font-bold">SortItOut</h1>
                    <p className="text-sm text-gray-600">Signed in as {email}</p>
                    {error && (
                        <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-2 rounded mb-3 flex justify-between items-center">
                            <span>{error}</span>
                            <button onClick={() => setError(null)} className="text-red-700 font-bold ml-2">
                                x
                            </button>
                        </div>
                    )}
                    {senders.length === 0 && !scanning ? (
                        <button 
                            onClick={handleScan}
                            disabled={scanning}
                            className="w-full bg-green-500 text-white py-2 px-4 rounded hover:bg-green-600 disabled:opacity-50">
                                Scan Emails
                            </button>
                    ) : scanning ? (
                        <div className="space-y-2">
                            {Array.from({ length: 5 }).map((_, i) => (
                                <SenderSkeleton key={i} />
                            ))}
                        </div>
                    ) : (
                        <div>
                        <AnimatedList>
                            <ul className="space-y-2 max-h-96 overflow-y-auto mb-3">
                                {senders.map((sender, index) => (
                                    <AnimatedItem key={sender.email} index={index}>
                                        <li className="p-2 rounded bg-gray-50">
                                            <div className="flex justify-between items-center">
                                                <div className="min-w-0 flex-1">
                                                    <p className="font-medium text-sm truncate">{sender.name}</p>
                                                    <p className="text-xs text-gray-500 truncate">{sender.email}</p>
                                                </div>
                                                <div className="text-right flex-shrink-0 ml-2">
                                                    <span className="text-sm font-bold">{sender.count}</span>
                                                    <p className="text-xs text-gray-400">
                                                        {sender.readCount}/{sender.count} opened ({Math.round((sender.readCount / sender.count) * 100)}%)
                                                    </p>
                                                    <p className="text-xs text-gray-400">
                                                        {sender.unsubscribe.hasOneClick
                                                            ? "One-click"
                                                            : sender.unsubscribe.httpUrl
                                                            ? "Link"
                                                            : "Manual"}
                                                    </p>
                                                </div>
                                            </div>
                                        </li>
                                    </AnimatedItem>
                                ))}
                            </ul>
                        </AnimatedList>

                            {results.length > 0 && (
                                <ul className="mt-3 space-y-1">
                                    {results.map((r) => (
                                        <li key={r.email} className="text-xs flex justify-between items-center">
                                            <div>
                                                <span className={r.success ? "text-green-600" : "text-yellow-600"}>
                                                    {r.success ? "Unsubscribed" : r.method === "link" ? "Tab opened" : "Manual"}
                                                </span>
                                                {" — "}{r.name}
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
                                                    className="text-green-600 hover:underline ml-2 whitespace-nowrap"
                                                >
                                                    Done?
                                                </button>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}
                </div>
            ) : (
                <button
                    onClick={handleSignIn}
                    className="w-full bg-blue-500 text-white py-2 px-4 rounded hover:bg-blue-600"
                >
                    Sign in with Google
                </button>
            )}
        </div>
    );
}

export default App;
