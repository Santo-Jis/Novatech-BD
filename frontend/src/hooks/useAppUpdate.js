// frontend/src/hooks/useAppUpdate.js
import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import api from '../api/axios'

// ✅ এই number টা নতুন APK বানালে বাড়াতে হবে
// app.routes.js এর versionCode এর সাথে মিলিয়ে রাখুন
const CURRENT_VERSION_CODE = 1

export function useAppUpdate() {
  const [updateInfo, setUpdateInfo] = useState(null)

  useEffect(() => {
    // শুধু Android App এ check করবে — Web এ না
    if (!Capacitor.isNativePlatform()) return
    checkForUpdate()
  }, [])

  const checkForUpdate = async () => {
    try {
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
    if (updateInfo?.forceUpdate) return
    setUpdateInfo(null)
  }

  return { updateInfo, downloadUpdate, dismissUpdate }
}
