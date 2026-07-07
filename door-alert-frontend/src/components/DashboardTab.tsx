import React, { useState, useEffect } from 'react';
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
  Check
} from 'lucide-react';
import { DeviceStatus, LiveFeedItem, Alert } from '../types';
import { addDevice, updateDevice, deleteDevice, getDeviceList } from '@/api/index';

interface DashboardTabProps {
  searchQuery: string;
  devices: DeviceStatus[];
  setDevices: React.Dispatch<React.SetStateAction<DeviceStatus[]>>;
  liveFeed: LiveFeedItem[];
  setLiveFeed: React.Dispatch<React.SetStateAction<LiveFeedItem[]>>;
  triggerThreatEvent: () => void;
  alerts: Alert[];
}

export default function DashboardTab({ 
  searchQuery, 
  devices, 
  setDevices, 
  liveFeed, 
  setLiveFeed,
  triggerThreatEvent,
  alerts
}: DashboardTabProps) {
  const [timeRange, setTimeRange] = useState<'1h' | '24h'>('24h');
  const [inferenceData, setInferenceData] = useState<{ x: number; y1: number; y2: number }[]>([]);

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

  const handleDeleteDeviceClick = (id: string, name: string) => {
    if (confirm(`Purge device nodes and decommission connection profile for ${name}?`)) {
      deleteDevice(id)
        .then(() => {
          setDevices(prev => prev.filter(d => d.id !== id));
          alert(`Device ${name} deleted successfully.`);
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
          // Re-fetch device list
          getDeviceList({ current: 1, size: 50 }).then((res: any) => {
            const records = res.records || [];
            const mappedDevices: DeviceStatus[] = records.map((d: any) => ({
              id: String(d.id),
              name: d.deviceName,
              ip: d.ip || '192.168.1.' + (100 + d.id),
              status: d.status === 1 ? 'online' : 'offline',
              latency: d.status === 1 ? Math.floor(Math.random() * 15) + 5 : 0,
              lastTimeout: d.status === 0 ? '04:22' : undefined
            }));
            setDevices(mappedDevices);
          });
          setShowDeviceModal(false);
          alert(`Device ${formDeviceName} registered successfully.`);
        })
        .catch(err => console.error('Add device failed', err));
    } else {
      updateDevice(editingDeviceId, { deviceName: formDeviceName.trim(), location: formLocation.trim() })
        .then(() => {
          setDevices(prev => prev.map(d => {
            if (d.id === editingDeviceId) {
              return { ...d, name: formDeviceName.trim(), location: formLocation.trim() };
            }
            return d;
          }));
          setShowDeviceModal(false);
          alert(`Device profile updated successfully.`);
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
              // Reset state back to nominal values
              setDevices([
                { id: '1', name: '大门入口_Cam_01', ip: '192.168.1.104', status: 'online', latency: 12 },
                { id: '2', name: '后装卸货台_Cam_B', ip: '192.168.1.108', status: 'online', latency: 18 },
                { id: '3', name: '南侧警戒大门_P3', ip: '192.168.1.112', status: 'offline', latency: 0, lastTimeout: '04:22' }
              ]);
              alert('监控设备状态矩阵已重置为正常标称参数。');
            }}
            className="px-4 py-2 bg-cyber-surface-high border border-outline-variant/40 text-on-surface font-sans text-xs rounded flex items-center gap-2 hover:bg-cyber-surface-highest transition-all"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            重置设备矩阵
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

      {/* Secondary Layout - Chart and Feeds */}
      <div className="grid grid-cols-12 gap-6">
        {/* Chart + Heartbeats on Left */}
        <div className="col-span-12 lg:col-span-8 space-y-6">
          {/* Activity Chart panel */}
          <div className="glass-panel p-6 rounded-lg h-[400px] relative overflow-hidden flex flex-col">
            <div className="flex justify-between items-center mb-6 relative z-10">
              <div>
                <h3 className="text-data-lg text-cyber-primary font-bold uppercase tracking-wider font-sans">
                  检测数据遥测图表
                </h3>
                <p className="text-data-sm text-on-surface-variant/80 font-sans">
                  YOLOv8m 推理负载 与 识别成功置信度统计
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
            <div className="flex gap-6 mt-4 pt-4 border-t border-outline-variant/10 font-sans text-[10px] text-on-surface-variant">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-cyber-primary block" />
                <span>YOLOv8m 推理神经网络负载</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 border-t border-dashed border-cyber-secondary block" />
                <span>目标识别成功率 (置信度波动)</span>
              </div>
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
              {filteredLiveFeed.map((feed) => (
                <div 
                  key={feed.id} 
                  className="group cursor-pointer bg-cyber-surface-low rounded overflow-hidden border border-outline-variant/15 hover:border-cyber-primary/50 transition-all duration-200"
                  onClick={() => alert(`正在调取监控节点详情。视频流ID: ${feed.id}。事件描述：${feed.title}。防区：${feed.zone}。AI 置信度：${feed.confidence}。`)}
                >
                  <div className="h-32 bg-cyber-surface-lowest relative overflow-hidden">
                    <img 
                      className="w-full h-full object-cover opacity-85 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500" 
                      src={feed.imageSrc} 
                      alt={feed.title} 
                    />
                    <div className="absolute top-2 right-2 bg-black/75 backdrop-blur-md px-2 py-1 rounded text-[10px] font-mono text-on-surface flex items-center gap-1.5 border border-outline-variant/20">
                      <span className="w-1.5 h-1.5 rounded-full bg-cyber-primary" />
                      {feed.confidence}
                    </div>
                    <div className="absolute bottom-2 left-2 bg-cyber-surface-lowest/90 px-2 py-0.5 rounded text-[8px] font-mono uppercase tracking-widest text-on-surface-variant/80 border border-outline-variant/20">
                      监控防区_{feed.zone.replace(' ', '_').toUpperCase()}
                    </div>
                  </div>

                  <div className="p-3">
                    <div className="flex justify-between items-start mb-1">
                      <p className="text-data-sm text-on-surface font-bold font-sans">{feed.title}</p>
                      <span className="text-[10px] text-on-surface-variant font-mono">{feed.time}</span>
                    </div>
                    <p className="text-xs text-on-surface-variant/85 font-sans">
                      物理位置: {feed.zone}
                    </p>
                  </div>
                </div>
              ))}
              {filteredLiveFeed.length === 0 && (
                <div className="text-center py-20 text-on-surface-variant text-xs font-sans">
                  未检测到符合搜索条件的活动流。
                </div>
              )}
            </div>

            {/* Full History button */}
            <div className="p-4 border-t border-outline-variant/10">
              <button 
                onClick={() => alert('正在接入历史冷存储离线盘库，直接安全通道已建立。')}
                className="w-full py-2.5 bg-cyber-surface-high/40 hover:bg-cyber-surface-highest border border-outline-variant/20 rounded font-sans text-xs text-on-surface-variant hover:text-on-surface transition-colors"
              >
                调取系统监控历史底片
              </button>
            </div>
          </div>
        </div>
      </div>

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
