<script setup>
import { computed, provide, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { getUserInfo, resolveUserRole } from '@/utils/permission'

const route = useRoute()
const authTick = ref(0)

// 路由切换时刷新登录态（登录成功 / 退出登录均会触发）
watch(() => route.fullPath, () => {
  authTick.value++
})

/** 大屏 RBAC 角色：ADMIN（管理员） / OPERATOR（安保） */
const userRole = computed(() => {
  authTick.value
  return resolveUserRole(getUserInfo())
})

const isAdmin = computed(() => userRole.value === 'ADMIN')

provide('userRole', userRole)
provide('isAdmin', isAdmin)
</script>

<template>
  <router-view />
</template>

<style>
body {
  margin: 0;
  padding: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  background-color: #0f1423;
}
</style>
