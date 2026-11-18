<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'

const router = useRouter()
const route = useRoute()
const username = ref('')
const password = ref('')
const loading = ref(false)
const verifyingGate = ref(true)
const gateValid = ref(false)
const errorMessage = ref('')

const slugParam = typeof route.params.slug === 'string' ? route.params.slug : ''

interface LoginSuccessResponse {
  success: boolean
  token: string
  expiresAt: number
}

interface LoginErrorResponse {
  error: string
}

async function verifyGateSlug() {
  if (!slugParam) {
    await router.replace('/matches')
    return
  }

  try {
    const res = await fetch(`/api/admin/gate/${encodeURIComponent(slugParam)}`)
    if (res.ok) {
      gateValid.value = true
    } else {
      await router.replace('/matches')
      return
    }
  } catch {
    await router.replace('/matches')
    return
  } finally {
    verifyingGate.value = false
  }
}

onMounted(() => {
  verifyGateSlug()
})

async function handleLogin() {
  if (!username.value.trim()) {
    errorMessage.value = 'Please enter your administrative username.'
    return
  }
  if (!password.value.trim()) {
    errorMessage.value = 'Please enter the administrative password.'
    return
  }

  loading.value = true
  errorMessage.value = ''

  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        slug: slugParam,
        username: username.value.trim(),
        password: password.value.trim(),
      }),
    })

    if (!res.ok) {
      const errData: LoginErrorResponse = await res.json().catch(() => ({ error: 'Authentication failed' }))
      errorMessage.value = errData.error || 'Invalid administrative password.'
      return
    }

    const data: LoginSuccessResponse = await res.json()
    if (data.token) {
      localStorage.setItem('crunch_admin_token', data.token)
      localStorage.setItem('crunch_admin_expires', String(data.expiresAt))
      await router.push({ path: '/matches', query: { admin: '1' } })
    } else {
      errorMessage.value = 'Received invalid token from server.'
    }
  } catch (err) {
    console.error('Login error:', err)
    errorMessage.value = 'Network error while attempting to authenticate.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="gate-container">
    <div v-if="gateValid"
         class="gate-card">
      <div class="gate-header">
        <div class="avatar-wrap">
          <img :src="'/branding/Avatar_no_BG.png'"
               alt="Customs Cruncher Logo"
               class="gate-logo" />
        </div>
        <h1 class="gate-title">Crunch Gate</h1>
        <p class="gate-subtitle">Administrative Management Gateway</p>
      </div>

      <form method="post"
            action="#"
            class="gate-form"
            @submit.prevent="handleLogin">
        <div v-if="errorMessage"
             class="error-banner">
          <span class="error-icon">⚠️</span>
          <span>{{ errorMessage }}</span>
        </div>

        <div class="input-group">
          <label for="admin-user"
                 class="input-label">Username</label>
          <input id="admin-user"
                 name="username"
                 v-model="username"
                 type="text"
                 class="gate-input"
                 placeholder="Enter your username..."
                 autocomplete="username"
                 :disabled="loading"
                 autofocus />
        </div>

        <div class="input-group">
          <label for="admin-pass"
                 class="input-label">Password</label>
          <input id="admin-pass"
                 name="password"
                 v-model="password"
                 type="password"
                 class="gate-input"
                 placeholder="Enter your password..."
                 autocomplete="current-password"
                 :disabled="loading" />
        </div>

        <button type="submit"
                class="gate-btn"
                :disabled="loading">
          <span v-if="loading"
                class="spinner"></span>
          <span v-else>Authenticate & Enter ➜</span>
        </button>
      </form>

      <div class="gate-footer">
        <span class="gate-hint">Restricted to server operators and bot administrators.</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.gate-container {
  min-height: calc(100vh - 200px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem 1rem;
}

.gate-card {
  width: 100%;
  max-width: 440px;
  background: var(--bg-surface, #161e2e);
  border: 1px solid var(--border-subtle, #2d3748);
  border-radius: var(--radius-lg, 16px);
  padding: 2.5rem 2rem;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(255, 255, 255, 0.05);
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.gate-header {
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.avatar-wrap {
  width: 72px;
  height: 72px;
  margin-bottom: 1rem;
  border-radius: 50%;
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.25);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 0 24px rgba(59, 130, 246, 0.2);
}

.gate-logo {
  width: 48px;
  height: 48px;
  object-fit: contain;
}

.gate-title {
  font-size: 1.6rem;
  font-weight: 700;
  color: var(--text-primary, #f8fafc);
  margin: 0;
  letter-spacing: -0.02em;
}

.gate-subtitle {
  font-size: 0.9rem;
  color: var(--text-muted, #94a3b8);
  margin: 0.4rem 0 0 0;
}

.gate-form {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.error-banner {
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.35);
  color: #fca5a5;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  font-size: 0.85rem;
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.error-icon {
  font-size: 1rem;
}

.input-group {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.input-label {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-secondary, #cbd5e1);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.gate-input {
  background: var(--bg-base, #0b0f19);
  border: 1px solid var(--border-subtle, #334155);
  border-radius: 8px;
  padding: 0.8rem 1rem;
  color: var(--text-primary, #f8fafc);
  font-size: 1rem;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.gate-input:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
}

.gate-btn {
  background: linear-gradient(135deg, #2563eb, #1d4ed8);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  color: #ffffff;
  padding: 0.85rem 1.25rem;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.1s, box-shadow 0.15s, opacity 0.15s;
  box-shadow: 0 4px 14px rgba(37, 99, 235, 0.4);
}

.gate-btn:hover:not(:disabled) {
  opacity: 0.95;
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(37, 99, 235, 0.5);
}

.gate-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.spinner {
  width: 18px;
  height: 18px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #ffffff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.gate-footer {
  text-align: center;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  padding-top: 1rem;
}

.gate-hint {
  font-size: 0.75rem;
  color: var(--text-muted, #64748b);
}
</style>
