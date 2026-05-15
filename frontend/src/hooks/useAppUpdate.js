// frontend/src/hooks/useAppUpdate.js
import { useEffect, useState } from 'react'
import api from '../api/axios'

// ✅ GitHub Actions automatically এই number আপডেট করবে
const CURRENT_VERSION_CODE = 283

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
      // cleanup: listener সরিয়ে দাও
      listenerHandle?.remove?.()
    }
  }, [updateInfo?.forceUpdate])

  const checkForUpdate = async () => {
    try {
      const isNative = window?.Capacitor?.isNativePlatform?.() ?? false
      if (!isNative) return

      const res = await api.get('/app/version')
      if (!res.data?.success) return

      const { versionCode, versionName, apkUrl, forceUpdate, changelog } = res.data.data

      if (versionCode > CURRENT_VERSION_CODE) {
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
    if (updateInfo?.forceUpdate) return // forceUpdate হলে dismiss করতে দেবে না
    setUpdateInfo(null)
  }

  return { updateInfo, downloadUpdate, dismissUpdate }
}
