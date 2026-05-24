import { useState, useEffect, useCallback } from "react";
import api from "../../api/axios";

// ─── Helpers ─────────────────────────────────────────────────

// ─── Helpers ─────────────────────────────────────────────────
const fmtDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return "এইমাত্র";
  if (diff < 3600) return `${Math.floor(diff/60)} মিনিট আগে`;
  if (diff < 86400) return `${Math.floor(diff/3600)} ঘণ্টা আগে`;
  if (diff < 604800) return `${Math.floor(diff/86400)} দিন আগে`;
  return d.toLocaleDateString("bn-BD", { day:"2-digit", month:"short", year:"numeric" });
};

const isExpired = (iso) => iso ? new Date(iso) < new Date() : false;

const DeviceIcon = ({ label = "" }) => {
  const l = label.toLowerCase();
  if (l.includes("iphone") || l.includes("android")) return "📱";
  if (l.includes("ipad")) return "⊞";
  if (l.includes("mac") || l.includes("windows") || l.includes("linux")) return "💻";
  return "🖥";
};

// ─── Stat Card ────────────────────────────────────────────────
const StatCard = ({ label, value, accent, sub }) => (
  <div style={{
    background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 14, padding: "20px 24px", flex: 1, minWidth: 140,
    position: "relative", overflow: "hidden",
  }}>
    <div style={{
      position: "absolute", top: 0, left: 0, right: 0, height: 2,
      background: accent || "linear-gradient(90deg,#4ade80,#22d3ee)",
    }} />
    <div style={{ fontSize: 28, fontWeight: 800, color: "#f1f5f9", letterSpacing: -1 }}>{value}</div>
    <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4, fontWeight: 500 }}>{label}</div>
    {sub && <div style={{ fontSize: 11, color: "#4ade80", marginTop: 6 }}>{sub}</div>}
  </div>
);

// ─── Toast ───────────────────────────────────────────────────
const Toast = ({ msg, type, onClose }) => {
  useEffect(() => { const t = setTimeout(onClose, 3000); return () => clearTimeout(t); }, []);
  return (
    <div style={{
      position:"fixed", bottom:28, right:28, zIndex:9999,
      background: type==="error" ? "#ef4444" : "#22c55e",
      color:"#fff", padding:"12px 20px", borderRadius:10,
      fontWeight:600, fontSize:14, boxShadow:"0 8px 32px rgba(0,0,0,0.4)",
      animation: "slideUp .25s ease",
    }}>{msg}</div>
  );
};

// ─── Confirm Modal ────────────────────────────────────────────
const ConfirmModal = ({ title, desc, danger, onConfirm, onCancel, extra }) => (
  <div style={{
    position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", zIndex:1000,
    display:"flex", alignItems:"center", justifyContent:"center", padding:20,
  }}>
    <div style={{
      background:"#1e293b", border:"1px solid rgba(255,255,255,0.1)",
      borderRadius:16, padding:32, maxWidth:420, width:"100%",
      boxShadow:"0 24px 64px rgba(0,0,0,0.6)",
    }}>
      <div style={{ fontSize:20, fontWeight:700, color:"#f1f5f9", marginBottom:10 }}>{title}</div>
      <div style={{ fontSize:14, color:"#94a3b8", lineHeight:1.6, marginBottom: extra?12:24 }}>{desc}</div>
      {extra}
      <div style={{ display:"flex", gap:10 }}>
        <button onClick={onCancel} style={{
          flex:1, padding:"10px 0", borderRadius:8, border:"1px solid rgba(255,255,255,0.12)",
          background:"transparent", color:"#cbd5e1", cursor:"pointer", fontWeight:600,
        }}>বাতিল</button>
        <button onClick={onConfirm} style={{
          flex:1, padding:"10px 0", borderRadius:8, border:"none",
          background: danger ? "#ef4444" : "#3b82f6", color:"#fff", cursor:"pointer", fontWeight:600,
        }}>নিশ্চিত করুন</button>
      </div>
    </div>
  </div>
);

