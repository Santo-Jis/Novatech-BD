import { useEffect, useState } from 'react'
import api from '../api/axios'

// GET করে ডেটা আনে। ব্যর্থ হলে failed=true — কার্ড নিজেকে লুকায়, ড্যাশবোর্ডের বাকি অংশ আটকায় না।
export default function useHealth(url, params) {
  const [state, setState] = useState({ data: null, loading: true, failed: false })
  const key = JSON.stringify(params || {})
  useEffect(() => {
    let alive = true
    setState(s => ({ ...s, loading: true, failed: false }))
    api.get(url, { params })
      .then(r => { if (alive) setState({ data: r.data?.data || null, loading: false, failed: false }) })
      .catch(() => { if (alive) setState({ data: null, loading: false, failed: true }) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, key])
  return state
}
