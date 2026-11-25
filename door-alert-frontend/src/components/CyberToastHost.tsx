import React, { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, ShieldAlert, Info, X } from 'lucide-react';
import { CyberToastItem, subscribeCyberToast } from '../utils/cyberToast';

export default function CyberToastHost() {
  const [items, setItems] = useState<CyberToastItem[]>([]);

  useEffect(() => {
    return subscribeCyberToast((item) => {
      setItems((prev) => [item, ...prev].slice(0, 5));
      window.setTimeout(() => {
        setItems((prev) => prev.filter((t) => t.id !== item.id));
      }, item.durationMs);
    });
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="fixed top-20 right-6 z-[140] flex flex-col gap-2.5 max-w-sm w-full pointer-events-none font-sans">
      {items.map((item) => {
        const toneStyle =
          item.tone === 'success'
            ? 'border-cyber-secondary/60 bg-cyber-surface/95 text-cyber-secondary shadow-[0_0_24px_rgba(0,230,57,0.22)]'
            : item.tone === 'error'
              ? 'border-cyber-error/65 bg-cyber-surface/95 text-cyber-error shadow-[0_0_24px_rgba(255,75,75,0.28)]'
              : item.tone === 'warning'
                ? 'border-amber-400/60 bg-cyber-surface/95 text-amber-300 shadow-[0_0_24px_rgba(251,191,36,0.22)]'
                : 'border-cyber-primary/60 bg-cyber-surface/95 text-cyber-primary shadow-[0_0_24px_rgba(0,218,243,0.22)]';

        const Icon =
          item.tone === 'success'
            ? CheckCircle2
            : item.tone === 'error'
              ? ShieldAlert
              : item.tone === 'warning'
                ? AlertTriangle
                : Info;

        return (
          <div
            key={item.id}
            className={`pointer-events-auto backdrop-blur-xl border-l-4 border rounded-lg px-4 py-3 flex items-start gap-3 animate-in fade-in slide-in-from-right-3 duration-200 ${toneStyle}`}
          >
            <Icon className="w-4 h-4 shrink-0 mt-0.5" />
            <p className="text-xs text-on-surface leading-relaxed flex-1 font-medium">
              {item.message}
            </p>
            <button
              type="button"
              onClick={() => setItems((prev) => prev.filter((t) => t.id !== item.id))}
              className="text-on-surface-variant hover:text-on-surface p-0.5 rounded cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
