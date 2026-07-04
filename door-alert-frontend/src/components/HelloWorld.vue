<script setup>
import { onMounted, ref } from 'vue'
import viteLogo from '../assets/vite.svg'
import heroImg from '../assets/hero.png'
import vueLogo from '../assets/vue.svg'

const count = ref(0)
const apiStatus = ref('检测中...')
const alerts = ref([])
const devices = ref([])

async function loadDashboard() {
  try {
    const [usersRes, alertsRes, devicesRes] = await Promise.all([
      fetch('/api/users?size=5'),
      fetch('/api/alerts?size=5'),
      fetch('/api/devices?size=5'),
    ])
    if (!usersRes.ok || !alertsRes.ok || !devicesRes.ok) {
      throw new Error('接口请求失败')
    }
    const usersData = await usersRes.json()
    const alertsData = await alertsRes.json()
    const devicesData = await devicesRes.json()
    apiStatus.value = `后端已连通 · 用户 ${usersData.data?.total ?? 0} 条 · 告警 ${alertsData.data?.total ?? 0} 条 · 设备 ${devicesData.data?.total ?? 0} 条`
    alerts.value = alertsData.data?.records ?? []
    devices.value = devicesData.data?.records ?? []
  } catch (e) {
    apiStatus.value = `后端未连通：${e.message}`
  }
}

onMounted(loadDashboard)
</script>

<template>
  <section id="center">
    <div class="hero">
      <img :src="heroImg" class="base" width="170" height="179" alt="" />
      <img :src="vueLogo" class="framework" alt="Vue logo" />
      <img :src="viteLogo" class="vite" alt="Vite logo" />
    </div>
    <div>
      <h1>智能门禁安防系统</h1>
      <p class="status">{{ apiStatus }}</p>
      <p>Edit <code>src/App.vue</code> and save to test <code>HMR</code></p>
    </div>
    <button type="button" class="counter" @click="count++">
      Count is {{ count }}
    </button>
  </section>

  <section class="dashboard">
    <div class="panel">
      <h2>最近告警</h2>
      <p v-if="!alerts.length">暂无告警记录</p>
      <ul v-else>
        <li v-for="item in alerts" :key="item.id">
          设备 {{ item.deviceId }} · 危险等级 {{ item.dangerLevel }} · {{ item.createTime }}
        </li>
      </ul>
    </div>
    <div class="panel">
      <h2>设备列表</h2>
      <p v-if="!devices.length">暂无设备</p>
      <ul v-else>
        <li v-for="item in devices" :key="item.id">
          {{ item.deviceName }} · {{ item.location }} · {{ item.status === 1 ? '在线' : '离线' }}
        </li>
      </ul>
    </div>
  </section>

  <div class="ticks"></div>

  <section id="next-steps">
    <div id="docs">
      <svg class="icon" role="presentation" aria-hidden="true">
        <use href="/icons.svg#documentation-icon"></use>
      </svg>
      <h2>Documentation</h2>
      <p>Your questions, answered</p>
      <ul>
        <li>
          <a href="https://vite.dev/" target="_blank">
            <img class="logo" :src="viteLogo" alt="" />
            Explore Vite
          </a>
        </li>
        <li>
          <a href="https://vuejs.org/" target="_blank">
            <img class="button-icon" :src="vueLogo" alt="" />
            Learn more
          </a>
        </li>
      </ul>
    </div>
    <div id="social">
      <svg class="icon" role="presentation" aria-hidden="true">
        <use href="/icons.svg#social-icon"></use>
      </svg>
      <h2>Connect with us</h2>
      <p>Join the Vite community</p>
      <ul>
        <li>
          <a href="https://github.com/vitejs/vite" target="_blank">
            <svg class="button-icon" role="presentation" aria-hidden="true">
              <use href="/icons.svg#github-icon"></use>
            </svg>
            GitHub
          </a>
        </li>
        <li>
          <a href="https://chat.vite.dev/" target="_blank">
            <svg class="button-icon" role="presentation" aria-hidden="true">
              <use href="/icons.svg#discord-icon"></use>
            </svg>
            Discord
          </a>
        </li>
        <li>
          <a href="https://x.com/vite_js" target="_blank">
            <svg class="button-icon" role="presentation" aria-hidden="true">
              <use href="/icons.svg#x-icon"></use>
            </svg>
            X.com
          </a>
        </li>
        <li>
          <a href="https://bsky.app/profile/vite.dev" target="_blank">
            <svg class="button-icon" role="presentation" aria-hidden="true">
              <use href="/icons.svg#bluesky-icon"></use>
            </svg>
            Bluesky
          </a>
        </li>
      </ul>
    </div>
  </section>

  <div class="ticks"></div>
  <section id="spacer"></section>
</template>
