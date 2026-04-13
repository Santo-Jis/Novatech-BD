import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import api from '../../api/axios'
import Button from '../../components/ui/Button'
import Input, { Select, Textarea } from '../../components/ui/Input'
import { Card } from '../../components/ui/Badge'
import toast from 'react-hot-toast'
import { FiSave, FiArrowLeft, FiCamera, FiPlus, FiTrash2 } from 'react-icons/fi'

export default function EmployeeForm() {
  const navigate    = useNavigate()
  const { id }      = useParams()
  const isEdit      = !!id
  const [loading,   setLoading]   = useState(false)
  const [fetching,  setFetching]  = useState(isEdit)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [photoFile,    setPhotoFile]    = useState(null)

  const [form, setForm] = useState({
    role: 'worker', name_bn: '', name_en: '', father_name: '', mother_name: '',
    email: '', phone: '', phone2: '', dob: '', gender: 'male',
    marital_status: 'single', nid: '',
    permanent_address: '', current_address: '', district: '', thana: '',
    basic_salary: '', manager_id: '',
    skills: { bangla_communication: 'medium', english_communication: 'low', smartphone: 'medium', ms_office: 'low', motorcycle: false, motorcycle_license: '' },
    education: [{ exam: 'SSC', board: '', year: '', gpa: '' }],
    experience: [],
    emergency_contact: { name: '', relation: '', phone: '', address: '' }
  })

  useEffect(() => {
    if (isEdit) {
      api.get(`/employees/${id}`)
        .then(res => {
          const emp = res.data.data
          // DB থেকে JSON fields string হিসেবে আসতে পারে - parse করতে হবে
          const parseJSON = (val, fallback) => {
            if (!val) return fallback
            if (typeof val === 'string') { try { return JSON.parse(val) } catch { return fallback } }
            return val
          }
          emp.education         = parseJSON(emp.education, [{ exam: 'SSC', board: '', year: '', gpa: '' }])
          emp.experience        = parseJSON(emp.experience, [])
          emp.skills            = parseJSON(emp.skills, { bangla_communication: 'medium', english_communication: 'low', smartphone: 'medium', ms_office: 'low', motorcycle: false, motorcycle_license: '' })
          emp.emergency_contact = parseJSON(emp.emergency_contact, { name: '', relation: '', phone: '', address: '' })
          setForm(prev => ({ ...prev, ...emp }))
          if (emp.profile_photo) setPhotoPreview(emp.profile_photo)
        })
        .finally(() => setFetching(false))
    }
  }, [id])

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }))

  const handlePhotoChange = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  const addEducation = () => setForm(prev => ({
    ...prev,
    education: [...prev.education, { exam: '', board: '', year: '', gpa: '' }]
  }))

  const addExperience = () => setForm(prev => ({
    ...prev,
    experience: [...prev.experience, { company: '', position: '', duration: '', details: '' }]
  }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const formData = new FormData()
      Object.entries(form).forEach(([k, v]) => {
        if (typeof v === 'object' && !(v instanceof File)) {
          formData.append(k, JSON.stringify(v))
        } else if (v !== '' && v !== null && v !== undefined) {
          formData.append(k, v)
        }
      })
      if (photoFile) formData.append('profile_photo', photoFile)

      if (isEdit) {
        await api.put(`/employees/${id}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } })
        toast.success('তথ্য আপডেট হয়েছে।')
      } else {
        await api.post('/employees', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
        toast.success('কর্মচারী তৈরি হয়েছে। অনুমোদনের অপেক্ষায়।')
      }
      navigate('/admin/employees')
    } catch (err) {
      // পুরনো archived কর্মচারী → reactivate করার সুযোগ দাও
      if (err.response?.data?.code === 'ARCHIVED_EXISTS') {
        const existingId = err.response.data.data.existing_id
        const confirmed  = window.confirm(
          `${err.response.data.message}\n\nহ্যাঁ চাপলে তাকে পুনরায় যুক্ত করা হবে এবং নতুন পাসওয়ার্ড Email এ যাবে।`
        )
        if (confirmed) {
          try {
            const res = await api.put(`/employees/${existingId}/reactivate`)
            toast.success(res.data.message)
            navigate('/admin/employees')
          } catch {
            toast.error('পুনরায় যুক্ত করতে সমস্যা হয়েছে।')
          }
        }
      } else {
        toast.error(err.response?.data?.message || 'সমস্যা হয়েছে।')
      }
    } finally {
      setLoading(false)
    }
  }

  if (fetching) return <div className="h-96 bg-white rounded-2xl animate-pulse" />

  const roleOptions = [
    { value: 'worker', label: 'SR (Worker)' },
    { value: 'manager', label: 'Manager' },
    { value: 'supervisor', label: 'Supervisor' },
    { value: 'asm', label: 'ASM' },
    { value: 'rsm', label: 'RSM' },
    { value: 'accountant', label: 'Accountant' },
  ]

  return (
    <div className="max-w-3xl mx-auto space-y-5 animate-fade-in">

      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-gray-100">
          <FiArrowLeft />
        </button>
        <h1 className="text-xl font-bold text-gray-800">
          {isEdit ? 'কর্মচারী সম্পাদনা' : 'নতুন কর্মচারী'}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* Photo + Basic */}
        <Card title="ব্যক্তিগত তথ্য">
          <div className="flex gap-6 mb-5">
            {/* Photo */}
            <label className="cursor-pointer flex-shrink-0">
              <div className="w-24 h-24 rounded-2xl bg-gray-100 border-2 border-dashed border-gray-300 flex flex-col items-center justify-center overflow-hidden hover:border-primary transition-colors">
                {photoPreview
                  ? <img src={photoPreview} alt="" className="w-full h-full object-cover" />
                  : <>
                      <FiCamera className="text-2xl text-gray-400" />
                      <span className="text-xs text-gray-400 mt-1">ছবি</span>
                    </>
                }
              </div>
              <input type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" />
            </label>

            <div className="flex-1 grid grid-cols-2 gap-3">
              <Select label="পদবী" required options={roleOptions} value={form.role} onChange={e => set('role', e.target.value)} />
              <Input label="মূল বেতন (৳)" type="number" value={form.basic_salary} onChange={e => set('basic_salary', e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input label="পূর্ণ নাম (বাংলায়)" required value={form.name_bn} onChange={e => set('name_bn', e.target.value)} />
            <Input label="পূর্ণ নাম (ইংরেজিতে)" required value={form.name_en} onChange={e => set('name_en', e.target.value)} />
            <Input label="পিতার নাম" value={form.father_name} onChange={e => set('father_name', e.target.value)} />
            <Input label="মাতার নাম" value={form.mother_name} onChange={e => set('mother_name', e.target.value)} />
            <Input label="জন্ম তারিখ" type="date" value={form.dob} onChange={e => set('dob', e.target.value)} />
            <Input label="NID নম্বর" value={form.nid} onChange={e => set('nid', e.target.value)} />
            <Select label="লিঙ্গ" value={form.gender} onChange={e => set('gender', e.target.value)}
              options={[{ value: 'male', label: 'পুরুষ' }, { value: 'female', label: 'মহিলা' }, { value: 'other', label: 'অন্যান্য' }]}
            />
            <Select label="বৈবাহিক অবস্থা" value={form.marital_status} onChange={e => set('marital_status', e.target.value)}
              options={[{ value: 'single', label: 'অবিবাহিত' }, { value: 'married', label: 'বিবাহিত' }]}
            />
          </div>
        </Card>

        {/* Contact */}
        <Card title="যোগাযোগ ও ঠিকানা">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input label="মোবাইল নম্বর ১" required type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} />
            <Input label="মোবাইল নম্বর ২" type="tel" value={form.phone2} onChange={e => set('phone2', e.target.value)} />
            <Input label="ইমেইল" type="email" value={form.email} onChange={e => set('email', e.target.value)} />
            <Input label="জেলা" value={form.district} onChange={e => set('district', e.target.value)} />
            <Input label="থানা/উপজেলা" value={form.thana} onChange={e => set('thana', e.target.value)} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
            <Textarea label="স্থায়ী ঠিকানা" rows={2} value={form.permanent_address} onChange={e => set('permanent_address', e.target.value)} />
            <Textarea label="বর্তমান ঠিকানা" rows={2} value={form.current_address} onChange={e => set('current_address', e.target.value)} />
          </div>
        </Card>

        {/* Education */}
        <Card title="শিক্ষাগত যোগ্যতা"
          action={<button type="button" onClick={addEducation} className="text-sm text-primary flex items-center gap-1"><FiPlus /> যোগ করুন</button>}
        >
          <div className="space-y-3">
            {form.education.map((edu, i) => (
              <div key={i} className="grid grid-cols-2 md:grid-cols-4 gap-2 p-3 bg-gray-50 rounded-xl">
                <Input placeholder="পরীক্ষা (SSC/HSC)" value={edu.exam} onChange={e => {
                  const arr = [...form.education]; arr[i].exam = e.target.value; set('education', arr)
                }} />
                <Input placeholder="বোর্ড" value={edu.board} onChange={e => {
                  const arr = [...form.education]; arr[i].board = e.target.value; set('education', arr)
                }} />
                <Input placeholder="পাসের বছর" type="number" value={edu.year} onChange={e => {
                  const arr = [...form.education]; arr[i].year = e.target.value; set('education', arr)
                }} />
                <div className="flex gap-2">
                  <Input placeholder="GPA" value={edu.gpa} onChange={e => {
                    const arr = [...form.education]; arr[i].gpa = e.target.value; set('education', arr)
                  }} />
                  {i > 0 && (
                    <button type="button" onClick={() => set('education', form.education.filter((_, j) => j !== i))}
                      className="text-red-400 hover:text-red-600">
                      <FiTrash2 />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Emergency Contact */}
        <Card title="জরুরি যোগাযোগ">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Input label="নাম" value={form.emergency_contact.name}
              onChange={e => set('emergency_contact', { ...form.emergency_contact, name: e.target.value })} />
            <Input label="সম্পর্ক" value={form.emergency_contact.relation}
              onChange={e => set('emergency_contact', { ...form.emergency_contact, relation: e.target.value })} />
            <Input label="মোবাইল" value={form.emergency_contact.phone}
              onChange={e => set('emergency_contact', { ...form.emergency_contact, phone: e.target.value })} />
            <Input label="ঠিকানা" value={form.emergency_contact.address}
              onChange={e => set('emergency_contact', { ...form.emergency_contact, address: e.target.value })} />
          </div>
        </Card>

        {/* Submit */}
        <div className="flex gap-3 justify-end">
          <Button variant="ghost" onClick={() => navigate(-1)}>বাতিল</Button>
          <Button type="submit" loading={loading} icon={<FiSave />}>
            {isEdit ? 'আপডেট করুন' : 'জমা দিন'}
          </Button>
        </div>
      </form>
    </div>
  )
}
