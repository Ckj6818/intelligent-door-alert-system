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
import { getUserList, addOperatorUser, deleteOperatorUser, resetOperatorPassword, exportAlerts } from '@/api/index';
import * as XLSX from 'xlsx';

interface ReportsTabProps {
  searchQuery: string;
}

export default function ReportsTab({ searchQuery }: ReportsTabProps) {
  // Nodes telemetry state
  const [nodes, setNodes] = useState<NodeReport[]>([
    { nodeId: 'SEC-ALPHA-01', dataType: 'Entry Logs', totalEvents: 1248, criticality: 'LOW', avgResponse: '1.2s', lastAggregation: '10m ago' },
    { nodeId: 'SEC-BETA-09', dataType: 'Biometric Fluctuation', totalEvents: 42, criticality: 'HIGH', avgResponse: '0.4s', lastAggregation: '2m ago' },
    { nodeId: 'CAM-GRID-04', dataType: 'Motion Analytics', totalEvents: 8931, criticality: 'MED', avgResponse: '0.8s', lastAggregation: '35s ago' }
  ]);

  const handleExportSpreadsheet = async () => {
    try {
      const records = await exportAlerts();
      if (!records || records.length === 0) {
        alert('No alert logs available for export.');
        return;
      }
      const rows = records.map((item: any) => ({
        '告警时间': new Date(item.createTime).toLocaleString(),
        '设备ID': item.deviceId,
        '接近度': item.proximityRatio != null ? `${(item.proximityRatio * 100).toFixed(1)}%` : '-',
        '危险等级': item.dangerLevel >= 3 ? '高危' : item.dangerLevel === 2 ? '中危' : '低危',
        '状态': item.status === 1 ? '已处理' : '未处理'
      }));
      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, '告警记录');
      XLSX.writeFile(workbook, '智能门禁告警报表.xlsx');
      alert('门禁安防报警日志报表已成功导出为 Excel。');
    } catch (error) {
      console.error('Export failed', error);
    }
  };

  // System Users state
  const [users, setUsers] = useState<SystemUser[]>([]);

  // User creation state
  const [showAddModal, setShowAddModal] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newRole, setNewRole] = useState<'Admin' | 'Operator'>('Operator');
  const [newStatus, setNewStatus] = useState<'Active' | 'Offline'>('Active');

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

    addOperatorUser({ username: newUsername.trim(), password: '123456' })
      .then(() => {
        fetchUsers();
        setNewUsername('');
        setShowAddModal(false);
        alert(`已成功为节点代理创建操作员账号：${newUsername}。默认密码为：123456`);
      })
      .catch(err => {
        console.error('Failed to create user', err);
      });
  };

  // Delete User
  const handleDeleteUser = (id: string, name: string) => {
    if (confirm(`是否确认吊销安全凭证并注销操作员 "${name}" 的系统账号？`)) {
      deleteOperatorUser(id)
        .then(() => {
          setUsers(prev => prev.filter(u => u.id !== id));
          alert(`操作员 "${name}" 账号凭证已注销清除。`);
        })
        .catch(err => console.error(err));
    }
  };

  // Reset password
  const handleResetPassword = (id: string, name: string) => {
    if (confirm(`是否确认将操作员 "${name}" 的登录密码重置为：123456？`)) {
      resetOperatorPassword(id)
        .then(() => {
          alert(`操作员 "${name}" 密码已重置为：123456。`);
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
          <p className="text-label-caps text-on-surface-variant mb-2 text-[10px] font-sans">24小时事件总数</p>
          <div className="flex items-end justify-between">
            <h3 className="text-display-lg text-cyber-primary font-bold tabular-nums">142</h3>
            <span className="text-cyber-secondary font-mono text-xs font-bold">+3.4%</span>
          </div>
        </div>

        <div className="glass-panel p-6 rounded-lg">
          <p className="text-label-caps text-on-surface-variant mb-2 text-[10px] font-sans">当前活动会话</p>
          <div className="flex items-end justify-between">
            <h3 className="text-display-lg text-cyber-primary font-bold tabular-nums">12</h3>
            <span className="text-on-surface-variant font-sans text-xs">在线中</span>
          </div>
        </div>

        <div className="glass-panel p-6 rounded-lg">
          <p className="text-label-caps text-on-surface-variant mb-2 text-[10px] font-sans">网络通信延迟</p>
          <div className="flex items-end justify-between">
            <h3 className="text-display-lg text-cyber-primary font-bold tabular-nums">24ms</h3>
            <span className="text-cyber-secondary font-sans text-xs font-bold">优良</span>
          </div>
        </div>

        <div className="glass-panel p-6 rounded-lg">
          <p className="text-label-caps text-on-surface-variant mb-2 text-[10px] font-sans">数据库在线时长</p>
          <div className="flex items-end justify-between">
            <h3 className="text-display-lg text-cyber-primary font-bold tabular-nums">99.9%</h3>
            <ShieldCheck className="text-cyber-secondary w-7 h-7" />
          </div>
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
                {filteredNodes.map((nd) => (
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
                ))}
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
                          <span className="font-mono text-xs font-bold text-on-surface">{u.username}</span>
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
            {/* Styled Map background illustration */}
            <div 
              className="absolute inset-0 bg-cover bg-center mix-blend-screen opacity-70"
              style={{ 
                backgroundImage: `url('https://lh3.googleusercontent.com/aida-public/AB6AXuCr5ZnAVyf2DOkSmfKgCxniMW2XQgNG0ME0C-7JJ37xn7qQrA7EbaudkorAtXBA8awpWMgETQrsgc1G8fX0b69ibOfxaMJp_12SQYYZsDWkOqPRIRLsWP0_v7SY6PiyKvhCJJj4BKlEe9d8VoOugj9no6YXESZ4aKGTTgy5IPAcL0d2xZf7_283HJWRHUQiDAkJeBidMb7sWkfjFPDsPcYPlzyPXeD70EGnVQSPDb48yqxu6QW9bZXb')` 
              }}
              aria-label="Stylized world Map with nodes"
            />
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
                <label className="text-label-caps text-on-surface-variant text-[10px] ml-0.5">操作员账户名</label>
                <input
                  type="text"
                  required
                  placeholder="例如：chen_kejie_sec"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  className="w-full bg-cyber-surface-lowest border border-outline-variant/30 rounded py-2 px-3 text-sm text-on-surface outline-none focus:border-cyber-primary/50 font-sans"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-label-caps text-on-surface-variant text-[10px] ml-0.5">权限等级</label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as 'Admin' | 'Operator')}
                    className="w-full bg-cyber-surface-lowest border border-outline-variant/30 rounded py-2 px-3 text-sm text-on-surface outline-none focus:border-cyber-primary/50 font-sans"
                  >
                    <option value="Operator">一般操作员 (Operator)</option>
                    <option value="Admin">超级管理员 (Admin)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-label-caps text-on-surface-variant text-[10px] ml-0.5">初始代理状态</label>
                  <select
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value as 'Active' | 'Offline')}
                    className="w-full bg-cyber-surface-lowest border border-outline-variant/30 rounded py-2 px-3 text-sm text-on-surface outline-none focus:border-cyber-primary/50 font-sans"
                  >
                    <option value="Active">正常工作 (Active)</option>
                    <option value="Offline">离线注销 (Offline)</option>
                  </select>
                </div>
              </div>

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
