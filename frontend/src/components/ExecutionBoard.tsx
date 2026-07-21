import React, { useEffect, useState, useCallback } from 'react';
import { Users, AlertTriangle, Check, X, Download, FileCheck, ArrowRight, Sparkles } from 'lucide-react';
import { displayStatus } from '../taskStatus';
import { useStore } from '../store/useStore';

interface Person {
  name: string; title: string; current_task: string; status: string; status_cn: string;
  deadline: string; overdue: boolean; next_task: string; today_submit: string;
  progress: number; risk: string; noah_action: string;
}
interface Review {
  id: number; title: string; owner: string; submitter: string; submitted_at: string;
  has_file: boolean; submission_filename: string; submission: string;
}
interface DynData {
  people: Person[]; pending_review: Review[];
  progress: { total: number; done: number; rate: number; overdue: number };
}

export function ExecutionBoard({ projectId }: { projectId: string }) {
  const [data, setData] = useState<DynData | null>(null);
  const setActiveTab = useStore((s) => s.setActiveTab);

  const fetchDyn = useCallback(async () => {
    try {
      const r = await fetch(`/api/projects/${projectId}/dynamics?t=${Date.now()}`);
      if (r.ok) setData(await r.json());
    } catch { /* ignore */ }
  }, [projectId]);

  useEffect(() => {
    fetchDyn();
    const id = setInterval(fetchDyn, 5000);   // 执行端一动，Boss 端 5 秒内看到
    return () => clearInterval(id);
  }, [fetchDyn]);

  const [busy, setBusy] = useState<number | null>(null);
  const approve = async (id: number) => {
    setBusy(id);
    try { await fetch(`/api/tasks/${id}/approve`, { method: 'POST' }); await fetchDyn(); }
    finally { setBusy(null); }
  };
  const reject = async (id: number) => {
    const reason = window.prompt('退回该任务，请填写修改意见（必填）：', '');
    if (reason === null) return;
    if (!reason.trim()) { window.alert('退回必须填写修改意见'); return; }
    setBusy(id);
    try {
      await fetch(`/api/tasks/${id}/reject`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note: reason }) });
      await fetchDyn();
    } finally { setBusy(null); }
  };

  if (!data || data.progress.total === 0) return null;
  const pg = data.progress;

  return (
    <div className="mb-8 space-y-4">
      {/* 待你审核（成果提交，通过/退回；保留审核闭环） */}
      {data.pending_review.length > 0 && (
        <div className="bg-white rounded-2xl border-2 border-amber-200 shadow-sm overflow-hidden">
          <div className="bg-amber-50 px-5 py-3 flex items-center gap-2 border-b border-amber-100">
            <FileCheck size={16} className="text-amber-600" />
            <span className="font-semibold text-amber-900">待你审核</span>
            <span className="text-xs text-amber-700">{data.pending_review.length} 项成果已提交，请通过或退回</span>
          </div>
          <div className="divide-y divide-zinc-100">
            {data.pending_review.map((r) => (
              <div key={r.id} className="flex items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-zinc-800 truncate">{r.title}</div>
                  <div className="text-xs text-zinc-500 mt-0.5 flex items-center gap-2 flex-wrap">
                    <span>{r.owner || r.submitter} 提交 {r.submitted_at}</span>
                    {r.has_file && <a href={`/api/tasks/${r.id}/submission`} className="inline-flex items-center gap-1 text-blue-600 hover:underline"><FileCheck size={12} />{r.submission_filename}<Download size={11} /></a>}
                    {!r.has_file && r.submission && <span className="text-zinc-400">“{r.submission}”</span>}
                  </div>
                </div>
                <button onClick={() => approve(r.id)} disabled={busy === r.id}
                  className="text-xs px-2.5 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700 inline-flex items-center disabled:opacity-60"><Check size={13} className="mr-1" />通过</button>
                <button onClick={() => reject(r.id)} disabled={busy === r.id}
                  className="text-xs px-2.5 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 inline-flex items-center disabled:opacity-60"><X size={13} className="mr-1" />退回</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 执行动态：以人为核心，每个成员当前在做什么 */}
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-zinc-900 flex items-center">
            <Users size={18} className="mr-2 text-zinc-400" />执行动态 · 团队现在在做什么
          </h3>
          <button onClick={() => setActiveTab('timeline')} className="text-sm text-blue-600 hover:underline inline-flex items-center">
            查看完整执行排期<ArrowRight size={14} className="ml-1" />
          </button>
        </div>

        {/* 项目完成率 */}
        <div className="mb-5">
          <div className="flex justify-between text-sm mb-1.5">
            <span className="text-zinc-600">项目完成率</span>
            <span className="font-semibold text-zinc-900">{pg.rate}%（{pg.done}/{pg.total}）{pg.overdue > 0 && <span className="text-red-500 ml-2">· {pg.overdue} 项逾期</span>}</span>
          </div>
          <div className="h-2 bg-zinc-100 rounded-full overflow-hidden">
            <div className="h-full bg-blue-600 rounded-full transition-all duration-500" style={{ width: `${pg.rate}%` }} />
          </div>
        </div>

        {/* 每个人一行 */}
        <div className="space-y-3">
          {data.people.map((p, i) => {
            const st = displayStatus(p.status, p.overdue);
            return (
              <div key={i} className={`flex items-start gap-3 p-3 rounded-xl border ${p.overdue ? 'border-red-200 bg-red-50/40' : 'border-zinc-100'}`}>
                <div className="w-9 h-9 rounded-full bg-zinc-800 text-white text-xs flex items-center justify-center shrink-0">{p.name.slice(-2)}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-zinc-900 text-sm">{p.name}</span>
                    {p.title && <span className="text-[11px] px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-500">{p.title}</span>}
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${st.style}`}>{st.label}</span>
                  </div>
                  <div className="text-sm text-zinc-700 mt-1">正在：{p.current_task}</div>
                  <div className="text-xs text-zinc-500 mt-0.5 flex items-center gap-x-3 gap-y-0.5 flex-wrap">
                    {p.deadline && <span className={p.overdue ? 'text-red-500 font-medium' : ''}>{p.overdue && <AlertTriangle size={11} className="inline mr-0.5" />}截止 {p.deadline}</span>}
                    <span>进度 {p.progress}%</span>
                    <span>下一步：{p.next_task}</span>
                    {p.today_submit && <span className="text-blue-600">今日提交：{p.today_submit}</span>}
                    {p.noah_action && <span className="text-amber-600 inline-flex items-center"><Sparkles size={11} className="mr-0.5" />{p.noah_action}</span>}
                  </div>
                </div>
              </div>
            );
          })}
          {data.people.length === 0 && <p className="text-sm text-zinc-400 text-center py-4">暂无进行中的执行动态。</p>}
        </div>
      </div>
    </div>
  );
}
