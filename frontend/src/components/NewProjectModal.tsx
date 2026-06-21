import React, { useState } from 'react';
import { X, Loader2, FolderPlus } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}

export function NewProjectModal({ open, onClose, onCreated }: Props) {
  const [form, setForm] = useState({
    name: '', client: '', industry: '', delivery_date: '',
    film_type: '宣传片', duration_minutes: 5, shoot_days: 2,
  });
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, name: form.name.trim() }),
      });
      const data = await res.json();
      if (data.id) onCreated(data.id);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="w-full max-w-lg bg-white rounded-2xl p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-semibold text-zinc-900 flex items-center">
            <FolderPlus size={20} className="mr-2 text-blue-600" />新建项目
          </h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700"><X size={20} /></button>
        </div>
        <p className="text-sm text-zinc-500 mb-5">先填基本信息建项目；客户 Brief 可以建完之后再在项目里上传，然后一键生成报价+排期。</p>

        <div className="space-y-4">
          <Field label="项目名称 *">
            <input autoFocus value={form.name} onChange={(e) => set('name', e.target.value)}
              placeholder="如：某品牌 2026 春节 TVC"
              className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="客户">
              <input value={form.client} onChange={(e) => set('client', e.target.value)}
                placeholder="客户名称"
                className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
            </Field>
            <Field label="行业">
              <input value={form.industry} onChange={(e) => set('industry', e.target.value)}
                placeholder="如 消费电子 / 地产"
                className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Field label="交付日期">
              <input type="date" value={form.delivery_date} onChange={(e) => set('delivery_date', e.target.value)}
                className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
            </Field>
            <Field label="影片性质">
              <input value={form.film_type} onChange={(e) => set('film_type', e.target.value)}
                className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
            </Field>
            <Field label="拍摄天数">
              <input type="number" min={1} value={form.shoot_days} onChange={(e) => set('shoot_days', Number(e.target.value))}
                className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
            </Field>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm text-zinc-600 rounded-lg hover:bg-zinc-100">取消</button>
          <button onClick={submit} disabled={!form.name.trim() || saving}
            className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 inline-flex items-center">
            {saving ? <Loader2 size={16} className="mr-2 animate-spin" /> : null}创建项目
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-zinc-500 mb-1.5">{label}</label>
      {children}
    </div>
  );
}
