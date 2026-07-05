import axios from 'axios'
import { ElMessage } from 'element-plus'

// 创建 axios 实例
const service = axios.create({
  baseURL: 'http://localhost:8081/api',
  timeout: 10000
})

// ==================== 请求拦截器 ====================
service.interceptors.request.use(
  (config) => {
    // 如果本地存储中有 token，则在请求头中携带
    const token = localStorage.getItem('token')
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    console.error('请求发送失败：', error)
    return Promise.reject(error)
  }
)

// ==================== 响应拦截器 ====================
service.interceptors.response.use(
  (response) => {
    const res = response.data

    // 后端统一返回格式 Result<T>: { code, msg, data }
    // code === 200 表示业务成功
    if (res.code === 200) {
      return res.data
    }

    // 业务异常，弹出后端返回的错误信息
    ElMessage.error(res.msg || '请求失败，请稍后重试')

    // 特殊状态码处理（如 401 未授权）
    if (res.code === 401) {
      // 可在此处做登出或跳转登录页的逻辑
      console.warn('登录已过期，请重新登录')
    }

    return Promise.reject(new Error(res.msg || '业务异常'))
  },
  (error) => {
    // HTTP 层面的异常处理
    const status = error.response?.status
    const messageMap = {
      400: '请求参数错误',
      401: '未授权，请重新登录',
      403: '拒绝访问',
      404: '请求资源不存在',
      500: '服务器内部错误',
      502: '网关错误',
      503: '服务不可用'
    }
    const msg = messageMap[status] || `连接异常：${error.message}`
    ElMessage.error(msg)
    return Promise.reject(error)
  }
)

export default service
