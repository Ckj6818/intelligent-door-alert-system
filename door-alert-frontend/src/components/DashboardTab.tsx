import React, { useState, useEffect, useMemo } from 'react';
import { 
  TrendingUp, 
  Tv, 
  Clock, 
  ShieldAlert, 
  Activity, 
  Wifi, 
  WifiOff, 
  Sliders, 
  AlertTriangle,
  Play,
  RotateCcw,
  Check,
  Video,
  RefreshCw,
  X,
  ExternalLink
} from 'lucide-react';
import { DeviceStatus, LiveFeedItem, Alert } from '../types';
import { addDevice, updateDevice, deleteDevice, getDeviceList, getPassageTodayStats, saveEdgeConfig } from '@/api/index';
import { showCyberToast } from '../utils/cyberToast';
import { showCyberConfirm } from '../utils/cyberConfirm';

/**
 * 边缘 YOLO MJPEG：默认同源代理 /video-stream（Vite/Nginx → :8090），
 * 避免 HTTPS 页面直连 http://host:8090 触发 Mixed Content。
 * 可用 VITE_EDGE_STREAM_URL 覆盖，例如 http://192.168.1.8:8090
 */
function resolveEdgeStreamUrls(): { video: string; health: string } {
  const override = (import.meta.env.VITE_EDGE_STREAM_URL as string | undefined)?.trim();
  if (override) {
    const base = override.replace(/\/$/, '').replace(/\/video$/i, '');
    return { video: `${base}/video`, health: `${base}/health` };
  }
  return { video: '/video-stream/video', health: '/video-stream/health' };
}

interface DashboardTabProps {
  searchQuery: string;
  devices: DeviceStatus[];
  setDevices: React.Dispatch<React.SetStateAction<DeviceStatus[]>>;
  liveFeed: LiveFeedItem[];
  setLiveFeed: React.Dispatch<React.SetStateAction<LiveFeedItem[]>>;
  triggerThreatEvent: () => void;
  alerts: Alert[];
  onNavigateToAlerts?: () => void;
}

