import { useState } from "react";

interface InfoPanelProps {
    onClose: () => void;
}

type Tab = "guide" | "privacy";

function InfoPanel({ onClose }: InfoPanelProps) {
    const [activeTab, setActiveTab] = useState<Tab>("guide");

    return (
        <div className="absolute inset-0 bg-white z-20 p-4 overflow-y-auto overscroll-contain rounded-lg">
            <div className="flex justify-between items-center mb-3">
                <h2 className="text-lg font-bold text-gray-800">Info</h2>
                <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg font-bold">
                    x
                </button>
            </div>

            <div className="flex gap-1 mb-5">
                <button
                    onClick={() => setActiveTab("guide")}
                    className={`text-xs px-3 py-1 rounded-full transition-colors ${
                        activeTab === "guide"
                            ? "bg-violet-500 text-white"
                            : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                    }`}
                >
                    Guide
                </button>
                <button
                    onClick={() => setActiveTab("privacy")}
                    className={`text-xs px-3 py-1 rounded-full transition-colors ${
                        activeTab === "privacy"
                            ? "bg-violet-500 text-white"
                            : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                    }`}
                >
                    Privacy
                </button>
            </div>

            {activeTab === "guide" ? <GuideTab /> : <PrivacyTab />}
        </div>
    );
}

