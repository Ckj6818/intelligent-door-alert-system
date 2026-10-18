import request from '@/utils/request';

/**
 * User login
 * @param data - { username, password }
 */
export function login(data: any): Promise<any> {
  return request({
    url: '/users/login',
    method: 'post',
    data,
  });
}

/**
 * Get device list
 * @param params - query parameters like { current, size }
 */
export function getDeviceList(params?: any): Promise<any> {
  return request({
    url: '/devices',
    method: 'get',
    params,
  });
}

/**
 * Get alerts list
 * @param params - query parameters like { current, size }
 */
export function getAlertList(params?: any): Promise<any> {
  return request({
    url: '/alerts',
    method: 'get',
    params,
  });
}

/**
 * Export alerts list
 */
export function exportAlerts(): Promise<any> {
  return request({
    url: '/alerts/export',
    method: 'get',
  });
}

/**
 * Delete device
 */
export function deleteDevice(id: string | number): Promise<any> {
  return request({
    url: `/devices/${id}`,
    method: 'delete',
  });
}

/**
 * Add device
 */
export function addDevice(data: any): Promise<any> {
  return request({
    url: '/devices',
    method: 'post',
    data,
  });
}

/**
 * Update device
 */
export function updateDevice(id: string | number, data: any): Promise<any> {
  return request({
    url: `/devices/${id}`,
    method: 'put',
    data,
  });
}

/**
 * Handle alert
 */
export function handleAlert(id: string | number): Promise<any> {
  return request({
    url: `/alerts/${id}/handle`,
    method: 'put',
  });
}

/**
 * Delete alert log
 */
export function deleteAlert(id: string | number): Promise<any> {
  return request({
    url: `/alerts/${id}`,
    method: 'delete',
  });
}

/**
 * Clear all alerts
 */
export function clearAllAlerts(): Promise<any> {
  return request({
    url: '/alerts/clear',
    method: 'delete',
  });
}

/**
 * Get recycle bin alert list
 */
export function getRecycleBin(): Promise<any> {
  return request({
    url: '/alerts/recycle-bin',
    method: 'get',
  });
}

/**
 * Restore deleted alert
 */
export function restoreAlert(id: string | number): Promise<any> {
  return request({
    url: `/alerts/${id}/restore`,
    method: 'put',
  });
}

/**
 * Permanently clear recycle bin
 */
export function clearRecycleBinPermanently(): Promise<any> {
  return request({
    url: '/alerts/recycle-bin/clear',
    method: 'delete',
  });
}

/**
 * Get user lists
 */
export function getUserList(): Promise<any> {
  return request({
    url: '/sys-user/list',
    method: 'get',
  });
}

/**
 * Add operator user account
 */
export function addOperatorUser(data: any): Promise<any> {
  return request({
    url: '/sys-user/add',
    method: 'post',
    data,
  });
}

/**
 * Delete operator user account
 */
export function deleteOperatorUser(id: string | number): Promise<any> {
  return request({
    url: `/sys-user/delete/${id}`,
    method: 'delete',
  });
}

/**
 * Reset operator password
 */
export function resetOperatorPassword(id: string | number): Promise<any> {
  return request({
    url: `/sys-user/reset-password/${id}`,
    method: 'post',
  });
}

/**
 * 获取授权人员白名单
 * @param includeDisabled 是否包含禁用人员
 */
export function getAuthorizedUsers(includeDisabled = false): Promise<any> {
  return request({
    url: '/authorized-users',
    method: 'get',
    params: { includeDisabled },
  });
}

/**
 * 新增授权人员（JSON，无照片）
 */
export function addAuthorizedUser(data: {
  userCode: string;
  name: string;
  department?: string;
  avatarUrl?: string;
  status?: number;
}): Promise<any> {
  return request({
    url: '/authorized-users',
    method: 'post',
    data,
  });
}

/**
 * 管理员新增授权人员并上传正脸照片（同步至 AI 人脸库）
 */
export function addAuthorizedUserWithAvatar(form: FormData): Promise<any> {
  return request({
    url: '/authorized-users/with-avatar',
    method: 'post',
    data: form,
    // 不要手动设 Content-Type，由 axios 自动带 multipart boundary
    timeout: 30000,
  });
}

/**
 * 启用/禁用授权人员（同步边缘人脸库）
 */
export function updateAuthorizedUserStatus(id: number, status: 0 | 1): Promise<any> {
  return request({
    url: `/authorized-users/${id}/status`,
    method: 'put',
    params: { status },
  });
}

/**
 * 删除授权人员（同步移除边缘人脸）
 */
export function deleteAuthorizedUser(id: number): Promise<any> {
  return request({
    url: `/authorized-users/${id}`,
    method: 'delete',
  });
}

/**
 * 查询设备门锁/电机状态
 */
export function getDoorStatus(deviceId = 1): Promise<any> {
  return request({
    url: `/devices/${deviceId}/door`,
    method: 'get',
  });
}

/**
 * 远程开锁（下发边缘电机指令）
 */
export function remoteUnlockDoor(deviceId = 1, holdSeconds?: number): Promise<any> {
  return request({
    url: `/devices/${deviceId}/door/unlock`,
    method: 'post',
    params: holdSeconds ? { holdSeconds } : undefined,
  });
}

/**
 * 远程上锁
 */
export function remoteLockDoor(deviceId = 1): Promise<any> {
  return request({
    url: `/devices/${deviceId}/door/lock`,
    method: 'post',
  });
}

export function getEdgeConfig(deviceId = 1): Promise<any> {
  return request({
    url: `/devices/${deviceId}/edge-config`,
    method: 'get',
  });
}

export function saveEdgeConfig(deviceId: number, data: {
  dangerDistanceM: number;
  cooldownSec: number;
  faceMatchThreshold: number;
  tailgateEnabled: boolean;
}): Promise<any> {
  return request({
    url: `/devices/${deviceId}/edge-config`,
    method: 'put',
    data,
  });
}

export function getPassagePage(params?: { current?: number; size?: number }): Promise<any> {
  return request({
    url: '/passages',
    method: 'get',
    params,
  });
}

export function getPassageTodayStats(): Promise<any> {
  return request({
    url: '/passages/stats/today',
    method: 'get',
  });
}
