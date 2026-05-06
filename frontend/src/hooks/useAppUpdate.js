// frontend/src/hooks/useAppUpdate.js
import { useEffect, useState } from 'react'
import api from '../api/axios'

// ✅ GitHub Actions automatically এই number আপডেট করবে
const CURRENT_VERSION_CODE = 65

export function useAppUpdate() {
  const [updateInfo, setUpdateInfo] = useState(null)

  useEffect(() => {
    checkForUpdate()
  }, [])

  const checkForUpdate = async () => {
    try {
      // ✅ Capacitor static import করা হয়নি
      // Web এ window.Capacitor থাকে না — তাই Web এ কিছু হবে না
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
    if (updateInfo?.forceUpdate) return
    setUpdateInfo(null)
  }

  return { updateInfo, downloadUpdate, dismissUpdate }
}
