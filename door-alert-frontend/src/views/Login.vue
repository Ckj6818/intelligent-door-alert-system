<script setup>
import { reactive, ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { login } from '@/api/index'
import { clearUserInfo, saveUserInfo, saveUserRole } from '@/utils/permission'

const router = useRouter()
const loading = ref(false)

const form = reactive({
  username: '',
  password: ''
})

onMounted(() => {
  localStorage.removeItem('token')
  clearUserInfo()
})

const onSubmit = async () => {
  if (!form.username.trim() || !form.password.trim()) {
    ElMessage.warning('请输入用户名和密码')
    return
  }

  loading.value = true
  try {
    const username = form.username.trim()
    const data = await login({
      username,
      password: form.password.trim()
    })
    if (!data?.token) {
      ElMessage.error('登录失败：未获取到 token')
      return
    }
    localStorage.setItem('token', data.token)
    saveUserInfo(data)
    // 明确写入大屏角色，供 Dashboard 按钮权限隔离
    saveUserRole({ ...data, username: data.username || username })
    ElMessage.success('登录成功')
    router.replace('/dashboard')
  } catch (error) {
    ElMessage.error(error.message || '登录失败，请检查账号密码')
    console.error('登录失败', error)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-page">
    <div class="login-bg-glow"></div>
    <div class="login-card">
      <div class="card-glow"></div>
      <div class="login-header">
        <h1 class="login-title">智能门禁安防系统</h1>
        <p class="login-subtitle">SECURE ACCESS CONTROL TERMINAL</p>
      </div>

      <el-form class="login-form" @submit.prevent="onSubmit">
        <el-form-item>
          <el-input
            v-model="form.username"
            placeholder="用户名"
            size="large"
            clearable
            class="dark-input"
          >
            <template #prefix>
              <span class="input-icon">👤</span>
            </template>
          </el-input>
        </el-form-item>

        <el-form-item>
          <el-input
            v-model="form.password"
            type="password"
            placeholder="密码"
            size="large"
            show-password
            class="dark-input"
            @keyup.enter="onSubmit"
          >
            <template #prefix>
              <span class="input-icon">🔒</span>
            </template>
          </el-input>
        </el-form-item>

        <el-button
          type="primary"
          size="large"
          class="login-btn"
          :loading="loading"
          @click="onSubmit"
        >
          登 录
        </el-button>
      </el-form>

      <div class="login-hint">管理员：admin / 123456　安保：security / 123456</div>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  position: relative;
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(ellipse at top, #141e38 0%, #0f1423 45%, #0a0a0c 100%);
  overflow: hidden;
}

.login-bg-glow {
  position: absolute;
  width: 600px;
  height: 600px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(59, 130, 246, 0.15) 0%, transparent 70%);
  top: 20%;
  left: 50%;
  transform: translateX(-50%);
  pointer-events: none;
}

.login-card {
  position: relative;
  width: 420px;
  padding: 48px 40px 36px;
  border-radius: 12px;
  border: 1px solid #1a2f56;
  background: rgba(16, 24, 48, 0.85);
  box-shadow: 0 0 40px rgba(0, 150, 255, 0.12);
  backdrop-filter: blur(12px);
}

.card-glow {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 70%;
  height: 2px;
  background: linear-gradient(90deg, transparent, #3b82f6, #60a5fa, #3b82f6, transparent);
  box-shadow: 0 0 16px rgba(59, 130, 246, 0.8);
}

.login-header {
  text-align: center;
  margin-bottom: 36px;
}

.login-title {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  letter-spacing: 3px;
  color: #f1f5f9;
  text-shadow: 0 0 20px rgba(59, 130, 246, 0.5);
}

.login-subtitle {
  margin: 8px 0 0;
  font-size: 10px;
  letter-spacing: 3px;
  color: #64748b;
}

.login-form {
  margin-top: 8px;
}

.login-form :deep(.el-form-item) {
  margin-bottom: 22px;
}

.dark-input :deep(.el-input__wrapper) {
  background: rgba(20, 28, 52, 0.6) !important;
  border: 1px solid #1a2f56;
  box-shadow: none !important;
  transition: border-color 0.3s ease, box-shadow 0.3s ease;
}

.dark-input :deep(.el-input__wrapper:hover),
.dark-input :deep(.el-input__wrapper.is-focus) {
  border-color: #3b82f6;
  box-shadow: 0 0 12px rgba(59, 130, 246, 0.25) !important;
}

.dark-input :deep(.el-input__inner) {
  color: #e2e8f0;
}

.dark-input :deep(.el-input__inner::placeholder) {
  color: #64748b;
}

.input-icon {
  font-size: 14px;
  opacity: 0.7;
}

.login-btn {
  width: 100%;
  height: 44px;
  margin-top: 8px;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 6px;
  border: none;
  background: linear-gradient(135deg, #2563eb, #3b82f6);
  box-shadow: 0 0 20px rgba(59, 130, 246, 0.4);
  transition: box-shadow 0.3s ease, transform 0.2s ease;
}

.login-btn:hover {
  box-shadow: 0 0 28px rgba(59, 130, 246, 0.6);
  transform: translateY(-1px);
}

.login-hint {
  margin-top: 24px;
  text-align: center;
  font-size: 12px;
  color: #475569;
  letter-spacing: 1px;
}
</style>
