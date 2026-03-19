import { useState, useEffect } from "react";
import { SenderInfo } from "./logic/types";
import { scanEmails } from "./logic/scanner";

function App() {
    const [token, setToken] = useState<string | null>(null);
    const [email, setEmail] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [senders, setSenders] = useState<SenderInfo[]>([]);
    const [scanning, setScanning] = useState(false);

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
                        <ul className="space-y-2 max-h-96 overflow-y-auto">
                            {senders.map((sender) => (
                            <li key={sender.email} className="p-2 bg-gray-50 rounded">
                                <div className="flex justify-between items-center">
                                    <div>
                                        <p className="font-medium text-sm">{sender.name}</p>
                                        <p className="text-xs text-gray-500">{sender.email}</p>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-sm font-bold">{sender.count}</span>
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
