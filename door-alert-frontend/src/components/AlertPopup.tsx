import React from 'react';
import { AlertTriangle, Shield, Check, X } from 'lucide-react';

interface AlertPopupProps {
  onClose: () => void;
  onDispatch: () => void;
  onIgnore: () => void;
}

export default function AlertPopup({ onClose, onDispatch, onIgnore }: AlertPopupProps) {
  return (
    <div className="fixed bottom-8 right-8 w-80 glass-panel border-cyber-error/65 rounded-lg p-1 glow-error z-[100] transform transition-all duration-500 animate-in slide-in-from-bottom-5">
      {/* Alert Header bar */}
      <div className="bg-cyber-error/15 p-3 flex justify-between items-center rounded-t border-b border-cyber-error/25">
        <div className="flex items-center text-cyber-error font-sans text-xs font-bold animate-pulse gap-1.5">
          <AlertTriangle className="w-4 h-4 text-cyber-error" />
          检测到高风险入侵
        </div>
        <button 
          onClick={onClose} 
          className="text-on-surface-variant hover:text-on-surface hover:bg-cyber-surface-low rounded p-1 transition-all cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Alert Content body */}
      <div className="p-3 space-y-3">
        {/* Thermal image container */}
        <div className="h-40 bg-cyber-surface-lowest rounded overflow-hidden relative border border-cyber-error/30">
          <img 
            className="w-full h-full object-cover grayscale brightness-125" 
            alt="Thermal fence breach" 
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuBWoWqbKOIeTYFF7V3ILetfIWcFmTqN1CE-Ki1rsjmW3zXZlwZiamXU3BzsqpTYjJvG1Ax8_YEgjOTbAhMqc0b0qNZJ__h8ObQ6jHEbdtaXEhV3zPXNxZXdyhv3qjzLMksaxoujFjmGRrs9CLbiZtbSfHtFjHVryMPyvfUXtCxNo4NZRjiUNcpAIMu35jaAm_d9tnLocqKUUJYLKgUNbl44AbVDdhgCRfVLoSiFbpHTU0HJtDeTeewp"
          />
          <div className="absolute inset-0 border-2 border-cyber-error/30 pointer-events-none" />
          <div className="absolute top-2 left-2 bg-cyber-error text-white px-2 py-0.5 rounded text-[9px] font-sans font-bold uppercase tracking-wider">
            越界闯入尝试
          </div>
        </div>

        {/* Text information */}
        <div className="font-sans">
          <p className="text-data-sm text-on-surface font-bold font-sans">未知可疑人员</p>
          <p className="text-xs text-on-surface-variant/80 font-sans mb-3">
            防区位置：北侧栅栏 / 12号防区
          </p>

          {/* Action buttons */}
          <div className="grid grid-cols-2 gap-2">
            <button 
              onClick={onDispatch}
              className="py-2 bg-cyber-error text-white rounded font-sans text-[11px] font-bold hover:brightness-110 active:scale-95 transition-all glow-error flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Shield className="w-3.5 h-3.5" />
              派遣安保
            </button>
            <button 
              onClick={onIgnore}
              className="py-2 bg-cyber-surface-high text-on-surface rounded font-sans text-[11px] hover:bg-cyber-surface-highest active:scale-95 transition-all border border-outline-variant/30 flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5 text-on-surface-variant" />
              忽略警报
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
