import React, { useState, useEffect } from 'react';
import { AlertTriangle, Shield, CheckCircle2, X, Camera, Percent } from 'lucide-react';
import type { Alert } from '../types';

interface AlertPopupProps {
  alert?: Alert | null;
  onClose: () => void;
  /** 派单处置（带处置结论） */
  onDispatch: (remark: string) => void;
  /** 确认误报（带处置结论） */
  onIgnore: (remark: string) => void;
}

const QUICK_REMARKS = [
  '已派安保现场核查劝离',
  '快递/访客临时送件停留',
  '门外路过或光影误报',
  '照片/屏幕防伪攻击演练',
];

/**
 * 未授权入侵强提醒（大屏中心红框，支持一键勾选处置结论）
 */
export default function AlertPopup({ alert, onClose, onDispatch, onIgnore }: AlertPopupProps) {
  const [imgError, setImgError] = useState(false);
  const [remark, setRemark] = useState('');
  const name = alert?.recognizedName || '未授权人员/陌生人';
  const areaPct = Math.round(((alert?.areaRatio ?? alert?.confidence) || 0) * 1000) / 10;
  const imageSrc = alert?.imageSrc || '';

  useEffect(() => {
    setImgError(false);
    setRemark('');
  }, [imageSrc, alert?.id]);

  const alertType = (alert?.alertType || 'INTRUSION').toUpperCase();
  const headline =
    alertType === 'SPOOFING'
      ? '警告：检测到照片/屏幕伪造防伪攻击！'
      : alertType === 'TAILGATING'
        ? '警告：尾随闯入，授权人员身后有未授权目标！'
        : alertType === 'LOITERING'
          ? '警告：门前遮挡徘徊超时！'
          : '警告：非授权人员/陌生人靠近门禁防区！';
  const tone =
    alertType === 'SPOOFING' || alertType === 'TAILGATING'
      ? 'text-amber-300'
      : alertType === 'LOITERING'
        ? 'text-fuchsia-300'
        : 'text-cyber-error';
  const border =
    alertType === 'SPOOFING' || alertType === 'TAILGATING'
      ? 'border-amber-400/75'
      : alertType === 'LOITERING'
        ? 'border-fuchsia-400/70'
        : 'border-cyber-error/70';

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      {/* 扫描线氛围 */}
      <div className="absolute inset-0 pointer-events-none opacity-20 scan-line" />

      <div className={`relative w-full max-w-2xl glass-panel border-2 ${border} rounded-xl overflow-hidden shadow-[0_0_60px_rgba(255,85,85,0.35)] animate-in zoom-in-95 duration-300`}>
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
          <div className="relative h-56 md:h-full min-h-[220px] rounded-lg overflow-hidden border border-cyber-error/40 bg-cyber-surface-lowest">
            {imageSrc && !imgError ? (
              <img
                src={imageSrc}
                alt="入侵抓拍"
                className="w-full h-full object-cover"
                onError={() => setImgError(true)}
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
          <div className="flex flex-col justify-between gap-3">
            <div className="space-y-3">
              <div>
                <p className="text-[10px] text-on-surface-variant uppercase tracking-widest font-bold mb-1">
                  识别结果
                </p>
                <p className="text-lg text-on-surface font-bold">{name}</p>
                <p className={`text-xs mt-0.5 font-mono ${tone}`}>alertType = {alertType}</p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-cyber-surface-lowest border border-outline-variant/20 p-2.5">
                  <div className="flex items-center gap-1 text-[10px] text-on-surface-variant mb-0.5">
                    <Percent className="w-3 h-3" />
                    接近度 P
                  </div>
                  <p className="text-xl font-mono font-bold text-cyber-error tabular-nums">
                    {areaPct.toFixed(1)}%
                  </p>
                </div>
                <div className="rounded-lg bg-cyber-surface-lowest border border-outline-variant/20 p-2.5">
                  <p className="text-[10px] text-on-surface-variant mb-0.5">防区 / 设备</p>
                  <p className="text-xs text-on-surface font-bold leading-snug">
                    {alert?.location || '门禁核心防区'}
                  </p>
                  <p className="text-[10px] text-on-surface-variant mt-0.5 truncate">
                    {alert?.device || '边缘视觉节点'}
                  </p>
                </div>
              </div>

              <p className="text-[11px] text-on-surface-variant leading-relaxed">
                {alertType === 'SPOOFING'
                  ? '边缘静默防伪门控检测到人脸缺乏真实头肩躯干几何比例或存在屏幕/相纸边框特征，已实时阻断通行。'
                  : alertType === 'TAILGATING'
                    ? '警戒区内同时出现已授权人员与未授权目标，判定为尾随闯入。'
                    : alertType === 'LOITERING'
                      ? '目标在门前滞留超时且始终没有合格正脸，判定为遮挡或恶意徘徊。'
                      : '边缘节点已完成人脸比对，目标未命中授权白名单。请选择处置结论归档或立即派单。'}
              </p>

              {/* 快捷处置结论点选 + 备注输入 */}
              <div className="space-y-1.5 pt-1">
                <p className="text-[10px] text-on-surface-variant font-bold">快捷处置结论（可选填或点击标签）</p>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_REMARKS.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setRemark(tag)}
                      className={`px-2 py-0.5 rounded text-[10px] border transition-all cursor-pointer ${
                        remark === tag
                          ? 'border-cyber-primary bg-cyber-primary/20 text-cyber-primary font-bold'
                          : 'border-outline-variant/30 bg-cyber-surface-lowest text-on-surface-variant hover:text-on-surface'
                      }`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={remark}
                  onChange={(e) => setRemark(e.target.value)}
                  placeholder="补充现场复核备注（将记录至工单与 Excel 报表）..."
                  className="w-full bg-cyber-surface-lowest border border-outline-variant/30 rounded px-2.5 py-1.5 text-xs text-on-surface outline-none focus:border-cyber-primary"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => onIgnore(remark.trim() || '人工复核：确认误报归档')}
                className="py-2.5 rounded bg-cyber-surface-high border border-outline-variant/40 text-on-surface text-xs font-bold hover:bg-cyber-surface-highest active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-cyber-secondary" />
                确认误报
              </button>
              <button
                type="button"
                onClick={() => onDispatch(remark.trim() || '安保派单：已通知值班人员现场核查')}
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
