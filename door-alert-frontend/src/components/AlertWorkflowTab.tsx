import React, { useState } from 'react';
import { 
  Filter, 
  Download, 
  Trash2, 
  RotateCw, 
  Layers, 
  History,
  Trash,
  CheckCircle,
  Eye,
  Camera
} from 'lucide-react';
import { Alert, TrashItem, LiveFeedItem } from '../types';
import * as XLSX from 'xlsx';
import { handleAlert, deleteAlert, restoreAlert, clearAllAlerts, exportAlerts, clearRecycleBinPermanently } from '@/api/index';

interface AlertWorkflowTabProps {
  searchQuery: string;
  alerts: Alert[];
  setAlerts: React.Dispatch<React.SetStateAction<Alert[]>>;
  trashItems: TrashItem[];
  setTrashItems: React.Dispatch<React.SetStateAction<TrashItem[]>>;
  setLiveFeed: React.Dispatch<React.SetStateAction<LiveFeedItem[]>>;
}

export default function AlertWorkflowTab({ 
  searchQuery, 
  alerts, 
  setAlerts,
  trashItems,
  setTrashItems,
  setLiveFeed
}: AlertWorkflowTabProps) {
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const handleSelectRow = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      const pageIds = paginatedAlerts.map(r => r.id);
      setSelectedIds(prev => {
        const next = new Set([...prev, ...pageIds]);
        return Array.from(next);
      });
    } else {
      const pageIds = paginatedAlerts.map(r => r.id);
      setSelectedIds(prev => prev.filter(id => !pageIds.includes(id)));
    }
  };

  const handleBatchDelete = () => {
    if (selectedIds.length === 0) return;
    if (confirm(`您确定要逻辑删除选中的 ${selectedIds.length} 条告警记录吗？`)) {
      const rawIds = selectedIds.map(id => id.replace('AL-', ''));
      Promise.all(rawIds.map(rawId => deleteAlert(rawId)))
        .then(() => {
          setAlerts(prev => prev.filter(al => !selectedIds.includes(al.id)));
          setLiveFeed(prev => prev.filter(f => !selectedIds.map(id => 'F-' + id.replace('AL-', '')).includes(f.id)));
          
          const newTrashItems = selectedIds.map(id => {
            const row = alerts.find(al => al.id === id);
            return {
              id: id.replace('AL-', ''),
              name: row ? `${row.device}_告警日志_${row.id}` : `告警日志_${id}`,
              deletedTime: '刚刚'
            };
          });
          setTrashItems(prev => [...newTrashItems, ...prev]);
          setSelectedIds([]);
          alert('批量逻辑删除成功，已移入回收站。');
        })
        .catch(err => {
          console.error('Batch delete failed', err);
          alert('批量删除出现异常，请确认网络连接与后端状态。');
        });
    }
  };

  const handleExportLogs = async () => {
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
        '危险等级': item.dangerLevel >= 3 ? 'HIGH' : item.dangerLevel === 2 ? 'MEDIUM' : 'LOW',
        '状态': item.status === 1 ? '已处理' : '未处理'
      }));
      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, '告警记录');
      XLSX.writeFile(workbook, '智能门禁告警报表.xlsx');
      alert('Alert logs report compiled as Excel successfully.');
    } catch (error) {
      console.error('Export failed', error);
    }
  };

  // Interactive buttons handler
  const handleProcess = (id: string, newStatus: string) => {
    const rawId = id.replace('AL-', '');
    handleAlert(rawId)
      .then(() => {
        setAlerts(prev => prev.map(al => {
          if (al.id === id) {
            return { 
              ...al, 
              status: '已处理',
              statusType: 'success'
            };
          }
          return al;
        }));
        alert(`告警事件 ${id} 状态已更新为：已处理`);
      })
      .catch(err => {
        console.error('Failed to process alert', err);
      });
  };

  // Soft delete alert -> moves to recycle bin
  const handleSoftDelete = (id: string, name: string) => {
    const rawId = id.replace('AL-', '');
    deleteAlert(rawId)
      .then(() => {
        setAlerts(prev => prev.filter(al => al.id !== id));
        setLiveFeed(prev => prev.filter(f => f.id !== 'F-' + rawId));
        const newTrash: TrashItem = {
          id: rawId,
          name: name,
          deletedTime: '刚刚'
        };
        setTrashItems(prev => [newTrash, ...prev]);
        alert(`告警记录 ${id} 已移至回收站（逻辑删除）。`);
      })
      .catch(err => {
        console.error('Failed to delete alert', err);
      });
  };

  // Restore trash item -> moves back to table
  const handleRestoreTrash = (item: TrashItem) => {
    restoreAlert(item.id)
      .then(() => {
        setTrashItems(prev => prev.filter(t => t.id !== item.id));
        const restoredAlert: Alert = {
          id: 'AL-' + item.id,
          time: new Date().toLocaleTimeString(),
          date: new Date().toISOString().split('T')[0],
          device: item.name.replace('_Alert', '').replace(/_\d+$/, ''),
          type: '陌生人员入侵',
          typeBadge: 'error',
          imageSrc: '',
          status: '待复核',
          statusType: 'error',
          confidence: 0.92,
          location: '已恢复防区'
        };
        setAlerts(prev => [restoredAlert, ...prev]);
        alert(`告警轨迹记录 ${item.id} 恢复成功。`);
      })
      .catch(err => console.error(err));
  };

  const handleLogicDeleteAll = () => {
    if (alerts.length === 0) return;
    clearAllAlerts()
      .then(() => {
        const deletedAlerts: TrashItem[] = alerts.map(al => ({
          id: al.id.replace('AL-', ''),
          name: `${al.device}_告警日志`,
          deletedTime: '刚刚'
        }));
        setTrashItems(prev => [...deletedAlerts, ...prev]);
        setAlerts([]);
        setLiveFeed([]);
        alert('所有当前活动告警已成功移至回收站。');
      })
      .catch(err => console.error(err));
  };

  const handleRestoreAll = () => {
    if (trashItems.length === 0) return;
    Promise.all(trashItems.map(item => restoreAlert(item.id)))
      .then(() => {
        trashItems.forEach(item => {
          const restored: Alert = {
            id: 'AL-' + item.id,
            time: new Date().toLocaleTimeString(),
            date: new Date().toISOString().split('T')[0],
            device: item.name.replace('_Alert', '').replace(/_\d+$/, ''),
            type: '陌生人员入侵',
            typeBadge: 'error',
            imageSrc: '',
            status: '待复核',
            statusType: 'error',
            confidence: 0.91,
            location: '已恢复防区'
          };
          setAlerts(prev => [restored, ...prev]);
        });
        setTrashItems([]);
        alert('回收站中的所有逻辑记录已恢复至告警工作流表格。');
      })
      .catch(err => console.error(err));
  };

  const handleClearTrashPermanently = () => {
    if (trashItems.length === 0) {
      alert('回收站已清空，无需操作。');
      return;
    }
    if (confirm('您确定要永久清除回收站中的所有安全追踪记录吗？此操作将清空本地数据库缓存，且无法撤销。')) {
      clearRecycleBinPermanently()
        .then(() => {
          setTrashItems([]);
          alert('审计痕迹已从数据库中永久清除。');
        })
        .catch(err => {
          console.error('Failed to clear recycle bin', err);
          alert('清空失败，请确认后端运行正常！');
        });
    }
  };

  // Filter list rows based on search input and status drop-down
  const filteredAlerts = alerts.filter(al => {
    const matchesSearch = al.device.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          al.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          al.status.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (filterStatus === 'all') return matchesSearch;
    return matchesSearch && al.status.toLowerCase().replace(' ', '_') === filterStatus;
  });

  // 分页状态管理与动态切片计算
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(filteredAlerts.length / pageSize));
  const validCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (validCurrentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedAlerts = filteredAlerts.slice(startIndex, endIndex);

  return (
    <div className="space-y-8 pb-12">
      {/* Page Header Area */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 font-sans">
        <div>
          <h2 className="text-headline-lg text-on-surface font-sans">报警处置工作流</h2>
          <p className="text-on-surface-variant font-sans text-sm opacity-80">
            管理历史遥测数据及 YOLOv8 目标分类识别日志。
          </p>
        </div>
        <div className="flex gap-3">
          <div className="relative">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-4 py-2 bg-cyber-surface-high border border-outline-variant/30 text-data-sm font-sans text-on-surface hover:bg-cyber-surface-highest transition-all rounded outline-none focus:border-cyber-primary/40 appearance-none cursor-pointer pr-10"
            >
              <option value="all">所有状态</option>
              <option value="pending_review">待复核警报</option>
              <option value="auto-cleared">已处理事件</option>
              <option value="investigating">深度调查中</option>
            </select>
            <Filter className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant pointer-events-none" />
          </div>

          {selectedIds.length > 0 && (
            <button
              onClick={handleBatchDelete}
              className="px-4 py-2 bg-cyber-error-dim/20 border border-cyber-error/40 text-cyber-error font-sans text-xs font-bold rounded flex items-center gap-2 hover:bg-cyber-error hover:text-white hover:shadow-[0_0_15px_rgba(255,75,75,0.3)] transition-all active:scale-95 cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              批量删除 ({selectedIds.length})
            </button>
          )}

          <button
            onClick={handleExportLogs}
            className="px-4 py-2 bg-cyber-primary text-cyber-bg font-sans text-xs font-bold rounded flex items-center gap-2 hover:shadow-[0_0_15px_rgba(0,218,243,0.3)] transition-all active:scale-95 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            导出表格日志
          </button>
        </div>
      </div>

      {/* Atmospheric Shader cards */}
      <div className="relative h-24 w-full glass-panel rounded-xl overflow-hidden mb-8 glow-primary font-sans">
        <div className="scan-line" />
        <div className="absolute inset-0 flex items-center justify-between px-8 relative z-10">
          <div className="flex gap-12">
            <div>
              <span className="text-on-surface-variant/70 text-label-caps text-[10px]">警报处置率</span>
              <div className="text-cyber-primary font-mono text-2xl font-bold">98.4%</div>
            </div>
            <div>
              <span className="text-on-surface-variant/70 text-label-caps text-[10px]">平均识别置信度</span>
              <div className="text-cyber-secondary font-mono text-2xl font-bold">92.0%</div>
            </div>
            <div>
              <span className="text-on-surface-variant/70 text-label-caps text-[10px]">活动缓冲区</span>
              <div className="text-on-surface font-mono text-2xl font-bold">12 条</div>
            </div>
          </div>
          <div className="hidden lg:block text-right font-sans text-xs text-on-surface-variant/80">
            全局安全监控等级已优化
          </div>
        </div>
      </div>

      {/* Historical Alerts Table */}
      <div className="glass-panel rounded-xl overflow-hidden border border-outline-variant/10 shadow-2xl font-sans">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-cyber-surface-low/50 border-b border-outline-variant/10">
                <th className="pl-6 py-4 w-10">
                  <input 
                    type="checkbox" 
                    checked={paginatedAlerts.length > 0 && paginatedAlerts.every(row => selectedIds.includes(row.id))}
                    onChange={handleSelectAll}
                    className="w-4 h-4 rounded border-outline-variant/30 text-cyber-primary bg-cyber-surface-high cursor-pointer focus:ring-0 focus:ring-offset-0"
                  />
                </th>
                <th className="px-6 py-4 text-label-caps text-[11px] text-on-surface-variant font-sans">触发时间</th>
                <th className="px-6 py-4 text-label-caps text-[11px] text-on-surface-variant font-sans">来源设备</th>
                <th className="px-6 py-4 text-label-caps text-[11px] text-on-surface-variant font-sans">识别类型 (YOLOv8)</th>
                <th className="px-6 py-4 text-label-caps text-[11px] text-on-surface-variant font-sans">现场抓拍预览</th>
                <th className="px-6 py-4 text-label-caps text-[11px] text-on-surface-variant font-sans">复核状态</th>
                <th className="px-6 py-4 text-label-caps text-[11px] text-on-surface-variant font-sans text-right">处置动作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/5">
              {paginatedAlerts.map((row) => (
                <tr key={row.id} className={`hover:bg-cyber-surface-high/20 transition-all group ${selectedIds.includes(row.id) ? 'bg-cyber-primary-dim/5' : ''}`}>
                  <td className="pl-6 py-5">
                    <input 
                      type="checkbox"
                      checked={selectedIds.includes(row.id)}
                      onChange={() => handleSelectRow(row.id)}
                      className="w-4 h-4 rounded border-outline-variant/30 text-cyber-primary bg-cyber-surface-high cursor-pointer focus:ring-0 focus:ring-offset-0"
                    />
                  </td>
                  {/* Time column */}
                  <td className="px-6 py-5">
                    <div className="flex flex-col">
                      <span className="text-data-sm text-on-surface font-bold">{row.time}</span>
                      <span className="text-[10px] text-on-surface-variant/80 font-mono mt-0.5">{row.date}</span>
                    </div>
                  </td>

                  {/* Device location column */}
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-2 text-on-surface">
                      <Camera className="w-4 h-4 text-cyber-primary" />
                      <span className="text-data-sm font-bold">{row.device}</span>
                    </div>
                  </td>

                  {/* Badged Type column */}
                  <td className="px-6 py-5">
                    <span className={`px-2 py-0.5 rounded-full font-mono text-[10px] uppercase tracking-wider border ${
                      row.typeBadge === 'error'
                        ? 'bg-cyber-error-dim/10 border-cyber-error/30 text-cyber-error'
                        : row.typeBadge === 'primary'
                        ? 'bg-cyber-primary-dim/10 border-cyber-primary/30 text-cyber-primary'
                        : 'bg-cyber-warning-dim/10 border-cyber-warning/30 text-cyber-warning'
                    }`}>
                      {row.type}
                    </span>
                  </td>

                  {/* Preview image camera feed column */}
                  <td className="px-6 py-5">
                    <div 
                      onClick={() => setPreviewImage(row.imageSrc)}
                      className="w-20 h-12 rounded border border-outline-variant/30 overflow-hidden relative transition-transform duration-300 hover:scale-110 cursor-pointer"
                      title="点击放大查看图片"
                    >
                      <img 
                        className="w-full h-full object-cover grayscale opacity-80 group-hover:grayscale-0 group-hover:opacity-100" 
                        src={row.imageSrc} 
                        alt="surveillance preview thumbnail" 
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                    </div>
                  </td>

                  {/* Pulse dot Status column */}
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-2">
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        row.statusType === 'error' 
                          ? 'bg-cyber-error animate-pulse' 
                          : row.statusType === 'success' 
                          ? 'bg-cyber-secondary' 
                          : 'bg-on-surface-variant/60 animate-pulse'
                      }`} />
                      <span className={`text-data-sm font-bold ${
                        row.statusType === 'error'
                          ? 'text-cyber-error'
                          : row.statusType === 'success'
                          ? 'text-cyber-secondary'
                          : 'text-on-surface-variant'
                      }`}>
                        {row.status}
                      </span>
                    </div>
                  </td>

                  {/* Action triggers */}
                  <td className="px-6 py-5 text-right">
                    <div className="flex justify-end gap-2">
                      {row.status !== '已处理' && (
                        <button 
                          onClick={() => handleProcess(row.id, '已处理')}
                          className="px-3 py-1 bg-cyber-primary-dim/20 border border-cyber-primary/30 text-cyber-primary text-xs font-sans font-bold hover:bg-cyber-primary hover:text-cyber-bg transition-all cursor-pointer"
                        >
                          确认处理
                        </button>
                      )}
                      {row.status === '已处理' && (
                        <button 
                          onClick={() => handleProcess(row.id, 'investigating')}
                          className="px-3 py-1 bg-cyber-warning-dim/20 border border-cyber-warning/30 text-cyber-warning text-xs font-sans font-bold hover:bg-cyber-warning hover:text-cyber-bg transition-all cursor-pointer"
                        >
                          重新核实
                        </button>
                      )}
                      <button 
                        onClick={() => handleSoftDelete(row.id, `${row.device}_告警日志_${row.id}`)}
                        className="px-3 py-1 border border-outline-variant/30 text-on-surface-variant/80 hover:text-cyber-error hover:border-cyber-error/40 text-xs font-sans transition-all cursor-pointer"
                        title="移至回收站"
                      >
                        逻辑删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredAlerts.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-on-surface-variant text-xs font-sans">
                    未发现符合条件的分类报警记录。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Dynamic Pagination footer */}
        <div className="px-6 py-4 bg-cyber-surface-low/30 border-t border-outline-variant/10 flex justify-between items-center font-sans text-xs">
          <span className="text-on-surface-variant font-sans">
            显示第 {filteredAlerts.length > 0 ? startIndex + 1 : 0} 到 {Math.min(endIndex, filteredAlerts.length)} 条记录（当前过滤后共 {filteredAlerts.length} 条记录，总共 {alerts.length} 个节点轨迹）
          </span>
          <div className="flex gap-1.5 font-mono">
            <button 
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={validCurrentPage === 1}
              className="w-8 h-8 flex items-center justify-center border border-outline-variant/30 text-on-surface-variant hover:bg-cyber-surface-high/40 rounded disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
            >
              &lt;
            </button>
            
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(pageNum => (
              <button
                key={pageNum}
                onClick={() => setCurrentPage(pageNum)}
                className={`w-8 h-8 flex items-center justify-center border rounded ${
                  pageNum === validCurrentPage
                    ? "bg-cyber-primary-dim text-cyber-primary border-cyber-primary/40 font-bold"
                    : "border-outline-variant/30 text-on-surface-variant hover:bg-cyber-surface-high/40 cursor-pointer"
                }`}
              >
                {pageNum}
              </button>
            ))}

            <button 
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={validCurrentPage === totalPages}
              className="w-8 h-8 flex items-center justify-center border border-outline-variant/30 text-on-surface-variant hover:bg-cyber-surface-high/40 rounded disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
            >
              &gt;
            </button>
          </div>
        </div>
      </div>

      {/* Recycle Bin module */}
      <div className="glass-panel rounded-xl border border-cyber-error/10 overflow-hidden relative font-sans">
        <div className="absolute top-0 right-0 p-4 opacity-[0.03] pointer-events-none">
          <Trash className="w-24 h-24 text-cyber-error" />
        </div>

        <div className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <Trash className="text-cyber-error w-6 h-6 animate-pulse" />
            <div>
              <h3 className="text-data-lg text-on-surface font-bold font-sans">报警日志回收站</h3>
              <p className="text-[11px] text-on-surface-variant font-sans uppercase tracking-widest leading-none mt-1 font-bold">
                逻辑删除数据记录缓冲管理
              </p>
            </div>
          </div>

          {/* Grid of deleted items */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {trashItems.map((item) => (
              <div 
                key={item.id}
                className="bg-cyber-surface-lowest border border-outline-variant/10 p-4 rounded flex items-center justify-between group hover:border-cyber-error/30 transition-all duration-200"
              >
                <div className="flex flex-col overflow-hidden mr-2">
                  <span className="text-xs font-sans text-on-surface font-bold truncate" title={item.name}>
                    {item.name}
                  </span>
                  <span className="text-[10px] text-on-surface-variant/70 font-sans mt-0.5">
                    {item.deletedTime}
                  </span>
                </div>
                <button 
                  onClick={() => handleRestoreTrash(item)}
                  className="material-symbols-outlined text-on-surface-variant hover:text-cyber-secondary p-1.5 hover:bg-cyber-surface-high/40 rounded transition-all cursor-pointer"
                  title="还原此记录到告警工作流"
                >
                  <History className="w-4 h-4" />
                </button>
              </div>
            ))}

            {trashItems.length === 0 && (
              <div className="col-span-full py-6 text-center text-on-surface-variant/50 font-sans text-xs italic">
                回收站为空。所有逻辑删除日志已同步移至离线盘库。
              </div>
            )}

            {trashItems.length > 0 && (
              <div className="bg-cyber-surface-lowest border border-outline-variant/10 p-4 rounded border-dashed flex items-center justify-center">
                <span className="text-[10px] text-on-surface-variant font-sans uppercase tracking-widest font-bold">
                  + 还有 {trashItems.length} 条已归档轨迹
                </span>
              </div>
            )}
          </div>

          {/* Actions panel */}
          <div className="flex flex-wrap gap-4 pt-4 border-t border-outline-variant/10 font-sans">
            <button
              onClick={handleLogicDeleteAll}
              disabled={alerts.length === 0}
              className="px-5 py-2 bg-cyber-surface-high border border-outline-variant/20 text-on-surface text-xs hover:bg-cyber-surface-highest hover:border-cyber-error/40 transition-all rounded flex items-center gap-2 disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
            >
              <Layers className="w-4 h-4" />
              逻辑删除当前全部
            </button>
            <button
              onClick={handleRestoreAll}
              disabled={trashItems.length === 0}
              className="px-5 py-2 bg-cyber-surface-high border border-outline-variant/20 text-on-surface text-xs hover:bg-cyber-surface-highest hover:border-cyber-primary/40 transition-all rounded flex items-center gap-2 disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
            >
              <History className="w-4 h-4" />
              恢复全部记录
            </button>
            <div className="flex-1" />
            <button
              onClick={handleClearTrashPermanently}
              disabled={trashItems.length === 0}
              className="px-6 py-2 bg-cyber-error-dim/15 border border-cyber-error/40 text-cyber-error hover:bg-cyber-error hover:text-white transition-all rounded font-bold text-xs flex items-center gap-2 group disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
            >
              <Trash2 className="w-4 h-4 group-hover:scale-110 transition-transform" />
              永久清空回收站
            </button>
          </div>
        </div>
      </div>

      {/* Click to Enlarge Image Preview Modal */}
      {previewImage && (
        <div 
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 transition-all animate-fade-in"
          onClick={() => setPreviewImage(null)}
        >
          <div 
            className="relative max-w-4xl max-h-[90vh] bg-cyber-surface-low rounded-xl border border-outline-variant/30 overflow-hidden flex flex-col items-center justify-center p-2 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button 
              onClick={() => setPreviewImage(null)}
              className="absolute top-4 right-4 bg-black/60 hover:bg-cyber-error text-white px-3 py-1.5 rounded-full transition-all cursor-pointer font-bold text-xs shadow-lg"
              title="关闭预览"
            >
              关闭 ✕
            </button>
            <img 
              className="max-w-full max-h-[80vh] object-contain rounded"
              src={previewImage} 
              alt="Enlarged surveillance alert capture" 
            />
            <div className="mt-3 text-center text-xs text-on-surface-variant font-sans">
              抓拍大图预览（点击外围空白区域或右上角按钮可关闭）
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
