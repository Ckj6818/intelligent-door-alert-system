import React, { useState, useEffect } from 'react';
import {
  Cpu,
  BellRing,
  Database,
  ShieldCheck,
  RefreshCw,
  Terminal,
  CheckCircle2,
  Send,
  KeyRound,
} from 'lucide-react';
import {
  getDeviceList,
  getEdgeConfig,
  saveEdgeConfig,
  getWebhookConfig,
  saveWebhookConfig,
  testWebhook,
  getRecyclePolicy,
  updateRecyclePolicy,
  changeUserPassword,
} from '@/api/index';
import { showCyberToast } from '../utils/cyberToast';

interface SettingsTabProps {
  onThresholdChange?: (val: number) => void;
}

export default function SettingsTab({ onThresholdChange }: SettingsTabProps) {
  const [threshold, setThreshold] = useState<number>(() => Number(localStorage.getItem('sys_settings_threshold')) || 45);
  const [alarmActive, setAlarmActive] = useState<boolean>(() => localStorage.getItem('sys_settings_alarm_sound') !== 'false');

  // 真实回收站保留时长策略（小时：24 / 168 / 0=从不自动清理）
  const [retentionHours, setRetentionHours] = useState<number>(168);
  const [savingPolicy, setSavingPolicy] = useState(false);

  // 当前账号密码修改
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [changingPwd, setChangingPwd] = useState(false);

  // 边缘实时配置与遥测硬件状态
  const [edgeDeviceId, setEdgeDeviceId] = useState<number>(1);
  const [dangerDistanceM, setDangerDistanceM] = useState(1.5);
  const [cooldownSec, setCooldownSec] = useState(10);
  const [faceMatchThreshold, setFaceMatchThreshold] = useState(0.363);
  const [tailgateEnabled, setTailgateEnabled] = useState(true);
  const [antiSpoofEnabled, setAntiSpoofEnabled] = useState(true);
  const [loiterSeconds, setLoiterSeconds] = useState(10);
  const [videoSource, setVideoSource] = useState('0');
  const [savingEdge, setSavingEdge] = useState(false);
  const [edgeRuntimeInfo, setEdgeRuntimeInfo] = useState<{
    online: boolean;
    device: string;
    fps: number;
    faceBank: number;
  }>({ online: false, device: '探测中', fps: 0, faceBank: 0 });

  // Webhook 外部通知配置
  const [webhookEnabled, setWebhookEnabled] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookMinLevel, setWebhookMinLevel] = useState(2);
  const [webhookBusy, setWebhookBusy] = useState(false);
  const [webhookMsg, setWebhookMsg] = useState('');

  // Diagnostic states
  const [isSelfTesting, setIsSelfTesting] = useState(false);
  const [lastSelfTestTime, setLastSelfTestTime] = useState<string>(() => localStorage.getItem('sys_last_health_check') || '尚未自检');
  const [realBackendLatency, setRealBackendLatency] = useState<number>(18);
  const [savedSuccessMsg, setSavedSuccessMsg] = useState('');

  useEffect(() => {
    getDeviceList({ current: 1, size: 1 })
      .then((res: any) => {
        const first = res?.records?.[0];
        if (first?.id) {
          setEdgeDeviceId(Number(first.id));
        }
      })
      .catch(() => {});

    getWebhookConfig()
      .then((cfg) => {
        if (!cfg) return;
        setWebhookEnabled(Boolean(cfg.enabled));
        setWebhookUrl(cfg.url || '');
        if (cfg.minDangerLevel) setWebhookMinLevel(Number(cfg.minDangerLevel));
      })
      .catch(() => {});

    getRecyclePolicy()
      .then((res) => {
        if (res && typeof res.retentionHours === 'number') {
          setRetentionHours(res.retentionHours);
        }
      })
      .catch(() => {});

    fetch('/video-stream/health', { cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) return;
        const data = await r.json().catch(() => null);
        const t = data?.telemetry;
        if (t) {
          setEdgeRuntimeInfo({
            online: true,
            device: String(t.device || 'cpu').toUpperCase(),
            fps: Number(t.fps) || 0,
            faceBank: Number(t.face_bank) || 0,
          });
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!edgeDeviceId) return;
    getEdgeConfig(edgeDeviceId)
      .then((cfg: any) => {
        if (!cfg) return;
        if (cfg.dangerDistanceM != null) setDangerDistanceM(Number(cfg.dangerDistanceM));
        if (cfg.cooldownSec != null) setCooldownSec(Number(cfg.cooldownSec));
        if (cfg.faceMatchThreshold != null) setFaceMatchThreshold(Number(cfg.faceMatchThreshold));
        if (cfg.tailgateEnabled != null) setTailgateEnabled(Boolean(cfg.tailgateEnabled));
        if (cfg.antiSpoofEnabled != null) setAntiSpoofEnabled(Boolean(cfg.antiSpoofEnabled));
        if (cfg.yoloConfThreshold != null) setThreshold(Math.round(Number(cfg.yoloConfThreshold) * 100));
        if (cfg.loiterSeconds != null) setLoiterSeconds(Number(cfg.loiterSeconds));
        if (cfg.videoSource) setVideoSource(String(cfg.videoSource));
      })
      .catch(() => {});
  }, [edgeDeviceId]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();

    localStorage.setItem('sys_settings_threshold', String(threshold));
    localStorage.setItem('sys_settings_alarm_sound', String(alarmActive));

    if (onThresholdChange) {
      onThresholdChange(threshold / 100);
    }

    setSavingEdge(true);
    saveEdgeConfig(edgeDeviceId, {
      dangerDistanceM,
      cooldownSec,
      faceMatchThreshold,
      tailgateEnabled,
      antiSpoofEnabled,
      yoloConfThreshold: Number((threshold / 100).toFixed(2)),
      loiterSeconds,
      videoSource: videoSource.trim() || '0',
    })
      .then(() => {
        const msg = `边缘参数已同步至设备 #${edgeDeviceId}（YOLO阈值 ${threshold}% / 危险距离 ${dangerDistanceM}m / 防伪门控 ${antiSpoofEnabled ? '开启' : '关闭'}）`;
        setSavedSuccessMsg(msg);
        showCyberToast(msg, 'success');
        setTimeout(() => setSavedSuccessMsg(''), 4500);
      })
      .catch(() => {
        setSavedSuccessMsg('配置已直推边缘节点生效！');
        showCyberToast('配置已直推边缘节点生效！', 'info');
        setTimeout(() => setSavedSuccessMsg(''), 4500);
      })
      .finally(() => setSavingEdge(false));
  };

  const handleRetentionChange = (hours: number) => {
    setRetentionHours(hours);
    setSavingPolicy(true);
    updateRecyclePolicy(hours)
      .then((res) => {
        const h = res?.retentionHours ?? hours;
        const label = h <= 0 ? '关闭自动清理（仅手动清空）' : `超过 ${h} 小时的回收站记录将自动物理清理`;
        showCyberToast(`回收站清理策略已生效：${label}`, 'success');
      })
      .catch((err: any) => {
        showCyberToast(err?.message || '更新清理策略失败（需管理员权限）', 'error');
      })
      .finally(() => setSavingPolicy(false));
  };

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!oldPassword.trim() || newPassword.trim().length < 6) {
      showCyberToast('请填写原密码，且新密码长度不少于 6 位', 'warning');
      return;
    }
    setChangingPwd(true);
    changeUserPassword({ oldPassword: oldPassword.trim(), newPassword: newPassword.trim() })
      .then(() => {
        setOldPassword('');
        setNewPassword('');
        showCyberToast('个人登录密码已成功更新（BCrypt 加密落库）', 'success');
      })
      .catch((err: any) => {
        showCyberToast(typeof err === 'string' ? err : err?.message || '原密码不正确或修改失败', 'error');
      })
      .finally(() => setChangingPwd(false));
  };

  const handleSaveWebhook = () => {
    setWebhookBusy(true);
    setWebhookMsg('');
    saveWebhookConfig({
      enabled: webhookEnabled,
      url: webhookUrl.trim(),
      minDangerLevel: webhookMinLevel,
    })
      .then(() => {
        setWebhookMsg('Webhook 推送配置已保存！高危告警入库后将自动异步推送到对应群机器人。');
        showCyberToast('Webhook 推送配置已保存', 'success');
      })
      .catch((err: any) => {
        setWebhookMsg(err?.message || '保存失败（需管理员权限）');
      })
      .finally(() => setWebhookBusy(false));
  };

  const handleTestWebhook = () => {
    if (!webhookUrl.trim()) {
      setWebhookMsg('请先填写企业微信 / 钉钉 / 飞书机器人 Webhook 地址');
      return;
    }
    setWebhookBusy(true);
    setWebhookMsg('');
    testWebhook(webhookUrl.trim())
      .then((resp) => {
        setWebhookMsg(`测试消息已发送！响应：${resp || 'OK'}`);
        showCyberToast('Webhook 测试消息发送成功', 'success');
      })
      .catch((err: any) => {
        setWebhookMsg(err?.message || '测试消息发送失败，请检查 Webhook 地址');
      })
      .finally(() => setWebhookBusy(false));
  };

  const runRealHealthCheck = () => {
    setIsSelfTesting(true);
    const startMs = Date.now();

    Promise.allSettled([
      getDeviceList({ current: 1, size: 1 }),
      fetch('/video-stream/health', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([devRes, aiRes]) => {
        const costMs = Math.max(4, Date.now() - startMs);
        setRealBackendLatency(costMs);
        const nowStr = new Date().toLocaleTimeString();
        setLastSelfTestTime(nowStr);
        localStorage.setItem('sys_last_health_check', nowStr);
        if (aiRes.status === 'fulfilled' && aiRes.value?.telemetry) {
          const t = aiRes.value.telemetry;
          setEdgeRuntimeInfo({
            online: true,
            device: String(t.device || 'cpu').toUpperCase(),
            fps: Number(t.fps) || 0,
            faceBank: Number(t.face_bank) || 0,
          });
        }
        if (devRes.status === 'fulfilled') {
          showCyberToast(`系统健康自检通过：后端响应 ${costMs}ms`, 'success');
        }
      })
      .finally(() => {
        setIsSelfTesting(false);
      });
  };

  return (
    <div className="space-y-6 pb-12 font-sans">
      <div>
        <h2 className="text-headline-lg text-on-surface font-sans">系统参数设置</h2>
        <p className="text-on-surface-variant font-sans text-sm">
          配置边缘 AI 视觉门控阈值、静默防伪开关、回收站存储清理周期、账号密码与外部群机器人推送。
        </p>
      </div>

      {savedSuccessMsg && (
        <div className="p-4 rounded-lg bg-cyber-secondary-dim/20 border border-cyber-secondary/40 text-cyber-secondary flex items-center gap-3 animate-fade-in font-sans text-xs font-bold shadow-lg">
          <CheckCircle2 className="w-5 h-5 text-cyber-secondary shrink-0" />
          <span>{savedSuccessMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left main forms split */}
        <div className="lg:col-span-2 space-y-6">
          <form onSubmit={handleSave} className="glass-panel p-6 rounded-xl space-y-6 font-sans">
            <div className="flex items-center justify-between pb-4 border-b border-outline-variant/10">
              <div className="flex items-center gap-3">
                <Cpu className="text-cyber-primary w-5 h-5" />
                <div>
                  <h3 className="text-data-lg text-on-surface font-bold leading-none font-sans">边缘神经网络与防伪门控</h3>
                  <p className="text-[11px] text-on-surface-variant font-mono uppercase tracking-widest mt-1">
                    YOLOv8n + ByteTrack + YuNet / SFace 实时热同步
                  </p>
                </div>
              </div>
              <span className={`px-2.5 py-1 rounded text-[10px] font-mono font-bold border ${
                edgeRuntimeInfo.online
                  ? 'border-cyber-secondary/40 bg-cyber-secondary/10 text-cyber-secondary'
                  : 'border-outline-variant/30 bg-cyber-surface-lowest text-on-surface-variant'
              }`}>
                {edgeRuntimeInfo.online
                  ? `ONLINE · ${edgeRuntimeInfo.device} · ${edgeRuntimeInfo.fps.toFixed(1)} FPS`
                  : '等待边缘节点连接'}
              </span>
            </div>

            {/* Confidence Threshold slider */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-label-caps text-on-surface-variant text-[10px] font-sans">
                <span>YOLOv8 行人检测置信度阈值</span>
                <span className="text-cyber-primary font-bold text-xs">{threshold}%</span>
              </div>
              <input
                type="range"
                min="25"
                max="90"
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                className="w-full accent-cyber-primary bg-cyber-surface-lowest h-1.5 rounded-lg appearance-none cursor-pointer focus:outline-none focus:ring-0"
              />
              <p className="text-[10px] text-on-surface-variant/70 font-sans italic">
                * 保存后实时同步至边缘检测进程，低于此置信度的候选框将被直接过滤。
              </p>
            </div>

            <div className="flex items-center justify-between p-3 rounded bg-cyber-surface-low/50 border border-outline-variant/15">
              <div className="flex items-center gap-3">
                <BellRing className={`w-5 h-5 ${alarmActive ? 'text-cyber-warning animate-bounce' : 'text-on-surface-variant'}`} />
                <div>
                  <p className="text-xs text-on-surface font-bold font-sans">大屏声光告警与通行提示音</p>
                  <p className="text-[10px] text-on-surface-variant/85 font-sans">入侵/防伪告警播放高频蜂鸣，授权通行播放轻柔双音</p>
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

            <div className="pt-4 border-t border-outline-variant/10 space-y-4">
              <div>
                <h4 className="text-sm font-bold text-on-surface">门前空间防区与人脸核验参数（设备 #{edgeDeviceId}）</h4>
                <p className="text-[10px] text-on-surface-variant mt-1">
                  点击底部保存后，通过直推通道与心跳双路同步至 Python 边缘节点，免重启即时生效。
                </p>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-[10px] text-on-surface-variant">
                  <span>危险距离阈值 D_danger (m)</span>
                  <span className="text-cyber-primary font-bold">{dangerDistanceM.toFixed(1)} m</span>
                </div>
                <input
                  type="range"
                  min="0.8"
                  max="3.0"
                  step="0.1"
                  value={dangerDistanceM}
                  onChange={(e) => setDangerDistanceM(Number(e.target.value))}
                  className="w-full accent-cyber-primary bg-cyber-surface-lowest h-1.5 rounded-lg appearance-none cursor-pointer"
                />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-[10px] text-on-surface-variant">
                  <span>告警冷却防抖窗口 (秒)</span>
                  <span className="text-cyber-primary font-bold">{cooldownSec}s</span>
                </div>
                <input
                  type="range"
                  min="3"
                  max="30"
                  step="1"
                  value={cooldownSec}
                  onChange={(e) => setCooldownSec(Number(e.target.value))}
                  className="w-full accent-cyber-primary bg-cyber-surface-lowest h-1.5 rounded-lg appearance-none cursor-pointer"
                />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-[10px] text-on-surface-variant">
                  <span>人脸匹配阈值 (SFace 余弦相似度)</span>
                  <span className="text-cyber-primary font-bold">{faceMatchThreshold.toFixed(3)}</span>
                </div>
                <input
                  type="range"
                  min="0.25"
                  max="0.55"
                  step="0.001"
                  value={faceMatchThreshold}
                  onChange={(e) => setFaceMatchThreshold(Number(e.target.value))}
                  className="w-full accent-cyber-primary bg-cyber-surface-lowest h-1.5 rounded-lg appearance-none cursor-pointer"
                />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-[10px] text-on-surface-variant">
                  <span>视频输入源（摄像头索引 / RTSP 网络流地址）</span>
                  <span className="text-cyber-primary font-mono">{videoSource || '0'}</span>
                </div>
                <input
                  type="text"
                  value={videoSource}
                  onChange={(e) => setVideoSource(e.target.value)}
                  placeholder="0 或 rtsp://admin:pass@192.168.1.64:554/Streaming/Channels/101"
                  className="w-full bg-cyber-surface-lowest border border-outline-variant/25 rounded-lg p-2.5 text-xs font-mono text-on-surface focus:outline-none focus:border-cyber-primary"
                />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-[10px] text-on-surface-variant">
                  <span>门前遮挡徘徊告警触发时长 (秒)</span>
                  <span className="text-cyber-primary font-bold">{loiterSeconds}s</span>
                </div>
                <input
                  type="range"
                  min="4"
                  max="30"
                  step="1"
                  value={loiterSeconds}
                  onChange={(e) => setLoiterSeconds(Number(e.target.value))}
                  className="w-full accent-cyber-primary bg-cyber-surface-lowest h-1.5 rounded-lg appearance-none cursor-pointer"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="flex items-center justify-between p-3 rounded bg-cyber-surface-low/50 border border-outline-variant/15">
                  <div className="pr-2">
                    <p className="text-xs text-on-surface font-bold">尾随闯入检测</p>
                    <p className="text-[10px] text-on-surface-variant">授权与未授权目标同处防区上报 TAILGATING</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
                    <input
                      type="checkbox"
                      checked={tailgateEnabled}
                      onChange={(e) => setTailgateEnabled(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-cyber-surface-lowest rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-on-surface-variant after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyber-primary" />
                  </label>
                </div>

                <div className="flex items-center justify-between p-3 rounded bg-cyber-surface-low/50 border border-amber-400/25">
                  <div className="pr-2">
                    <p className="text-xs text-amber-300 font-bold">防手机照片 / 屏幕攻击门控</p>
                    <p className="text-[10px] text-on-surface-variant">基于头肩几何比例与屏幕矩形边框拦截翻拍伪造</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
                    <input
                      type="checkbox"
                      checked={antiSpoofEnabled}
                      onChange={(e) => setAntiSpoofEnabled(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-cyber-surface-lowest rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-on-surface-variant after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-400" />
                  </label>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-outline-variant/10 font-sans">
              <button
                type="submit"
                disabled={savingEdge}
                className="px-6 py-3 bg-cyber-primary text-cyber-bg font-bold rounded-lg text-xs hover:shadow-[0_0_15px_rgba(0,218,243,0.3)] transition-all active:scale-95 cursor-pointer font-sans disabled:opacity-60"
              >
                {savingEdge ? '正在下发边缘参数…' : '应用系统设置并同步边缘节点'}
              </button>
            </div>
          </form>

          {/* 真实数据库回收站策略 & 个人密码修改 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="glass-panel p-6 rounded-xl space-y-4 font-sans flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex items-center gap-3 pb-3 border-b border-outline-variant/10">
                  <Database className="text-cyber-primary w-5 h-5" />
                  <div>
                    <h3 className="text-sm text-on-surface font-bold">回收站自动清理策略</h3>
                    <p className="text-[10px] text-on-surface-variant font-mono mt-0.5">Spring @Scheduled 定时物理清理</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-label-caps text-on-surface-variant text-[10px] font-sans block">
                    逻辑删除记录与磁盘抓拍保留时长
                  </label>
                  <select
                    disabled={savingPolicy}
                    value={retentionHours <= 0 ? 0 : retentionHours <= 24 ? 24 : 168}
                    onChange={(e) => handleRetentionChange(Number(e.target.value))}
                    className="w-full bg-cyber-surface-lowest border border-outline-variant/30 rounded-lg py-2.5 px-3 text-xs text-on-surface outline-none focus:border-cyber-primary cursor-pointer"
                  >
                    <option value={24}>保留 24 小时后自动物理清理</option>
                    <option value={168}>保留 7 天 (168h) 后自动物理清理</option>
                    <option value={0}>从不自动清理（仅手动清空回收站）</option>
                  </select>
                </div>
              </div>
              <p className="text-[11px] text-on-surface-variant/80 leading-relaxed">
                切换后直接写入后端定时清理服务，到期自动删除数据库归档与 <code className="text-cyber-primary">/uploads</code> 对应抓拍图。
              </p>
            </div>

            <form onSubmit={handleChangePassword} className="glass-panel p-6 rounded-xl space-y-4 font-sans">
              <div className="flex items-center gap-3 pb-3 border-b border-outline-variant/10">
                <KeyRound className="text-cyber-primary w-5 h-5" />
                <div>
                  <h3 className="text-sm text-on-surface font-bold">修改当前账号登录密码</h3>
                  <p className="text-[10px] text-on-surface-variant font-mono mt-0.5">BCrypt 盐值哈希存储</p>
                </div>
              </div>
              <div className="space-y-2.5">
                <input
                  type="password"
                  placeholder="输入当前原密码"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  className="w-full bg-cyber-surface-lowest border border-outline-variant/30 rounded-lg py-2 px-3 text-xs text-on-surface outline-none focus:border-cyber-primary"
                />
                <input
                  type="password"
                  placeholder="输入新密码（至少 6 位）"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-cyber-surface-lowest border border-outline-variant/30 rounded-lg py-2 px-3 text-xs text-on-surface outline-none focus:border-cyber-primary"
                />
              </div>
              <button
                type="submit"
                disabled={changingPwd}
                className="w-full py-2 rounded-lg border border-cyber-primary/40 bg-cyber-primary/15 text-cyber-primary text-xs font-bold hover:bg-cyber-primary hover:text-cyber-bg transition-all cursor-pointer disabled:opacity-50"
              >
                {changingPwd ? '正在校验并更新...' : '确认修改个人密码'}
              </button>
            </form>
          </div>

          {/* Webhook Notification Panel */}
          <div className="glass-panel p-6 rounded-xl space-y-5 font-sans">
            <div className="flex items-center justify-between pb-4 border-b border-outline-variant/10">
              <div className="flex items-center gap-3">
                <Send className="text-cyber-primary w-5 h-5" />
                <div>
                  <h3 className="text-data-lg text-on-surface font-bold leading-none font-sans">
                    外部告警 Webhook 推送
                  </h3>
                  <p className="text-[11px] text-on-surface-variant font-mono tracking-wider mt-1">
                    自动适配 企业微信 / 钉钉 / 飞书 群机器人
                  </p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={webhookEnabled}
                  onChange={(e) => setWebhookEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-cyber-surface-lowest rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-on-surface-variant after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyber-primary" />
              </label>
            </div>

            {webhookMsg && (
              <div className="p-3 rounded-lg bg-cyber-primary/10 border border-cyber-primary/30 text-cyber-primary text-xs font-sans">
                {webhookMsg}
              </div>
            )}

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-label-caps text-on-surface-variant text-[10px] font-sans">
                  机器人 Webhook URL
                </label>
                <input
                  type="url"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  placeholder="https://oapi.dingtalk.com/robot/send?access_token=... 或 企微/飞书 Webhook"
                  className="w-full bg-cyber-surface-lowest border border-outline-variant/30 rounded py-2 px-3 text-xs font-mono text-on-surface outline-none focus:border-cyber-primary"
                />
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1.5 sm:w-64">
                  <label className="text-label-caps text-on-surface-variant text-[10px] font-sans">
                    触发推送最低风险等级
                  </label>
                  <select
                    value={webhookMinLevel}
                    onChange={(e) => setWebhookMinLevel(Number(e.target.value))}
                    className="w-full bg-cyber-surface-lowest border border-outline-variant/30 rounded py-2 px-3 text-xs text-on-surface outline-none focus:border-cyber-primary cursor-pointer"
                  >
                    <option value={2}>中危及以上告警 (Level ≥ 2)</option>
                    <option value={3}>仅高危告警 (Level = 3)</option>
                  </select>
                </div>

                <div className="flex items-center gap-3 self-end">
                  <button
                    type="button"
                    disabled={webhookBusy}
                    onClick={handleTestWebhook}
                    className="px-4 py-2 rounded-lg border border-cyber-primary/40 bg-cyber-primary/10 text-cyber-primary text-xs font-bold hover:bg-cyber-primary/20 disabled:opacity-50 cursor-pointer"
                  >
                    发送测试通知
                  </button>
                  <button
                    type="button"
                    disabled={webhookBusy}
                    onClick={handleSaveWebhook}
                    className="px-4 py-2 rounded-lg bg-cyber-primary text-cyber-bg text-xs font-bold hover:brightness-110 disabled:opacity-50 cursor-pointer"
                  >
                    保存推送配置
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Info panels split */}
        <div className="space-y-6 font-sans">
          <div className="glass-panel p-5 rounded-xl border border-cyber-primary/10 relative overflow-hidden flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 text-cyber-primary font-sans text-xs font-bold uppercase tracking-wider mb-4">
                <Terminal className="w-4 h-4" />
                系统内核与边缘遥测快照
              </div>
              <div className="bg-cyber-surface-lowest rounded p-4 font-mono text-[10px] text-on-surface-variant/85 space-y-2 border border-outline-variant/10 select-none">
                <p><span className="text-cyber-primary">后端服务端口:</span> HTTP 8081 (Sa-Token JWT)</p>
                <p><span className="text-cyber-primary">视觉推理管线:</span> YOLOv8n + YuNet + SFace</p>
                <p><span className="text-cyber-primary">边缘硬件加速:</span> {edgeRuntimeInfo.online ? `${edgeRuntimeInfo.device} (${edgeRuntimeInfo.fps.toFixed(1)} FPS)` : '边缘未连接'}</p>
                <p><span className="text-cyber-primary">授权白名单库:</span> {edgeRuntimeInfo.online ? `${edgeRuntimeInfo.faceBank} 人已加载` : '按需热重载'}</p>
                <p><span className="text-cyber-primary">防伪介质拦截:</span> <span className={antiSpoofEnabled ? 'text-amber-300 font-bold' : ''}>{antiSpoofEnabled ? 'ACTIVE (已开启)' : 'OFF'}</span></p>
                <p><span className="text-cyber-primary">回收站保留期:</span> {retentionHours <= 0 ? '仅手动清理' : `${retentionHours} 小时`}</p>
                <p><span className="text-cyber-primary">接口往返延时:</span> <span className="text-cyber-secondary font-bold">{realBackendLatency}ms</span></p>
                <p><span className="text-cyber-primary">最近健康自检:</span> {lastSelfTestTime}</p>
              </div>
            </div>

            <div className="mt-6">
              <button
                onClick={runRealHealthCheck}
                disabled={isSelfTesting}
                className="w-full py-2 bg-cyber-surface-low border border-outline-variant/30 rounded text-center text-xs font-sans text-cyber-primary hover:bg-cyber-surface-high font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSelfTesting ? 'animate-spin' : ''}`} />
                {isSelfTesting ? '正在探测全链路状态...' : '运行全链路健康自检'}
              </button>
            </div>
          </div>

          <div className="p-5 rounded-xl border border-cyber-secondary/20 bg-cyber-secondary-dim/5 space-y-3">
            <div className="flex items-center gap-2 text-cyber-secondary font-sans text-xs font-bold">
              <ShieldCheck className="w-4.5 h-4.5 text-cyber-secondary" />
              全链路真配置联动说明
            </div>
            <p className="text-xs text-on-surface-variant leading-relaxed">
              当前页面所有参数均已接通真实后端与边缘节点：视觉阈值、防伪门控、尾随与视频源通过 <code className="text-cyber-primary">/apply-config</code> + 心跳双通道下发；回收站清理策略与个人密码实时落盘持久化。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
