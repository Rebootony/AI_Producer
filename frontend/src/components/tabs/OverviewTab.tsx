import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Target, Clock, DollarSign, Building, Wand2, Loader2, CheckCircle2, FileText, Upload, Save, Pencil } from 'lucide-react';
import { Project, useStore } from '../../store/useStore';

interface BackendProject {
  id: string; name: string; client: string; industry: string; goal: string;
  delivery_date: string; film_type: string; duration_minutes: number;
  shoot_days: number; cost_total: number; margin_rate: number; client_price: number;
  brief_text: string; generated: boolean;
}

const wan = (n: number) => (n / 10000).toFixed(1) + ' 万';

export function OverviewTab({ project }: { project: Project }) {
  const [p, setP] = useState<BackendProject | null>(null);
  const [generating, setGenerating] = useState(false);
  const { updateProject, currentUser } = useStore();
  const isBoss = currentUser?.role === 'boss';

  const fetchProject = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${project.id}?t=${Date.now()}`);
      if (res.ok) setP(await res.json());
    } catch { /* ignore */ }
  }, [project.id]);

  useEffect(() => {
    fetchProject();
    const id = setInterval(fetchProject, 4000);
    return () => clearInterval(id);
  }, [fetchProject]);

  const generate = async () => {
    setGenerating(true);
    try {
      await fetch(`/api/projects/${project.id}/generate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
      });
      await fetchProject();
      const pr = await (await fetch(`/api/projects/${project.id}`)).json();
      updateProject(project.id, { budget: pr.client_price });
    } finally { setGenerating(false); }
  };

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [uploading, setUploading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const flashToast = (regenerated: boolean) => {
    setToast(regenerated
      ? '已根据新 Brief 重新生成报价与排期，看板已同步'
      : 'Brief 已保存（点“生成”后看板按此 Brief 计算）');
    setTimeout(() => setToast(''), 3500);
  };

  const saveBrief = async () => {
    setSyncing(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/brief`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brief_text: draft }),
      });
      const data = await res.json().catch(() => ({}));
      setEditing(false);
      await fetchProject();
      flashToast(!!data?.regenerated);
    } finally {
      setSyncing(false);
    }
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', f);
      const res = await fetch(`/api/projects/${project.id}/brief/upload`, { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      await fetchProject();
      flashToast(!!data?.regenerated);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const generated = p?.generated;
  const goalParts = (p?.goal || '品牌宣传').split(/[：:]/);
  const goalMain = goalParts[0];
  const goalSub = goalParts.slice(1).join('：') || (p?.film_type || '');

  return (
    <div className="p-8 max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-zinc-900 text-white text-sm px-4 py-3 rounded-xl shadow-lg flex items-center animate-in fade-in slide-in-from-bottom-2">
          <CheckCircle2 size={16} className="mr-2 text-green-400" />{toast}
        </div>
      )}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">{p?.name || project.name}</h1>
          <p className="text-zinc-500 mt-2">基于客户 Brief 由 AI 制片智能提取与核算</p>
        </div>
        <span className={`text-xs px-3 py-1.5 rounded-full font-medium ${generated ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
          {generated ? '已生成报价 + 排期' : '待生成'}
        </span>
      </div>

      {/* 生成 CTA（仅老板可生成报价） */}
      {!generated && isBoss && (
        <div className="mb-8 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-6 text-white flex items-center justify-between">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center shrink-0"><Wand2 size={24} /></div>
            <div>
              <h3 className="font-semibold text-lg">一键生成报价 + 排期</h3>
              <p className="text-sm text-blue-100 mt-1 max-w-lg">已读取该项目 Brief。AI 将按价格单拆解 4 段成本、核算实收，并按交付日倒推排期。</p>
            </div>
          </div>
          <button onClick={generate} disabled={generating}
            className="shrink-0 inline-flex items-center px-5 py-2.5 bg-white text-blue-700 rounded-xl font-medium hover:bg-blue-50 disabled:opacity-60">
            {generating ? <Loader2 size={18} className="mr-2 animate-spin" /> : <Wand2 size={18} className="mr-2" />}
            {generating ? '生成中…' : '立即生成'}
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-6 mb-8">
        <Card icon={<Building size={24} />} color="blue" label="客户信息"
          main={p?.client || project.client} sub={p?.industry || project.industry} />
        <Card icon={<DollarSign size={24} />} color="green" label="对客户报价（实收）"
          main={!isBoss ? '🔒 仅老板可见' : generated ? '¥ ' + wan(p!.client_price) : '— 待生成'}
          sub={!isBoss ? '预算信息对员工隐藏' : generated ? `成本 ¥ ${wan(p!.cost_total)} · 利润率 ${Math.round((p!.margin_rate) * 100)}%` : '生成后显示'} />
        <Card icon={<Clock size={24} />} color="orange" label="交付时间"
          main={p?.delivery_date || project.deliveryDate}
          sub={p ? `${p.film_type} · 约 ${p.duration_minutes} 分钟 · 拍摄 ${p.shoot_days} 天` : ''} />
        <Card icon={<Target size={24} />} color="purple" label="核心目标"
          main={goalMain} sub={goalSub} />
      </div>

      {/* Brief：可编辑 + 上传 */}
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-zinc-900 flex items-center"><FileText size={18} className="mr-2 text-zinc-400" />客户 Brief</h3>
          <div className="flex items-center gap-2">
            <input ref={fileRef} type="file" accept=".pdf,.txt,.md,.doc,.docx" className="hidden" onChange={onFile} />
            <button onClick={() => fileRef.current?.click()} disabled={uploading}
              className="text-xs px-3 py-1.5 rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-50 inline-flex items-center">
              {uploading ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : <Upload size={13} className="mr-1.5" />}
              {uploading ? '解析中…' : '上传 Brief'}
            </button>
            {editing ? (
              <button onClick={saveBrief} disabled={syncing}
                className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 inline-flex items-center">
                {syncing ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : <Save size={13} className="mr-1.5" />}
                {syncing ? '同步看板中…' : '保存'}
              </button>
            ) : (
              <button onClick={() => { setDraft(p?.brief_text || ''); setEditing(true); }}
                className="text-xs px-3 py-1.5 rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-50 inline-flex items-center">
                <Pencil size={13} className="mr-1.5" />编辑
              </button>
            )}
          </div>
        </div>
        {editing ? (
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={6}
            className="w-full text-sm text-zinc-700 border border-zinc-200 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-200"
            placeholder="粘贴客户 Brief / 商务沟通记录…" />
        ) : (
          <p className="text-sm text-zinc-600 leading-relaxed whitespace-pre-wrap">{p?.brief_text || '暂无 Brief，可上传或编辑后一键生成报价。'}</p>
        )}
        <ul className="mt-4 space-y-2 border-t border-zinc-100 pt-4">
          {['品牌立意：明确品牌核心定位与主张',
            '内容结构：依据 Brief 拆解脚本大纲与分镜',
            '交付应用：覆盖核心投放与传播场景'].map((t, i) => (
            <li key={i} className="flex items-center text-sm text-zinc-700">
              <CheckCircle2 size={14} className="mr-2 text-blue-500 shrink-0" />{t}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Card({ icon, color, label, main, sub }: { icon: React.ReactNode; color: string; label: string; main: string; sub: string }) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600', green: 'bg-green-50 text-green-600',
    orange: 'bg-orange-50 text-orange-600', purple: 'bg-purple-50 text-purple-600',
  };
  return (
    <div className="p-6 bg-white rounded-2xl border border-zinc-200 shadow-sm flex items-start space-x-4">
      <div className={`p-3 rounded-xl ${colors[color]}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-zinc-500 mb-1">{label}</p>
        <p className="font-semibold text-zinc-900 truncate">{main}</p>
        <p className="text-sm text-zinc-500 mt-0.5">{sub}</p>
      </div>
    </div>
  );
}
