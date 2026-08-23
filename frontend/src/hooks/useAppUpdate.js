// frontend/src/hooks/useAppUpdate.js
import { useEffect, useState } from 'react'
import api from '../api/axios'

// ─── Build-time mode ──────────────────────────────────────────
const IS_CUSTOMER_APP = import.meta.env.VITE_APP_MODE === 'customer'
const IS_WORKER_APP = import.meta.env.VITE_APP_MODE === 'worker'

// ✅ GitHub Actions automatically এই numbers আপডেট করবে
const CURRENT_VERSION_CODE = 277          // Main APK — build-apk.yml আপডেট করে
const CURRENT_CUSTOMER_VERSION_CODE = 352   // Customer APK — build-customer-apk.yml আপডেট করে
const CURRENT_SR_VERSION_CODE = 7           // SR APK — build-sr-apk.yml আপডেট করে (প্রথম রিলিজের আগে 0)

export function useAppUpdate() {
  const [updateInfo, setUpdateInfo] = useState(null)

  useEffect(() => {
    checkForUpdate()
  }, [])

  // ✅ forceUpdate চলাকালীন Android back button block করা
  useEffect(() => {
    if (!updateInfo?.forceUpdate) return

    let listenerHandle = null

    const registerBackHandler = async () => {
      try {
        const { App } = await import('@capacitor/app')
        listenerHandle = await App.addListener('backButton', () => {
          // কিছু করব না — dialog বন্ধ হবে না
        })
      } catch (err) {
        console.log('Back button handler registration failed:', err)
      }
    }

    registerBackHandler()

    return () => {
      listenerHandle?.remove?.()
    }
  }, [updateInfo?.forceUpdate])

  const checkForUpdate = async () => {
    try {
      const isNative = window?.Capacitor?.isNativePlatform?.() ?? false
      if (!isNative) return

      // Customer APK → /api/app/customer-version
      // SR APK      → /api/app/sr-version
      // Main APK    → /api/app/version (আগের মতো)
      const endpoint = IS_CUSTOMER_APP
        ? '/app/customer-version'
        : IS_WORKER_APP
          ? '/app/sr-version'
          : '/app/version'
      const currentCode = IS_CUSTOMER_APP
        ? CURRENT_CUSTOMER_VERSION_CODE
        : IS_WORKER_APP
          ? CURRENT_SR_VERSION_CODE
          : CURRENT_VERSION_CODE

      const res = await api.get(endpoint)
      if (!res.data?.success) return

      const { versionCode, versionName, apkUrl, forceUpdate, changelog } = res.data.data

      if (versionCode > currentCode) {
        setUpdateInfo({ versionName, apkUrl, forceUpdate, changelog })
      }
    } catch (err) {
      console.log('Version check failed:', err)
    }
  }

  const downloadUpdate = () => {
    if (!updateInfo?.apkUrl) return
    window.open(updateInfo.apkUrl, '_blank')
  }

  const dismissUpdate = () => {
    if (updateInfo?.forceUpdate) return
    setUpdateInfo(null)
  }

  return { updateInfo, downloadUpdate, dismissUpdate }
}
