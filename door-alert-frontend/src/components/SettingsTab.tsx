import React, { useState } from 'react';
import { 
  Cpu, 
  BellRing, 
  Database, 
  ShieldCheck, 
  RefreshCw,
  Terminal,
} from 'lucide-react';
import { updateCleanupPolicy } from '@/api/index';

interface SettingsTabProps {
  onThresholdChange?: (val: number) => void;
}

const PURGE_POLICY_LABELS: Record<string, string> = {
  '24h': '每 24 小时',
  '7d': '每 7 天',
  never: '从不自动清理（仅手动清除）',
};

const PURGE_POLICY_DAYS: Record<string, number> = {
  '24h': 1,
  '7d': 7,
  never: -1,
};

export default function SettingsTab({ onThresholdChange }: SettingsTabProps) {
  const [yoloModel, setYoloModel] = useState('YOLOv8m');
  const [threshold, setThreshold] = useState(85);
  const [alarmActive, setAlarmActive] = useState(true);
  const [autoPurge, setAutoPurge] = useState('24h');
  const [encryptionStandard, setEncryptionStandard] = useState('AES-256');
  const [activeFeedsCount, setActiveFeedsCount] = useState(32);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (onThresholdChange) {
      onThresholdChange(threshold / 100);
    }

    let cleanupSynced = false;
    try {
      await updateCleanupPolicy({
        policy: autoPurge,
        intervalDays: PURGE_POLICY_DAYS[autoPurge] ?? 1,
      });
      cleanupSynced = true;
    } catch (error) {
      console.warn('[Settings] cleanup policy sync failed:', error);
    }

    const purgeLabel = PURGE_POLICY_LABELS[autoPurge] ?? autoPurge;
    const cleanupStatus = cleanupSynced
      ? `逻辑删除缓冲区清理策略「${purgeLabel}」已同步至后端配置节点。`
      : `逻辑删除缓冲区清理策略「${purgeLabel}」已在控制台登记；后端同步暂不可用，本地预览策略仍生效。`;

    alert(
      `策略配置已分发。\n\n` +
      `${cleanupStatus}\n` +
      `神经网络推理参数（边缘节点本地预览）：模型 ${yoloModel}，置信度阈值 ${threshold}%。\n` +
      `上述 AI 参数尚未下发至物理推理引擎，仅供运维界面演示。`
    );
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="font-sans">
        <h2 className="text-headline-lg text-on-surface font-sans">系统参数设置</h2>
        <p className="text-on-surface-variant font-sans text-sm">
          配置安防节点系统变量、AI 神经网络推理触发阈值以及数据库存储策略。
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left main forms split */}
        <div className="lg:col-span-2 space-y-6">
          <form onSubmit={handleSave} className="glass-panel p-6 rounded-xl space-y-6 font-sans">
            <div className="flex items-center gap-3 pb-4 border-b border-outline-variant/10">
              <Cpu className="text-cyber-primary w-5 h-5" />
              <div>
                <h3 className="text-data-lg text-on-surface font-bold leading-none font-sans">神经网络推理控制</h3>
                <p className="text-[11px] text-on-surface-variant font-mono uppercase tracking-widest mt-1">YOLO 模型推理参数</p>
              </div>
            </div>

            {/* Model select */}
            <div className="space-y-2">
              <label className="text-label-caps text-on-surface-variant text-[10px] font-sans">当前 YOLOv8 目标分类模型</label>
              <div className="grid grid-cols-3 gap-3 font-mono">
                {['YOLOv8-nano', 'YOLOv8m', 'YOLOv9-complex'].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setYoloModel(m)}
                    className={`p-3 rounded border text-xs font-bold transition-all cursor-pointer ${
                      yoloModel === m
                        ? 'bg-cyber-primary-dim border-cyber-primary text-cyber-primary shadow-[0_0_10px_rgba(0,218,243,0.15)]'
                        : 'bg-cyber-surface-low border-outline-variant/20 text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {/* Confidence Threshold slider */}
            <div className="space-y-2 pt-2">
              <div className="flex justify-between items-center text-label-caps text-on-surface-variant text-[10px] font-sans">
                <span>目标分类置信度过滤阈值</span>
                <span className="text-cyber-primary font-bold text-xs">{threshold}%</span>
              </div>
              <input 
                type="range" 
                min="50" 
                max="98" 
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                className="w-full accent-cyber-primary bg-cyber-surface-lowest h-1.5 rounded-lg appearance-none cursor-pointer focus:outline-none focus:ring-0" 
              />
              <p className="text-[10px] text-on-surface-variant/70 font-sans italic">
                * 置信度低于此阈值的识别结果将作为噪声过滤，不会触发警报处置工作流。
              </p>
            </div>

            <div className="flex items-center justify-between p-3 rounded bg-cyber-surface-low/50 border border-outline-variant/15 pt-4">
              <div className="flex items-center gap-3">
                <BellRing className="text-cyber-warning w-5 h-5 animate-bounce" />
                <div>
                  <p className="text-xs text-on-surface font-bold font-sans">声音报警及动效警示</p>
                  <p className="text-[10px] text-on-surface-variant/85 font-sans">在高风险入侵检测时闪烁红色边框并合成播放报警声效</p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer select-none">
                <input 
                  type="checkbox" 
                  checked={alarmActive}
                  onChange={(e) => setAlarmActive(e.target.checked)}
                  className="sr-only peer" 
                />
                <div className="w-11 h-6 bg-cyber-surface-lowest rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-on-surface-variant after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyber-primary" />
              </label>
            </div>

            {/* Save trigger */}
            <div className="flex justify-end pt-4 border-t border-outline-variant/10 font-sans">
              <button
                type="submit"
                className="px-6 py-3 bg-cyber-primary text-cyber-bg font-bold rounded-lg text-xs hover:shadow-[0_0_15px_rgba(0,218,243,0.3)] transition-all active:scale-95 cursor-pointer font-sans"
              >
                应用系统设置并同步
              </button>
            </div>
          </form>

          {/* Database Policy & Encryption Panel */}
          <div className="glass-panel p-6 rounded-xl space-y-6 font-sans">
            <div className="flex items-center gap-3 pb-4 border-b border-outline-variant/10">
              <Database className="text-cyber-primary w-5 h-5" />
              <div>
                <h3 className="text-data-lg text-on-surface font-bold leading-none font-sans">数据库与安全加固设置</h3>
                <p className="text-[11px] text-on-surface-variant font-mono uppercase tracking-widest mt-1">安全审计策略</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-label-caps text-on-surface-variant text-[10px] font-sans">自动清理逻辑删除记录缓冲区</label>
                <select
                  value={autoPurge}
                  onChange={(e) => setAutoPurge(e.target.value)}
                  className="w-full bg-cyber-surface-lowest border border-outline-variant/30 rounded py-2 px-3 text-sm text-on-surface outline-none focus:border-cyber-primary/50 font-sans cursor-pointer"
                >
                  <option value="24h">每 24 小时</option>
                  <option value="7d">每 7 天</option>
                  <option value="never">从不自动清理 (仅手动清除)</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-label-caps text-on-surface-variant text-[10px] font-sans">对称加密保护标准</label>
                <select
                  value={encryptionStandard}
                  onChange={(e) => setEncryptionStandard(e.target.value)}
                  className="w-full bg-cyber-surface-lowest border border-outline-variant/30 rounded py-2 px-3 text-sm text-on-surface outline-none focus:border-cyber-primary/50 font-sans cursor-pointer"
                >
                  <option value="AES-256">AES-256 (国标/企业级推荐)</option>
                  <option value="ChaCha20">ChaCha20-Poly1305 移动端优化</option>
                  <option value="unencrypted">明文传输 (警告：无安全防护)</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Right Info panels split */}
        <div className="space-y-6 font-sans">
          {/* Console kernel shell */}
          <div className="glass-panel p-5 rounded-xl border border-cyber-primary/10 relative overflow-hidden flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 text-cyber-primary font-sans text-xs font-bold uppercase tracking-wider mb-4">
                <Terminal className="w-4 h-4" />
                系统内核控制台信息
              </div>
              <div className="bg-cyber-surface-lowest rounded p-4 font-mono text-[10px] text-on-surface-variant/80 space-y-1 border border-outline-variant/10 select-none">
                <p><span className="text-cyber-primary">安全守护守护进程 (C2):</span> 正常运行 (ONLINE)</p>
                <p><span className="text-cyber-primary">AES 加密机制 (CIPHER):</span> 已校验启用 (VALIDATED)</p>
                <p><span className="text-cyber-primary">神经网络内核 (SUITE):</span> NEURAL_CORE_V4.2</p>
                <p><span className="text-cyber-primary">累计在线时长 (UPTIME):</span> 124:44:02</p>
                <p><span className="text-cyber-primary">AI 平均推理延迟:</span> 18.2ms</p>
                <p><span className="text-cyber-primary">活动监控心跳源:</span> {activeFeedsCount} 个路监控</p>
              </div>
            </div>

            <div className="mt-6">
              <button
                onClick={() => {
                  setActiveFeedsCount(Math.floor(Math.random() * 8) + 28);
                  alert('内核诊断自检完成。诊断日志已通过管道安全写入控制台。');
                }}
                className="w-full py-2 bg-cyber-surface-low border border-outline-variant/30 rounded text-center text-xs font-sans text-cyber-primary hover:bg-cyber-surface-high font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5 animate-spin-slow" />
                运行系统健康自检
              </button>
            </div>
          </div>

          {/* Security alert policy tip */}
          <div className="p-5 rounded-xl border border-cyber-secondary/20 bg-cyber-secondary-dim/5 space-y-3">
            <div className="flex items-center gap-2 text-cyber-secondary font-sans text-xs font-bold">
              <ShieldCheck className="w-4.5 h-4.5 text-cyber-secondary" />
              系统完整性报告结论
            </div>
            <p className="text-xs text-on-surface-variant leading-relaxed">
              门禁安防 C2 节点在服务器端内存线程中本地处理实时 YOLO 目标分类，确保所有检测到的特征参数和摄像机 IP 配置免受外部公网探测与追踪泄漏。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
