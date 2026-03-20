import { LazyMotion, domMax, m } from "motion/react";

interface AnimatedListProps {
    children: React.ReactNode;
}

function AnimatedList({ children }: AnimatedListProps) {
    return (
        <LazyMotion features={domMax}>
            {children}
        </LazyMotion>
    );
}

interface AnimatedItemProps {
    children: React.ReactNode;
    index: number;
}

function AnimatedItem({ children, index }: AnimatedItemProps) {
    return (
        <m.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.03, duration: 0.2 }}
        >
            {children}
        </m.div>
    );
}
export { AnimatedList, AnimatedItem };