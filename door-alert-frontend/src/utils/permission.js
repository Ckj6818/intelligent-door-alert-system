/**
 * 前端 RBAC 权限工具：读取登录时缓存的用户角色与权限。
 */

export function getUserInfo() {
  const raw = localStorage.getItem('userInfo')
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function hasRole(role) {
  const user = getUserInfo()
  return Array.isArray(user?.roles) && user.roles.includes(role)
}

export function hasPermission(permission) {
  const user = getUserInfo()
  return Array.isArray(user?.permissions) && user.permissions.includes(permission)
}

/**
 * 解析当前登录用户的大屏角色标识。
 * admin → ADMIN；security 及其他值班账号 → OPERATOR
 */
export function resolveUserRole(user = getUserInfo()) {
  if (!user) return ''
  if (user.username === 'admin' || user.roles?.includes('ADMIN')) {
    return 'ADMIN'
  }
  return 'OPERATOR'
}

export function isAdminUser(user = getUserInfo()) {
  return resolveUserRole(user) === 'ADMIN'
}

export function clearUserInfo() {
  localStorage.removeItem('userInfo')
}

export function saveUserInfo(data) {
  if (!data) return
  localStorage.setItem('userInfo', JSON.stringify({
    userId: data.userId,
    username: data.username,
    nickname: data.nickname,
    role: data.role,
    roles: data.roles || [],
    permissions: data.permissions || []
  }))
}

/** 清除本地登录态（token + 用户信息） */
export function logout() {
  localStorage.removeItem('token')
  clearUserInfo()
}
