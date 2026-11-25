import React, { useEffect, useState } from 'react';
import { AlertTriangle, ShieldAlert, HelpCircle, X } from 'lucide-react';
import {
  CYBER_CONFIRM_EVENT,
  CyberConfirmRequest,
  CyberConfirmTone,
} from '../utils/cyberConfirm';

const TONE_STYLES: Record<
  CyberConfirmTone,
  { border: string; badge: string; btn: string; icon: React.ReactNode }
> = {
  danger: {
    border: 'border-cyber-error/50 shadow-[0_0_32px_rgba(255,82,82,0.22)]',
    badge: 'bg-cyber-error/15 text-cyber-error border-cyber-error/30',
    btn: 'bg-cyber-error text-white hover:brightness-110 shadow-[0_0_16px_rgba(255,82,82,0.35)]',
    icon: <ShieldAlert className="w-5 h-5 text-cyber-error" />,
  },
  warning: {
    border: 'border-amber-400/50 shadow-[0_0_32px_rgba(251,191,36,0.20)]',
    badge: 'bg-amber-400/15 text-amber-300 border-amber-400/30',
    btn: 'bg-amber-400 text-slate-950 hover:brightness-110 shadow-[0_0_16px_rgba(251,191,36,0.35)]',
    icon: <AlertTriangle className="w-5 h-5 text-amber-300" />,
  },
  primary: {
    border: 'border-cyber-primary/50 shadow-[0_0_32px_rgba(0,218,243,0.20)]',
    badge: 'bg-cyber-primary/15 text-cyber-primary border-cyber-primary/30',
    btn: 'bg-cyber-primary text-cyber-bg hover:brightness-110 shadow-[0_0_16px_rgba(0,218,243,0.35)]',
    icon: <HelpCircle className="w-5 h-5 text-cyber-primary" />,
  },
};

export default function CyberConfirmHost() {
  const [queue, setQueue] = useState<CyberConfirmRequest[]>([]);
  const active = queue[0] || null;

  useEffect(() => {
    const onOpen = (ev: Event) => {
      const detail = (ev as CustomEvent<CyberConfirmRequest>).detail;
      if (!detail) return;
      setQueue((prev) => [...prev, detail]);
    };
    window.addEventListener(CYBER_CONFIRM_EVENT, onOpen as EventListener);
    return () => window.removeEventListener(CYBER_CONFIRM_EVENT, onOpen as EventListener);
  }, []);

  const settle = (confirmed: boolean) => {
    if (!active) return;
    active.resolve(confirmed);
    setQueue((prev) => prev.slice(1));
  };

  useEffect(() => {
    if (!active) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        settle(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active]);

  if (!active) return null;

  const style = TONE_STYLES[active.tone] || TONE_STYLES.danger;

  return (
    <div
      className="fixed inset-0 z-[150] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={() => settle(false)}
    >
      <div
        className={`glass-panel max-w-md w-full rounded-xl p-6 border ${style.border} animate-in zoom-in-95 duration-150 font-sans`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 pb-4 border-b border-outline-variant/15">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg border flex items-center justify-center shrink-0 ${style.badge}`}>
              {style.icon}
            </div>
            <div>
              <h3 className="text-sm font-bold text-on-surface tracking-wide">{active.title}</h3>
              <p className="text-[10px] font-mono uppercase tracking-widest text-on-surface-variant mt-0.5">
                DOORALERT SECURITY CONFIRMATION
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => settle(false)}
            className="text-on-surface-variant hover:text-on-surface p-1 rounded transition-colors cursor-pointer"
            aria-label="关闭确认弹窗"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-on-surface/90 leading-relaxed py-5 whitespace-pre-line">
          {active.message}
        </p>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-outline-variant/15">
          <button
            type="button"
            onClick={() => settle(false)}
            className="px-4 py-2 rounded-lg bg-cyber-surface-high border border-outline-variant/30 text-xs text-on-surface hover:bg-cyber-surface-highest transition-colors cursor-pointer"
          >
            {active.cancelText}
          </button>
          <button
            type="button"
            onClick={() => settle(true)}
            className={`px-5 py-2 rounded-lg text-xs font-bold transition-all active:scale-95 cursor-pointer ${style.btn}`}
          >
            {active.confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
