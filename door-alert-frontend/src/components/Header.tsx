import React, { useState, useEffect } from 'react';
import { Search, Clock, Bell, Shield, ChevronDown } from 'lucide-react';

interface HeaderProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  username: string;
}

export default function Header({ searchQuery, setSearchQuery, username }: HeaderProps) {
  const [timeMode, setTimeMode] = useState<'local' | 'utc'>('local');
  const [timeString, setTimeString] = useState('');
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  // Tick clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      if (timeMode === 'local') {
        setTimeString(now.toLocaleTimeString());
      } else {
        setTimeString(now.toUTCString().slice(17, 25) + ' UTC');
      }
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [timeMode]);

  return (
    <header className="fixed top-0 right-0 left-[280px] h-16 bg-cyber-surface/60 backdrop-blur-md border-b border-outline-variant/10 z-40 flex justify-between items-center px-8">
      {/* Search Bar */}
      <div className="flex items-center gap-4">
        <div className="relative group">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant group-focus-within:text-cyber-primary transition-colors" />
          <input
            type="text"
            className="bg-cyber-surface-lowest/80 border border-outline-variant/30 rounded-full py-1.5 pl-10 pr-4 text-xs font-sans text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-cyber-primary/50 focus:ring-1 focus:ring-cyber-primary/10 transition-all w-72 outline-none"
            placeholder="搜索系统、报警或监控摄像头..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-on-surface-variant hover:text-on-surface font-mono"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* System Status and Profile */}
      <div className="flex items-center gap-6">
        {/* System Online Badge */}
        <div className="flex items-center gap-2 px-3 py-1 bg-cyber-surface-low/30 rounded border border-outline-variant/10">
          <div className="w-2 h-2 rounded-full bg-cyber-secondary animate-pulse shadow-[0_0_8px_#00e639]" />
          <span className="font-sans text-[11px] text-cyber-secondary uppercase tracking-widest font-bold">
            系统已上线
          </span>
        </div>

        {/* Time Toggle Action */}
        <button
          onClick={() => setTimeMode(prev => prev === 'local' ? 'utc' : 'local')}
          className="flex items-center gap-1.5 text-on-surface-variant hover:text-cyber-primary transition-colors font-mono text-xs cursor-pointer select-none bg-cyber-surface-low/20 px-2.5 py-1 rounded border border-outline-variant/15"
          title="切换 本地时间 / UTC 时间"
        >
          <Clock className="w-3.5 h-3.5" />
          <span className="tracking-wider tabular-nums">{timeString}</span>
        </button>

        {/* Alerts and Action controls */}
        <div className="flex items-center gap-4 text-on-surface-variant relative">
          {/* Notifications Trigger */}
          <div className="relative">
            <button 
              onClick={() => setNotificationsOpen(!notificationsOpen)}
              className="material-symbols-outlined text-on-surface-variant hover:text-cyber-primary transition-all cursor-pointer select-none p-1.5 hover:bg-cyber-surface-low/40 rounded-full relative"
            >
              <Bell className="w-4 h-4" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-cyber-error rounded-full" />
            </button>

            {/* Notifications Dropdown */}
            {notificationsOpen && (
              <div className="absolute right-0 mt-3 w-80 glass-panel rounded-lg shadow-2xl p-4 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="flex justify-between items-center pb-2 border-b border-outline-variant/10 mb-2">
                  <span className="text-label-caps text-xs text-cyber-primary font-sans font-bold">系统警报信号</span>
                  <button 
                    onClick={() => setNotificationsOpen(false)}
                    className="text-xs text-on-surface-variant hover:text-on-surface font-sans"
                  >
                    关闭
                  </button>
                </div>
                <div className="space-y-3">
                  <div className="p-2 rounded bg-cyber-error-dim/10 border-l-2 border-cyber-error">
                    <p className="text-xs text-on-surface font-bold font-sans">触发紧急入侵警告</p>
                    <p className="text-[10px] text-on-surface-variant/80 font-sans">检测到北防区 12 号段有疑似越界入侵尝试</p>
                    <span className="text-[9px] text-cyber-error font-mono font-bold">1 分钟前</span>
                  </div>
                  <div className="p-2 rounded bg-cyber-primary-dim/10 border-l-2 border-cyber-primary">
                    <p className="text-xs text-on-surface font-sans">自动清理垃圾箱</p>
                    <p className="text-[10px] text-on-surface-variant/80 font-sans">14 条数据库逻辑日志已移至回收站</p>
                    <span className="text-[9px] text-cyber-primary font-mono">2 小时前</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* User profile with headshot image */}
          <div className="relative">
            <div 
              onClick={() => setProfileOpen(!profileOpen)}
              className="flex items-center gap-2 pl-2 border-l border-outline-variant/20 cursor-pointer hover:opacity-80 select-none"
            >
              <div className="w-8 h-8 rounded-full border border-cyber-primary/30 overflow-hidden relative">
                <img 
                  className="w-full h-full object-cover" 
                  alt="Analyst Glow Avatar" 
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuC4a-o3GB8Ac3i5N6wOfFHfYPrvmHqEXcNFqVqfsIXi45VSBgeX7g1UYY3NIWsLHrGAbjDguuQv4CngwbN8ae4u0JOQPymr_CWnSlJ8YuYPGuUaRsS8kN1cyO0DpLtYzxLLfGpFW0FFIG1uysNuY33rSAKXX_MFgAx0pkkQvcL5SM-uHxbVPF7T9naZm6r8iDvBOHMKJ4dfNNWA0Maz6vEoMDPIjij-TRWFAGR7IltdbLAdSMYgK-x2"
                />
              </div>
              <span className="font-mono text-xs text-on-surface hidden md:inline">{username || 'Admin_01'}</span>
              <ChevronDown className="w-3.5 h-3.5 text-on-surface-variant hidden md:inline" />
            </div>

            {/* Profile Dropdown menu */}
            {profileOpen && (
              <div className="absolute right-0 mt-3 w-48 glass-panel rounded-lg shadow-2xl p-2 z-50 animate-in fade-in duration-200">
                <div className="p-2 border-b border-outline-variant/10 text-center">
                  <p className="font-mono text-xs text-on-surface font-bold truncate">{username || 'Admin_01'}</p>
                  <p className="text-[9px] font-mono text-cyber-primary uppercase tracking-widest font-bold">系统超级管理员</p>
                </div>
                <div className="py-1">
                  <button 
                    onClick={() => { setProfileOpen(false); alert('安全协议：个人资料修改已被锁定，需插入物理安全硬件 UKey 进行解锁。'); }}
                    className="w-full text-left font-sans text-[11px] px-3 py-2 text-on-surface-variant hover:text-cyber-primary hover:bg-cyber-surface-high/30 rounded"
                  >
                    控制台安全密钥
                  </button>
                  <button 
                    onClick={() => { setProfileOpen(false); alert('系统完整性：100% 标称状态。节点鉴权状态：标准 C2 控制中心。'); }}
                    className="w-full text-left font-sans text-[11px] px-3 py-2 text-on-surface-variant hover:text-cyber-primary hover:bg-cyber-surface-high/30 rounded"
                  >
                    系统健康状态
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
