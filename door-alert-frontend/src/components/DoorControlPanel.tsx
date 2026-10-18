import React, { useCallback, useEffect, useState } from 'react';
import { Lock, LockOpen, RefreshCw } from 'lucide-react';
import { getDoorStatus, remoteLockDoor, remoteUnlockDoor } from '@/api/index';

interface DoorControlPanelProps {
  deviceId?: number;
}

type DoorStatus = {
  status: string;
  source?: string;
  operator?: string;
  remainSeconds?: number;
};

/**
 * 门锁/电机远程控制：状态轮询 + 远程开锁/上锁
 */
export default function DoorControlPanel({ deviceId = 1 }: DoorControlPanelProps) {
  const [door, setDoor] = useState<DoorStatus>({ status: 'LOCKED' });
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(() => {
    setLoading(true);
    getDoorStatus(deviceId)
      .then((data: any) => {
        setDoor({
          status: data?.status || 'LOCKED',
          source: data?.source,
          operator: data?.operator,
          remainSeconds: data?.remainSeconds ?? 0,
        });
        setError('');
      })
      .catch((err: any) => {
        setError(err?.message || '门锁状态获取失败');
      })
      .finally(() => setLoading(false));
  }, [deviceId]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 2000);
    return () => clearInterval(timer);
  }, [refresh]);

  const unlocked = (door.status || '').toUpperCase() === 'UNLOCKED';

  const handleUnlock = () => {
    setBusy(true);
    setError('');
    remoteUnlockDoor(deviceId)
      .then((data: any) => {
        setDoor({
          status: data?.status || 'UNLOCKED',
          source: data?.source,
          operator: data?.operator,
          remainSeconds: data?.remainSeconds ?? 5,
        });
      })
      .catch((err: any) => setError(err?.message || '远程开锁失败'))
      .finally(() => setBusy(false));
  };

  const handleLock = () => {
    setBusy(true);
    setError('');
    remoteLockDoor(deviceId)
      .then((data: any) => {
        setDoor({
          status: data?.status || 'LOCKED',
          source: data?.source,
          operator: data?.operator,
          remainSeconds: 0,
        });
      })
      .catch((err: any) => setError(err?.message || '远程上锁失败'))
      .finally(() => setBusy(false));
  };

  return (
    <div className="flex items-center gap-2">
      <div
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded border text-[11px] font-bold tracking-wide ${
          unlocked
            ? 'border-cyber-secondary/40 bg-cyber-secondary/10 text-cyber-secondary'
            : 'border-cyber-primary/35 bg-cyber-primary/10 text-cyber-primary'
        }`}
        title={
          door.operator
            ? `来源 ${door.source || '-'} · ${door.operator}`
            : '门锁/电机状态'
        }
      >
        {unlocked ? <LockOpen className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
        <span>{unlocked ? `已开锁${door.remainSeconds ? ` ${door.remainSeconds}s` : ''}` : '已上锁'}</span>
      </div>

      <button
        type="button"
        disabled={busy || unlocked}
        onClick={handleUnlock}
        className="px-2.5 py-1 rounded border border-cyber-secondary/40 bg-cyber-secondary/10 text-cyber-secondary text-[11px] font-bold hover:bg-cyber-secondary/20 disabled:opacity-40 cursor-pointer"
        title="远程开锁（电机正转）"
      >
        远程开锁
      </button>
      <button
        type="button"
        disabled={busy || !unlocked}
        onClick={handleLock}
        className="px-2.5 py-1 rounded border border-outline-variant/35 text-on-surface-variant text-[11px] font-bold hover:border-cyber-primary/40 hover:text-cyber-primary disabled:opacity-40 cursor-pointer"
        title="远程上锁（电机反转）"
      >
        远程上锁
      </button>
      <button
        type="button"
        onClick={refresh}
        className="p-1 rounded text-on-surface-variant hover:text-cyber-primary cursor-pointer"
        title="刷新门锁状态"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
      </button>
      {error && (
        <span className="text-[10px] text-cyber-error max-w-[140px] truncate" title={error}>
          {error}
        </span>
      )}
    </div>
  );
}
