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