// ─── Device Row ───────────────────────────────────────────────
const DeviceRow = ({ device, onRevoke, onRestore }) => {
  const icon = DeviceIcon({ label: device.device_label });
  return (
    <div style={{
      display:"flex", alignItems:"center", gap:14, padding:"14px 18px",
      background: device.is_active ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.015)",
      borderRadius:10, border:`1px solid ${device.is_active ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.04)"}`,
      opacity: device.is_active ? 1 : 0.55,
    }}>
      <span style={{ fontSize:22 }}>{icon}</span>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:14, fontWeight:600, color: device.is_active ? "#e2e8f0" : "#64748b" }}>
          {device.device_label}
        </div>
        <div style={{ fontSize:12, color:"#64748b", marginTop:2 }}>
          {device.google_email} · যোগ {fmtDate(device.added_at)}
        </div>
      </div>
      <div style={{ textAlign:"right", flexShrink:0 }}>
        <div style={{ fontSize:11, color:"#64748b" }}>সর্বশেষ</div>
        <div style={{ fontSize:12, color:"#94a3b8", fontWeight:500 }}>
          {fmtDate(device.last_used_at)}
        </div>
      </div>
      <div style={{
        padding:"3px 10px", borderRadius:20, fontSize:11, fontWeight:700,
        background: device.is_active ? "rgba(74,222,128,0.12)" : "rgba(100,116,139,0.12)",
        color: device.is_active ? "#4ade80" : "#64748b",
        border: `1px solid ${device.is_active ? "rgba(74,222,128,0.25)" : "rgba(100,116,139,0.2)"}`,
      }}>
        {device.is_active ? "সক্রিয়" : "বাতিল"}
      </div>
      {device.is_active ? (
        <button onClick={() => onRevoke(device)} style={{
          padding:"6px 14px", borderRadius:7, border:"1px solid rgba(239,68,68,0.3)",
          background:"rgba(239,68,68,0.08)", color:"#f87171", cursor:"pointer",
          fontSize:12, fontWeight:600, whiteSpace:"nowrap",
        }}>Revoke</button>
      ) : (
        <button onClick={() => onRestore(device)} style={{
          padding:"6px 14px", borderRadius:7, border:"1px solid rgba(59,130,246,0.3)",
          background:"rgba(59,130,246,0.08)", color:"#60a5fa", cursor:"pointer",
          fontSize:12, fontWeight:600, whiteSpace:"nowrap",
        }}>Restore</button>
      )}
    </div>
  );
};

