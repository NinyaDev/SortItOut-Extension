import { useState, useEffect } from "react";
import { SenderInfo } from "./logic/types";
import { scanEmails } from "./logic/scanner";
import { unsubscribeFromSender, UnsubscribeResult } from "./logic/unsubscribe";
import { trashMessages } from "./logic/gmail";


function App() {
    const [token, setToken] = useState<string | null>(null);
    const [email, setEmail] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [senders, setSenders] = useState<SenderInfo[]>([]);
    const [scanning, setScanning] = useState(false);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [results, setResults] = useState<UnsubscribeResult[]>([]);
    const [processing, setProcessing] = useState(false);

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
                    }
                })
                .catch((err) => console.error("Failed to fetch user info:", err))
                .finally(() => setLoading(false));
        });
    }, []);

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
                    }
                })
                .catch((err) => console.error("Failed to fetch user info:", err))
                .finally(() => setLoading(false));
        });
    };

    const handleScan = async () => {
        if (!token) return;
        setScanning(true);
        try {
            const results = await scanEmails(token);
            setSenders(results);
        } catch (err) {
            console.error("Scan Failed:", err);
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
        try {
            await trashMessages(token, allIds);
            // After trashing, we can optimistically update the UI by removing the trashed senders
            setSenders((prev) => prev.filter((s) => !selected.has(s.email)));
            setSelected(new Set());
        } catch (err) {
            console.error("Failed to trash messages:", err);
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
                    {senders.length === 0 ? (
                        <button 
                            onClick={handleScan}
                            disabled={scanning}
                            className="w-full bg-green-500 text-white py-2 px-4 rounded hover:bg-green-600 disabled:opacity-50">
                                {scanning ? "Scanning..." : "Scan Emails"}
                            </button>
                    ) : (
                        <div>
                            <div className="flex justify-between items-center mb-2">
                                <button onClick={toggleSelectAll} className="text-xs text-blue-500 hover:underline">
                                    {selected.size === senders.length ? "Deselect All" : "Select All"}
                                </button>
                                <span className="text-xs text-gray-400">{selected.size} selected</span>
                            </div>
                        <ul className="space-y-2 max-h-72 overflow-y-auto mb-3">
                            {senders.map((sender) => (
                            <li key={sender.email} onClick={() => toggleSelect(sender.email)} className={`p-2 rounded cursor-pointer ${selected.has(sender.email) ? "bg-blue-50 border border-blue-200" : "bg-gray-50"}`}>
                                <div className="flex justify-between items-center">
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            checked={selected.has(sender.email)}
                                            onChange={() => toggleSelect(sender.email)}
                                            className="accent-blue-500"
                                        />
                                        <div>
                                            <p className="font-medium text-sm">{sender.name}</p>
                                            <p className="text-xs text-gray-500">{sender.email}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
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
                            ))}
                            </ul>

                            <div className="flex gap-2 mb-2">
                                <button
                                    onClick={handleUnsubscribe}
                                    disabled={selected.size === 0 || processing}
                                    className="flex-1 bg-red-500 text-white py-2 px-3 rounded text-sm hover:bg-red-600 disabled:opacity-50"
                                >
                                    Unsubscribe
                                </button>
                                <button
                                    onClick={handleTrash}
                                    disabled={selected.size === 0 || processing}
                                    className="flex-1 bg-gray-500 text-white py-2 px-3 rounded text-sm hover:bg-gray-600 disabled:opacity-50"
                                >
                                    Trash
                                </button>
                            </div>
                            <button
                                onClick={handleUnsubscribeAndTrash}
                                disabled={selected.size === 0 || processing}
                                className="w-full bg-red-700 text-white py-2 px-3 rounded text-sm hover:bg-red-800 disabled:opacity-50 mb-2"
                            >
                                {processing ? "Processing..." : "Unsubscribe & Trash"}
                            </button>

                            {results.length > 0 && (
                                <ul className="mt-3 space-y-1">
                                    {results.map((r) => (
                                        <li key={r.email} className="text-xs">
                                            <span className={r.success ? "text-green-600" : "text-yellow-600"}>
                                                {r.success ? "Unsubscribed" : r.method === "link" ? "Tab opened" : "Manual"}
                                            </span>
                                            {" — "}{r.name}
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