function GuideTab() {
    const [expanded, setExpanded] = useState<string | null>(null);

    const toggle = (key: string) => setExpanded((prev) => (prev === key ? null : key));

    return (
        <div className="space-y-5">
            {/* Swipe intro — the core mechanic explained in one line */}
            <div>
                <p className="text-sm text-gray-700">
                    Swipe <span className="text-red-400 font-semibold">left to unsubscribe</span>,{" "}
                    <span className="text-emerald-500 font-semibold">right to keep</span>.
                </p>
                <p className="text-xs text-gray-400 mt-1">Or use list mode to select multiple at once.</p>
            </div>

            <div className="h-px bg-gray-100" />

            {/* Unsubscribe methods — expandable cards, one open at a time */}
            <div>
                <p className="text-xs text-gray-400 mb-2">What happens when you unsubscribe</p>
                <div className="space-y-2">
                    <button
                        onClick={() => toggle("oneclick")}
                        className={`w-full text-left rounded-lg p-2.5 transition-colors ${
                            expanded === "oneclick" ? "bg-emerald-50" : "bg-gray-50 hover:bg-emerald-50/50"
                        }`}
                    >
                        <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold text-emerald-700">One-click</p>
                            <span className="text-gray-400 text-[10px]">{expanded === "oneclick" ? "−" : "+"}</span>
                        </div>
                        {expanded === "oneclick" && (
                            <p className="text-[10px] text-gray-500 mt-1.5">We handle it for you. A request is sent to the sender's server and you're unsubscribed instantly. Nothing else to do.</p>
                        )}
                    </button>
                    <button
                        onClick={() => toggle("link")}
                        className={`w-full text-left rounded-lg p-2.5 transition-colors ${
                            expanded === "link" ? "bg-amber-50" : "bg-gray-50 hover:bg-amber-50/50"
                        }`}
                    >
                        <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold text-amber-700">Link</p>
                            <span className="text-gray-400 text-[10px]">{expanded === "link" ? "−" : "+"}</span>
                        </div>
                        {expanded === "link" && (
                            <p className="text-[10px] text-gray-500 mt-1.5">We open the sender's unsubscribe page in a new tab. You'll need to confirm on their site. Once you do, hit "Did it?" back in the extension.</p>
                        )}
                    </button>
                    <button
                        onClick={() => toggle("manual")}
                        className={`w-full text-left rounded-lg p-2.5 transition-colors ${
                            expanded === "manual" ? "bg-gray-100" : "bg-gray-50 hover:bg-gray-100/50"
                        }`}
                    >
                        <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold text-gray-500">Manual</p>
                            <span className="text-gray-400 text-[10px]">{expanded === "manual" ? "−" : "+"}</span>
                        </div>
                        {expanded === "manual" && (
                            <p className="text-[10px] text-gray-500 mt-1.5">Some senders don't offer an unsubscribe link at all. For these, you'll need to go to their site or email them directly. Not ideal, but it's on them.</p>
                        )}
                    </button>
                </div>
                <p className="text-[10px] text-gray-400 mt-2">Each sender's card shows which method is available — look for the green, amber, or gray badge.</p>
            </div>

            <div className="h-px bg-gray-100" />

            {/* Swipe modes — compact grid */}
            <div>
                <p className="text-xs text-gray-400 mb-2">Swipe left modes</p>
                <div className="space-y-1.5 text-xs">
                    <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
                        <span className="text-gray-700 font-medium w-20">Unsubscribe</span>
                        <span className="text-gray-400">Stop getting emails</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
                        <span className="text-gray-700 font-medium w-20">Unsub & Trash</span>
                        <span className="text-gray-400">Unsub + delete all</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
                        <span className="text-gray-700 font-medium w-20">Trash only</span>
                        <span className="text-gray-400">Delete but stay subscribed</span>
                    </div>
                </div>
            </div>

            <div className="h-px bg-gray-100" />

            {/* Toolbar icons — explain what each header button does */}
            <div>
                <p className="text-xs text-gray-400 mb-2">Toolbar</p>
                <div className="space-y-2 text-xs">
                    <div className="flex items-center gap-3">
                        <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-gray-500">
                                <path d="M2 3a1 1 0 0 0-1 1v1a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1H2Z" />
                                <path fillRule="evenodd" d="M2 7.5h16l-.811 7.71a2 2 0 0 1-1.99 1.79H4.802a2 2 0 0 1-1.99-1.79L2 7.5ZM7 11a1 1 0 0 1 1-1h4a1 1 0 1 1 0 2H8a1 1 0 0 1-1-1Z" clipRule="evenodd" />
                            </svg>
                        </div>
                        <div>
                            <span className="text-gray-700 font-medium">Dismissed list</span>
                            <span className="text-gray-400"> — senders you've already reviewed</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-gray-500">
                                <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 0 1-9.201 2.466l-.312-.311h2.451a.75.75 0 0 0 0-1.5H4.5a.75.75 0 0 0-.75.75v3.75a.75.75 0 0 0 1.5 0v-2.033l.364.363a7 7 0 0 0 11.712-3.138.75.75 0 0 0-1.449-.39Zm-10.624-2.85a5.5 5.5 0 0 1 9.201-2.465l.312.31H11.75a.75.75 0 0 0 0 1.5h3.75a.75.75 0 0 0 .75-.75V3.42a.75.75 0 0 0-1.5 0v2.033l-.364-.364A7 7 0 0 0 3.239 8.227a.75.75 0 0 0 1.449.39Z" clipRule="evenodd" />
                            </svg>
                        </div>
                        <div>
                            <span className="text-gray-700 font-medium">Rescan</span>
                            <span className="text-gray-400"> — scan your 200 most recent emails</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="h-px bg-gray-100" />

            {/* Walkthrough — numbered steps, tight and minimal */}
            <div>
                <p className="text-xs text-gray-400 mb-2">Walkthrough</p>
                <div className="space-y-2">
                    {[
                        "Sign in with Gmail or Outlook",
                        "Hit scan: We read headers, never content",
                        "Review senders, swipe or batch select",
                        "Done! Dismissed senders won't come back",
                    ].map((step, i) => (
                        <div key={i} className="flex items-start gap-2.5 text-xs">
                            <span className="w-5 h-5 rounded-full bg-violet-500 text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                                {i + 1}
                            </span>
                            <span className="text-gray-600 pt-0.5">{step}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

function PrivacyTab() {
    return (
        <div className="space-y-5">
            {/* Hero statement — big and confident */}
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
                <div className="flex justify-center mb-2">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-8 h-8 text-emerald-500">
                        <path fillRule="evenodd" d="M9.661 2.237a.531.531 0 0 1 .678 0 11.947 11.947 0 0 0 7.078 2.749.5.5 0 0 1 .479.425c.069.52.104 1.05.104 1.59 0 5.162-3.26 9.563-7.834 11.256a.48.48 0 0 1-.332 0C5.26 16.564 2 12.163 2 7c0-.538.035-1.069.104-1.589a.5.5 0 0 1 .48-.425 11.947 11.947 0 0 0 7.077-2.75Zm4.196 5.954a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd" />
                    </svg>
                </div>
                <p className="text-sm font-semibold text-emerald-800">100% local. Zero servers.</p>
                <p className="text-xs text-emerald-600 mt-1">No backend. No analytics. No tracking. Everything runs in your browser.</p>
            </div>

            <div className="h-px bg-gray-100" />

            {/* What we access vs what we don't — two-column contrast */}
            <div>
                <p className="text-xs text-gray-400 mb-2">What we access</p>
                <div className="grid grid-cols-2 gap-2">
                    <div className="bg-emerald-50 rounded-lg p-2.5">
                        <p className="text-[10px] text-emerald-600 font-semibold mb-1">WE READ</p>
                        <p className="text-xs text-gray-600">Sender name</p>
                        <p className="text-xs text-gray-600">Sender address</p>
                        <p className="text-xs text-gray-600">Unsubscribe link</p>
                    </div>
                    <div className="bg-red-50 rounded-lg p-2.5">
                        <p className="text-[10px] text-red-500 font-semibold mb-1">WE NEVER READ</p>
                        <p className="text-xs text-gray-600">Email content</p>
                        <p className="text-xs text-gray-600">Attachments</p>
                        <p className="text-xs text-gray-600">Contacts</p>
                    </div>
                </div>
            </div>

            <div className="h-px bg-gray-100" />

            {/* Storage & auth — simple list */}
            <div>
                <p className="text-xs text-gray-400 mb-2">Where data lives</p>
                <div className="space-y-1.5 text-xs">
                    <div className="flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-300 flex-shrink-0 mt-1.5" />
                        <span className="text-gray-600">Scan results and preferences stored in <span className="font-medium text-gray-700">Chrome's local storage</span> on your computer</span>
                    </div>
                    <div className="flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-300 flex-shrink-0 mt-1.5" />
                        <span className="text-gray-600">Gmail tokens managed by <span className="font-medium text-gray-700">Chrome itself</span></span>
                    </div>
                    <div className="flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-300 flex-shrink-0 mt-1.5" />
                        <span className="text-gray-600">Outlook tokens stored locally and <span className="font-medium text-gray-700">auto-refreshed</span></span>
                    </div>
                    <div className="flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-300 flex-shrink-0 mt-1.5" />
                        <span className="text-gray-600">We <span className="font-medium text-gray-700">never see or store</span> your password</span>
                    </div>
                </div>
            </div>

            <div className="h-px bg-gray-100" />

            {/* Permissions */}
            <div>
                <p className="text-xs text-gray-400 mb-2">Why we need permissions</p>
                <div className="space-y-1.5 text-xs">
                    <div className="flex gap-2">
                        <span className="text-gray-700 font-medium w-14 flex-shrink-0">Identity</span>
                        <span className="text-gray-500">Sign in with Google or Microsoft</span>
                    </div>
                    <div className="flex gap-2">
                        <span className="text-gray-700 font-medium w-14 flex-shrink-0">Storage</span>
                        <span className="text-gray-500">Save results and preferences locally</span>
                    </div>
                    <div className="flex gap-2">
                        <span className="text-gray-700 font-medium w-14 flex-shrink-0">Host</span>
                        <span className="text-gray-500">Read email headers and unsubscribe</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default InfoPanel;
