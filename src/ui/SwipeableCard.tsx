import { m, useMotionValue, useTransform, useAnimation } from "motion/react";

interface SwipeableCardProps {
    children: React.ReactNode;
    onSwipeLeft: () => void;
    onSwipeRight: () => void;
    leftLabel: string;
    rightLabel?: string;
}

const SWIPE_THRESHOLD = 120;

function SwipeableCard({ children, onSwipeLeft, onSwipeRight, leftLabel, rightLabel = "Keep" }: SwipeableCardProps) {
    const x = useMotionValue(0);
    const controls = useAnimation();

    const rotate = useTransform(x, [-200, 0, 200], [-15, 0, 15]);
    const leftOpacity = useTransform(x, [-SWIPE_THRESHOLD, -40], [1, 0]);
    const rightOpacity = useTransform(x, [40, SWIPE_THRESHOLD], [0, 1]);

    const handleDragEnd = async (_: unknown, info: { offset: { x: number }; velocity: { x: number } }) => {
        const swipePower = Math.abs(info.offset.x) * info.velocity.x;

        if (info.offset.x < -SWIPE_THRESHOLD || swipePower < -10000) {
            await controls.start({ x: -400, opacity: 0, transition: { duration: 0.3 } });
            onSwipeLeft();
        } else if (info.offset.x > SWIPE_THRESHOLD || swipePower > 10000) {
            await controls.start({ x: 400, opacity: 0, transition: { duration: 0.3 } });
            onSwipeRight();
        } else {
            controls.start({ x: 0, transition: { type: "spring", stiffness: 300, damping: 25 } });
        }
    };

    return (
        <div className="relative w-full h-full">
            <m.div
                className="absolute top-4 left-4 bg-emerald-500 text-white text-sm font-semibold px-3 py-1 rounded-lg z-10 pointer-events-none"
                style={{ opacity: rightOpacity }}
            >
                {rightLabel}
            </m.div>
            <m.div
                className="absolute top-4 right-4 bg-red-400 text-white text-sm font-semibold px-3 py-1 rounded-lg z-10 pointer-events-none"
                style={{ opacity: leftOpacity }}
            >
                {leftLabel}
            </m.div>

            <m.div
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={1}
                style={{ x, rotate }}
                animate={controls}
                onDragEnd={handleDragEnd}
                whileDrag={{ cursor: "grabbing" }}
                className="bg-white rounded-2xl shadow-sm border border-gray-200 cursor-grab"
            >
                {children}
            </m.div>
        </div>
    );
}

export default SwipeableCard;
