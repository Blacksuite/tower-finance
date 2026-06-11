import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Bottom sheet on mobile (springs up), centered modal on desktop.
 * The same markup serves both; CSS switches the position at 700px.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 700;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="sheet-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
          />
          <motion.div
            ref={ref}
            className="sheet"
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={reduced ? { opacity: 0 } : isDesktop ? { opacity: 0, y: '-44%', x: '-50%', scale: 0.97 } : { y: '100%' }}
            animate={reduced ? { opacity: 1 } : isDesktop ? { opacity: 1, y: '-50%', x: '-50%', scale: 1 } : { y: 0 }}
            exit={reduced ? { opacity: 0 } : isDesktop ? { opacity: 0, y: '-44%', x: '-50%', scale: 0.97 } : { y: '100%' }}
            transition={
              isDesktop
                ? { duration: 0.2, ease: 'easeOut' }
                : { type: 'spring', damping: 30, stiffness: 360 }
            }
          >
            <div className="sheet__grabber" />
            <h2 className="sheet__title">{title}</h2>
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
