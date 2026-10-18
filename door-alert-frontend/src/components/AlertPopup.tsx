import React from 'react';
import { AlertTriangle, Shield, CheckCircle2, X, Camera, Percent } from 'lucide-react';
import type { Alert } from '../types';

interface AlertPopupProps {
  alert?: Alert | null;
  onClose: () => void;
  /** 派单处置 */
  onDispatch: () => void;
  /** 确认误报 */
  onIgnore: () => void;
}

/**
 * 未授权入侵强提醒（大屏中心红框）
 */
export default function AlertPopup({ alert, onClose, onDispatch, onIgnore }: AlertPopupProps) {
  const name = alert?.recognizedName || '未授权人员/陌生人';
  const areaPct = Math.round(((alert?.areaRatio ?? alert?.confidence) || 0) * 1000) / 10;
  const imageSrc = alert?.imageSrc || '';
  const alertType = (alert?.alertType || 'INTRUSION').toUpperCase();
  const headline = alertType === 'TAILGATING'
    ? '警告：尾随闯入，授权人员身后有未授权目标！'
    : alertType === 'LOITERING'
      ? '警告：门前遮挡徘徊超时！'
      : '警告：非授权人员/陌生人靠近门禁防区！';
  const tone = alertType === 'TAILGATING' ? 'text-amber-300' : alertType === 'LOITERING' ? 'text-fuchsia-300' : 'text-cyber-error';
  const border = alertType === 'TAILGATING'
    ? 'border-amber-400/70'
    : alertType === 'LOITERING'
      ? 'border-fuchsia-400/70'
      : 'border-cyber-error/70';

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      {/* 扫描线氛围 */}
      <div className="absolute inset-0 pointer-events-none opacity-20 scan-line" />

      <div className={`relative w-full max-w-xl glass-panel border-2 ${border} rounded-xl overflow-hidden shadow-[0_0_60px_rgba(255,85,85,0.35)] animate-in zoom-in-95 duration-300`}>
        {/* 顶栏 */}
        <div className="bg-cyber-error/20 px-5 py-3.5 flex items-center justify-between border-b border-cyber-error/40">
          <div className={`flex items-center gap-2 ${tone} font-bold text-sm tracking-wide animate-pulse`}>
            <span aria-hidden>🔴</span>
            <AlertTriangle className="w-5 h-5" />
            <span>{headline}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-on-surface-variant hover:text-on-surface p-1.5 rounded hover:bg-cyber-surface-low cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* 抓拍 */}
          <div className="relative h-52 md:h-full min-h-[200px] rounded-lg overflow-hidden border border-cyber-error/40 bg-cyber-surface-lowest">
            {imageSrc ? (
              <img
                src={imageSrc}
                alt="入侵抓拍"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-on-surface-variant gap-2">
                <Camera className="w-8 h-8 opacity-50" />
                <span className="text-xs">暂无抓拍图像</span>
              </div>
            )}
            <div className="absolute inset-0 border-2 border-cyber-error/25 pointer-events-none" />
            <div className="absolute top-2 left-2 bg-cyber-error text-white px-2 py-0.5 rounded text-[10px] font-bold tracking-wider">
              {alertType}
            </div>
          </div>

          {/* 信息与处置 */}
          <div className="flex flex-col justify-between gap-4">
            <div className="space-y-3">
              <div>
                <p className="text-[10px] text-on-surface-variant uppercase tracking-widest font-bold mb-1">
                  识别结果
                </p>
                <p className="text-lg text-on-surface font-bold">{name}</p>
                <p className={`text-xs mt-1 font-mono ${tone}`}>alertType = {alertType}</p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-cyber-surface-lowest border border-outline-variant/20 p-3">
                  <div className="flex items-center gap-1 text-[10px] text-on-surface-variant mb-1">
                    <Percent className="w-3 h-3" />
                    面积占比 R
                  </div>
                  <p className="text-xl font-mono font-bold text-cyber-error tabular-nums">
                    {areaPct.toFixed(1)}%
                  </p>
                </div>
                <div className="rounded-lg bg-cyber-surface-lowest border border-outline-variant/20 p-3">
                  <p className="text-[10px] text-on-surface-variant mb-1">防区 / 设备</p>
                  <p className="text-xs text-on-surface font-bold leading-snug">
                    {alert?.location || '门禁核心防区'}
                  </p>
                  <p className="text-[10px] text-on-surface-variant mt-1 truncate">
                    {alert?.device || '边缘视觉节点'}
                  </p>
                </div>
              </div>

              <p className="text-[11px] text-on-surface-variant leading-relaxed">
                {alertType === 'TAILGATING'
                  ? '警戒区内同时出现已授权人员与未授权目标，判定为尾随闯入。'
                  : alertType === 'LOITERING'
                    ? '目标在门前滞留超时且始终没有合格正脸，判定为遮挡或恶意徘徊。'
                    : '边缘节点已完成人脸比对，目标未命中授权白名单。请立即确认是否为误报，或派单安保处置。'}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={onIgnore}
                className="py-2.5 rounded bg-cyber-surface-high border border-outline-variant/40 text-on-surface text-xs font-bold hover:bg-cyber-surface-highest active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-cyber-secondary" />
                确认误报
              </button>
              <button
                type="button"
                onClick={onDispatch}
                className="py-2.5 rounded bg-cyber-error text-white text-xs font-bold hover:brightness-110 active:scale-95 transition-all glow-error flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Shield className="w-3.5 h-3.5" />
                派单处置
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
