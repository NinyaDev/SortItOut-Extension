import { useState } from "react";

interface InfoPanelProps {
    onClose: () => void;
}

// Tab type — each tab has a key, label, and render function
type Tab = "how" | "privacy" | "details";

function InfoPanel({ onClose }: InfoPanelProps) {
    // Tab state — defaults to "how" so new users see the overview first
    const [activeTab, setActiveTab] = useState<Tab>("how");

    const tabs: { key: Tab; label: string }[] = [
        { key: "how", label: "How It Works" },
        { key: "privacy", label: "Privacy" },
        { key: "details", label: "Details" },
    ];

    return (
        <div className="absolute inset-0 bg-white z-20 p-4 overflow-y-auto rounded-lg">
            {/* Header — same layout as before, title + close button */}
            <div className="flex justify-between items-center mb-3">
                <h2 className="text-lg font-bold text-gray-800">Info</h2>
                <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg font-bold">
                    x
                </button>
            </div>

            {/* Tab navigation — reuses the pill style from the provider tabs and
                view mode toggle in App.tsx for visual consistency */}
            <div className="flex gap-1 mb-4">
                {tabs.map((tab) => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={`text-xs px-3 py-1 rounded-full transition-colors ${
                            activeTab === tab.key
                                ? "bg-violet-500 text-white"
                                : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Tab content — only the active tab renders */}
            <div className="space-y-3 text-sm">
                {activeTab === "how" && <HowItWorksTab />}
                {activeTab === "privacy" && <PrivacyTab />}
                {activeTab === "details" && <DetailsTab />}
            </div>
        </div>
    );
}

// Tab 1: Step-by-step walkthrough of the extension flow.
// Uses numbered steps so users understand the full journey from sign-in to cleanup.
function HowItWorksTab() {
    const steps = [
        {
            number: 1,
            title: "Sign in",
            description: "Connect your Gmail or Outlook account. We only request permission to read email headers — never your email content.",
        },
        {
            number: 2,
            title: "Scan",
            description: "We look through your 200 most recent emails for unsubscribe headers. Only the sender address and unsubscribe link are read.",
        },
        {
            number: 3,
            title: "Review",
            description: "Swipe through senders one by one in card mode, or use list mode to select and process multiple at once.",
        },
        {
            number: 4,
            title: "Unsubscribe",
            description: "One-click senders are handled automatically. Link-based opens a tab for you to confirm. Manual gives you the email address to contact.",
        },
    ];

    return (
        <>
            {steps.map((step) => (
                <div key={step.number} className="bg-violet-50 rounded-xl p-3 flex gap-3">
                    {/* Number badge — gives a clear visual sequence */}
                    <div className="w-7 h-7 bg-violet-500 text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                        {step.number}
                    </div>
                    <div>
                        <h3 className="font-semibold text-violet-700 mb-0.5">{step.title}</h3>
                        <p className="text-gray-600 text-xs">{step.description}</p>
                    </div>
                </div>
            ))}
        </>
    );
}

// Tab 2: Privacy and security — the trust-building section.
// This is the most important tab for user confidence. It answers:
// "What does this extension have access to?" and "Where does my data go?"
function PrivacyTab() {
    return (
        <>
            {/* Lead with the strongest reassurance — no server, no data leaving the device */}
            <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-200">
                <h3 className="font-semibold text-emerald-700 mb-1">Everything stays on your device</h3>
                <p className="text-gray-600 text-xs">
                    No backend server. No analytics. No tracking. Your data never leaves your browser — everything runs locally in this extension.
                </p>
            </div>

            <div className="bg-gray-50 rounded-xl p-3">
                <h3 className="font-semibold text-gray-700 mb-1">What we read</h3>
                <p className="text-gray-600 text-xs">
                    Only email headers: the sender's name, address, and the unsubscribe link. We never read your email content, attachments, or contacts.
                </p>
            </div>

            <div className="bg-gray-50 rounded-xl p-3">
                <h3 className="font-semibold text-gray-700 mb-1">Where data lives</h3>
                <p className="text-gray-600 text-xs">
                    Scan results, your preferences, and your dismissed sender list are all stored in Chrome's local storage on your computer. Nothing is sent anywhere.
                </p>
            </div>

            <div className="bg-gray-50 rounded-xl p-3">
                <h3 className="font-semibold text-gray-700 mb-1">Authentication</h3>
                <p className="text-gray-600 text-xs">
                    Gmail tokens are managed by Chrome itself. Outlook tokens are stored locally and refreshed automatically. We never see or store your password.
                </p>
            </div>
        </>
    );
}

// Tab 3: Detailed reference — unsubscribe methods, swipe actions, views,
// permissions, and storage. This combines the old InfoPanel content with
// new sections for permissions and storage info.
function DetailsTab() {
    return (
        <>
            {/* Unsubscribe methods — preserved from the original InfoPanel with
                the same color scheme (emerald/amber/gray) */}
            <div className="bg-emerald-50 rounded-xl p-3">
                <h3 className="font-semibold text-emerald-700 mb-1">One-click unsubscribe</h3>
                <p className="text-gray-600 text-xs">
                    The dream scenario. We send a magic request to the sender's server and boom — you're out. No tabs, no forms, no drama.
                </p>
            </div>

            <div className="bg-amber-50 rounded-xl p-3">
                <h3 className="font-semibold text-amber-700 mb-1">Link unsubscribe</h3>
                <p className="text-gray-600 text-xs">
                    We open the unsubscribe page in a new tab. You'll need to click "confirm" or whatever they ask. Almost as easy, just one extra step.
                </p>
            </div>

            <div className="bg-gray-50 rounded-xl p-3">
                <h3 className="font-semibold text-gray-500 mb-1">Manual only</h3>
                <p className="text-gray-600 text-xs">
                    These senders are old school. The only way out is to email them directly. We'll show you the address, but you gotta do the work.
                </p>
            </div>

            {/* Swipe actions — preserved from original */}
            <div className="border-t border-gray-100 pt-3">
                <h3 className="font-semibold text-gray-700 mb-2">Swipe actions</h3>
                <div className="space-y-2 text-xs">
                    <div className="flex items-start gap-2">
                        <span className="text-red-400 font-medium shrink-0">← Unsubscribe</span>
                        <span className="text-gray-500">Stop getting emails from this sender</span>
                    </div>
                    <div className="flex items-start gap-2">
                        <span className="text-red-400 font-medium shrink-0">← Unsub & Trash</span>
                        <span className="text-gray-500">Unsubscribe AND delete all their emails</span>
                    </div>
                    <div className="flex items-start gap-2">
                        <span className="text-red-400 font-medium shrink-0">← Trash only</span>
                        <span className="text-gray-500">Delete emails but stay subscribed</span>
                    </div>
                    <div className="flex items-start gap-2">
                        <span className="text-emerald-500 font-medium shrink-0">Keep →</span>
                        <span className="text-gray-500">This one's a keeper, skip it</span>
                    </div>
                </div>
            </div>

            {/* Views — preserved from original */}
            <div className="border-t border-gray-100 pt-3">
                <h3 className="font-semibold text-gray-700 mb-2">Views</h3>
                <p className="text-gray-500 text-xs mb-2">
                    <span className="text-violet-600 font-medium">Card mode:</span> Swipe through senders one by one. Take your time with each one.
                </p>
                <p className="text-gray-500 text-xs">
                    <span className="text-violet-600 font-medium">List mode:</span> See everyone at once. Select multiple and nuke them in one go.
                </p>
            </div>

            {/* Permissions — NEW section. Plain-language explanation so users
                understand why each permission exists, not just that it exists */}
            <div className="border-t border-gray-100 pt-3">
                <h3 className="font-semibold text-gray-700 mb-2">Permissions</h3>
                <div className="space-y-2 text-xs">
                    <div>
                        <span className="font-medium text-gray-700">Identity</span>
                        <span className="text-gray-500"> — Sign in with your Google or Microsoft account</span>
                    </div>
                    <div>
                        <span className="font-medium text-gray-700">Storage</span>
                        <span className="text-gray-500"> — Save scan results and preferences locally on your device</span>
                    </div>
                    <div>
                        <span className="font-medium text-gray-700">Gmail / Outlook access</span>
                        <span className="text-gray-500"> — Read email headers and perform unsubscribe actions on your behalf</span>
                    </div>
                </div>
            </div>

            {/* What gets stored — NEW section. Users should know exactly what's
                on their machine */}
            <div className="border-t border-gray-100 pt-3">
                <h3 className="font-semibold text-gray-700 mb-2">What gets stored</h3>
                <div className="space-y-1 text-xs text-gray-500">
                    <p>Cached sender list from your last scan</p>
                    <p>Dismissed senders you've already reviewed</p>
                    <p>Your cooldown and provider preferences</p>
                    <p>Auth tokens (managed by Chrome and Microsoft)</p>
                </div>
            </div>
        </>
    );
}

export default InfoPanel;
