import React, { useState } from 'react';
import { Shield, Key, User, ArrowRight, Activity, Terminal } from 'lucide-react';
import { login } from '@/api/index';

interface LoginScreenProps {
  onLoginSuccess: (username: string) => void;
}

export default function LoginScreen({ onLoginSuccess }: LoginScreenProps) {
  const [terminalId, setTerminalId] = useState('admin');
  const [password, setPassword] = useState('123456');
  const [isVerifying, setIsVerifying] = useState(false);
  const [persistenceMode, setPersistenceMode] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!terminalId.trim()) {
      setErrorMsg('请输入终端用户名');
      return;
    }
    if (!password) {
      setErrorMsg('请输入安全访问密码');
      return;
    }

    setIsVerifying(true);
    setErrorMsg('');

    login({ username: terminalId.trim(), password: password.trim() })
      .then((data: any) => {
        setIsVerifying(false);
        if (!data?.token) {
          setErrorMsg('认证失败：未收到 Token 校验凭证');
          return;
        }
        localStorage.setItem('token', data.token);
        const role = String(data.role || 'OPERATOR').trim().toUpperCase();
        localStorage.setItem('user_role', role);
        onLoginSuccess(terminalId.trim());
      })
      .catch((err: any) => {
        setIsVerifying(false);
        setErrorMsg(err.message || '用户名或密码错误，请检查输入');
      });
  };

  return (
    <div className="min-h-screen bg-cyber-bg text-on-surface font-sans selection:bg-cyber-primary/30 flex items-center justify-center relative overflow-hidden bg-pattern">
      {/* Ambient background decoration */}
      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 ambient-glow" />
      <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 ambient-glow" />

      {/* Decorative corners */}
      <div className="absolute top-10 left-10 w-32 h-32 border-t-2 border-l-2 border-cyber-primary/10 pointer-events-none hidden sm:block" />
      <div className="absolute bottom-10 right-10 w-32 h-32 border-b-2 border-r-2 border-cyber-primary/10 pointer-events-none hidden sm:block" />

      <main className="relative z-10 w-full max-w-md px-6">
        <div className="glass-panel rounded-xl p-8 relative overflow-hidden glow-primary">
          {/* Scan line laser */}
          <div className="scan-line" />

          {/* Branding */}
          <header className="text-center mb-10">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-xl bg-cyber-primary-dim border border-cyber-primary/30 mb-6 transition-all duration-500 hover:scale-110">
              <Shield className="text-cyber-primary w-9 h-9" />
            </div>
            <h1 className="text-headline-lg text-cyber-primary tracking-tighter uppercase mb-1 font-sans">
              门禁告警平台
            </h1>
            <p className="text-data-sm text-on-surface-variant tracking-widest uppercase">
              控制台安全登录
            </p>
          </header>

          {/* Status Indicator */}
          <div className="flex items-center justify-center gap-2 mb-8 py-2 px-4 bg-cyber-surface-low/50 rounded-full w-fit mx-auto border border-outline-variant/10">
            <div className="w-2.5 h-2.5 rounded-full bg-cyber-secondary animate-pulse shadow-[0_0_8px_#00e639]" />
            <span className="text-label-caps text-cyber-secondary">AI 边缘端监测已上线</span>
          </div>

          {/* Login Form */}
          <form className="space-y-6" onSubmit={handleSubmit}>
            {errorMsg && (
              <div className="p-3 rounded bg-cyber-error-dim border border-cyber-error/30 text-cyber-error text-data-sm text-center">
                {errorMsg}
              </div>
            )}

            <div className="space-y-1">
              <label className="text-label-caps text-on-surface-variant ml-1" htmlFor="terminal-id">
                终端用户名
              </label>
              <div className="relative group">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-on-surface-variant group-focus-within:text-cyber-primary transition-colors" />
                <input
                  className="w-full bg-cyber-surface-lowest/80 border border-outline-variant/30 rounded-lg py-3.5 pl-12 pr-4 text-on-surface text-data-sm placeholder:text-outline/40 focus:outline-none focus:border-cyber-primary/50 focus:ring-1 focus:ring-cyber-primary/20 transition-all outline-none"
                  id="terminal-id"
                  type="text"
                  placeholder="输入登录用户名 (admin)"
                  value={terminalId}
                  onChange={(e) => setTerminalId(e.target.value)}
                  disabled={isVerifying}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-label-caps text-on-surface-variant ml-1" htmlFor="secure-protocol">
                安全密码
              </label>
              <div className="relative group">
                <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-on-surface-variant group-focus-within:text-cyber-primary transition-colors" />
                <input
                  className="w-full bg-cyber-surface-lowest/80 border border-outline-variant/30 rounded-lg py-3.5 pl-12 pr-4 text-on-surface text-data-sm placeholder:text-outline/40 focus:outline-none focus:border-cyber-primary/50 focus:ring-1 focus:ring-cyber-primary/20 transition-all outline-none"
                  id="secure-protocol"
                  type="password"
                  placeholder="输入安全密码 (123456)"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isVerifying}
                />
              </div>
            </div>

            <div className="flex items-center justify-between py-2">
              <label className="flex items-center gap-2 cursor-pointer group">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded-sm border-outline-variant/40 bg-cyber-surface-low text-cyber-primary focus:ring-cyber-primary focus:ring-offset-cyber-bg transition-all"
                  checked={persistenceMode}
                  onChange={(e) => setPersistenceMode(e.target.checked)}
                  disabled={isVerifying}
                />
                <span className="text-data-sm text-on-surface-variant group-hover:text-on-surface transition-colors">
                  记住登录状态
                </span>
              </label>
              <button
                type="button"
                className="text-data-sm text-cyber-primary hover:underline underline-offset-4 transition-all"
                onClick={() => {
                  setTerminalId('Admin_01');
                  setPassword('admin123');
                  setErrorMsg('');
                }}
                disabled={isVerifying}
              >
                重置初始凭证
              </button>
            </div>

            <button
              className="w-full bg-cyber-primary text-cyber-bg font-sans font-bold py-4 rounded-lg flex items-center justify-center gap-3 active:scale-[0.98] transition-all hover:shadow-[0_0_20px_rgba(0,218,243,0.4)] disabled:opacity-75 disabled:pointer-events-none group"
              type="submit"
              disabled={isVerifying}
            >
              {isVerifying ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-cyber-bg border-t-transparent" />
                  <span className="text-data-lg font-bold tracking-wider">安全协议校验中...</span>
                </>
              ) : (
                <>
                  <span className="text-data-lg font-bold tracking-wider">安全登录</span>
                  <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
                </>
              )}
            </button>
          </form>

          {/* System Footer Information */}
          <footer className="mt-10 pt-6 border-t border-outline-variant/10 flex flex-col items-center gap-3">
            <div className="flex items-center gap-6 text-on-surface-variant/60">
              <div className="flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-cyber-primary" />
                <span className="text-label-caps text-[10px]">JWT 安全链路</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-cyber-secondary" />
                <span className="text-label-caps text-[10px]">YOLO 神经网络引擎</span>
              </div>
            </div>
            <p className="text-data-sm text-[10px] text-outline/40 uppercase tracking-widest text-center font-mono">
              Intelligent Door Alert System © 2026
            </p>
          </footer>
        </div>

        {/* Decorative brackets outside */}
        <div className="absolute -top-4 -right-4 w-24 h-24 border-t-2 border-r-2 border-cyber-primary/20 pointer-events-none hidden sm:block" />
        <div className="absolute -bottom-4 -left-4 w-24 h-24 border-b-2 border-l-2 border-cyber-primary/20 pointer-events-none hidden sm:block" />
      </main>
    </div>
  );
}
