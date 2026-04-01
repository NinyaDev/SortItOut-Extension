import { useState, useEffect } from "react";
import {
    getDismissedList,
    removeFromDismissed,
    clearDismissed,
    getCooldownSetting,
    setCooldownSetting,
    DismissedEntry,
    CooldownSetting,
} from "../logic/dismissed";

interface DismissedPanelProps {
    accountEmail: string;
    onClose: () => void;
}

function DismissedPanel({ accountEmail, onClose }: DismissedPanelProps) {
    const [entries, setEntries] = useState<DismissedEntry[]>([]);
    const [cooldown, setCooldown] = useState<CooldownSetting>("1week");
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        Promise.all([getDismissedList(accountEmail), getCooldownSetting()]).then(
            ([list, setting]) => {
                setEntries(list);
                setCooldown(setting);
                setLoading(false);
            }
        );
    }, [accountEmail]);

    const handleRemove = (email: string) => {
        removeFromDismissed(accountEmail, email);
        setEntries((prev) => prev.filter((e) => e.email !== email));
    };

    const handleClearAll = () => {
        clearDismissed(accountEmail);
        setEntries([]);
    };

    const handleCooldownChange = (value: CooldownSetting) => {
        setCooldown(value);
        setCooldownSetting(value);
    };

    const formatDate = (timestamp: number) => {
        return new Date(timestamp).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
        });
    };

    const cooldownLabel: Record<CooldownSetting, string> = {
        "1week": "1 week",
        "1month": "1 month",
        "never": "Never",
    };

    return (
        <div className="absolute inset-0 bg-white z-20 p-4 overflow-y-auto overscroll-contain rounded-lg">
            <div className="flex justify-between items-center mb-3">
                <h2 className="text-lg font-bold text-gray-800">Dismissed</h2>
                <button
                    onClick={onClose}
                    className="text-gray-400 hover:text-gray-600 text-lg font-bold"
                >
                    x
                </button>
            </div>

            <p className="text-xs text-gray-400 mb-3">
                Senders you've already reviewed for {accountEmail}
            </p>

            {/* Cooldown setting */}
            <div className="flex items-center justify-between mb-3 bg-gray-50 rounded-xl p-3">
                <div>
                    <p className="text-sm font-medium text-gray-700">Reappear after</p>
                    <p className="text-xs text-gray-400">Only for kept senders</p>
                </div>
                <select
                    value={cooldown}
                    onChange={(e) => handleCooldownChange(e.target.value as CooldownSetting)}
                    className="text-xs bg-white border border-gray-200 text-gray-600 rounded-lg px-2 py-1"
                >
                    <option value="1week">1 week</option>
                    <option value="1month">1 month</option>
                    <option value="never">Never</option>
                </select>
            </div>

            {loading ? (
                <p className="text-sm text-gray-400 text-center py-6 animate-pulse">Loading...</p>
            ) : entries.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">No dismissed senders</p>
            ) : (
                <>
                    <ul className="space-y-2 max-h-40 overflow-y-auto mb-3">
                        {entries.map((entry) => (
                            <li
                                key={entry.email}
                                className="flex items-center justify-between bg-gray-50 rounded-xl p-3"
                            >
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm text-gray-700 truncate">{entry.email}</p>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <span
                                            className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                                entry.action === "unsubscribed"
                                                    ? "bg-red-50 text-red-500"
                                                    : "bg-emerald-50 text-emerald-600"
                                            }`}
                                        >
                                            {entry.action === "unsubscribed" ? "Unsubscribed" : "Kept"}
                                        </span>
                                        <span className="text-xs text-gray-400">
                                            {formatDate(entry.dismissedAt)}
                                        </span>
                                        {entry.action === "kept" && cooldown !== "never" && (
                                            <span className="text-xs text-gray-400">
                                                — returns in {cooldownLabel[cooldown]}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <button
                                    onClick={() => handleRemove(entry.email)}
                                    className="text-gray-400 hover:text-red-400 ml-2 text-sm font-bold flex-shrink-0 transition-colors"
                                >
                                    x
                                </button>
                            </li>
                        ))}
                    </ul>

                    <button
                        onClick={handleClearAll}
                        className="w-full text-sm text-red-400 hover:text-red-500 py-2 border border-red-200 rounded-xl transition-colors"
                    >
                        Clear all ({entries.length})
                    </button>
                </>
            )}
        </div>
    );
}

export default DismissedPanel;
