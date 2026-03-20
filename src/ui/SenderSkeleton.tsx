function SenderSkeleton() {
    return (
        <div className="p-3 bg-white rounded-xl border border-violet-100 animate-pulse">
            <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-violet-100 rounded" />
                    <div>
                        <div className="w-28 h-4 bg-violet-100 rounded mb-1" />
                        <div className="w-36 h-3 bg-violet-100 rounded" />
                    </div>
                </div>
                <div className="text-right">
                    <div className="w-6 h-4 bg-yellow-100 rounded mb-1 ml-auto" />
                    <div className="w-16 h-3 bg-violet-100 rounded" />
                </div>
            </div>
        </div>
    )
}
export default SenderSkeleton;
