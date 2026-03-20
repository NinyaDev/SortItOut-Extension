interface InfoPanelProps {
    onClose: () => void;
}

function InfoPanel({ onClose }: InfoPanelProps) {
    return (
        <div className="absolute inset-0 bg-violet-50 z-20 p-4 overflow-y-auto rounded-lg">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold text-yellow-600">How it works</h2>
                <button onClick={onClose} className="text-violet-400 hover:text-violet-700 text-lg font-bold">
                    x
                </button>
            </div>

            <div className="space-y-3 text-sm">
                <div className="bg-white rounded-xl p-3 border border-emerald-200">
                    <h3 className="font-bold text-emerald-600 mb-1">One-click unsubscribe</h3>
                    <p className="text-violet-600">
                        The dream scenario. We send a magic request to the sender's server and boom — you're out. No tabs, no forms, no drama.
                    </p>
                </div>

                <div className="bg-white rounded-xl p-3 border border-yellow-200">
                    <h3 className="font-bold text-yellow-600 mb-1">Link unsubscribe</h3>
                    <p className="text-violet-600">
                        We open the unsubscribe page in a new tab. You'll need to click "confirm" or whatever they ask. Almost as easy, just one extra step.
                    </p>
                </div>

                <div className="bg-white rounded-xl p-3 border border-violet-200">
                    <h3 className="font-bold text-violet-400 mb-1">Manual only</h3>
                    <p className="text-violet-600">
                        These senders are old school. The only way out is to email them directly. We'll show you the address, but you gotta do the work.
                    </p>
                </div>

                <div className="border-t border-violet-200 pt-3">
                    <h3 className="font-bold text-violet-700 mb-2">Swipe actions</h3>
                    <div className="space-y-2">
                        <div className="flex items-start gap-2">
                            <span className="text-red-400 font-bold shrink-0">← Unsubscribe</span>
                            <span className="text-violet-500">Stop getting emails from this sender</span>
                        </div>
                        <div className="flex items-start gap-2">
                            <span className="text-red-400 font-bold shrink-0">← Unsub & Trash</span>
                            <span className="text-violet-500">Unsubscribe AND delete all their emails</span>
                        </div>
                        <div className="flex items-start gap-2">
                            <span className="text-red-400 font-bold shrink-0">← Trash only</span>
                            <span className="text-violet-500">Delete emails but stay subscribed</span>
                        </div>
                        <div className="flex items-start gap-2">
                            <span className="text-emerald-500 font-bold shrink-0">Keep →</span>
                            <span className="text-violet-500">This one's a keeper, skip it</span>
                        </div>
                    </div>
                </div>

                <div className="border-t border-violet-200 pt-3">
                    <h3 className="font-bold text-violet-700 mb-2">Views</h3>
                    <p className="text-violet-500 mb-2">
                        <span className="text-yellow-600 font-bold">Card mode:</span> Swipe through senders one by one. Take your time with each one.
                    </p>
                    <p className="text-violet-500">
                        <span className="text-yellow-600 font-bold">List mode:</span> See everyone at once. Select multiple and nuke them in one go.
                    </p>
                </div>
            </div>
        </div>
    );
}

export default InfoPanel;
