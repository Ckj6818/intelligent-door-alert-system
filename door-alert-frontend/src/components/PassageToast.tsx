import React, { useEffect, type FC } from 'react';
import { ShieldCheck, X } from 'lucide-react';
import type { PassageNotice } from '../types';

interface PassageToastProps {
  notice: PassageNotice;
  onDismiss: (id: string) => void;
}

/**
 * 右上角绿色授权通行徽章
 */
const PassageToast: FC<PassageToastProps> = ({ notice, onDismiss }) => {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(notice.id), 5000);
    return () => clearTimeout(timer);
  }, [notice.id, onDismiss]);

  return (
    <div
      className="pointer-events-auto w-[320px] glass-panel border border-cyber-secondary/50 rounded-lg overflow-hidden shadow-[0_0_24px_rgba(0,230,57,0.25)] animate-in slide-in-from-right-5 fade-in duration-300"
      role="status"
    >
      <div className="bg-cyber-secondary/15 px-3 py-2 flex items-center justify-between border-b border-cyber-secondary/30">
        <div className="flex items-center gap-2 text-cyber-secondary text-xs font-bold tracking-wide">
          <span className="text-sm leading-none" aria-hidden>🟢</span>
          <ShieldCheck className="w-4 h-4" />
          <span>[授权通行] {notice.recognizedName}</span>
        </div>
        <button
          type="button"
          onClick={() => onDismiss(notice.id)}
          className="text-on-surface-variant hover:text-on-surface p-1 rounded cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="px-3 py-2.5 flex items-center gap-3">
        {notice.imageUrl ? (
          <img
            src={notice.imageUrl}
            alt={notice.recognizedName}
            className="w-12 h-12 rounded object-cover border border-cyber-secondary/40"
          />
        ) : (
          <div className="w-12 h-12 rounded bg-cyber-secondary/10 border border-cyber-secondary/30 flex items-center justify-center text-cyber-secondary text-lg font-bold">
            {notice.recognizedName.slice(0, 1) || '✓'}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-xs text-on-surface font-bold truncate">{notice.recognizedName}</p>
          <p className="text-[10px] text-on-surface-variant font-mono mt-0.5">
            {notice.time}
            {typeof notice.areaRatio === 'number'
              ? ` · R=${(notice.areaRatio * 100).toFixed(1)}%`
              : ''}
          </p>
          <p className="text-[10px] text-cyber-secondary/90 mt-0.5">身份核验通过，已记录通行日志</p>
        </div>
      </div>
    </div>
  );
};

export default PassageToast;
