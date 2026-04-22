import { useState, useEffect, useCallback } from 'react'
import api from '../../api/axios'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Modal from '../../components/ui/Modal'
import Badge from '../../components/ui/Badge'
import toast from 'react-hot-toast'
import {
  FiUsers, FiPlus, FiEdit2, FiTarget, FiUserPlus,
  FiChevronDown, FiChevronUp, FiSearch, FiTrash2,
  FiCheck, FiX, FiTrendingUp
} from 'react-icons/fi'

// ─── ছোট helper ──────────────────────────────────────────
const fmt = n => Number(n || 0).toLocaleString('bn-BD')

// ─── টিম কার্ড ────────────────────────────────────────────
function TeamCard({ team, onEdit, onTarget, onAssignSR, onExpand, expanded }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary to-blue-600 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="text-white font-bold text-lg truncate">{team.name}</h3>
            <p className="text-white/70 text-xs mt-0.5">
              {team.manager_name_bn
                ? `ম্যানেজার: ${team.manager_name_bn} (${team.manager_code})`
                : 'ম্যানেজার নিয়োগ হয়নি'}
            </p>
          </div>
          <span className={`flex-shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${team.is_active ? 'bg-green-400/30 text-green-100' : 'bg-red-400/30 text-red-100'}`}>
            {team.is_active ? 'সক্রিয়' : 'বন্ধ'}
          </span>
        </div>
      </div>

      {/* Stats */}
      <div className="p-4 grid grid-cols-2 gap-3 border-b border-gray-100">
        <div className="bg-blue-50 rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-blue-600">{team.sr_count || 0}</p>
          <p className="text-xs text-blue-500 mt-0.5">মোট SR</p>
        </div>
        <div className="bg-green-50 rounded-xl p-3 text-center">
          <p className="text-lg font-bold text-green-600 leading-tight">৳{fmt(team.monthly_target)}</p>
          <p className="text-xs text-green-500 mt-0.5">মাসিক টার্গেট</p>
        </div>
      </div>

      {/* Actions */}
      <div className="p-3 flex flex-wrap gap-2">
        <button
          onClick={() => onEdit(team)}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <FiEdit2 className="text-sm" /> সম্পাদনা
        </button>
        <button
          onClick={() => onTarget(team)}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs border border-green-200 rounded-xl text-green-600 hover:bg-green-50 transition-colors"
        >
          <FiTarget className="text-sm" /> টার্গেট
        </button>
        <button
          onClick={() => onAssignSR(team)}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs border border-blue-200 rounded-xl text-blue-600 hover:bg-blue-50 transition-colors"
        >
          <FiUserPlus className="text-sm" /> SR যোগ
        </button>
        <button
          onClick={() => onExpand(team.id)}
          className="px-3 py-2 text-xs border border-gray-200 rounded-xl text-gray-500 hover:bg-gray-50 transition-colors"
        >
          {expanded ? <FiChevronUp /> : <FiChevronDown />}
        </button>
      </div>

      {/* SR List (expanded) */}
      {expanded && team.members && (
        <div className="border-t border-gray-100 px-4 pb-4 pt-3 space-y-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">SR তালিকা</p>
          {team.members.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-2">কোনো SR নেই</p>
          ) : (
            team.members.map(sr => (
              <div key={sr.id} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <FiUsers className="text-primary text-xs" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{sr.name_bn}</p>
                    <p className="text-xs text-gray-400 font-mono">{sr.employee_code}</p>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs font-semibold text-green-600">৳{fmt(sr.monthly_target)}</p>
                  <p className="text-xs text-gray-400">টার্গেট</p>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────
export default function AdminTeams() {
  const [teams,     setTeams]     = useState([])
  const [managers,  setManagers]  = useState([])   // টিমহীন ম্যানেজার
  const [unassigned,setUnassigned]= useState([])   // টিমহীন SR
  const [loading,   setLoading]   = useState(true)
  const [search,    setSearch]    = useState('')
  const [expanded,  setExpanded]  = useState({})   // { [teamId]: bool }

  // Modal states
  const [createModal, setCreateModal] = useState(false)
  const [editModal,   setEditModal]   = useState(null)  // team object
  const [targetModal, setTargetModal] = useState(null)  // team object
  const [assignModal, setAssignModal] = useState(null)  // team object
  const [saving,      setSaving]      = useState(false)

  // Form states
  const [form, setForm] = useState({ name: '', manager_id: '', monthly_target: '', description: '' })
  const [targetVal, setTargetVal] = useState('')
  const [selectedSRs, setSelectedSRs] = useState([])
  const [srSearch, setSrSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [teamsRes, mgrRes, srRes] = await Promise.all([
        api.get('/teams'),
        api.get('/teams/available-managers'),
        api.get('/teams/unassigned-srs')
      ])
      setTeams(teamsRes.data.data)
      setManagers(mgrRes.data.data)
      setUnassigned(srRes.data.data)
    } catch {
      toast.error('তথ্য আনতে সমস্যা হয়েছে।')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // টিম expand হলে members লোড করো
  const handleExpand = async (teamId) => {
    if (expanded[teamId]) {
      setExpanded(prev => ({ ...prev, [teamId]: false }))
      return
    }
    try {
      const res = await api.get(`/teams/${teamId}`)
      setTeams(prev => prev.map(t => t.id === teamId ? { ...t, members: res.data.data.members } : t))
      setExpanded(prev => ({ ...prev, [teamId]: true }))
    } catch {
      toast.error('SR তালিকা আনতে সমস্যা।')
    }
  }

  // ─── Create Team ────────────────────────────────────────
  const openCreate = () => {
    setForm({ name: '', manager_id: '', monthly_target: '', description: '' })
    setCreateModal(true)
  }

  const handleCreate = async () => {
    if (!form.name.trim()) { toast.error('টিমের নাম দিন।'); return }
    setSaving(true)
    try {
      await api.post('/teams', {
        ...form,
        monthly_target: parseFloat(form.monthly_target) || 0,
        manager_id: form.manager_id || undefined
      })
      toast.success('টিম তৈরি হয়েছে!')
      setCreateModal(false)
      load()
    } catch (err) {
      toast.error(err?.response?.data?.message || 'সমস্যা হয়েছে।')
    } finally {
      setSaving(false)
    }
  }

  // ─── Edit Team ──────────────────────────────────────────
  const openEdit = (team) => {
    setForm({
      name: team.name,
      manager_id: team.manager_id || '',
      monthly_target: team.monthly_target || '',
      description: team.description || '',
      is_active: team.is_active
    })
    setEditModal(team)
  }

  const handleEdit = async () => {
    setSaving(true)
    try {
      await api.put(`/teams/${editModal.id}`, {
        ...form,
        monthly_target: parseFloat(form.monthly_target) || 0,
        manager_id: form.manager_id || undefined
      })
      toast.success('টিম আপডেট হয়েছে!')
      setEditModal(null)
      load()
    } catch (err) {
      toast.error(err?.response?.data?.message || 'সমস্যা হয়েছে।')
    } finally {
      setSaving(false)
    }
  }

  // ─── Set Target ─────────────────────────────────────────
  const openTarget = (team) => {
    setTargetVal(team.monthly_target || '')
    setTargetModal(team)
  }

  const handleSetTarget = async () => {
    if (!targetVal || isNaN(targetVal)) { toast.error('বৈধ টার্গেট দিন।'); return }
    setSaving(true)
    try {
      await api.patch(`/teams/${targetModal.id}/target`, { monthly_target: parseFloat(targetVal) })
      toast.success('টার্গেট সেট হয়েছে!')
      setTargetModal(null)
      load()
    } catch (err) {
      toast.error(err?.response?.data?.message || 'সমস্যা হয়েছে।')
    } finally {
      setSaving(false)
    }
  }

  // ─── Assign SRs ─────────────────────────────────────────
  const openAssign = async (team) => {
    setAssignModal(team)
    setSelectedSRs([])
    setSrSearch('')
  }

  const toggleSR = (srId) => {
    setSelectedSRs(prev =>
      prev.includes(srId) ? prev.filter(id => id !== srId) : [...prev, srId]
    )
  }

  const handleAssign = async () => {
    if (selectedSRs.length === 0) { toast.error('অন্তত একজন SR বেছে নিন।'); return }
    setSaving(true)
    try {
      await api.put(`/teams/${assignModal.id}/members`, { sr_ids: selectedSRs })
      toast.success(`${selectedSRs.length} জন SR যোগ করা হয়েছে!`)
      setAssignModal(null)
      load()
    } catch (err) {
      toast.error(err?.response?.data?.message || 'সমস্যা হয়েছে।')
    } finally {
      setSaving(false)
    }
  }

  // ─── Filter ─────────────────────────────────────────────
  const filtered = teams.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    (t.manager_name_bn || '').includes(search)
  )

  const filteredSRs = unassigned.filter(sr =>
    sr.name_bn.includes(srSearch) ||
    sr.employee_code?.includes(srSearch) ||
    sr.phone?.includes(srSearch)
  )

  // ─── All managers (for select — existing + available) ───
  const allManagerOptions = [
    ...managers,
    ...(editModal?.manager_id ? [{
      id: editModal.manager_id,
      name_bn: editModal.manager_name_bn,
      employee_code: editModal.manager_code
    }] : [])
  ]

  if (loading) return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="h-52 bg-white rounded-2xl animate-pulse" />
      ))}
    </div>
  )

  return (
    <div className="space-y-5 animate-fade-in">
      {/* ─── Header ─────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">টিম ম্যানেজমেন্ট</h1>
          <p className="text-sm text-gray-500">মোট {teams.length}টি টিম • {unassigned.length} জন SR টিমে নেই</p>
        </div>
        <Button onClick={openCreate} icon={<FiPlus />}>নতুন টিম</Button>
      </div>

      {/* ─── Stats Bar ──────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm text-center">
          <p className="text-2xl font-bold text-primary">{teams.length}</p>
          <p className="text-xs text-gray-500 mt-1">মোট টিম</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm text-center">
          <p className="text-2xl font-bold text-green-600">
            {teams.reduce((s, t) => s + parseInt(t.sr_count || 0), 0)}
          </p>
          <p className="text-xs text-gray-500 mt-1">মোট SR</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm text-center">
          <p className="text-sm font-bold text-orange-600">
            ৳{fmt(teams.reduce((s, t) => s + parseFloat(t.monthly_target || 0), 0))}
          </p>
          <p className="text-xs text-gray-500 mt-1">মোট টার্গেট</p>
        </div>
      </div>

      {/* ─── Search ─────────────────────────────────────── */}
      <Input
        placeholder="টিমের নাম বা ম্যানেজার দিয়ে খুঁজুন"
        icon={<FiSearch />}
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="max-w-sm"
      />

      {/* ─── Team Grid ──────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-gray-100">
          <FiUsers className="text-5xl text-gray-300 mx-auto mb-3" />
          <p className="text-gray-400">কোনো টিম নেই।</p>
          <Button onClick={openCreate} icon={<FiPlus />} className="mt-4">প্রথম টিম তৈরি করুন</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(team => (
            <TeamCard
              key={team.id}
              team={team}
              onEdit={openEdit}
              onTarget={openTarget}
              onAssignSR={openAssign}
              onExpand={handleExpand}
              expanded={!!expanded[team.id]}
            />
          ))}
        </div>
      )}

      {/* ════════════════════════════════════════════════════
          MODAL: নতুন টিম তৈরি
      ════════════════════════════════════════════════════ */}
      <Modal
        isOpen={createModal}
        onClose={() => setCreateModal(false)}
        title="নতুন টিম তৈরি"
        footer={
          <>
            <Button variant="outline" onClick={() => setCreateModal(false)}>বাতিল</Button>
            <Button onClick={handleCreate} loading={saving} icon={<FiCheck />}>তৈরি করুন</Button>
          </>
        }
      >
        <TeamForm
          form={form}
          setForm={setForm}
          managers={managers}
          showTarget
        />
      </Modal>

      {/* ════════════════════════════════════════════════════
          MODAL: টিম সম্পাদনা
      ════════════════════════════════════════════════════ */}
      <Modal
        isOpen={!!editModal}
        onClose={() => setEditModal(null)}
        title={`সম্পাদনা — ${editModal?.name}`}
        footer={
          <>
            <Button variant="outline" onClick={() => setEditModal(null)}>বাতিল</Button>
            <Button onClick={handleEdit} loading={saving} icon={<FiCheck />}>আপডেট করুন</Button>
          </>
        }
      >
        <TeamForm
          form={form}
          setForm={setForm}
          managers={allManagerOptions}
          showTarget
          showStatus
        />
      </Modal>

      {/* ════════════════════════════════════════════════════
          MODAL: টার্গেট সেট
      ════════════════════════════════════════════════════ */}
      <Modal
        isOpen={!!targetModal}
        onClose={() => setTargetModal(null)}
        title={`টার্গেট — ${targetModal?.name}`}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setTargetModal(null)}>বাতিল</Button>
            <Button onClick={handleSetTarget} loading={saving} icon={<FiTrendingUp />}>সেট করুন</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="bg-blue-50 rounded-xl p-4 text-center">
            <p className="text-sm text-blue-600">বর্তমান টার্গেট</p>
            <p className="text-2xl font-bold text-blue-700 mt-1">৳{fmt(targetModal?.monthly_target)}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">নতুন মাসিক টার্গেট (টাকা)</label>
            <Input
              type="number"
              placeholder="যেমন: 500000"
              value={targetVal}
              onChange={e => setTargetVal(e.target.value)}
              icon={<span className="text-gray-400 text-xs font-bold">৳</span>}
            />
          </div>
        </div>
      </Modal>

      {/* ════════════════════════════════════════════════════
          MODAL: SR যোগ করা
      ════════════════════════════════════════════════════ */}
      <Modal
        isOpen={!!assignModal}
        onClose={() => setAssignModal(null)}
        title={`SR যোগ — ${assignModal?.name}`}
        size="lg"
        footer={
          <>
            <span className="text-sm text-gray-500 mr-auto">
              {selectedSRs.length} জন বাছাই করা হয়েছে
            </span>
            <Button variant="outline" onClick={() => setAssignModal(null)}>বাতিল</Button>
            <Button onClick={handleAssign} loading={saving} icon={<FiUserPlus />}>
              যোগ করুন
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input
            placeholder="নাম, কোড বা ফোন দিয়ে খুঁজুন"
            icon={<FiSearch />}
            value={srSearch}
            onChange={e => setSrSearch(e.target.value)}
          />
          {filteredSRs.length === 0 ? (
            <p className="text-center text-gray-400 py-6">টিমহীন কোনো SR নেই</p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {filteredSRs.map(sr => (
                <label key={sr.id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={selectedSRs.includes(sr.id)}
                    onChange={() => toggleSR(sr.id)}
                    className="w-4 h-4 rounded text-primary accent-primary"
                  />
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <FiUsers className="text-primary text-xs" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800">{sr.name_bn}</p>
                    <p className="text-xs text-gray-400 font-mono">{sr.employee_code} • {sr.phone}</p>
                  </div>
                  {selectedSRs.includes(sr.id) && (
                    <FiCheck className="text-primary text-sm flex-shrink-0" />
                  )}
                </label>
              ))}
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}

// ─── Reusable Form ─────────────────────────────────────────
function TeamForm({ form, setForm, managers, showTarget, showStatus }) {
  const set = (key, val) => setForm(prev => ({ ...prev, [key]: val }))

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          টিমের নাম <span className="text-red-500">*</span>
        </label>
        <Input
          placeholder="যেমন: বরিশাল সিটি টিম"
          value={form.name}
          onChange={e => set('name', e.target.value)}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">ম্যানেজার নির্বাচন</label>
        <select
          className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary bg-white"
          value={form.manager_id}
          onChange={e => set('manager_id', e.target.value)}
        >
          <option value="">— ম্যানেজার বাছাই করুন (ঐচ্ছিক) —</option>
          {managers.map(m => (
            <option key={m.id} value={m.id}>
              {m.name_bn} ({m.employee_code})
            </option>
          ))}
        </select>
      </div>

      {showTarget && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">মাসিক টার্গেট (টাকা)</label>
          <Input
            type="number"
            placeholder="যেমন: 500000"
            value={form.monthly_target}
            onChange={e => set('monthly_target', e.target.value)}
            icon={<span className="text-gray-400 text-xs font-bold">৳</span>}
          />
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">বিবরণ (ঐচ্ছিক)</label>
        <textarea
          rows={2}
          placeholder="টিম সম্পর্কে সংক্ষিপ্ত বিবরণ"
          className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
          value={form.description}
          onChange={e => set('description', e.target.value)}
        />
      </div>

      {showStatus && (
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-gray-700">সক্রিয় অবস্থা</label>
          <button
            type="button"
            onClick={() => set('is_active', !form.is_active)}
            className={`relative w-11 h-6 rounded-full transition-colors ${form.is_active ? 'bg-primary' : 'bg-gray-300'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.is_active ? 'translate-x-5' : ''}`} />
          </button>
          <span className="text-sm text-gray-500">{form.is_active ? 'সক্রিয়' : 'বন্ধ'}</span>
        </div>
      )}
    </div>
  )
}
