// frontend/src/components/AppUpdateDialog.jsx
import { useAppUpdate } from '../hooks/useAppUpdate'

export default function AppUpdateDialog() {
  const { updateInfo, downloadUpdate, dismissUpdate } = useAppUpdate()

  if (!updateInfo) return null

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '0 24px',
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, padding: 24,
        width: '100%', maxWidth: 340,
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 16,
            background: '#eff6ff', display: 'inline-flex',
            alignItems: 'center', justifyContent: 'center',
            fontSize: 32,
          }}>🔄</div>
        </div>

        <h2 style={{
          textAlign: 'center', fontSize: 18, fontWeight: 700,
          color: '#1f2937', margin: '0 0 8px',
        }}>নতুন আপডেট এসেছে!</h2>

        <p style={{
          textAlign: 'center', fontSize: 13, color: '#6b7280',
          margin: '0 0 12px',
        }}>Version {updateInfo.versionName}</p>

        <div style={{
          background: '#f9fafb', borderRadius: 8, padding: '10px 14px',
          marginBottom: 20, fontSize: 13, color: '#4b5563', lineHeight: 1.6,
        }}>
          {updateInfo.changelog}
        </div>

        {updateInfo.forceUpdate && (
          <p style={{
            textAlign: 'center', fontSize: 12, color: '#ef4444',
            marginBottom: 16, fontWeight: 600,
          }}>⚠️ এই আপডেট বাধ্যতামূলক</p>
        )}

        <button
          onClick={downloadUpdate}
          style={{
            width: '100%', padding: '12px',
            background: '#3b82f6', color: '#fff',
            border: 'none', borderRadius: 10,
            fontSize: 15, fontWeight: 700, cursor: 'pointer',
            marginBottom: updateInfo.forceUpdate ? 0 : 10,
          }}
        >⬇️ এখনই আপডেট করুন</button>

        {!updateInfo.forceUpdate && (
          <button
            onClick={dismissUpdate}
            style={{
              width: '100%', padding: '10px',
              background: 'transparent', color: '#9ca3af',
              border: 'none', borderRadius: 10,
              fontSize: 14, cursor: 'pointer',
            }}
          >পরে করব</button>
        )}
      </div>
    </div>
  )
}
