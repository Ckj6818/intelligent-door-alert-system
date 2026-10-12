import React, { useEffect, useMemo, useState } from 'react';
import { Users, X, RefreshCw, UserCheck, Plus, Upload, Shield, Trash2 } from 'lucide-react';
import {
  getAuthorizedUsers,
  addAuthorizedUserWithAvatar,
  updateAuthorizedUserStatus,
  deleteAuthorizedUser,
} from '@/api/index';
import type { AuthorizedUser } from '../types';

interface AuthorizedUsersModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * 授权人员白名单弹窗：列表 + 管理员新增（含人脸上传）
 */
export default function AuthorizedUsersModal({ open, onClose }: AuthorizedUsersModalProps) {
  const [users, setUsers] = useState<AuthorizedUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showForm, setShowForm] = useState(false);

  const [userCode, setUserCode] = useState('');
  const [name, setName] = useState('');
  const [department, setDepartment] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');

  const isAdmin = useMemo(
    () => (localStorage.getItem('user_role') || '').toUpperCase() === 'ADMIN',
    [open]
  );

  const loadUsers = () => {
    setLoading(true);
    setError('');
    getAuthorizedUsers(true)
      .then((res: any) => {
        const list = Array.isArray(res) ? res : res?.records || res?.data || [];
        setUsers(
          list.map((u: any) => ({
            id: u.id,
            userCode: u.userCode,
            name: u.name,
            department: u.department || '—',
            avatarUrl: u.avatarUrl,
            status: u.status ?? 1,
            createTime: u.createTime,
          }))
        );
      })
      .catch((err: any) => {
        console.error(err);
        setError(typeof err === 'string' ? err : err?.message || '加载授权白名单失败');
        setUsers([]);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!open) return;
    loadUsers();
    setShowForm(false);
    setSuccess('');
    setError('');
    resetForm();
  }, [open]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const resetForm = () => {
    setUserCode('');
    setName('');
    setDepartment('');
    setFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl('');
  };

  const onPickFile = (f: File | null) => {
    setFile(f);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(f ? URL.createObjectURL(f) : '');
  };

  const handleToggleStatus = (user: AuthorizedUser) => {
    if (!isAdmin) {
      setError('仅超级管理员可修改授权状态');
      return;
    }
    const next = user.status === 1 ? 0 : 1;
    const tip = next === 1 ? '启用' : '禁用';
    if (!window.confirm(`确认${tip}「${user.name}」？将同步边缘人脸库。`)) return;

    setError('');
    setSuccess('');
    updateAuthorizedUserStatus(Number(user.id), next as 0 | 1)
      .then(() => {
        setSuccess(
          next === 1
            ? `已启用「${user.name}」，人脸已恢复至边缘识别库`
            : `已禁用「${user.name}」，人脸已从边缘识别库移除`
        );
        loadUsers();
      })
      .catch((err: any) => {
        setError(err?.message || `${tip}失败`);
      });
  };

  const handleDelete = (user: AuthorizedUser) => {
    if (!isAdmin) {
      setError('仅超级管理员可删除授权人员');
      return;
    }
    if (!window.confirm(`确认删除「${user.name}」？将同步移除边缘人脸文件。`)) return;

    setError('');
    setSuccess('');
    deleteAuthorizedUser(Number(user.id))
      .then(() => {
        setSuccess(`已删除「${user.name}」，边缘人脸库已同步`);
        loadUsers();
      })
      .catch((err: any) => {
        setError(err?.message || '删除失败');
      });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      setError('仅超级管理员可新增授权人员');
      return;
    }
    if (!userCode.trim() || !name.trim()) {
      setError('工号与姓名不能为空');
      return;
    }
    if (!file) {
      setError('请上传清晰正脸照片');
      return;
    }

    const form = new FormData();
    form.append('userCode', userCode.trim());
    form.append('name', name.trim());
    if (department.trim()) form.append('department', department.trim());
    form.append('status', '1');
    form.append('file', file);

    setSubmitting(true);
    setError('');
    setSuccess('');
    addAuthorizedUserWithAvatar(form)
      .then(() => {
        setSuccess(`已添加「${name.trim()}」，人脸已同步至边缘识别库（AI 将自动热加载）`);
        resetForm();
        setShowForm(false);
        loadUsers();
      })
      .catch((err: any) => {
        setError(err?.message || '新增失败');
      })
      .finally(() => setSubmitting(false));
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-[120] p-4 font-sans"
      onClick={onClose}
    >
      <div
        className="glass-panel w-full max-w-4xl rounded-xl border border-cyber-primary/35 shadow-[0_0_40px_rgba(0,218,243,0.15)] overflow-hidden max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-outline-variant/15 flex items-center justify-between bg-cyber-primary/5 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-cyber-primary-dim border border-cyber-primary/40">
              <Users className="w-5 h-5 text-cyber-primary" />
            </div>
            <div>
              <h3 className="text-on-surface font-bold text-base tracking-wide">授权人员白名单</h3>
              <p className="text-[11px] text-on-surface-variant">
                管理员可新增人员并上传正脸照，自动同步边缘 AI 人脸库
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <button
                type="button"
                onClick={() => {
                  setShowForm((v) => !v);
                  setError('');
                  setSuccess('');
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-cyber-secondary/40 bg-cyber-secondary/10 text-cyber-secondary text-xs font-bold hover:bg-cyber-secondary/20 transition-all cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                {showForm ? '收起表单' : '新增授权人员'}
              </button>
            )}
            <button
              type="button"
              onClick={loadUsers}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-outline-variant/30 text-xs text-on-surface-variant hover:text-cyber-primary hover:border-cyber-primary/40 transition-all cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              刷新
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded text-on-surface-variant hover:text-on-surface cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-5 overflow-y-auto">
          {!isAdmin && (
            <div className="mb-3 px-3 py-2 rounded border border-outline-variant/30 bg-cyber-surface-low/50 text-on-surface-variant text-xs flex items-center gap-2">
              <Shield className="w-3.5 h-3.5" />
              当前为安保值班员账号，仅可查看白名单；新增需管理员权限。
            </div>
          )}

          {error && (
            <div className="mb-3 px-3 py-2 rounded border border-cyber-error/40 bg-cyber-error/10 text-cyber-error text-xs">
              {error}
            </div>
          )}
          {success && (
            <div className="mb-3 px-3 py-2 rounded border border-cyber-secondary/40 bg-cyber-secondary/10 text-cyber-secondary text-xs">
              {success}
            </div>
          )}

          {isAdmin && showForm && (
            <form
              onSubmit={handleSubmit}
              className="mb-5 p-4 rounded-lg border border-cyber-primary/25 bg-cyber-surface-lowest/60 space-y-3"
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <label className="text-xs space-y-1.5 block">
                  <span className="text-on-surface-variant">工号 *</span>
                  <input
                    value={userCode}
                    onChange={(e) => setUserCode(e.target.value)}
                    className="w-full px-3 py-2 rounded bg-cyber-surface-low border border-outline-variant/30 text-on-surface outline-none focus:border-cyber-primary/50 font-mono"
                    placeholder="如 CKJ002"
                    required
                  />
                </label>
                <label className="text-xs space-y-1.5 block">
                  <span className="text-on-surface-variant">姓名 *</span>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3 py-2 rounded bg-cyber-surface-low border border-outline-variant/30 text-on-surface outline-none focus:border-cyber-primary/50"
                    placeholder="如 张三"
                    required
                  />
                </label>
                <label className="text-xs space-y-1.5 block">
                  <span className="text-on-surface-variant">部门</span>
                  <input
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="w-full px-3 py-2 rounded bg-cyber-surface-low border border-outline-variant/30 text-on-surface outline-none focus:border-cyber-primary/50"
                    placeholder="如 信息工程学院"
                  />
                </label>
              </div>

              <div className="flex flex-col md:flex-row gap-4 items-start">
                <label className="flex-1 w-full cursor-pointer">
                  <span className="text-xs text-on-surface-variant block mb-1.5">正脸照片 *（jpg/png）</span>
                  <div className="border border-dashed border-cyber-primary/40 rounded-lg px-4 py-6 flex flex-col items-center justify-center gap-2 hover:bg-cyber-primary/5 transition-colors">
                    <Upload className="w-5 h-5 text-cyber-primary" />
                    <span className="text-xs text-on-surface-variant">
                      {file ? file.name : '点击选择清晰正脸照片'}
                    </span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/bmp"
                      className="hidden"
                      onChange={(e) => onPickFile(e.target.files?.[0] || null)}
                    />
                  </div>
                </label>
                {previewUrl && (
                  <div className="w-28 shrink-0">
                    <p className="text-[10px] text-on-surface-variant mb-1">预览</p>
                    <img
                      src={previewUrl}
                      alt="preview"
                      className="w-28 h-28 object-cover rounded-lg border border-cyber-primary/40"
                    />
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    resetForm();
                  }}
                  className="px-4 py-2 rounded text-xs border border-outline-variant/30 text-on-surface-variant cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded text-xs font-bold bg-cyber-primary text-cyber-bg hover:brightness-110 disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? '提交中…' : '确认添加'}
                </button>
              </div>
            </form>
          )}

          <div className="rounded-lg border border-outline-variant/20 overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-cyber-surface-low/80 text-on-surface-variant uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3 font-bold">姓名</th>
                  <th className="px-4 py-3 font-bold">工号</th>
                  <th className="px-4 py-3 font-bold">部门</th>
                  <th className="px-4 py-3 font-bold">状态</th>
                  {isAdmin && <th className="px-4 py-3 font-bold text-right">操作</th>}
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={isAdmin ? 5 : 4} className="px-4 py-10 text-center text-on-surface-variant">
                      正在同步白名单数据…
                    </td>
                  </tr>
                )}
                {!loading && users.length === 0 && (
                  <tr>
                    <td colSpan={isAdmin ? 5 : 4} className="px-4 py-10 text-center text-on-surface-variant">
                      暂无授权人员{isAdmin ? '，请点击右上角「新增授权人员」' : ''}
                    </td>
                  </tr>
                )}
                {!loading &&
                  users.map((user) => (
                    <tr
                      key={user.id}
                      className="border-t border-outline-variant/10 hover:bg-cyber-primary/5 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          {user.avatarUrl ? (
                            <img
                              src={user.avatarUrl}
                              alt={user.name}
                              className="w-8 h-8 rounded-full object-cover border border-cyber-primary/30"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-cyber-primary/10 border border-cyber-primary/30 flex items-center justify-center">
                              <UserCheck className="w-3.5 h-3.5 text-cyber-primary" />
                            </div>
                          )}
                          <span className="text-on-surface font-bold">{user.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-cyber-primary">{user.userCode}</td>
                      <td className="px-4 py-3 text-on-surface-variant">{user.department || '—'}</td>
                      <td className="px-4 py-3">
                        {user.status === 1 ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-cyber-secondary/15 text-cyber-secondary border border-cyber-secondary/30 font-bold">
                            <span className="w-1.5 h-1.5 rounded-full bg-cyber-secondary" />
                            启用
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-on-surface-variant/10 text-on-surface-variant border border-outline-variant/30">
                            禁用
                          </span>
                        )}
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => handleToggleStatus(user)}
                              className="px-2.5 py-1 rounded border border-outline-variant/30 text-[11px] text-on-surface-variant hover:border-cyber-primary/40 hover:text-cyber-primary cursor-pointer"
                            >
                              {user.status === 1 ? '禁用' : '启用'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(user)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-cyber-error/35 text-[11px] text-cyber-error hover:bg-cyber-error/10 cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3" />
                              删除
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-[10px] text-on-surface-variant font-mono">
            共 {users.length} 人 · 新增/启用/禁用/删除均会同步边缘 AI 人脸库
          </p>
        </div>
      </div>
    </div>
  );
}