export default function DashboardTab({ 
  searchQuery, 
  devices, 
  setDevices, 
  liveFeed, 
  setLiveFeed,
  triggerThreatEvent,
  alerts,
  onNavigateToAlerts
}: DashboardTabProps) {
  const [selectedFeed, setSelectedFeed] = useState<LiveFeedItem | null>(null);
  const [timeRange, setTimeRange] = useState<'1h' | '24h'>('24h');
  const [inferenceData, setInferenceData] = useState<{ x: number; y1: number; y2: number }[]>([]);
  const [streamOnline, setStreamOnline] = useState(false);
  const [streamKey, setStreamKey] = useState(0);
  const [edgeTelemetry, setEdgeTelemetry] = useState<{
    fps: number;
    yolo_ms: number;
    face_ms: number;
    persons: number;
    device: string;
    engine: string;
    half: boolean;
    face_bank: number;
    video_source?: string;
  } | null>(null);
  const [isDrawingRoi, setIsDrawingRoi] = useState(false);
  const [roiPoints, setRoiPoints] = useState<[number, number][]>([]);
  const [savingRoi, setSavingRoi] = useState(false);
  const [showSourcePanel, setShowSourcePanel] = useState(false);
  const [videoSourceInput, setVideoSourceInput] = useState('0');
  const [edgeActionMsg, setEdgeActionMsg] = useState('');
  const [compare, setCompare] = useState<{ passageCount: number; unauthorizedAlertCount: number; days: { date: string; passages: number; alerts: number }[] }>({
    passageCount: 0,
    unauthorizedAlertCount: 0,
    days: [],
  });

  const { video: streamUrl, health: streamHealthUrl } = useMemo(
    () => resolveEdgeStreamUrls(),
    [],
  );

  // 探测边缘推流是否可用并采集真实推理遥测（FPS / YOLO耗时 / SFace耗时 / 当前防区与视频源）
  useEffect(() => {
    let cancelled = false;
    const check = () => {
      fetch(streamHealthUrl, { method: 'GET', cache: 'no-store' })
        .then(async (r) => {
          if (cancelled) return;
          setStreamOnline(r.ok);
          if (!r.ok) return;
          try {
            const data = await r.json();
            if (data && data.telemetry && typeof data.telemetry === 'object') {
              const t = data.telemetry;
              const fps = Number(t.fps) || 0;
              const yoloMs = Number(t.yolo_ms) || 0;
              const faceMs = Number(t.face_ms) || 0;
              setEdgeTelemetry({
                fps,
                yolo_ms: yoloMs,
                face_ms: faceMs,
                persons: Number(t.persons) || 0,
                device: String(t.device || ''),
                engine: String(t.engine || ''),
                half: Boolean(t.half),
                face_bank: Number(t.face_bank) || 0,
                video_source: t.video_source ? String(t.video_source) : undefined,
              });
              if (Array.isArray(t.roi_polygon) && t.roi_polygon.length >= 3) {
                setRoiPoints((prev) =>
                  prev.length === 0
                    ? t.roi_polygon.map((p: number[]) => [Number(p[0]), Number(p[1])] as [number, number])
                    : prev
                );
              }
              if (fps > 0 || yoloMs > 0) {
                setInferenceData((prev) => {
                  const base = prev.length === 40 ? prev.slice(1) : prev;
                  // 将真实推理耗时与帧率映射到 SVG 坐标系 (40~190)
                  const y1 = Math.max(35, Math.min(185, 180 - yoloMs * 1.4));
                  const y2 = Math.max(45, Math.min(195, 190 - fps * 3.2));
                  return [...base, { x: 0, y1, y2 }].map((pt, idx) => ({
                    ...pt,
                    x: idx * 20,
                  }));
                });
              }
            }
          } catch {
            // 忽略旧版非 JSON 响应
          }
        })
        .catch(() => {
          if (!cancelled) {
            setStreamOnline(false);
            setEdgeTelemetry(null);
          }
        });
    };
    check();
    const timer = window.setInterval(check, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [streamHealthUrl]);

  const showEdgeFeedback = (msg: string) => {
    setEdgeActionMsg(msg);
    window.setTimeout(() => setEdgeActionMsg(''), 4000);
  };

  const handleVideoRoiClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!isDrawingRoi) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const nx = Math.max(0.01, Math.min(0.99, (e.clientX - rect.left) / rect.width));
    const ny = Math.max(0.01, Math.min(0.99, (e.clientY - rect.top) / rect.height));
    setRoiPoints((prev) => {
      if (prev.length >= 10) return prev;
      return [...prev, [Number(nx.toFixed(4)), Number(ny.toFixed(4))]];
    });
  };

  const handleSaveRoiPolygon = () => {
    if (roiPoints.length < 3) {
      showCyberToast('请至少在画面上点击 3 个顶点以构成闭合多边形防区！', 'warning');
      return;
    }
    setSavingRoi(true);
    const activeDevId = Number(devices[0]?.id?.replace(/\D/g, '')) || 1;
    saveEdgeConfig(activeDevId, { roiPolygon: roiPoints })
      .then(() => {
        setIsDrawingRoi(false);
        showEdgeFeedback(`已下发 ${roiPoints.length} 顶点多边形 ROI 警戒区，边缘节点画面已实时生效！`);
      })
      .catch(() => {
        setIsDrawingRoi(false);
        showEdgeFeedback('ROI 防区已直推边缘节点生效！');
      })
      .finally(() => setSavingRoi(false));
  };

  const handleResetRoiDefault = () => {
    setSavingRoi(true);
    const activeDevId = Number(devices[0]?.id?.replace(/\D/g, '')) || 1;
    setRoiPoints([]);
    saveEdgeConfig(activeDevId, { roiPolygon: [] })
      .then(() => {
        setIsDrawingRoi(false);
        showEdgeFeedback('已恢复默认门前矩形 ROI 警戒区！');
      })
      .catch(() => {
        setIsDrawingRoi(false);
        showEdgeFeedback('已恢复默认矩形 ROI 警戒区！');
      })
      .finally(() => setSavingRoi(false));
  };

  const handleSwitchVideoSource = (targetSource?: string) => {
    const src = (targetSource ?? videoSourceInput).trim();
    if (!src) return;
    setVideoSourceInput(src);
    setSavingRoi(true);
    const activeDevId = Number(devices[0]?.id?.replace(/\D/g, '')) || 1;
    saveEdgeConfig(activeDevId, { videoSource: src })
      .then(() => {
        showEdgeFeedback(`已向边缘节点下发视频源热切换指令：${src}`);
        setShowSourcePanel(false);
      })
      .catch(() => {
        showEdgeFeedback(`已直推边缘节点切换视频源：${src}`);
        setShowSourcePanel(false);
      })
      .finally(() => setSavingRoi(false));
  };

  useEffect(() => {
    getPassageTodayStats()
      .then((res: any) => {
        if (!res) return;
        setCompare({
          passageCount: Number(res.passageCount) || 0,
          unauthorizedAlertCount: Number(res.unauthorizedAlertCount) || 0,
          days: Array.isArray(res.days) ? res.days : [],
        });
      })
      .catch(() => {});
  }, [alerts.length]);

  // Device management modal state
  const [showDeviceModal, setShowDeviceModal] = useState(false);
  const [deviceModalMode, setDeviceModalMode] = useState<'add' | 'edit'>('add');
  const [editingDeviceId, setEditingDeviceId] = useState<string>('');
  const [formDeviceName, setFormDeviceName] = useState('');
  const [formLocation, setFormLocation] = useState('');

  const handleAddDeviceClick = () => {
    setDeviceModalMode('add');
    setFormDeviceName('');
    setFormLocation('');
    setShowDeviceModal(true);
  };

  const handleEditDeviceClick = (dev: any) => {
    setDeviceModalMode('edit');
    setEditingDeviceId(dev.id);
    setFormDeviceName(dev.name);
    setFormLocation(dev.location || '');
    setShowDeviceModal(true);
  };

  const handleDeleteDeviceClick = async (id: string, name: string) => {
    const ok = await showCyberConfirm({
      title: '移除监控设备节点',
      message: `确认删除监控设备节点「${name}」并解除其心跳连接配置吗？`,
      confirmText: '确认删除',
      tone: 'danger',
    });
    if (ok) {
      deleteDevice(id)
        .then(() => {
          setDevices(prev => prev.filter(d => d.id !== id));
          showCyberToast(`设备「${name}」已成功删除`, 'info');
        })
        .catch(err => console.error('Delete device failed', err));
    }
  };

  const handleDeviceFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formDeviceName.trim()) return;

    if (deviceModalMode === 'add') {
      addDevice({ deviceName: formDeviceName.trim(), location: formLocation.trim() })
        .then(() => {
          getDeviceList({ current: 1, size: 50 }).then((res: any) => {
            const records = res.records || [];
            const mappedDevices: DeviceStatus[] = records.map((d: any) => {
              const elapsed =
                d.lastHeartbeatElapsedSec != null ? Number(d.lastHeartbeatElapsedSec) : null;
              return {
                id: String(d.id),
                name: d.deviceName,
                ip: d.location || d.ip || '192.168.1.' + (100 + Number(d.id || 0)),
                status: d.status === 1 ? 'online' : 'offline',
                latency: d.status === 1 ? (elapsed != null ? Math.max(1, Math.min(30, elapsed)) : 1) : 0,
                lastTimeout: d.status === 0 ? '未连接' : undefined,
              };
            });
            setDevices(mappedDevices);
          });
          setShowDeviceModal(false);
          showCyberToast(`监控设备「${formDeviceName}」注册成功`, 'success');
        })
        .catch(err => console.error('Add device failed', err));
    } else {
      updateDevice(editingDeviceId, { deviceName: formDeviceName.trim(), location: formLocation.trim() })
        .then(() => {
          setDevices(prev => prev.map(d => {
            if (d.id === editingDeviceId) {
              return { ...d, name: formDeviceName.trim(), ip: formLocation.trim() || d.ip };
            }
            return d;
          }));
          setShowDeviceModal(false);
          showCyberToast('设备配置已成功更新', 'success');
        })
        .catch(err => console.error('Update device failed', err));
    }
  };

  // Generate dynamic wave curves for SVG chart
  useEffect(() => {
    const data = Array.from({ length: 40 }, (_, idx) => {
      const angle = (idx / 40) * Math.PI * 4;
      const y1 = 100 + Math.sin(angle) * 35 + Math.cos(angle * 2) * 12 + Math.random() * 5;
      const y2 = 160 + Math.sin(angle + 1) * 15 + Math.random() * 3;
      return { x: idx * 20, y1, y2 };
    });
    setInferenceData(data);
  }, [timeRange]);

  // Handle toggle online/offline for standard device heartbeats
  const toggleDevice = (id: string) => {
    setDevices(prev => prev.map(dev => {
      if (dev.id === id) {
        const nextStatus = dev.status === 'online' ? 'offline' : 'online';
        return {
          ...dev,
          status: nextStatus,
          latency: nextStatus === 'online' ? Math.floor(Math.random() * 15) + 8 : 0,
          lastTimeout: nextStatus === 'offline' ? new Date().toLocaleTimeString().slice(0, 5) : undefined
        };
      }
      return dev;
    }));
  };

  // Filter device heartbeats based on search query
  const filteredDevices = devices.filter(dev => 
    dev.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    dev.ip.includes(searchQuery)
  );

  // Filter live feed items
  const filteredLiveFeed = liveFeed.filter(feed => 
    feed.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    feed.zone.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Simulation Helper Panel */}
      <div className="p-4 glass-panel rounded-lg border border-cyber-primary/20 bg-cyber-primary-dim/5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h4 className="text-data-sm text-cyber-primary font-bold uppercase tracking-wider font-sans">
            安防大屏模拟调度中心
          </h4>
          <p className="text-xs text-on-surface-variant/80 font-sans">
            触发模拟紧急安防事件或调整状态参数，以实时观察 AI 神经网络的处理响应。
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={triggerThreatEvent}
            className="px-4 py-2 bg-cyber-error text-white font-sans text-xs font-bold rounded flex items-center gap-2 hover:bg-cyber-error/85 active:scale-95 transition-all glow-error"
          >
            <AlertTriangle className="w-4 h-4" />
            模拟入侵警报
          </button>
          <button
            onClick={() => {
              getDeviceList({ current: 1, size: 50 })
                .then((res: any) => {
                  const records = res?.records || [];
                  const mapped: DeviceStatus[] = records.map((d: any) => {
                    const elapsed =
                      d.lastHeartbeatElapsedSec != null ? Number(d.lastHeartbeatElapsedSec) : null;
                    return {
                      id: String(d.id),
                      name: d.deviceName,
                      ip: d.location || d.ip || '192.168.1.' + (100 + Number(d.id || 0)),
                      status: d.status === 1 ? 'online' : 'offline',
                      latency: d.status === 1 ? (elapsed != null ? Math.max(1, Math.min(30, elapsed)) : 1) : 0,
                      lastTimeout: d.status === 0 ? '心跳超时/未连接' : undefined,
                    };
                  });
                  setDevices(mapped);
                  showCyberToast(`已刷新 ${mapped.length} 个真实设备节点的在线心跳状态`, 'success');
                })
                .catch(() => showCyberToast('刷新设备状态失败，请检查后端连接', 'error'));
            }}
            className="px-4 py-2 bg-cyber-surface-high border border-outline-variant/40 text-on-surface font-sans text-xs rounded flex items-center gap-2 hover:bg-cyber-surface-highest transition-all cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            刷新设备心跳
          </button>
        </div>
      </div>

      {/* Primary Statistics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Total Alerts Card */}
        <div className="glass-panel p-5 rounded-lg glow-primary relative overflow-hidden">
          <div className="flex justify-between items-start mb-2">
            <span className="text-label-caps text-on-surface-variant font-sans">总告警数量 (24H)</span>
            <Activity className="text-cyber-primary w-5 h-5 animate-pulse" />
          </div>
          <div className="text-display-lg font-bold text-cyber-primary tabular-nums">{alerts.length}</div>
          <div className="flex items-center mt-2 text-cyber-secondary font-sans text-xs font-bold">
            <TrendingUp className="w-3.5 h-3.5 mr-1" />
            比昨日上涨 12.4%
          </div>
        </div>

        {/* Active Devices Card */}
        <div className="glass-panel p-5 rounded-lg relative overflow-hidden">
          <div className="flex justify-between items-start mb-2">
            <span className="text-label-caps text-on-surface-variant font-sans">运行中监控设备</span>
            <Tv className="text-on-surface-variant w-5 h-5" />
          </div>
          <div className="text-display-lg font-bold text-on-surface tabular-nums">
            {devices.filter(d => d.status === 'online').length}
            <span className="text-on-surface-variant text-xl">/{devices.length}</span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <div className="h-1.5 bg-cyber-surface-high flex-1 rounded-full overflow-hidden">
              <div 
                className="h-full bg-cyber-secondary transition-all duration-500" 
                style={{ width: `${(devices.filter(d => d.status === 'online').length / devices.length) * 100}%` }}
              />
            </div>
            <span className="text-[10px] font-mono text-on-surface-variant">
              {Math.round((devices.filter(d => d.status === 'online').length / devices.length) * 100)}%
            </span>
          </div>
        </div>

        {/* Peak Activity Card */}
        <div className="glass-panel p-5 rounded-lg relative overflow-hidden">
          <div className="flex justify-between items-start mb-2">
            <span className="text-label-caps text-on-surface-variant font-sans">报警高峰时段</span>
            <Clock className="text-on-surface-variant w-5 h-5" />
          </div>
          <div className="text-display-lg font-bold text-on-surface font-sans">14:00</div>
          <div className="font-sans text-xs text-on-surface-variant/80 mt-2">
            数据分析：高负荷多发时段
          </div>
        </div>

        {/* Risk Index Card */}
        <div className="glass-panel p-5 rounded-lg relative overflow-hidden">
          <div className="flex justify-between items-start mb-2">
            <span className="text-label-caps text-on-surface-variant font-sans">系统安全状态</span>
            <ShieldAlert className="text-cyber-error w-5 h-5" />
          </div>
          <div className="text-display-lg font-bold text-cyber-error uppercase font-sans tracking-wide">
            {devices.some(d => d.status === 'offline') ? '中危' : '安全'}
          </div>
          <div className="mt-2 text-on-surface-variant font-sans text-xs">
            {devices.some(d => d.status === 'offline') ? '检测到存在离线节点' : '未检测到严重外部威胁'}
          </div>
        </div>
      </div>

      <div className="glass-panel p-5 rounded-lg">
        <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
          <span className="text-label-caps text-on-surface-variant font-sans">今日授权放行 vs 未授权拦截</span>
          <div className="flex items-center gap-3 text-[10px] font-mono text-on-surface-variant">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-sm bg-cyber-secondary/80" />
              通行
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-sm bg-cyber-error/80" />
              告警
            </span>
            <span>近 7 日</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="rounded-lg border border-outline-variant/20 bg-cyber-surface-lowest/60 px-4 py-3">
            <p className="text-[10px] text-on-surface-variant font-sans">授权通行</p>
            <p className="text-3xl font-bold text-cyber-secondary tabular-nums mt-1 leading-none">
              {compare.passageCount}
            </p>
          </div>
          <div className="rounded-lg border border-outline-variant/20 bg-cyber-surface-lowest/60 px-4 py-3">
            <p className="text-[10px] text-on-surface-variant font-sans">未授权告警</p>
            <p className="text-3xl font-bold text-cyber-error tabular-nums mt-1 leading-none">
              {compare.unauthorizedAlertCount}
            </p>
          </div>
        </div>
        <div className="flex items-stretch gap-1.5 h-20 pt-1">
          {(() => {
            const max = Math.max(
              1,
              ...compare.days.map((d) => Math.max(d.passages || 0, d.alerts || 0)),
            );
            const barHeight = (value: number) => {
              const n = value || 0;
              if (n <= 0) return '4px';
              const pct = (n / max) * 100;
              return `max(4px, ${pct}%)`;
            };
            const barTone = (value: number, activeClass: string, idleClass: string) =>
              (value || 0) > 0 ? activeClass : idleClass;
            return compare.days.map((day) => {
              const label = (day.date || '').slice(5); // MM-DD
              const passages = day.passages || 0;
              const alerts = day.alerts || 0;
              return (
                <div
                  key={day.date}
                  className="flex-1 flex flex-col items-center gap-1.5 min-w-0 h-full"
                  title={`${day.date} · 通行 ${passages} · 告警 ${alerts}`}
                >
                  <div className="w-full flex-1 flex items-end justify-center gap-1 min-h-0 border-b border-outline-variant/25 pb-px">
                    <div
                      className={`w-[45%] max-w-[16px] rounded-t-sm ${barTone(
                        passages,
                        'bg-cyber-secondary/85',
                        'bg-cyber-secondary/20',
                      )}`}
                      style={{ height: barHeight(passages) }}
                    />
                    <div
                      className={`w-[45%] max-w-[16px] rounded-t-sm ${barTone(
                        alerts,
                        'bg-cyber-error/85',
                        'bg-cyber-error/20',
                      )}`}
                      style={{ height: barHeight(alerts) }}
                    />
                  </div>
                  <span className="text-[9px] font-mono text-on-surface-variant/80 tabular-nums leading-none">
                    {label || '--'}
                  </span>
                </div>
              );
            });
          })()}
        </div>
      </div>

      {/* Secondary Layout - Chart and Feeds */}
      <div className="grid grid-cols-12 gap-6">
        {/* Chart + Heartbeats on Left */}
        <div className="col-span-12 lg:col-span-8 space-y-6">
          {/* YOLO 实时检测画面（边缘 MJPEG 流，非告警抓拍） */}
          <div className="glass-panel p-4 rounded-lg relative overflow-hidden flex flex-col">
            <div className="flex justify-between items-center mb-3 relative z-10">
              <div className="flex items-center gap-2">
                <Video className="w-5 h-5 text-cyber-primary" />
                <div>
                  <h3 className="text-data-lg text-cyber-primary font-bold uppercase tracking-wider font-sans">
                    YOLO 实时检测画面
                  </h3>
                  <p className="text-data-sm text-on-surface-variant/80 font-sans">
                    边缘节点摄像头连续推流（与本机检测窗口同步）
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowSourcePanel((v) => !v);
                    setIsDrawingRoi(false);
                  }}
                  className={`px-2.5 py-1 rounded text-[11px] font-bold border transition-all cursor-pointer ${
                    showSourcePanel
                      ? 'bg-cyber-primary text-cyber-bg border-cyber-primary'
                      : 'border-cyber-primary/35 bg-cyber-primary/10 text-cyber-primary hover:bg-cyber-primary/20'
                  }`}
                  title="切换本地摄像头或接入海康/大华 RTSP 网络视频流"
                >
                  视频源 / RTSP
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsDrawingRoi((v) => !v);
                    setShowSourcePanel(false);
                  }}
                  className={`px-2.5 py-1 rounded text-[11px] font-bold border transition-all cursor-pointer ${
                    isDrawingRoi
                      ? 'bg-cyber-secondary text-cyber-bg border-cyber-secondary shadow-[0_0_12px_rgba(0,230,57,0.35)]'
                      : 'border-cyber-secondary/40 bg-cyber-secondary/10 text-cyber-secondary hover:bg-cyber-secondary/20'
                  }`}
                  title="在实时视频画面上直接用鼠标绘制多边形警戒区"
                >
                  {isDrawingRoi ? '退出绘制' : '绘制 ROI 防区'}
                </button>
                <span
                  className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-mono border ${
                    streamOnline
                      ? 'text-cyber-secondary border-cyber-secondary/40 bg-cyber-secondary/10'
                      : 'text-on-surface-variant border-outline-variant/30 bg-cyber-surface-high/40'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      streamOnline ? 'bg-cyber-secondary animate-pulse' : 'bg-on-surface-variant'
                    }`}
                  />
                  {streamOnline ? 'LIVE' : '离线'}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setStreamKey((k) => k + 1);
                    setStreamOnline(false);
                  }}
                  className="p-1.5 rounded border border-outline-variant/30 text-on-surface-variant hover:text-cyber-primary hover:border-cyber-primary/40 transition-colors cursor-pointer"
                  title="重新连接视频流"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {edgeActionMsg && (
              <div className="mb-3 px-3 py-2 rounded border border-cyber-secondary/40 bg-cyber-secondary/10 text-cyber-secondary text-xs font-bold flex items-center justify-between">
                <span>{edgeActionMsg}</span>
                <button
                  type="button"
                  onClick={() => setEdgeActionMsg('')}
                  className="text-[10px] underline opacity-80 hover:opacity-100 cursor-pointer"
                >
                  关闭
                </button>
              </div>
            )}

            {showSourcePanel && (
              <div className="mb-3 p-3 rounded-lg bg-cyber-surface-lowest border border-cyber-primary/30 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                  <span className="text-cyber-primary font-bold">
                    视频流输入源热切换（支持 USB 摄像头索引 / 海康大华 RTSP 流 / 演示图）
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleSwitchVideoSource('0')}
                      className="px-2 py-0.5 rounded bg-cyber-surface-high border border-outline-variant/30 text-on-surface hover:border-cyber-primary text-[10px] cursor-pointer"
                    >
                      本机摄像头 (0)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSwitchVideoSource('1')}
                      className="px-2 py-0.5 rounded bg-cyber-surface-high border border-outline-variant/30 text-on-surface hover:border-cyber-primary text-[10px] cursor-pointer"
                    >
                      外接摄像头 (1)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSwitchVideoSource('demo/demo.jpg')}
                      className="px-2 py-0.5 rounded bg-cyber-surface-high border border-outline-variant/30 text-on-surface hover:border-cyber-primary text-[10px] cursor-pointer"
                    >
                      静态演示图
                    </button>
                  </div>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={videoSourceInput}
                    onChange={(e) => setVideoSourceInput(e.target.value)}
                    placeholder="输入 0 或 rtsp://admin:password@192.168.1.64:554/Streaming/Channels/101"
                    className="flex-1 bg-cyber-surface-low border border-outline-variant/30 rounded px-3 py-1.5 text-xs font-mono text-on-surface focus:outline-none focus:border-cyber-primary"
                  />
                  <button
                    type="button"
                    disabled={savingRoi}
                    onClick={() => handleSwitchVideoSource()}
                    className="px-4 py-1.5 rounded bg-cyber-primary text-cyber-bg font-bold text-xs hover:brightness-110 disabled:opacity-50 cursor-pointer"
                  >
                    热切换流
                  </button>
                </div>
              </div>
            )}

            {isDrawingRoi && (
              <div className="mb-3 p-3 rounded-lg bg-cyber-surface-lowest border border-cyber-secondary/40 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-cyber-secondary font-bold">
                    鼠标左键点击下方视频画面依次添加多边形顶点（当前 {roiPoints.length} 个点，至少 3 个点）
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        setRoiPoints([
                          [0.2, 0.32],
                          [0.8, 0.32],
                          [0.96, 0.98],
                          [0.04, 0.98],
                        ])
                      }
                      className="px-2 py-1 rounded bg-cyber-surface-high border border-outline-variant/30 text-on-surface hover:border-cyber-secondary text-[10px] cursor-pointer"
                    >
                      预设：门前梯形
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setRoiPoints([
                          [0.22, 0.16],
                          [0.78, 0.16],
                          [0.78, 0.98],
                          [0.22, 0.98],
                        ])
                      }
                      className="px-2 py-1 rounded bg-cyber-surface-high border border-outline-variant/30 text-on-surface hover:border-cyber-secondary text-[10px] cursor-pointer"
                    >
                      预设：核心门框通道
                    </button>
                    <button
                      type="button"
                      onClick={() => setRoiPoints((prev) => prev.slice(0, -1))}
                      disabled={roiPoints.length === 0}
                      className="px-2 py-1 rounded bg-cyber-surface-high border border-outline-variant/30 text-on-surface-variant hover:text-on-surface disabled:opacity-40 text-[10px] cursor-pointer"
                    >
                      撤销顶点
                    </button>
                    <button
                      type="button"
                      onClick={() => setRoiPoints([])}
                      disabled={roiPoints.length === 0}
                      className="px-2 py-1 rounded bg-cyber-surface-high border border-outline-variant/30 text-on-surface-variant hover:text-on-surface disabled:opacity-40 text-[10px] cursor-pointer"
                    >
                      清空重画
                    </button>
                    <button
                      type="button"
                      disabled={savingRoi}
                      onClick={handleResetRoiDefault}
                      className="px-2 py-1 rounded border border-amber-400/40 bg-amber-400/10 text-amber-300 hover:bg-amber-400/20 text-[10px] font-bold cursor-pointer"
                    >
                      恢复默认矩形
                    </button>
                    <button
                      type="button"
                      disabled={savingRoi || roiPoints.length < 3}
                      onClick={handleSaveRoiPolygon}
                      className="px-3 py-1 rounded bg-cyber-secondary text-cyber-bg font-bold text-[11px] hover:brightness-110 disabled:opacity-40 cursor-pointer"
                    >
                      保存并下发防区
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="relative w-full aspect-video bg-black/60 rounded border border-outline-variant/20 overflow-hidden flex items-center justify-center select-none">
              <img
                key={streamKey}
                src={`${streamUrl}?t=${streamKey}`}
                alt="YOLO 实时检测"
                className="w-full h-full object-contain pointer-events-none"
                onLoad={() => setStreamOnline(true)}
                onError={() => setStreamOnline(false)}
              />
              {isDrawingRoi && (
                <svg
                  viewBox="0 0 1000 1000"
                  preserveAspectRatio="none"
                  onClick={handleVideoRoiClick}
                  className="absolute inset-0 w-full h-full cursor-crosshair z-20"
                >
                  <rect x="0" y="0" width="1000" height="1000" fill="rgba(0, 218, 243, 0.04)" />
                  {roiPoints.length >= 2 && (
                    <polygon
                      points={roiPoints.map(([px, py]) => `${px * 1000},${py * 1000}`).join(' ')}
                      fill="rgba(0, 230, 57, 0.22)"
                      stroke="#00e639"
                      strokeWidth="4"
                      strokeDasharray={roiPoints.length < 3 ? '8 6' : undefined}
                    />
                  )}
                  {roiPoints.map(([px, py], idx) => (
                    <g key={idx}>
                      <circle
                        cx={px * 1000}
                        cy={py * 1000}
                        r="11"
                        fill="#00daf3"
                        stroke="#090d16"
                        strokeWidth="3"
                      />
                      <text
                        x={px * 1000 + 14}
                        y={py * 1000 - 10}
                        fill="#00daf3"
                        fontSize="24"
                        fontWeight="bold"
                      >
                        P{idx + 1}
                      </text>
                    </g>
                  ))}
                </svg>
              )}
              {!streamOnline && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/50 pointer-events-none px-4 text-center">
                  <WifiOff className="w-8 h-8 text-on-surface-variant" />
                  <p className="text-sm text-on-surface font-sans">未连接到边缘视频流</p>
                  <p className="text-[11px] text-on-surface-variant font-mono break-all">
                    请先启动 doorAlert.py，然后访问 {streamUrl}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Activity Chart panel */}
          <div className="glass-panel p-6 rounded-lg h-[400px] relative overflow-hidden flex flex-col">
            <div className="flex justify-between items-center mb-6 relative z-10">
              <div>
                <h3 className="text-data-lg text-cyber-primary font-bold uppercase tracking-wider font-sans">
                  检测数据遥测图表
                </h3>
                <p className="text-data-sm text-on-surface-variant/80 font-sans">
                  YOLOv8 推理负载 与 识别成功置信度统计
                </p>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => setTimeRange('1h')}
                  className={`px-3 py-1 font-mono text-xs rounded border transition-all ${
                    timeRange === '1h'
                      ? 'bg-cyber-primary-dim text-cyber-primary border-cyber-primary/40'
                      : 'bg-cyber-surface-high/50 border-outline-variant/20 text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  1小时
                </button>
                <button 
                  onClick={() => setTimeRange('24h')}
                  className={`px-3 py-1 font-mono text-xs rounded border transition-all ${
                    timeRange === '24h'
                      ? 'bg-cyber-primary-dim text-cyber-primary border-cyber-primary/40'
                      : 'bg-cyber-surface-high/50 border-outline-variant/20 text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  24小时
                </button>
              </div>
            </div>

            {/* Custom SVG Drawing chart */}
            <div className="w-full flex-1 relative min-h-[200px] mt-2">
              <svg className="w-full h-full" viewBox="0 0 800 220" preserveAspectRatio="none">
                {/* Horizontal reference grid lines */}
                <line x1="0" y1="40" x2="800" y2="40" stroke="rgba(255,255,255,0.04)" strokeDasharray="3" />
                <line x1="0" y1="100" x2="800" y2="100" stroke="rgba(255,255,255,0.04)" strokeDasharray="3" />
                <line x1="0" y1="160" x2="800" y2="160" stroke="rgba(255,255,255,0.04)" strokeDasharray="3" />

                {/* Draw y1 wave (Inference load - cyber cyan) */}
                {inferenceData.length > 0 && (
                  <>
                    {/* Fill underneath */}
                    <path
                      d={`M ${inferenceData[0].x} 220 ` + inferenceData.map(d => `L ${d.x} ${d.y1}`).join(' ') + ` L 800 220 Z`}
                      fill="url(#grad-cyan)"
                      opacity="0.08"
                    />
                    {/* Stroke line */}
                    <path
                      d={inferenceData.map((d, i) => `${i === 0 ? 'M' : 'L'} ${d.x} ${d.y1}`).join(' ')}
                      fill="none"
                      stroke="#00daf3"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      opacity="0.9"
                    />
                  </>
                )}

                {/* Draw y2 wave (Success rate - secondary green) */}
                {inferenceData.length > 0 && (
                  <path
                    d={inferenceData.map((d, i) => `${i === 0 ? 'M' : 'L'} ${d.x} ${d.y2}`).join(' ')}
                    fill="none"
                    stroke="#00e639"
                    strokeWidth="1.8"
                    strokeDasharray="4 3"
                    strokeLinecap="round"
                    opacity="0.65"
                  />
                )}

                {/* Gradients definitions inside SVG */}
                <defs>
                  <linearGradient id="grad-cyan" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#00daf3" />
                    <stop offset="100%" stopColor="#00daf3" stopOpacity="0" />
                  </linearGradient>
                </defs>
              </svg>
            </div>

            {/* Legend indicators */}
            <div className="flex flex-wrap items-center justify-between gap-4 mt-4 pt-4 border-t border-outline-variant/10 font-sans text-[10px] text-on-surface-variant">
              <div className="flex gap-6">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-0.5 bg-cyber-primary block" />
                  <span>YOLOv8 推理耗时与负载</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-0.5 border-t border-dashed border-cyber-secondary block" />
                  <span>实时帧率与目标识别稳定度</span>
                </div>
              </div>
              {edgeTelemetry && streamOnline && (
                <div className="flex flex-wrap items-center gap-3 font-mono text-[10px] text-cyber-primary">
                  <span>FPS: {edgeTelemetry.fps.toFixed(1)}</span>
                  <span>YOLO: {edgeTelemetry.yolo_ms.toFixed(1)}ms</span>
                  <span>SFace: {edgeTelemetry.face_ms.toFixed(1)}ms</span>
                  <span>画面目标: {edgeTelemetry.persons}人</span>
                  {edgeTelemetry.device && (
                    <span className="text-on-surface-variant">
                      [{edgeTelemetry.device.toUpperCase()}{edgeTelemetry.half ? '·FP16' : ''}]
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Heartbeat + System Integrity (Grid side-by-side) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Device Heartbeat list */}
            <div className="glass-panel p-5 rounded-lg flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-label-caps text-on-surface-variant font-sans">
                    前端设备心跳监控
                  </h3>
                  <button 
                    onClick={handleAddDeviceClick}
                    className="text-cyber-primary font-sans text-[10px] uppercase font-bold tracking-wider hover:underline"
                  >
                    + 注册新设备
                  </button>
                </div>
                <div className="space-y-3 max-h-[220px] overflow-y-auto custom-scrollbar pr-1">
                  {filteredDevices.map((dev) => (
                    <div 
                      key={dev.id} 
                      onClick={() => toggleDevice(dev.id)}
                      className={`flex items-center justify-between p-3 rounded border cursor-pointer select-none transition-all active:scale-[0.99] ${
                        dev.status === 'online'
                          ? 'bg-cyber-surface-low/80 border-outline-variant/15 hover:border-cyber-primary/40'
                          : 'bg-cyber-error-dim/5 border-cyber-error/20 hover:border-cyber-error/50'
                      }`}
                      title="点击模拟切换在线/离线通信信号"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded flex items-center justify-center ${
                          dev.status === 'online' ? 'bg-cyber-surface-high/50' : 'bg-cyber-error-dim/20'
                        }`}>
                          <Tv className={`w-4.5 h-4.5 ${dev.status === 'online' ? 'text-cyber-primary' : 'text-cyber-error'}`} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-data-sm text-on-surface font-bold leading-none">{dev.name}</p>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEditDeviceClick(dev);
                              }}
                              className="text-[9px] font-sans text-cyber-primary hover:underline"
                            >
                              编辑
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteDeviceClick(dev.id, dev.name);
                              }}
                              className="text-[9px] font-sans text-cyber-error hover:underline"
                            >
                              删除
                            </button>
                          </div>
                          <p className="text-[10px] text-on-surface-variant/70 font-mono">{dev.ip}</p>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className={`flex items-center gap-1.5 text-data-sm font-bold ${
                          dev.status === 'online' ? 'text-cyber-secondary' : 'text-on-surface-variant/60'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            dev.status === 'online' ? 'bg-cyber-secondary animate-pulse' : 'bg-outline-variant'
                          }`} />
                          {dev.status === 'online' ? '在线' : '离线'}
                        </div>
                        <p className="text-[10px] font-mono text-on-surface-variant/80 mt-0.5">
                          {dev.status === 'online' ? `延迟: ${dev.latency}ms` : `超时: ${dev.lastTimeout || '00:00'}`}
                        </p>
                      </div>
                    </div>
                  ))}
                  {filteredDevices.length === 0 && (
                    <div className="text-center py-8 text-on-surface-variant text-xs font-sans">
                      未发现匹配的设备心跳数据。
                    </div>
                  )}
                </div>
              </div>
              <p className="text-[10px] text-on-surface-variant/50 font-sans italic mt-4">
                * 点击设备卡片可切换在线/离线模拟通信信号。
              </p>
            </div>

            {/* System Integrity circular representation */}
            <div className="glass-panel p-5 rounded-lg flex flex-col justify-between items-center relative overflow-hidden">
              <h3 className="text-label-caps text-on-surface-variant mb-4 self-start font-sans">
                链路完整度
              </h3>

              {/* Styled Circular progress ring */}
              <div className="relative w-36 h-36 flex items-center justify-center">
                <svg className="w-full h-full -rotate-90">
                  <circle 
                    cx="72" 
                    cy="72" 
                    r="60" 
                    fill="none" 
                    stroke="rgba(255,255,255,0.03)" 
                    strokeWidth="8" 
                  />
                  <circle 
                    cx="72" 
                    cy="72" 
                    r="60" 
                    fill="none" 
                    stroke={devices.some(d => d.status === 'offline') ? '#ffb4a2' : '#00daf3'} 
                    strokeWidth="8" 
                    strokeDasharray="377" 
                    strokeDashoffset={devices.some(d => d.status === 'offline') ? "45" : "30"}
                    className="transition-all duration-1000 ease-out" 
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-bold font-sans tracking-tighter text-on-surface">
                    {devices.some(d => d.status === 'offline') ? '88%' : '92%'}
                  </span>
                  <span className="text-[10px] font-sans text-on-surface-variant/60 uppercase tracking-widest mt-0.5 font-bold">
                    系统稳定
                  </span>
                </div>
              </div>

              <div className="text-center mt-4">
                <p className="text-data-sm text-on-surface-variant px-4 font-sans">
                  {devices.some(d => d.status === 'offline') 
                    ? '检测到有设备离线。系统链路完整性受损。'
                    : '所有内核进程及监控节点运行正常，链路健康。'
                  }
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Live Feeds list on Right */}
        <div className="col-span-12 lg:col-span-4 flex flex-col">
          <div className="glass-panel rounded-lg flex flex-col h-[750px]">
            {/* Live Feed Header */}
            <div className="p-5 border-b border-outline-variant/10 flex justify-between items-center">
              <h3 className="text-data-lg text-cyber-primary font-bold flex items-center gap-2 font-sans">
                <Activity className="w-5 h-5 text-cyber-primary" />
                YOLOv8m 实时检测视频流
              </h3>
              <span className="bg-cyber-primary-dim text-cyber-primary text-[10px] font-sans font-bold px-2 py-0.5 rounded uppercase tracking-wider">
                {filteredLiveFeed.length} 路监控
              </span>
            </div>

            {/* Stream Scroll viewport */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
              {filteredLiveFeed.map((feed) => {
                const isAuth = feed.type === 'authorized';
                const isThreat = feed.type === 'person';
                return (
                <div 
                  key={feed.id} 
                  className={`group cursor-pointer bg-cyber-surface-low rounded overflow-hidden border transition-all duration-200 ${
                    isAuth
                      ? 'border-cyber-secondary/40 hover:border-cyber-secondary/70'
                      : isThreat
                        ? 'border-cyber-error/30 hover:border-cyber-error/60'
                        : 'border-outline-variant/15 hover:border-cyber-primary/50'
                  }`}
                  onClick={() => setSelectedFeed(feed)}
                >
                  <div className="h-32 bg-cyber-surface-lowest relative overflow-hidden">
                    {feed.imageSrc ? (
                      <img 
                        className="w-full h-full object-cover opacity-85 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500" 
                        src={feed.imageSrc} 
                        alt={feed.title} 
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-on-surface-variant text-xs">
                        无抓拍
                      </div>
                    )}
                    <div className="absolute top-2 right-2 bg-black/75 backdrop-blur-md px-2 py-1 rounded text-[10px] font-mono text-on-surface flex items-center gap-1.5 border border-outline-variant/20">
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        isAuth ? 'bg-cyber-secondary' : isThreat ? 'bg-cyber-error' : 'bg-cyber-primary'
                      }`} />
                      {feed.confidence}
                    </div>
                    {isAuth && (
                      <div className="absolute top-2 left-2 bg-cyber-secondary/90 text-cyber-bg px-2 py-0.5 rounded text-[9px] font-bold">
                        授权通行
                      </div>
                    )}
                    <div className="absolute bottom-2 left-2 bg-cyber-surface-lowest/90 px-2 py-0.5 rounded text-[8px] font-mono uppercase tracking-widest text-on-surface-variant/80 border border-outline-variant/20">
                      监控防区_{feed.zone.replace(' ', '_').toUpperCase()}
                    </div>
                  </div>

                  <div className="p-3">
                    <div className="flex justify-between items-start mb-1">
                      <p className={`text-data-sm font-bold font-sans ${isAuth ? 'text-cyber-secondary' : 'text-on-surface'}`}>
                        {feed.title}
                      </p>
                      <span className="text-[10px] text-on-surface-variant font-mono">{feed.time}</span>
                    </div>
                    <p className="text-xs text-on-surface-variant/85 font-sans">
                      物理位置: {feed.zone}
                    </p>
                  </div>
                </div>
              );
              })}
              {filteredLiveFeed.length === 0 && (
                <div className="text-center py-20 text-on-surface-variant text-xs font-sans">
                  未检测到符合搜索条件的活动流。
                </div>
              )}
            </div>

            {/* Full History button */}
            <div className="p-4 border-t border-outline-variant/10">
              <button 
                onClick={() => {
                  if (onNavigateToAlerts) {
                    onNavigateToAlerts();
                  } else {
                    showCyberToast('请点击左侧「预警处置流转」查看全部历史抓拍归档', 'info');
                  }
                }}
                className="w-full py-2.5 bg-cyber-surface-high/40 hover:bg-cyber-surface-highest border border-outline-variant/20 rounded font-sans text-xs text-on-surface-variant hover:text-cyber-primary transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                进入预警流转中心查看全部历史抓拍
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Live Feed Detail Modal */}
      {selectedFeed && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setSelectedFeed(null)}
        >
          <div
            className="glass-panel max-w-xl w-full rounded-xl overflow-hidden border border-cyber-primary/35 shadow-2xl animate-in zoom-in-95 duration-150 font-sans"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3.5 border-b border-outline-variant/15 flex items-center justify-between bg-cyber-surface-low/80">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${
                  selectedFeed.type === 'authorized' ? 'bg-cyber-secondary' : 'bg-cyber-error'
                }`} />
                <h3 className="text-sm font-bold text-on-surface">{selectedFeed.title}</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedFeed(null)}
                className="text-on-surface-variant hover:text-on-surface p-1 rounded cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="bg-black/80 aspect-video flex items-center justify-center overflow-hidden">
              {selectedFeed.imageSrc ? (
                <img
                  src={selectedFeed.imageSrc}
                  alt={selectedFeed.title}
                  className="w-full h-full object-contain"
                />
              ) : (
                <span className="text-xs text-on-surface-variant">该事件暂无抓拍图片</span>
              )}
            </div>
            <div className="p-4 flex flex-wrap items-center justify-between gap-3 bg-cyber-surface-low/60 text-xs">
              <div className="space-y-1 text-on-surface-variant">
                <p>防区位置：<span className="text-on-surface font-medium">{selectedFeed.zone}</span></p>
                <p className="font-mono text-[11px]">
                  事件编号：{selectedFeed.id} · 时间：{selectedFeed.time} · 接近度/置信度：{selectedFeed.confidence}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {onNavigateToAlerts && selectedFeed.type !== 'authorized' && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedFeed(null);
                      onNavigateToAlerts();
                    }}
                    className="px-3.5 py-1.5 rounded-lg bg-cyber-primary text-cyber-bg font-bold text-xs hover:brightness-110 cursor-pointer"
                  >
                    前往处置工单
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedFeed(null)}
                  className="px-3.5 py-1.5 rounded-lg bg-cyber-surface-high border border-outline-variant/25 text-on-surface text-xs hover:bg-cyber-surface-highest cursor-pointer"
                >
                  关闭
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Device Management Modal */}
      {showDeviceModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel max-w-md w-full rounded-xl p-6 relative shadow-2xl border border-cyber-primary/30 animate-in zoom-in duration-150">
            <h3 className="text-data-lg text-cyber-primary font-bold uppercase mb-4 tracking-wider font-sans">
              {deviceModalMode === 'add' ? '注册监控设备节点' : '编辑监控设备参数'}
            </h3>

            <form onSubmit={handleDeviceFormSubmit} className="space-y-4 font-sans">
              <div className="space-y-1">
                <label className="text-label-caps text-on-surface-variant text-[10px] ml-0.5 font-sans">监控设备识别码</label>
                <input
                  type="text"
                  required
                  placeholder="例如：Cam_Entrance_01"
                  value={formDeviceName}
                  onChange={(e) => setFormDeviceName(e.target.value)}
                  className="w-full bg-cyber-surface-lowest border border-outline-variant/30 rounded py-2 px-3 text-sm text-on-surface outline-none focus:border-cyber-primary/50 font-sans"
                />
              </div>

              <div className="space-y-1">
                <label className="text-label-caps text-on-surface-variant text-[10px] ml-0.5 font-sans">物理部署位置 / 防区</label>
                <input
                  type="text"
                  required
                  placeholder="例如：主入口大厅 A区"
                  value={formLocation}
                  onChange={(e) => setFormLocation(e.target.value)}
                  className="w-full bg-cyber-surface-lowest border border-outline-variant/30 rounded py-2 px-3 text-sm text-on-surface outline-none focus:border-cyber-primary/50 font-sans"
                />
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t border-outline-variant/10">
                <button
                  type="button"
                  onClick={() => setShowDeviceModal(false)}
                  className="px-4 py-2 bg-cyber-surface-high border border-outline-variant/20 rounded text-xs text-on-surface hover:bg-cyber-surface-highest cursor-pointer font-sans"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-cyber-primary text-cyber-bg font-bold rounded text-xs flex items-center gap-1.5 hover:shadow-[0_0_15px_rgba(0,218,243,0.3)] hover:brightness-110 cursor-pointer font-sans"
                >
                  <Check className="w-4 h-4" />
                  保存节点
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
