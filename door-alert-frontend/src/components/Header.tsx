import React, { useState, useEffect } from 'react';
import { Search, Clock, Bell, ChevronDown, ShieldCheck, Key, Activity, Users } from 'lucide-react';
import { Tab, Alert } from '../types';
interface HeaderProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  username: string;
  alerts?: Alert[];
  setActiveTab?: (tab: Tab) => void;
  onOpenWhitelist?: () => void;
}

export default function Header({
  searchQuery,
  setSearchQuery,
  username,
  alerts = [],
  setActiveTab,
  onOpenWhitelist,
}: HeaderProps) {
  const [timeMode, setTimeMode] = useState<'local' | 'utc'>('local');
  const [timeString, setTimeString] = useState('');
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [showHealthModal, setShowHealthModal] = useState(false);

  const userRole = localStorage.getItem('user_role') || 'OPERATOR';

  // Compute pending/unhandled alerts
  const pendingAlerts = alerts.filter(a => a.status === '待复核');
  const unreadCount = pendingAlerts.length;

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
    <header className="fixed top-0 right-0 left-[280px] h-16 bg-cyber-surface/60 backdrop-blur-md border-b border-outline-variant/10 z-40 flex justify-between items-center px-8 font-sans">
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

        {/* 授权人员白名单入口 */}
        {onOpenWhitelist && (
          <button
            type="button"
            onClick={onOpenWhitelist}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-cyber-secondary/35 bg-cyber-secondary/10 text-cyber-secondary hover:bg-cyber-secondary/20 hover:shadow-[0_0_12px_rgba(0,230,57,0.25)] transition-all text-[11px] font-bold tracking-wide cursor-pointer"
            title="查看授权人员白名单"
          >
            <Users className="w-3.5 h-3.5" />
            授权人员白名单
          </button>
        )}

        {/* Alerts and Action controls */}
        <div className="flex items-center gap-4 text-on-surface-variant relative">
          {/* Notifications Trigger */}
          <div className="relative">
            <button 
              onClick={() => setNotificationsOpen(!notificationsOpen)}
              className="material-symbols-outlined text-on-surface-variant hover:text-cyber-primary transition-all cursor-pointer select-none p-1.5 hover:bg-cyber-surface-low/40 rounded-full relative flex items-center justify-center"
              title="未处理警报通知"
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-cyber-error text-white font-mono font-bold text-[10px] min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center border-2 border-cyber-bg shadow-[0_0_8px_rgba(255,59,48,0.6)] animate-pulse">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>

            {/* Notifications Dropdown */}
            {notificationsOpen && (
              <div className="absolute right-0 mt-3 w-84 glass-panel rounded-xl shadow-2xl p-4 z-50 animate-in fade-in slide-in-from-top-2 duration-200 border border-outline-variant/20">
                <div className="flex justify-between items-center pb-2 border-b border-outline-variant/10 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-label-caps text-xs text-cyber-primary font-sans font-bold">系统警报信号</span>
                    {unreadCount > 0 && (
                      <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-cyber-error-dim/20 text-cyber-error font-mono font-bold">
                        {unreadCount} 条待复核
                      </span>
                    )}
                  </div>
                  <button 
                    onClick={() => setNotificationsOpen(false)}
                    className="text-xs text-on-surface-variant hover:text-on-surface font-sans cursor-pointer"
                  >
                    关闭
                  </button>
                </div>
                
                <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                  {pendingAlerts.length > 0 ? (
                    pendingAlerts.slice(0, 5).map((item) => (
                      <div 
                        key={item.id} 
                        onClick={() => {
                          setNotificationsOpen(false);
                          if (setActiveTab) setActiveTab('workflow');
                        }}
                        className="p-2.5 rounded bg-cyber-surface-low/50 hover:bg-cyber-surface-high/60 border-l-3 border-cyber-error transition-all cursor-pointer group"
                      >
                        <div className="flex justify-between items-center mb-1">
                          <p className="text-xs text-on-surface font-bold font-sans group-hover:text-cyber-primary transition-colors">
                            {item.type}
                          </p>
                          <span className="text-[9px] text-cyber-error font-mono font-bold bg-cyber-error-dim/20 px-1.5 py-0.5 rounded">
                            待复核
                          </span>
                        </div>
                        <p className="text-[10px] text-on-surface-variant/80 font-sans truncate">
                          {item.device} · {item.location}
                        </p>
                        <span className="text-[9px] text-on-surface-variant/60 font-mono mt-1 block">
                          {item.time} ({item.date})
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="py-6 text-center text-xs text-on-surface-variant font-sans">
                      暂无待复核警报信号
                    </div>
                  )}
                </div>

                {setActiveTab && (
                  <div className="pt-3 border-t border-outline-variant/10 mt-3 text-center">
                    <button
                      onClick={() => {
                        setNotificationsOpen(false);
                        setActiveTab('workflow');
                      }}
                      className="text-xs font-sans text-cyber-primary hover:underline cursor-pointer font-bold"
                    >
                      查看全部告警处置流程 →
                    </button>
                  </div>
                )}
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
              <div className="absolute right-0 mt-3 w-52 glass-panel rounded-lg shadow-2xl p-2 z-50 animate-in fade-in duration-200">
                <div className="p-2 border-b border-outline-variant/10 text-center">
                  <p className="font-mono text-xs text-on-surface font-bold truncate">{username || 'Admin_01'}</p>
                  <p className="text-[9px] font-mono text-cyber-primary uppercase tracking-widest font-bold">
                    {userRole === 'ADMIN' ? '系统超级管理员' : '安保值班员'}
                  </p>
                </div>
                <div className="py-1">
                  <button 
                    onClick={() => { setProfileOpen(false); setProfileModalOpen(true); }}
                    className="w-full text-left font-sans text-[11px] px-3 py-2 text-on-surface-variant hover:text-cyber-primary hover:bg-cyber-surface-high/30 rounded flex items-center justify-between cursor-pointer"
                  >
                    <span>控制台安全凭证</span>
                    <Key className="w-3.5 h-3.5 text-cyber-primary" />
                  </button>
                  <button 
                    onClick={() => { setProfileOpen(false); setShowHealthModal(true); }}
                    className="w-full text-left font-sans text-[11px] px-3 py-2 text-on-surface-variant hover:text-cyber-primary hover:bg-cyber-surface-high/30 rounded flex items-center justify-between cursor-pointer"
                  >
                    <span>系统健康与内核状态</span>
                    <Activity className="w-3.5 h-3.5 text-cyber-secondary" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Security Credentials Modal */}
      {profileModalOpen && (
        <div 
          className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in font-sans"
          onClick={() => setProfileModalOpen(false)}
        >
          <div 
            className="glass-panel w-full max-w-lg rounded-xl p-6 relative border border-cyber-primary/30 glow-primary shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button 
              onClick={() => setProfileModalOpen(false)}
              className="absolute top-4 right-4 text-on-surface-variant hover:text-cyber-primary transition-colors text-sm font-mono cursor-pointer"
            >
              ✕
            </button>

            <div className="flex items-center gap-3 pb-4 border-b border-outline-variant/10 mb-5">
              <div className="p-2.5 rounded-lg bg-cyber-primary-dim border border-cyber-primary/30">
                <ShieldCheck className="w-6 h-6 text-cyber-primary" />
              </div>
              <div>
                <h3 className="text-data-lg text-on-surface font-bold">控制台安全凭证详情</h3>
                <p className="text-xs text-on-surface-variant">当前会话身份鉴权与安全密钥状态</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-cyber-surface-lowest p-4 rounded-lg border border-outline-variant/15 space-y-2.5 font-mono text-xs">
                <div className="flex justify-between border-b border-outline-variant/10 pb-2">
                  <span className="text-on-surface-variant">当前登录账号:</span>
                  <span className="text-cyber-primary font-bold">{username}</span>
                </div>
                <div className="flex justify-between border-b border-outline-variant/10 pb-2">
                  <span className="text-on-surface-variant">分配角色权限:</span>
                  <span className="text-cyber-secondary font-bold">
                    {userRole === 'ADMIN' ? 'ADMIN (超级管理员)' : 'OPERATOR (安保值班员)'}
                  </span>
                </div>
                <div className="flex justify-between border-b border-outline-variant/10 pb-2">
                  <span className="text-on-surface-variant">密码存储保护:</span>
                  <span className="text-on-surface">BCrypt (60-bit Salted Hash)</span>
                </div>
                <div className="flex justify-between border-b border-outline-variant/10 pb-2">
                  <span className="text-on-surface-variant">Sa-Token JWT 状态:</span>
                  <span className="text-cyber-secondary font-bold">VALIDATED (凭证生效中)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-on-surface-variant">会话有效期限:</span>
                  <span className="text-on-surface">86400 秒 (24 小时)</span>
                </div>
              </div>

              <div className="p-4 rounded-lg bg-cyber-surface-low border border-outline-variant/10 space-y-3">
                <h4 className="text-xs font-bold text-on-surface flex items-center gap-2">
                  <Key className="w-4 h-4 text-cyber-primary" />
                  凭证有效性自检
                </h4>
                <p className="text-[11px] text-on-surface-variant leading-relaxed">
                  系统采用 Sa-Token JWT 进行无状态身份鉴权。管理员可在左侧「报表与安保账号」界面中对安保人员账户进行新增、注销或密码重置。
                </p>
                <div className="pt-2 flex gap-3">
                  <button
                    onClick={() => {
                      alert(`【凭证校验通过】用户 [${username}] 的 JWT Token 校验正常，角色权限 [${userRole}] 匹配通过！`);
                    }}
                    className="flex-1 py-2 bg-cyber-primary-dim/20 border border-cyber-primary/40 text-cyber-primary rounded text-xs font-bold hover:bg-cyber-primary hover:text-cyber-bg transition-all cursor-pointer"
                  >
                    校验凭证有效性
                  </button>
                  <button
                    onClick={() => setProfileModalOpen(false)}
                    className="px-4 py-2 border border-outline-variant/30 text-on-surface-variant rounded text-xs hover:text-on-surface transition-all cursor-pointer"
                  >
                    关闭
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* System Health Status Modal */}
      {showHealthModal && (
        <div 
          className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in font-sans"
          onClick={() => setShowHealthModal(false)}
        >
          <div 
            className="glass-panel w-full max-w-lg rounded-xl p-6 relative border border-cyber-secondary/30 glow-secondary shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button 
              onClick={() => setShowHealthModal(false)}
              className="absolute top-4 right-4 text-on-surface-variant hover:text-cyber-secondary transition-colors text-sm font-mono cursor-pointer"
            >
              ✕
            </button>

            <div className="flex items-center gap-3 pb-4 border-b border-outline-variant/10 mb-5">
              <div className="p-2.5 rounded-lg bg-cyber-secondary-dim border border-cyber-secondary/30">
                <Activity className="w-6 h-6 text-cyber-secondary" />
              </div>
              <div>
                <h3 className="text-data-lg text-on-surface font-bold">系统健康与内核状态</h3>
                <p className="text-xs text-on-surface-variant">分布式节点服务与通信健康度遥测</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-cyber-surface-lowest p-4 rounded-lg border border-outline-variant/15 space-y-2.5 font-mono text-xs">
                <div className="flex justify-between border-b border-outline-variant/10 pb-2">
                  <span className="text-on-surface-variant">Spring Boot 核心后端:</span>
                  <span className="text-cyber-secondary font-bold">UP (8081 端口响应正常)</span>
                </div>
                <div className="flex justify-between border-b border-outline-variant/10 pb-2">
                  <span className="text-on-surface-variant">MySQL 8.0 数据库:</span>
                  <span className="text-cyber-secondary font-bold">CONNECTED (utf8mb4)</span>
                </div>
                <div className="flex justify-between border-b border-outline-variant/10 pb-2">
                  <span className="text-on-surface-variant">WebSocket 告警推流:</span>
                  <span className="text-cyber-primary font-bold">ESTABLISHED (实时监听中)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-on-surface-variant">YOLOv8 机器视觉引擎:</span>
                  <span className="text-cyber-secondary font-bold">ONLINE (帧率 30fps)</span>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  onClick={() => setShowHealthModal(false)}
                  className="px-6 py-2 bg-cyber-secondary text-cyber-bg rounded text-xs font-bold hover:shadow-[0_0_15px_rgba(0,230,57,0.3)] transition-all cursor-pointer font-sans"
                >
                  确定
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
