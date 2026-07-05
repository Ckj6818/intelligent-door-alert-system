import axios from 'axios'
import { ElMessage } from 'element-plus'
import router from '@/router'
import { clearUserInfo } from '@/utils/permission'

const service = axios.create({
  baseURL: '/api',
  timeout: 10000
})

const AUTH_REDIRECT_DELAY = 1500
let redirectTimer = null

const redirectToLogin = (message = '登录过期，请重新登录') => {
  if (redirectTimer) return

  ElMessage.error(message)

  redirectTimer = setTimeout(() => {
    localStorage.removeItem('token')
    clearUserInfo()
    redirectTimer = null

    if (router.currentRoute.value.path !== '/login') {
      router.replace('/login')
    }
  }, AUTH_REDIRECT_DELAY)
}

const isAuthRequest = (config) => config?.url?.includes('/users/login')

const handleAuthFailure = (message, config) => {
  if (isAuthRequest(config)) {
    return Promise.reject(new Error(message || '登录失败，请检查账号密码'))
  }
  redirectToLogin(message || '登录状态异常，请重新登录')
  return Promise.reject(new Error(message))
}

service.interceptors.request.use(
  (config) => {
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

service.interceptors.response.use(
  (response) => {
    const res = response.data

    if (res.code === 200) {
      return res.data
    }

    const message = res.message || res.msg || '请求失败，请稍后重试'

    if (res.code === 401 || res.code === 403) {
      return handleAuthFailure(message, response.config)
    }

    ElMessage.error(message)
    return Promise.reject(new Error(message))
  },
  (error) => {
    const status = error.response?.status
    const config = error.config
    const rawMsg = error.response?.data?.message || error.message || ''
    const messageMap = {
      400: '请求参数错误',
      401: '登录已过期，请重新登录',
      403: '无此操作权限，请重新登录',
      404: '请求资源不存在',
      500: '服务器内部错误',
      502: '网关错误',
      503: '服务不可用'
    }
    const msg = messageMap[status] || `连接异常：${rawMsg}`

    if (rawMsg.includes('CORS') || rawMsg.includes('cors')) {
      ElMessage.error('跨域请求被拒绝，请通过 http://localhost:5173 访问系统')
      return Promise.reject(error)
    }

    if ((status === 401 || status === 403) && !isAuthRequest(config)) {
      return handleAuthFailure(rawMsg || msg, config)
    }

    if ((status === 401 || status === 403) && isAuthRequest(config)) {
      return Promise.reject(new Error(rawMsg || '登录失败，请检查账号密码'))
    }

    ElMessage.error(msg)
    return Promise.reject(error)
  }
)

export default service
