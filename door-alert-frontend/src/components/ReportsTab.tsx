import React, { useState, useEffect } from 'react';
import { 
  BarChart, 
  TableProperties, 
  UserPlus, 
  MapPin, 
  Globe, 
  ShieldCheck, 
  Activity, 
  Check, 
  UserCheck, 
  Trash, 
  Key,
  Users,
  Settings2
} from 'lucide-react';
import { NodeReport, SystemUser } from '../types';
import { getUserList, addOperatorUser, deleteOperatorUser, resetOperatorPassword, exportAlerts, getPassageTodayStats, getPassagePage, getDeviceList, getAlertList } from '@/api/index';
import { showCyberToast } from '../utils/cyberToast';
import { showCyberConfirm } from '../utils/cyberConfirm';
import * as XLSX from 'xlsx';

interface ReportsTabProps {
  searchQuery: string;
}

export default function ReportsTab({ searchQuery }: ReportsTabProps) {
  // 真实设备节点遥测与统计
  const [nodes, setNodes] = useState<NodeReport[]>([]);
  const [onlineSummary, setOnlineSummary] = useState({ online: 0, total: 0 });
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [passageStats, setPassageStats] = useState({ passageCount: 0, unauthorizedAlertCount: 0 });
  const [trendDays, setTrendDays] = useState<{ date: string; passages: number; alerts: number }[]>([]);
  const [alertTypeDist, setAlertTypeDist] = useState({
    INTRUSION: 0,
    SPOOFING: 0,
    TAILGATING: 0,
    LOITERING: 0,
  });
  const [recentPassages, setRecentPassages] = useState<any[]>([]);

  useEffect(() => {
    getPassageTodayStats()
      .then((res: any) => {
        if (!res) return;
        setPassageStats({
          passageCount: Number(res.passageCount) || 0,
          unauthorizedAlertCount: Number(res.unauthorizedAlertCount) || 0,
        });
        if (Array.isArray(res.days)) {
          setTrendDays(
            res.days.map((d: any) => ({
              date: String(d.date || ''),
              passages: Number(d.passages) || 0,
              alerts: Number(d.alerts) || 0,
            }))
          );
        }
      })
      .catch(() => {});
    getPassagePage({ current: 1, size: 8 })
      .then((res: any) => setRecentPassages(res?.records || []))
      .catch(() => {});

    const apiStart = performance.now();
    Promise.allSettled([
      getDeviceList({ current: 1, size: 50 }),
      getAlertList({ current: 1, size: 100 }),
      fetch('/video-stream/health', { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ]).then(([devRes, alertRes, healthRes]) => {
      const apiLatency = Math.max(1, Math.round(performance.now() - apiStart));
      const deviceRecords: any[] =
        devRes.status === 'fulfilled' ? (devRes.value?.records || []) : [];
      const alertRecords: any[] =
        alertRes.status === 'fulfilled' ? (alertRes.value?.records || []) : [];
      const telemetry: any =
        healthRes.status === 'fulfilled' ? healthRes.value?.telemetry : null;

      const yoloMs = Number(telemetry?.yolo_ms) || 0;
      setLatencyMs(yoloMs > 0 ? Math.round(yoloMs) : apiLatency);

      const onlineCount = deviceRecords.filter((d) => Number(d.status) === 1).length;
      setOnlineSummary({ online: onlineCount, total: deviceRecords.length });

      // 按 deviceId 与 alertType 聚合真实告警统计
      const typeCounts = { INTRUSION: 0, SPOOFING: 0, TAILGATING: 0, LOITERING: 0 };
      const alertStats = new Map<
        number,
        { count: number; maxDanger: number; latestTime: string | null }
      >();
      for (const a of alertRecords) {
        const at = String(a.alertType || 'INTRUSION').toUpperCase();
        if (at === 'SPOOFING') typeCounts.SPOOFING += 1;
        else if (at === 'TAILGATING') typeCounts.TAILGATING += 1;
        else if (at === 'LOITERING') typeCounts.LOITERING += 1;
        else typeCounts.INTRUSION += 1;
        const did = Number(a.deviceId);
        if (!did) continue;
        const prev = alertStats.get(did) || { count: 0, maxDanger: 1, latestTime: null };
        prev.count += 1;
        prev.maxDanger = Math.max(prev.maxDanger, Number(a.dangerLevel) || 1);
        if (a.createTime && (!prev.latestTime || a.createTime > prev.latestTime)) {
          prev.latestTime = a.createTime;
        }
        alertStats.set(did, prev);
      }
      setAlertTypeDist(typeCounts);

      const mappedNodes: NodeReport[] = deviceRecords.map((d) => {
        const did = Number(d.id);
        const stat = alertStats.get(did);
        const maxDanger = stat?.maxDanger ?? 1;
        const criticality: NodeReport['criticality'] =
          maxDanger >= 3 ? 'HIGH' : maxDanger === 2 ? 'MED' : 'LOW';
        const isOnline = Number(d.status) === 1;
        const elapsed = d.lastHeartbeatElapsedSec != null ? Number(d.lastHeartbeatElapsedSec) : null;
        return {
          nodeId: `DEV-${String(did).padStart(2, '0')} · ${d.deviceName || '门禁节点'}`,
          dataType: d.location ? `${d.location}（门禁视觉流）` : '门禁视觉检测流',
          totalEvents: stat?.count ?? 0,
          criticality,
          avgResponse: isOnline
            ? (yoloMs > 0 && did === 1 ? `${yoloMs.toFixed(1)}ms (YOLO)` : `${apiLatency}ms (API)`)
            : '离线',
          lastAggregation:
            elapsed != null
              ? `${elapsed}秒前心跳`
              : stat?.latestTime
                ? new Date(stat.latestTime).toLocaleString()
                : '暂无心跳',
        };
      });
      setNodes(mappedNodes);
    });
  }, []);

  const handleExportSpreadsheet = async () => {
    try {
      const records = await exportAlerts();
      if (!records || records.length === 0) {
        showCyberToast('当前暂无可导出的告警记录', 'warning');
        return;
      }
      const rows = records.map((item: any) => {
        const raw = item.imageUrl as string | undefined;
        const imgUrl = !raw
          ? '-'
          : raw.startsWith('http')
            ? raw
            : `${window.location.origin}${raw.startsWith('/') ? '' : '/'}${raw}`;
        return {
          '告警时间': new Date(item.createTime).toLocaleString(),
          '设备ID': item.deviceId,
          '接近度': item.proximityRatio != null ? `${(item.proximityRatio * 100).toFixed(1)}%` : '-',
          '危险等级': item.dangerLevel >= 3 ? '高危' : item.dangerLevel === 2 ? '中危' : '低危',
          '告警类型': item.alertType || 'INTRUSION',
          '识别姓名': item.recognizedName || '-',
          '处置状态': item.status === 1 ? '已处理' : '待复核',
          '处置操作员': item.handler || '-',
          '处置时间': item.handleTime ? new Date(item.handleTime).toLocaleString() : '-',
          '处置结论备注': item.handleRemark || '-',
          '抓拍图片链接': imgUrl,
        };
      });
      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, '告警记录');
      XLSX.writeFile(workbook, '智能门禁告警报表.xlsx');
      showCyberToast(`已成功导出 ${rows.length} 条告警记录（含处置人与复核结论）`, 'success');
    } catch (error) {
      console.error('Export failed', error);
      showCyberToast('导出失败，请确认使用管理员账号登录', 'error');
    }
  };

  // System Users state
  const [users, setUsers] = useState<SystemUser[]>([]);

  // User creation state
  const [showAddModal, setShowAddModal] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newNickname, setNewNickname] = useState('');
  const [newPassword, setNewPassword] = useState('123456');

  const fetchUsers = () => {
    getUserList()
      .then((res: any) => {
        const list = Array.isArray(res) ? res : (res?.records || []);
        const mappedUsers: SystemUser[] = list.map((item: any) => {
          const cleanName = item.username.replace(/[^a-zA-Z]/g, '');
          const initials = cleanName.length >= 2
            ? (cleanName[0] + cleanName[1]).toUpperCase()
            : cleanName.length === 1
            ? cleanName[0].toUpperCase() + 'OP'
            : 'OP';
          return {
            id: String(item.id),
            username: item.username,
            nickname: item.nickname || item.username,
            role: item.role === 'ADMIN' ? 'Admin' : 'Operator',
            status: 'Active',
            initials
          };
        });
        setUsers(mappedUsers);
      })
      .catch(err => console.error('Failed to load user list', err));
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  // Add new user action
  const handleAddUserSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim()) return;
    if (newPassword.trim().length < 6) {
      showCyberToast('初始密码长度不能少于 6 位', 'warning');
      return;
    }

    addOperatorUser({
      username: newUsername.trim(),
      nickname: newNickname.trim() || newUsername.trim(),
      password: newPassword.trim(),
    })
      .then(() => {
        fetchUsers();
        const created = newUsername.trim();
        setNewUsername('');
        setNewNickname('');
        setNewPassword('123456');
        setShowAddModal(false);
        showCyberToast(`已成功创建安保值班员账号：${created}`, 'success');
      })
      .catch((err: any) => {
        console.error('Failed to create user', err);
        showCyberToast(typeof err === 'string' ? err : err?.message || '创建账号失败（用户名可能已存在）', 'error');
      });
  };

  // Delete User
  const handleDeleteUser = async (id: string, name: string) => {
    const ok = await showCyberConfirm({
      title: '注销操作员账号确认',
      message: `是否确认吊销安全凭证并永久注销操作员「${name}」的系统账号？`,
      confirmText: '确认注销',
      tone: 'danger',
    });
    if (ok) {
      deleteOperatorUser(id)
        .then(() => {
          setUsers(prev => prev.filter(u => u.id !== id));
          showCyberToast(`操作员 "${name}" 账号凭证已注销`, 'info');
        })
        .catch(err => console.error(err));
    }
  };

  // Reset password
  const handleResetPassword = async (id: string, name: string) => {
    const ok = await showCyberConfirm({
      title: '重置操作员登录密码',
      message: `是否确认将操作员「${name}」的登录密码重置为默认密码：123456？`,
      confirmText: '确认重置',
      tone: 'warning',
    });
    if (ok) {
      resetOperatorPassword(id)
        .then(() => {
          showCyberToast(`操作员 "${name}" 密码已重置为 123456`, 'success');
        })
        .catch(err => console.error('Failed to reset password', err));
    }
  };

  // Filter tables by search query
  const filteredNodes = nodes.filter(nd => 
    nd.nodeId.toLowerCase().includes(searchQuery.toLowerCase()) ||
    nd.dataType.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredUsers = users.filter(us => 
    us.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
    us.role.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-8 pb-12 relative">
      {/* Hero Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 font-sans">
        <div className="glass-panel p-6 rounded-lg">
          <p className="text-label-caps text-on-surface-variant mb-2 text-[10px] font-sans">今日授权放行</p>
          <div className="flex items-end justify-between">
            <h3 className="text-display-lg text-cyber-secondary font-bold tabular-nums">{passageStats.passageCount}</h3>
            <span className="text-cyber-secondary font-mono text-xs font-bold">PASSAGE</span>
          </div>
        </div>
        <div className="glass-panel p-6 rounded-lg">
          <p className="text-label-caps text-on-surface-variant mb-2 text-[10px] font-sans">今日未授权拦截</p>
          <div className="flex items-end justify-between">
            <h3 className="text-display-lg text-cyber-error font-bold tabular-nums">{passageStats.unauthorizedAlertCount}</h3>
            <span className="text-cyber-error font-mono text-xs font-bold">ALERT</span>
          </div>
        </div>
        <div className="glass-panel p-6 rounded-lg">
          <p className="text-label-caps text-on-surface-variant mb-2 text-[10px] font-sans">在线边缘设备</p>
          <div className="flex items-end justify-between">
            <h3 className="text-display-lg text-cyber-primary font-bold tabular-nums">
              {onlineSummary.online} / {onlineSummary.total}
            </h3>
            <span className="text-on-surface-variant font-sans text-xs">
              {onlineSummary.online > 0 ? '心跳在线' : '待接入'}
            </span>
          </div>
        </div>

        <div className="glass-panel p-6 rounded-lg">
          <p className="text-label-caps text-on-surface-variant mb-2 text-[10px] font-sans">通信与推理延迟</p>
          <div className="flex items-end justify-between">
            <h3 className="text-display-lg text-cyber-primary font-bold tabular-nums">
              {latencyMs !== null ? `${latencyMs}ms` : '--'}
            </h3>
            <span className="text-cyber-secondary font-sans text-xs font-bold">
              {latencyMs !== null && latencyMs <= 60 ? '优良' : latencyMs !== null ? '正常' : '检测中'}
            </span>
          </div>
        </div>
      </div>

      {/* 真数据双维可视化图表：四类告警分布环图 + 近7日通行/拦截趋势 */}
      {(() => {
        const donutItems = [
          { key: 'INTRUSION', label: '未授权入侵', count: alertTypeDist.INTRUSION, color: '#ff5252' },
          { key: 'SPOOFING', label: '照片/屏幕防伪拦截', count: alertTypeDist.SPOOFING, color: '#fbbf24' },
          { key: 'TAILGATING', label: '尾随闯入', count: alertTypeDist.TAILGATING, color: '#fb923c' },
          { key: 'LOITERING', label: '门前遮挡徘徊', count: alertTypeDist.LOITERING, color: '#c084fc' },
        ];
        const totalAlerts = donutItems.reduce((acc, it) => acc + it.count, 0);
        const radius = 56;
        const circumference = 2 * Math.PI * radius;
        let offsetCursor = 0;

        const maxDayVal = Math.max(
          1,
          ...trendDays.map((d) => Math.max(d.passages, d.alerts))
        );

        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 font-sans">
            {/* 四类告警事件分布环图 */}
            <div className="glass-panel p-6 rounded-xl border border-outline-variant/15">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h3 className="text-sm font-bold text-on-surface flex items-center gap-2">
                    <BarChart className="w-4 h-4 text-cyber-primary" />
                    四类安全告警分布统计
                  </h3>
                  <p className="text-[10px] text-on-surface-variant font-mono mt-0.5">
                    REAL-TIME ALERT_TYPE DISTRIBUTION (最近 100 条归档)
                  </p>
                </div>
                <span className="px-2.5 py-0.5 rounded bg-cyber-primary/10 border border-cyber-primary/30 text-cyber-primary font-mono text-[10px] font-bold">
                  TOTAL {totalAlerts}
                </span>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-6">
                <div className="relative w-40 h-40 shrink-0">
                  <svg viewBox="0 0 150 150" className="w-full h-full -rotate-90">
                    <circle
                      cx="75"
                      cy="75"
                      r={radius}
                      fill="none"
                      stroke="rgba(255,255,255,0.06)"
                      strokeWidth="16"
                    />
                    {totalAlerts > 0 &&
                      donutItems.map((it) => {
                        if (it.count <= 0) return null;
                        const segLen = (it.count / totalAlerts) * circumference;
                        const dashArray = `${Math.max(2, segLen - 2)} ${circumference}`;
                        const dashOffset = -offsetCursor;
                        offsetCursor += segLen;
                        return (
                          <circle
                            key={it.key}
                            cx="75"
                            cy="75"
                            r={radius}
                            fill="none"
                            stroke={it.color}
                            strokeWidth="16"
                            strokeDasharray={dashArray}
                            strokeDashoffset={dashOffset}
                            strokeLinecap="butt"
                            className="transition-all duration-500"
                          />
                        );
                      })}
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-2xl font-bold text-on-surface tabular-nums">
                      {totalAlerts}
                    </span>
                    <span className="text-[10px] text-on-surface-variant font-mono">告警总数</span>
                  </div>
                </div>

                <div className="flex-1 w-full space-y-2.5">
                  {donutItems.map((it) => {
                    const pct = totalAlerts > 0 ? Math.round((it.count / totalAlerts) * 100) : 0;
                    return (
                      <div key={it.key} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="flex items-center gap-2 text-on-surface">
                            <span
                              className="w-2.5 h-2.5 rounded-sm shrink-0"
                              style={{ backgroundColor: it.color }}
                            />
                            {it.label}
                          </span>
                          <span className="font-mono text-[11px] text-on-surface-variant tabular-nums">
                            <strong className="text-on-surface">{it.count}</strong> 条 ({pct}%)
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-cyber-surface-lowest overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${pct}%`, backgroundColor: it.color }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* 近 7 日授权通行 vs 异常拦截趋势图 */}
            <div className="glass-panel p-6 rounded-xl border border-outline-variant/15 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-bold text-on-surface flex items-center gap-2">
                    <Activity className="w-4 h-4 text-cyber-secondary" />
                    近 7 日通行放行 vs 异常拦截趋势
                  </h3>
                  <p className="text-[10px] text-on-surface-variant font-mono mt-0.5">
                    PASSAGE_LOG VS ALERT_LOG 7-DAY TIMELINE
                  </p>
                </div>
                <div className="flex items-center gap-3 text-[10px] font-sans">
                  <span className="flex items-center gap-1 text-cyber-secondary">
                    <span className="w-2 h-2 rounded-sm bg-cyber-secondary" /> 授权通行
                  </span>
                  <span className="flex items-center gap-1 text-cyber-error">
                    <span className="w-2 h-2 rounded-sm bg-cyber-error" /> 异常告警
                  </span>
                </div>
              </div>

              {trendDays.length === 0 ? (
                <div className="h-40 flex items-center justify-center text-xs text-on-surface-variant">
                  正在聚合近 7 日安全趋势数据...
                </div>
              ) : (
                <div className="h-44 flex items-end justify-between gap-2 pt-4 px-1 border-b border-outline-variant/20">
                  {trendDays.map((d) => {
                    const passH = Math.max(4, Math.round((d.passages / maxDayVal) * 124));
                    const alertH = Math.max(4, Math.round((d.alerts / maxDayVal) * 124));
                    const shortDate = d.date.length >= 10 ? d.date.slice(5) : d.date;
                    return (
                      <div key={d.date} className="flex-1 flex flex-col items-center gap-1.5 group">
                        <div className="w-full flex items-end justify-center gap-1 h-32">
                          <div className="flex flex-col items-center gap-1">
                            {d.passages > 0 && (
                              <span className="text-[9px] font-mono text-cyber-secondary opacity-85">
                                {d.passages}
                              </span>
                            )}
                            <div
                              title={`${d.date} 授权通行: ${d.passages} 次`}
                              className="w-3.5 sm:w-4 rounded-t bg-gradient-to-t from-cyber-secondary/60 to-cyber-secondary transition-all duration-500 group-hover:brightness-125"
                              style={{ height: `${d.passages > 0 ? passH : 3}px` }}
                            />
                          </div>
                          <div className="flex flex-col items-center gap-1">
                            {d.alerts > 0 && (
                              <span className="text-[9px] font-mono text-cyber-error opacity-85">
                                {d.alerts}
                              </span>
                            )}
                            <div
                              title={`${d.date} 异常告警: ${d.alerts} 次`}
                              className="w-3.5 sm:w-4 rounded-t bg-gradient-to-t from-cyber-error/60 to-cyber-error transition-all duration-500 group-hover:brightness-125"
                              style={{ height: `${d.alerts > 0 ? alertH : 3}px` }}
                            />
                          </div>
                        </div>
                        <span className="text-[10px] font-mono text-on-surface-variant pb-1">
                          {shortDate}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      <div className="glass-panel p-5 rounded-lg font-sans">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-on-surface">最近授权通行记录</h3>
          <span className="text-[10px] text-on-surface-variant font-mono">passage_log</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-on-surface-variant border-b border-outline-variant/20">
              <tr>
                <th className="py-2 pr-3">时间</th>
                <th className="py-2 pr-3">姓名</th>
                <th className="py-2 pr-3">设备</th>
                <th className="py-2">接近度</th>
              </tr>
            </thead>
            <tbody>
              {recentPassages.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-4 text-on-surface-variant">暂无通行记录</td>
                </tr>
              ) : (
                recentPassages
                  .filter((p) =>
                    !searchQuery ||
                    String(p.recognizedName || '').toLowerCase().includes(searchQuery.toLowerCase()),
                  )
                  .map((p) => (
                    <tr key={p.id} className="border-b border-outline-variant/10">
                      <td className="py-2 pr-3 font-mono">
                        {p.createTime ? new Date(p.createTime).toLocaleString() : '-'}
                      </td>
                      <td className="py-2 pr-3">{p.recognizedName || '-'}</td>
                      <td className="py-2 pr-3">#{p.deviceId}</td>
                      <td className="py-2 tabular-nums">
                        {p.proximityRatio != null ? `${(p.proximityRatio * 100).toFixed(1)}%` : '-'}
                      </td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reports Section header */}
      <section className="space-y-4 font-sans">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-headline-lg text-on-surface font-sans">数据管理中心</h2>
            <p className="text-on-surface-variant font-sans text-sm">
              系统综合安全监测、硬件遥测及报表整合汇总。
            </p>
          </div>
          <button 
            onClick={handleExportSpreadsheet}
            className="bg-cyber-primary text-cyber-bg font-sans text-xs font-bold px-6 py-3 rounded-lg flex items-center gap-2 hover:shadow-[0_0_15px_rgba(0,218,243,0.3)] hover:brightness-110 active:scale-95 transition-all cursor-pointer"
          >
            <TableProperties className="w-4 h-4" />
            导出 Excel 报表
          </button>
        </div>

        {/* Nodes table */}
        <div className="glass-panel rounded-xl overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-cyber-surface-high/40 border-b border-outline-variant/20">
                  <th className="px-6 py-4 text-label-caps text-[11px] text-on-surface-variant font-sans">节点识别码</th>
                  <th className="px-6 py-4 text-label-caps text-[11px] text-on-surface-variant font-sans">数据流类型</th>
                  <th className="px-6 py-4 text-label-caps text-[11px] text-on-surface-variant font-sans">累计触发事件</th>
                  <th className="px-6 py-4 text-label-caps text-[11px] text-on-surface-variant font-sans">风险紧急度</th>
                  <th className="px-6 py-4 text-label-caps text-[11px] text-on-surface-variant font-sans">平均响应耗时</th>
                  <th className="px-6 py-4 text-label-caps text-[11px] text-on-surface-variant font-sans">最近统计时间</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10">
                {filteredNodes.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-6 text-center text-xs text-on-surface-variant font-sans">
                      暂无匹配的设备节点统计数据
                    </td>
                  </tr>
                ) : (
                  filteredNodes.map((nd) => (
                    <tr key={nd.nodeId} className="hover:bg-cyber-primary/5 transition-colors cursor-pointer">
                      <td className="px-6 py-4 font-mono text-xs font-bold text-cyber-primary">{nd.nodeId}</td>
                      <td className="px-6 py-4 font-sans text-xs text-on-surface">{nd.dataType}</td>
                      <td className="px-6 py-4 font-mono text-xs text-on-surface">{nd.totalEvents.toLocaleString()}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-0.5 rounded text-[9px] uppercase tracking-widest font-bold border ${
                          nd.criticality === 'HIGH'
                            ? 'bg-cyber-error-dim/10 border-cyber-error/30 text-cyber-error'
                            : nd.criticality === 'MED'
                            ? 'bg-cyber-warning-dim/10 border-cyber-warning/30 text-cyber-warning'
                            : 'bg-cyber-secondary-dim/10 border-cyber-secondary/30 text-cyber-secondary'
                        }`}>
                          {nd.criticality === 'HIGH' ? '高' : nd.criticality === 'MED' ? '中' : '低'}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-mono text-xs text-on-surface-variant">{nd.avgResponse}</td>
                      <td className="px-6 py-4 font-mono text-xs text-on-surface-variant/80">{nd.lastAggregation}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Split section: User Management (Left) + Global Nodes map (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 font-sans">
        {/* User management */}
        <section className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-headline-lg text-on-surface font-sans">用户账号管理</h2>
            <button 
              onClick={() => setShowAddModal(true)}
              className="text-cyber-primary font-sans text-xs font-bold flex items-center gap-1.5 hover:underline transition-all bg-cyber-primary-dim/10 px-3 py-1.5 rounded border border-cyber-primary/20 hover:bg-cyber-primary-dim/30 cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              添加新操作员
            </button>
          </div>

          <div className="glass-panel rounded-xl overflow-hidden shadow-2xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-cyber-surface-high/40 border-b border-outline-variant/20">
                    <th className="px-6 py-3.5 text-label-caps text-[11px] text-on-surface-variant font-sans">用户名</th>
                    <th className="px-6 py-3.5 text-label-caps text-[11px] text-on-surface-variant font-sans">权限级别</th>
                    <th className="px-6 py-3.5 text-label-caps text-[11px] text-on-surface-variant font-sans">状态</th>
                    <th className="px-6 py-3.5 text-label-caps text-[11px] text-on-surface-variant text-right font-sans">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10">
                  {filteredUsers.map((u) => (
                    <tr key={u.id} className="hover:bg-cyber-surface-high/15 transition-all">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-7 h-7 rounded bg-cyber-primary-dim border border-cyber-primary/30 flex items-center justify-center text-cyber-primary text-xs font-mono font-bold">
                            {u.initials}
                          </div>
                          <div>
                            <span className="font-mono text-xs font-bold text-on-surface block">{u.username}</span>
                            {u.nickname && u.nickname !== u.username && (
                              <span className="text-[10px] text-on-surface-variant">{u.nickname}</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`text-xs font-sans px-2 py-0.5 rounded ${
                          u.role === 'Admin'
                            ? 'text-cyber-warning bg-cyber-warning-dim/15 border border-cyber-warning/20'
                            : 'text-cyber-primary bg-cyber-primary-dim/15 border border-cyber-primary/20'
                        }`}>
                          {u.role === 'Admin' ? '系统管理员' : '一般操作员'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className={`w-1.5 h-1.5 rounded-full ${u.status === 'Active' ? 'bg-cyber-secondary animate-pulse' : 'bg-outline-variant'}`} />
                          <span className={`text-xs font-sans ${u.status === 'Active' ? 'text-cyber-secondary font-bold' : 'text-on-surface-variant'}`}>
                            {u.status === 'Active' ? '正常工作 (Active)' : '逻辑离线'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-1.5">
                          <button
                            onClick={() => handleResetPassword(u.id, u.username)}
                            className="p-1 text-on-surface-variant hover:text-cyber-primary hover:bg-cyber-surface-high/40 rounded transition-all cursor-pointer"
                            title="重置密码为 123456"
                          >
                            <Settings2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteUser(u.id, u.username)}
                            className="p-1 text-on-surface-variant hover:text-cyber-error hover:bg-cyber-error-dim/10 rounded transition-all cursor-pointer"
                            title="注销此操作员账号"
                          >
                            <Trash className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Global nodes representation */}
        <section className="space-y-4 font-sans">
          <h2 className="text-headline-lg text-on-surface font-sans">全球安防节点</h2>
          <div className="glass-panel rounded-xl h-[360px] relative overflow-hidden flex flex-col justify-between">
            {/* 本地离线赛博雷达网格背景（无外网图片依赖） */}
            <svg
              className="absolute inset-0 w-full h-full opacity-35 pointer-events-none"
              viewBox="0 0 400 360"
              preserveAspectRatio="xMidYMid slice"
              aria-label="Cyber security radar grid"
            >
              <defs>
                <pattern id="cyber-grid" width="28" height="28" patternUnits="userSpaceOnUse">
                  <path d="M 28 0 L 0 0 0 28" fill="none" stroke="rgba(0,218,243,0.18)" strokeWidth="0.7" />
                </pattern>
              </defs>
              <rect width="400" height="360" fill="url(#cyber-grid)" />
              <circle cx="200" cy="145" r="45" fill="none" stroke="rgba(0,218,243,0.35)" strokeWidth="1" />
              <circle cx="200" cy="145" r="95" fill="none" stroke="rgba(0,218,243,0.22)" strokeWidth="1" strokeDasharray="4 4" />
              <circle cx="200" cy="145" r="145" fill="none" stroke="rgba(0,230,57,0.18)" strokeWidth="1" />
              <line x1="200" y1="0" x2="200" y2="290" stroke="rgba(0,218,243,0.18)" strokeWidth="0.8" />
              <line x1="30" y1="145" x2="370" y2="145" stroke="rgba(0,218,243,0.18)" strokeWidth="0.8" />
              <line x1="200" y1="145" x2="133" y2="180" stroke="rgba(0,230,57,0.5)" strokeWidth="1.2" strokeDasharray="3 3" />
              <line x1="200" y1="145" x2="100" y2="90" stroke="rgba(255,59,48,0.45)" strokeWidth="1.2" strokeDasharray="3 3" />
            </svg>
            {/* Ambient vector glow points */}
            <div className="absolute top-1/3 left-1/2 w-3 h-3 bg-cyber-primary rounded-full animate-ping pointer-events-none" />
            <div className="absolute top-1/2 left-1/3 w-2.5 h-2.5 bg-cyber-secondary rounded-full animate-ping pointer-events-none" />
            <div className="absolute top-1/4 left-1/4 w-2 h-2 bg-cyber-error rounded-full animate-ping pointer-events-none" />

            {/* Gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-cyber-bg via-transparent to-transparent pointer-events-none" />

            <div /> {/* Spacer */}

            {/* Status panel inside */}
            <div className="absolute bottom-4 left-4 right-4 bg-cyber-surface/90 backdrop-blur-md p-4 rounded-lg border border-outline-variant/30 z-10">
              <p className="text-label-caps text-[10px] text-cyber-primary mb-1 font-sans tracking-wider font-bold">
                数据传输流监控
              </p>
              <div className="flex justify-between items-center font-sans text-xs text-on-surface">
                <span>加密保护级别</span>
                <span className="text-cyber-secondary font-bold flex items-center gap-1">
                  <UserCheck className="w-3.5 h-3.5" />
                  AES-256 强加密已生效
                </span>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Add User modal dialog */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 font-sans">
          <div className="glass-panel max-w-md w-full rounded-xl p-6 relative shadow-2xl border border-cyber-primary/30 animate-in zoom-in duration-150">
            <h3 className="text-data-lg text-cyber-primary font-bold uppercase mb-4 tracking-wider flex items-center gap-2 font-sans">
              <Users className="w-5 h-5 text-cyber-primary" />
              部署操作员安全密钥
            </h3>

            <form onSubmit={handleAddUserSubmit} className="space-y-4 font-sans">
              <div className="space-y-1">
                <label className="text-label-caps text-on-surface-variant text-[10px] ml-0.5">登录账号名 (唯一)</label>
                <input
                  type="text"
                  required
                  placeholder="例如：guard_zhang"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  className="w-full bg-cyber-surface-lowest border border-outline-variant/30 rounded py-2 px-3 text-sm text-on-surface outline-none focus:border-cyber-primary/50 font-sans"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-label-caps text-on-surface-variant text-[10px] ml-0.5">值班员姓名 / 昵称</label>
                  <input
                    type="text"
                    placeholder="例如：夜班值班员李四"
                    value={newNickname}
                    onChange={(e) => setNewNickname(e.target.value)}
                    className="w-full bg-cyber-surface-lowest border border-outline-variant/30 rounded py-2 px-3 text-sm text-on-surface outline-none focus:border-cyber-primary/50 font-sans"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-label-caps text-on-surface-variant text-[10px] ml-0.5">初始登录密码 (≥6位)</label>
                  <input
                    type="text"
                    required
                    minLength={6}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full bg-cyber-surface-lowest border border-outline-variant/30 rounded py-2 px-3 text-sm font-mono text-on-surface outline-none focus:border-cyber-primary/50"
                  />
                </div>
              </div>
              <p className="text-[11px] text-on-surface-variant/80">
                新建账号默认分配 <span className="text-cyber-primary font-mono">OPERATOR</span> 安保值班员角色（具备实时大屏监控与告警工单处置权限）。
              </p>

              <div className="flex gap-3 justify-end pt-4 border-t border-outline-variant/10">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 bg-cyber-surface-high border border-outline-variant/20 rounded text-xs text-on-surface hover:bg-cyber-surface-highest cursor-pointer font-sans"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-cyber-primary text-cyber-bg font-bold rounded text-xs flex items-center gap-1.5 hover:shadow-[0_0_15px_rgba(0,218,243,0.3)] hover:brightness-110 cursor-pointer font-sans"
                >
                  <Check className="w-4 h-4" />
                  生成密钥
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
