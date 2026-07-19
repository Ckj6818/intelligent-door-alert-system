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
