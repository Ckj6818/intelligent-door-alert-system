import React from 'react';
import { Tab } from '../types';
import { 
  LayoutDashboard, 
  BellRing, 
  GitFork, 
  FilePieChart, 
  Settings, 
  HelpCircle, 
  LogOut,
  ShieldAlert
} from 'lucide-react';

interface SidebarProps {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
  username: string;
  onLogout: () => void;
}export default function Sidebar({ activeTab, setActiveTab, username, onLogout }: SidebarProps) {
  const navItems = [
    { id: 'dashboard' as Tab, label: '系统运行大屏', icon: LayoutDashboard },
    { id: 'workflow' as Tab, label: '报警处置流程', icon: GitFork },
    { id: 'reports' as Tab, label: '系统报表管理', icon: FilePieChart },
    { id: 'settings' as Tab, label: '系统参数设置', icon: Settings },
  ];

  return (
    <aside className="fixed left-0 top-0 h-full w-[280px] bg-cyber-surface/90 backdrop-blur-xl border-r border-outline-variant/20 shadow-[0_0_30px_rgba(0,218,243,0.08)] flex flex-col py-6 z-50">
      {/* Brand Logo Header */}
      <div className="px-6 mb-10 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-cyber-primary/10 border border-cyber-primary/30 flex items-center justify-center">
          <ShieldAlert className="text-cyber-primary w-6 h-6 animate-pulse" />
        </div>
        <div>
          <h1 className="text-headline-lg-mobile text-cyber-primary font-bold tracking-tighter leading-none font-sans">
            门禁安防
          </h1>
          <p className="text-[10px] font-mono tracking-widest text-on-surface-variant/70 uppercase mt-0.5">
            安全控制台
          </p>
        </div>
      </div>

      {/* Main Navigation Links */}
      <nav className="flex-1 px-3 space-y-1">
        {navItems.map((item) => {
          const IconComponent = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-lg text-data-sm transition-all duration-200 text-left active:scale-[0.98] ${
                isActive
                  ? 'bg-cyber-primary-dim text-cyber-primary border-l-4 border-cyber-primary shadow-[0_0_15px_rgba(0,218,243,0.1)]'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-cyber-surface-high/40'
              }`}
            >
              <IconComponent className={`w-5 h-5 ${isActive ? 'text-cyber-primary' : 'text-on-surface-variant/80'}`} />
              <span className="font-sans text-xs tracking-wider">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Bottom Actions Area */}
      <div className="px-3 pt-4 border-t border-outline-variant/10 space-y-1">
        {/* Help/Support info toggle or trigger */}
        <button
          onClick={() => alert('门禁告警平台技术支持：如需协助，请联系开发团队或访问内网工单系统。加密级别：AES-256。')}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-data-sm text-on-surface-variant hover:text-on-surface hover:bg-cyber-surface-high/40 transition-all text-left"
        >
          <HelpCircle className="w-5 h-5 text-on-surface-variant/80" />
          <span className="font-sans text-xs tracking-wider">技术支持</span>
        </button>

        {/* Logout action */}
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-data-sm text-on-surface-variant hover:text-cyber-error hover:bg-cyber-error-dim/10 transition-all text-left group"
        >
          <LogOut className="w-5 h-5 text-on-surface-variant/80 group-hover:text-cyber-error" />
          <span className="font-sans text-xs tracking-wider">安全登出</span>
        </button>
      </div>

      {/* User profile footer info */}
      <div className="mt-4 px-6 pt-4 border-t border-outline-variant/10 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-cyber-primary/20 border border-cyber-primary/35 flex items-center justify-center font-bold text-cyber-primary font-mono text-sm uppercase">
          {username ? username.slice(0, 2) : 'AD'}
        </div>
        <div className="overflow-hidden">
          <p className="font-sans text-xs text-on-surface truncate font-bold">{username || 'Admin_01'}</p>
          <p className="text-[10px] font-mono text-cyber-secondary uppercase tracking-widest font-bold">安全主体身份</p>
        </div>
      </div>
    </aside>
  );
}
