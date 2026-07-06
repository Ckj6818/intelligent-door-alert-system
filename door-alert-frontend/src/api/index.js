import request from '@/utils/request'
import { loginRequest } from '@/api/auth'

/**
 * 用户登录
 * @param {Object} data - { username, password }
 * @returns {Promise<{ token: string }>}
 */
export function login(data) {
  return loginRequest(data)
}

/**
 * 获取设备列表（分页）
 * @param {Object} params - 查询参数，如 { current: 1, size: 10 }
 * @returns {Promise} MyBatis-Plus IPage 格式: { records, total, current, size }
 */
export function getDeviceList(params) {
  return request({
    url: '/devices',
    method: 'get',
    params
  })
}

/**
 * 获取告警日志列表（分页）
 * @param {Object} params - 查询参数，如 { current: 1, size: 10 }
 * @returns {Promise} MyBatis-Plus IPage 格式: { records, total, current, size }
 */
export function getAlertList(params) {
  return request({
    url: '/alerts',
    method: 'get',
    params
  })
}

/**
 * 导出告警列表（需 alert:export 权限）
 */
export function exportAlerts() {
  return request({
    url: '/alerts/export',
    method: 'get'
  })
}

export function deleteDevice(id) {
  return request({
    url: `/devices/${id}`,
    method: 'delete'
  })
}

/**
 * 处理告警（将 status 从 0 更新为 1）
 * @param {number} id - 告警记录主键 ID
 * @returns {Promise}
 */
export function handleAlert(id) {
  return request({
    url: `/alerts/${id}/handle`,
    method: 'put'
  })
}

/** 获取用户列表（管理员专属，可按 role 过滤） */
export function getUserList(params) {
  return request({
    url: '/users',
    method: 'get',
    params
  })
}

/** 新增安保账号（管理员专属） */
export function addOperatorUser(data) {
  return request({
    url: '/users',
    method: 'post',
    data
  })
}

/** 删除安保账号（管理员专属） */
export function deleteOperatorUser(id) {
  return request({
    url: `/users/${id}`,
    method: 'delete'
  })
}

/** 重置安保密码为 123456（管理员专属） */
export function resetOperatorPassword(id) {
  return request({
    url: `/users/${id}/reset-password`,
    method: 'put'
  })
}
