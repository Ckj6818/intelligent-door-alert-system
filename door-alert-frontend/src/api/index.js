import request from '@/utils/request'

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