// ─── Customer Detail Drawer ───────────────────────────────────
const CustomerDrawer = ({ customer, onClose, onDeviceChange }) => {
  const [devices, setDevices]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [confirm, setConfirm]       = useState(null);
  const [toast, setToast]           = useState(null);
  const [alsoRevoke, setAlsoRevoke] = useState(false);
  const [acting, setActing]         = useState(false);

  const showToast = (msg, type="success") => setToast({ msg, type });

  // ── Fetch devices from real API ──
  useEffect(() => {
    setLoading(true);
    api.get(`/admin/portal-devices/${customer.id}`)
      .then(res => setDevices(res.data.data || []))
      .catch(() => showToast("ডিভাইস তথ্য আনতে সমস্যা।", "error"))
      .finally(() => setLoading(false));
  }, [customer.id]);

  const doRevoke = async (device) => {
    setActing(true);
    try {
      await api.delete(`/admin/portal-devices/${customer.id}/${device.id}`);
      setDevices(ds => ds.map(d => d.id === device.id ? { ...d, is_active: false } : d));
      showToast(`"${device.device_label}" revoke করা হয়েছে।`);
      onDeviceChange();
    } catch (err) {
      showToast(err?.response?.data?.message || "সমস্যা হয়েছে।", "error");
    } finally {
      setActing(false);
      setConfirm(null);
    }
  };

  const doRestore = async (device) => {
    setActing(true);
    try {
      await api.patch(`/admin/portal-devices/${customer.id}/${device.id}/restore`);
      setDevices(ds => ds.map(d => d.id === device.id ? { ...d, is_active: true } : d));
      showToast(`"${device.device_label}" পুনরায় সক্রিয় করা হয়েছে।`);
      onDeviceChange();
    } catch (err) {
      showToast(err?.response?.data?.message || "সমস্যা হয়েছে।", "error");
    } finally {
      setActing(false);
      setConfirm(null);
    }
  };

  const doRevokeAll = async () => {
    setActing(true);
    try {
      await api.delete(`/admin/portal-devices/${customer.id}`, {
        data: { also_revoke_link: alsoRevoke }
      });
      setDevices(ds => ds.map(d => ({ ...d, is_active: false })));
      showToast(`সব device revoke করা হয়েছে।${alsoRevoke ? " Link-ও বাতিল।" : ""}`);
      onDeviceChange();
    } catch (err) {
      showToast(err?.response?.data?.message || "সমস্যা হয়েছে।", "error");
    } finally {
      setActing(false);
      setConfirm(null);
      setAlsoRevoke(false);
    }
  };

  const activeCount   = devices.filter(d=>d.is_active).length;
  const inactiveCount = devices.filter(d=>!d.is_active).length;
  const linkExp       = isExpired(customer.link_expires_at);

  return (
    <div style={{
      position:"fixed", inset:0, background:"rgba(0,0,0,0.65)", zIndex:500,
      display:"flex", justifyContent:"flex-end",
    }} onClick={e=>{ if(e.target===e.currentTarget) onClose(); }}>
      <div style={{
        width: Math.min(560, window.innerWidth), height:"100%",
        background:"#0f172a", borderLeft:"1px solid rgba(255,255,255,0.08)",
        overflowY:"auto", display:"flex", flexDirection:"column",
        animation:"slideIn .25s ease",
      }}>
        {/* Header */}
        <div style={{
          padding:"24px 28px 20px", borderBottom:"1px solid rgba(255,255,255,0.07)",
          position:"sticky", top:0, background:"#0f172a", zIndex:10,
        }}>
          <div style={{ display:"flex", alignItems:"flex-start", gap:14 }}>
            <div style={{
              width:46, height:46, borderRadius:12, background:"linear-gradient(135deg,#3b82f6,#6366f1)",
              display:"flex", alignItems:"center", justifyContent:"center",
              fontSize:20, flexShrink:0,
            }}>🏪</div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:16, fontWeight:700, color:"#f1f5f9" }}>{customer.shop_name}</div>
              <div style={{ fontSize:12, color:"#64748b", marginTop:2 }}>
                {customer.owner_name} · {customer.customer_code}
              </div>
              {customer.portal_email && (
                <div style={{
                  marginTop:6, fontSize:11, color:"#60a5fa", display:"inline-flex",
                  alignItems:"center", gap:5, background:"rgba(59,130,246,0.1)",
                  padding:"3px 10px", borderRadius:20, border:"1px solid rgba(59,130,246,0.2)",
                }}>
                  🔒 {customer.portal_email}
                </div>
              )}
            </div>
            <button onClick={onClose} style={{
              background:"rgba(255,255,255,0.05)", border:"none", color:"#94a3b8",
              cursor:"pointer", borderRadius:8, padding:"6px 10px", fontSize:18,
            }}>✕</button>
          </div>

          {/* Info badges */}
          <div style={{ display:"flex", gap:8, marginTop:14, flexWrap:"wrap" }}>
            <span style={{
              padding:"4px 10px", borderRadius:20, fontSize:11, fontWeight:600,
              background:"rgba(74,222,128,0.1)", color:"#4ade80", border:"1px solid rgba(74,222,128,0.2)",
            }}>✓ {activeCount} সক্রিয় device</span>
            {inactiveCount > 0 && (
              <span style={{
                padding:"4px 10px", borderRadius:20, fontSize:11, fontWeight:600,
                background:"rgba(100,116,139,0.1)", color:"#94a3b8", border:"1px solid rgba(100,116,139,0.2)",
              }}>✗ {inactiveCount} বাতিল</span>
            )}
            {customer.last_login && (
              <span style={{
                padding:"4px 10px", borderRadius:20, fontSize:11,
                background:"rgba(255,255,255,0.04)", color:"#94a3b8", border:"1px solid rgba(255,255,255,0.07)",
              }}>সর্বশেষ: {fmtDate(customer.last_login)}</span>
            )}
            {customer.link_expires_at && (
              <span style={{
                padding:"4px 10px", borderRadius:20, fontSize:11, fontWeight:600,
                background: linkExp ? "rgba(239,68,68,0.1)" : "rgba(251,191,36,0.1)",
                color: linkExp ? "#f87171" : "#fbbf24",
                border: `1px solid ${linkExp ? "rgba(239,68,68,0.2)" : "rgba(251,191,36,0.2)"}`,
              }}>{linkExp ? "⚠ Link মেয়াদ শেষ" : `Link চলবে: ${fmtDate(customer.link_expires_at)}`}</span>
            )}
          </div>
        </div>

        {/* Body */}
        <div style={{ padding:"20px 28px", flex:1 }}>
          {loading ? (
            <div style={{ textAlign:"center", padding:"60px 0", color:"#475569" }}>
              <div style={{ fontSize:28, marginBottom:12, animation:"spin 1s linear infinite", display:"inline-block" }}>⟳</div>
              <div style={{ fontSize:13 }}>ডিভাইস লোড হচ্ছে…</div>
            </div>
          ) : (
            <>
          {/* Revoke all action */}
          {activeCount > 0 && (
            <div style={{
              background:"rgba(239,68,68,0.06)", border:"1px solid rgba(239,68,68,0.15)",
              borderRadius:10, padding:"14px 18px", marginBottom:20,
              display:"flex", alignItems:"center", justifyContent:"space-between", gap:12,
            }}>
              <div>
                <div style={{ fontSize:13, fontWeight:600, color:"#f87171" }}>সব Device Revoke</div>
                <div style={{ fontSize:11, color:"#94a3b8", marginTop:2 }}>
                  কাস্টমার নতুন করে Google login করতে বাধ্য হবে
                </div>
              </div>
              <button onClick={()=>setConfirm("all")} disabled={acting} style={{
                padding:"8px 16px", borderRadius:8, border:"1px solid rgba(239,68,68,0.4)",
                background:"rgba(239,68,68,0.15)", color:"#f87171", cursor:"pointer",
                fontSize:12, fontWeight:700, whiteSpace:"nowrap", opacity: acting ? 0.6 : 1,
              }}>সব Revoke</button>
            </div>
          )}

          {/* Device list */}
          <div style={{ fontSize:13, fontWeight:600, color:"#64748b", marginBottom:10, letterSpacing:1, textTransform:"uppercase" }}>
            Devices ({devices.length})
          </div>

          {devices.length === 0 ? (
            <div style={{
              textAlign:"center", padding:"40px 0", color:"#475569", fontSize:14,
            }}>
              <div style={{ fontSize:32, marginBottom:10 }}>📵</div>
              কোনো device নেই
            </div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {devices.map(device => (
                <DeviceRow
                  key={device.id}
                  device={device}
                  onRevoke={d => setConfirm({type:"single", device:d})}
                  onRestore={d => setConfirm({type:"restore", device:d})}
                />
              ))}
            </div>
          )}
            </>
          )}
        </div>
      </div>

      {/* Confirm modals */}
      {confirm === "all" && (
        <ConfirmModal
          title="সব Device Revoke?"
          desc={`${customer.shop_name}-এর সব ${activeCount}টি সক্রিয় device বাতিল হবে।`}
          danger
          extra={
            <label style={{ display:"flex", alignItems:"center", gap:10, marginBottom:18, cursor:"pointer" }}>
              <input type="checkbox" checked={alsoRevoke} onChange={e=>setAlsoRevoke(e.target.checked)}
                style={{ width:16, height:16, accentColor:"#ef4444", cursor:"pointer" }} />
              <span style={{ fontSize:13, color:"#94a3b8" }}>
                বিদ্যমান JWT-ও বাতিল করুন <span style={{color:"#f87171"}}>(তাৎক্ষণিক logout)</span>
              </span>
            </label>
          }
          onConfirm={doRevokeAll}
          onCancel={()=>{ setConfirm(null); setAlsoRevoke(false); }}
        />
      )}
      {confirm?.type === "single" && (
        <ConfirmModal
          title={`"${confirm.device.device_label}" Revoke?`}
          desc="এই device থেকে আর login হবে না। পুনরায় Restore করা যাবে।"
          danger
          onConfirm={() => doRevoke(confirm.device)}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm?.type === "restore" && (
        <ConfirmModal
          title={`"${confirm.device.device_label}" Restore?`}
          desc="এই device থেকে আবার portal-এ login করা যাবে।"
          danger={false}
          onConfirm={() => doRestore(confirm.device)}
          onCancel={() => setConfirm(null)}
        />
      )}

      {toast && <Toast {...toast} onClose={()=>setToast(null)} />}
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────
export default function PortalDeviceManager() {
  const [tab, setTab]             = useState("overview");
  const [search, setSearch]       = useState("");
  const [filter, setFilter]       = useState("all");
  const [selected, setSelected]   = useState(null);
  const [customers, setCustomers] = useState([]);
  const [stats, setStats]         = useState(null);
  const [recent, setRecent]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [toast, setToast]         = useState(null);

  const showToast = (msg, type="success") => setToast({ msg, type });

  // Fetch overview (stats + recent logins + customer list)
  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [overviewRes, listRes] = await Promise.all([
        api.get("/admin/portal-devices/stats"),
        api.get("/admin/portal-devices"),
      ]);
      setStats(overviewRes.data.data || overviewRes.data);
      setRecent(overviewRes.data.recent_logins || []);
      setCustomers(listRes.data.data || []);
    } catch {
      showToast("তথ্য লোড করতে সমস্যা হয়েছে।", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const filtered = customers.filter(c => {
    const q = search.toLowerCase();
    const matchSearch = !search || [c.shop_name, c.owner_name, c.customer_code]
      .some(f => f?.toLowerCase().includes(q));
    const matchFilter =
      filter === "all" ? true :
      filter === "yes" ? c.active_device_count > 0 :
      c.active_device_count === 0;
    return matchSearch && matchFilter;
  });

  // After device action inside drawer, refresh customer list to update badge counts
  const refreshCustomer = () => { fetchAll(); };

  return (
    <div style={{
      minHeight: "100vh",
      background: "#080f1e",
      color: "#e2e8f0",
      fontFamily: "'DM Sans', 'Noto Sans Bengali', sans-serif",
      padding: "0 0 60px",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=Noto+Sans+Bengali:wght@400;500;600;700&display=swap');
        @keyframes slideIn { from { transform: translateX(100%); opacity:0; } to { transform: translateX(0); opacity:1; } }
        @keyframes slideUp { from { transform: translateY(20px); opacity:0; } to { transform: translateY(0); opacity:1; } }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: #0f172a; }
        ::-webkit-scrollbar-thumb { background: #334155; border-radius: 3px; }
        input::placeholder { color: #475569; }
        button { transition: opacity .15s; }
        button:hover { opacity: .85; }
      `}</style>

      {/* Top bar */}
      <div style={{
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        padding: "20px 32px 0",
        background: "linear-gradient(180deg, #0d1829 0%, #080f1e 100%)",
      }}>
        <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
          <div style={{
            width:38, height:38, borderRadius:10,
            background:"linear-gradient(135deg,#3b82f6,#6366f1)",
            display:"flex", alignItems:"center", justifyContent:"center", fontSize:18,
          }}>🛡</div>
          <div>
            <div style={{ fontSize:18, fontWeight:800, color:"#f1f5f9", letterSpacing:-0.5 }}>
              Portal Device Management
            </div>
            <div style={{ fontSize:12, color:"#475569" }}>কাস্টমার ডিভাইস নিয়ন্ত্রণ করুন</div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display:"flex", gap:0 }}>
          {[["overview","📊 Overview"],["list","📋 Device List"]].map(([t,label])=>(
            <button key={t} onClick={()=>setTab(t)} style={{
              padding:"10px 22px", background:"none", border:"none", cursor:"pointer",
              color: tab===t ? "#60a5fa" : "#64748b",
              fontWeight: tab===t ? 700 : 500, fontSize:14,
              borderBottom: `2px solid ${tab===t ? "#3b82f6" : "transparent"}`,
              transition:"all .2s",
            }}>{label}</button>
          ))}
        </div>
      </div>

      <div style={{ padding:"28px 32px", maxWidth:1100, margin:"0 auto" }}>

        {/* ── Overview Tab ── */}
        {tab === "overview" && (
          <div>
            {/* Stats */}
            {loading ? (
              <div style={{ display:"flex", gap:12, flexWrap:"wrap", marginBottom:28 }}>
                {[...Array(4)].map((_,i) => (
                  <div key={i} style={{ flex:1, minWidth:140, height:90, background:"rgba(255,255,255,0.03)", borderRadius:14, animation:"pulse 1.5s ease infinite" }} />
                ))}
              </div>
            ) : (
              <div style={{ display:"flex", gap:12, flexWrap:"wrap", marginBottom:28 }}>
                <StatCard label="মোট Portal কাস্টমার" value={stats?.total_portal_customers ?? "—"}
                  accent="linear-gradient(90deg,#60a5fa,#818cf8)" />
                <StatCard label="Active Device আছে" value={stats?.customers_with_active_device ?? "—"}
                  accent="linear-gradient(90deg,#4ade80,#22d3ee)"
                  sub={`${stats?.total_active_devices ?? 0} টি device`} />
                <StatCard label="সক্রিয় (৭ দিন)" value={stats?.active_last_7_days ?? "—"}
                  accent="linear-gradient(90deg,#fb923c,#f59e0b)" />
                <StatCard label="সক্রিয় (৩০ দিন)" value={stats?.active_last_30_days ?? "—"}
                  accent="linear-gradient(90deg,#c084fc,#e879f9)" />
              </div>
            )}

            {/* Recent logins */}
            <div style={{
              background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.07)",
              borderRadius:14, overflow:"hidden",
            }}>
              <div style={{
                padding:"16px 20px", borderBottom:"1px solid rgba(255,255,255,0.06)",
                display:"flex", alignItems:"center", justifyContent:"space-between",
              }}>
                <div style={{ fontSize:14, fontWeight:700, color:"#e2e8f0" }}>সাম্প্রতিক Login</div>
                <button onClick={()=>setTab("list")} style={{
                  fontSize:12, color:"#60a5fa", background:"none", border:"none", cursor:"pointer", fontWeight:600,
                }}>সব দেখুন →</button>
              </div>
              {recent.length === 0 ? (
                <div style={{ padding:"32px 20px", textAlign:"center", color:"#475569", fontSize:13 }}>
                  {loading ? "লোড হচ্ছে…" : "সাম্প্রতিক login নেই।"}
                </div>
              ) : recent.map((r,i) => (
                <div key={i} style={{
                  display:"flex", alignItems:"center", gap:14,
                  padding:"12px 20px",
                  borderBottom: i < recent.length-1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                }}>
                  <div style={{
                    width:36, height:36, borderRadius:9,
                    background:`hsl(${i*67+200},50%,25%)`,
                    display:"flex", alignItems:"center", justifyContent:"center",
                    fontSize:15, flexShrink:0,
                  }}>🏪</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:"#e2e8f0" }}>
                      {r.shop_name}
                      <span style={{ color:"#64748b", fontWeight:400, marginLeft:8, fontSize:12 }}>
                        {r.customer_code}
                      </span>
                    </div>
                    <div style={{ fontSize:11, color:"#64748b", marginTop:1 }}>{r.portal_email}</div>
                  </div>
                  <div style={{ fontSize:12, color:"#94a3b8", textAlign:"right" }}>
                    {fmtDate(r.last_login)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Device List Tab ── */}
        {tab === "list" && (
          <div>
            {/* Filters */}
            <div style={{ display:"flex", gap:10, marginBottom:18, flexWrap:"wrap" }}>
              <input
                value={search} onChange={e=>setSearch(e.target.value)}
                placeholder="Shop, মালিক বা কোড দিয়ে খুঁজুন..."
                style={{
                  flex:1, minWidth:220, padding:"10px 16px", borderRadius:9,
                  border:"1px solid rgba(255,255,255,0.09)", background:"rgba(255,255,255,0.04)",
                  color:"#e2e8f0", fontSize:14, outline:"none",
                }}
              />
              {["all","yes","no"].map(f => (
                <button key={f} onClick={()=>setFilter(f)} style={{
                  padding:"10px 18px", borderRadius:9, cursor:"pointer", fontWeight:600, fontSize:13,
                  border:`1px solid ${filter===f ? "rgba(99,102,241,0.5)" : "rgba(255,255,255,0.08)"}`,
                  background: filter===f ? "rgba(99,102,241,0.15)" : "rgba(255,255,255,0.03)",
                  color: filter===f ? "#a5b4fc" : "#64748b",
                }}>
                  {f==="all" ? "সব" : f==="yes" ? "✓ Device আছে" : "✗ Device নেই"}
                </button>
              ))}
              <div style={{
                display:"flex", alignItems:"center", fontSize:12, color:"#475569",
                padding:"0 4px",
              }}>{filtered.length} জন কাস্টমার</div>
            </div>

            {/* Table */}
            <div style={{
              background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.07)",
              borderRadius:14, overflow:"hidden",
            }}>
              {/* Header */}
              <div style={{
                display:"grid", gridTemplateColumns:"1fr 1fr 120px 120px 100px",
                padding:"12px 20px", gap:12,
                borderBottom:"1px solid rgba(255,255,255,0.07)",
                fontSize:11, fontWeight:700, color:"#475569", textTransform:"uppercase", letterSpacing:1,
              }}>
                <div>কাস্টমার</div><div>Gmail</div><div>Device</div><div>সর্বশেষ Login</div><div style={{textAlign:"right"}}>Action</div>
              </div>

              {filtered.length === 0 && (
                <div style={{ textAlign:"center", padding:"40px 0", color:"#475569", fontSize:14 }}>
                  <div style={{ fontSize:28, marginBottom:8 }}>🔍</div>
                  কোনো কাস্টমার পাওয়া যায়নি
                </div>
              )}

              {filtered.map((c, i) => (
                <div key={c.id} style={{
                  display:"grid", gridTemplateColumns:"1fr 1fr 120px 120px 100px",
                  padding:"14px 20px", gap:12, alignItems:"center",
                  borderBottom: i < filtered.length-1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                  cursor:"pointer", transition:"background .15s",
                }}
                  onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.03)"}
                  onMouseLeave={e=>e.currentTarget.style.background="transparent"}
                  onClick={()=>setSelected(c)}
                >
                  <div>
                    <div style={{ fontSize:13, fontWeight:600, color:"#e2e8f0" }}>{c.shop_name}</div>
                    <div style={{ fontSize:11, color:"#64748b", marginTop:1 }}>
                      {c.owner_name} · {c.customer_code}
                    </div>
                  </div>
                  <div style={{ fontSize:12, color:"#94a3b8" }}>
                    {c.portal_email || <span style={{color:"#334155"}}>লগইন হয়নি</span>}
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                    {c.active_device_count > 0 ? (
                      <>
                        <span style={{
                          width:22, height:22, borderRadius:6, background:"rgba(74,222,128,0.15)",
                          display:"flex", alignItems:"center", justifyContent:"center",
                          fontSize:11, fontWeight:800, color:"#4ade80",
                        }}>{c.active_device_count}</span>
                        <span style={{ fontSize:11, color:"#64748b" }}>
                          {c.total_device_count > c.active_device_count && `/${c.total_device_count}`}
                        </span>
                      </>
                    ) : (
                      <span style={{ fontSize:12, color:"#334155" }}>—</span>
                    )}
                  </div>
                  <div style={{ fontSize:12, color:"#94a3b8" }}>{fmtDate(c.last_login)}</div>
                  <div style={{ textAlign:"right" }}>
                    <button onClick={e=>{e.stopPropagation();setSelected(c);}} style={{
                      padding:"5px 12px", borderRadius:7, fontSize:11, fontWeight:600, cursor:"pointer",
                      border:"1px solid rgba(255,255,255,0.09)", background:"rgba(255,255,255,0.04)",
                      color:"#94a3b8",
                    }}>Manage</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Drawer */}
      {selected && (
        <CustomerDrawer
          customer={selected}
          onClose={()=>setSelected(null)}
          onDeviceChange={refreshCustomer}
        />
      )}

      {toast && <Toast {...toast} onClose={()=>setToast(null)} />}
    </div>
  );
}
