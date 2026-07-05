import React, { useEffect, useState, useCallback } from 'react';
import { useStore } from '../store/useStore';
import { CheckCircle2, Clock, AlertTriangle, Upload, MessageSquare, Inbox, CalendarClock, Bot } from 'lucide-react';
import { cn } from '../utils';

interface Task {
  id: number; project_id: string; project_name: string; title: string; description: string;
  stage: string; deliverable: string; start_date: string; deadline: string; priority: string; status: string;
  ai_note: string; submission: string;
  collaborators: string; background: string; requirements: string; ref_material: string;
}

const STATUS_CN: Record<string, string> = { pending: '待办', in_progress: '进行中', submitted: '已提交', done: '已完成', revision: '待修改' };
const PRIO_CLS: Record<string, string> = { 高: 'bg-red-50 text-red-600', 中: 'bg-amber-50 text-amber-600', 低: 'bg-zinc-100 text-zinc-500' };

function deadlineInfo(d: string) {
  if (!d) return { label: '无截止', cls: 'text-zinc-400' };
  const days = Math.ceil((new Date(d + 'T00:00:00').getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000);
  if (days < 0) return { label: `逾期 ${-days} 天`, cls: 'text-red-600 font-medium' };
  if (days === 0) return { label: '今天截止', cls: 'text-orange-600 font-medium' };
  if (days <= 2) return { label: `剩 ${days} 天`, cls: 'text-orange-600' };
  return { label: `剩 ${days} 天`, cls: 'text-zinc-500' };
}

export function EmployeeWorkbench() {
  const { currentUser } = useStore();
  const [tasks, setTasks] = useState<Task[]>([]);

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch(`/api/tasks?assignee=employee&t=${Date.now()}`);
      if (res.ok) setTasks((await res.json()).tasks || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchTasks();
    const id = setInterval(fetchTasks, 4000);
    return () => clearInterval(id);
  }, [fetchTasks]);

  const submit = async (t: Task) => {
    const note = window.prompt(`提交「${t.title}」的成果说明（可留空）：`, '');
    if (note === null) return;
    await fetch(`/api/tasks/${t.id}/submit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note }) });
    await fetchTasks();
  };
  const feedback = async (t: Task) => {
    const note = window.prompt(`就「${t.title}」向项目经理诺亚反馈什么问题？`, '');
    if (!note) return;
    await fetch(`/api/tasks/${t.id}/feedback`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note }) });
    window.alert('已反馈给项目经理诺亚。');
  };
  const start = async (t: Task) => {
    await fetch(`/api/tasks/${t.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'in_progress' }) });
    await fetchTasks();
  };

  const active = tasks.filter((t) => ['pending', 'in_progress', 'revision'].includes(t.status));
  const submitted = tasks.filter((t) => t.status === 'submitted');
  const done = tasks.filter((t) => t.status === 'done');
  const today = active.filter((t) => { const di = deadlineInfo(t.deadline); return di.label === '今天截止' || di.label.startsWith('逾期'); });
  // 今日聚焦：进行中/待办里按截止日排序，取最近的几条作为个人计划
  const focusPlan = [...active].sort((a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999')).slice(0, 6);

  return (
    <div className="flex-1 overflow-y-auto bg-zinc-50/50 p-8">
      <div className="max-w-4xl mx-auto animate-in fade-in duration-500">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-zinc-900">我的任务工作台</h1>
          <p className="text-zinc-500 mt-1.5">{currentUser?.name}，这里只显示派给你的任务、日程与交付标准。</p>
        </div>

        <div className="grid grid-cols-4 gap-4 mb-8">
          <Stat icon={<CalendarClock size={18} />} color="orange" label="今天/逾期" value={today.length} />
          <Stat icon={<Clock size={18} />} color="blue" label="进行中/待办" value={active.length} />
          <Stat icon={<Inbox size={18} />} color="purple" label="已提交待审" value={submitted.length} />
          <Stat icon={<CheckCircle2 size={18} />} color="green" label="已完成" value={done.length} />
        </div>

        {focusPlan.length > 0 && (
          <div className="mb-8 bg-white rounded-2xl border border-zinc-200 shadow-sm p-5">
            <h2 className="font-semibold text-zinc-900 flex items-center mb-3"><CalendarClock size={17} className="mr-2 text-blue-500" />今日聚焦 · 我的计划</h2>
            <div className="space-y-1.5">
              {focusPlan.map((t) => {
                const di = deadlineInfo(t.deadline);
                return (
                  <div key={t.id} className="flex items-center gap-3 py-1.5 border-b border-zinc-50 last:border-0">
                    <span className="text-xs text-zinc-400 w-36 shrink-0 tabular-nums">{t.start_date || '—'} → {t.deadline || '—'}</span>
                    <span className="text-sm text-zinc-800 flex-1 truncate">{t.title}</span>
                    <span className="text-[11px] px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-500 shrink-0">{STATUS_CN[t.status] || t.status}</span>
                    <span className={cn('text-xs shrink-0 w-20 text-right', di.cls)}>{di.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tasks.length === 0 && (
          <div className="bg-white rounded-2xl border border-dashed border-zinc-300 p-12 text-center text-zinc-400">
            还没有派给你的任务。等项目经理生成项目排期后，你的任务会出现在这里。
          </div>
        )}

        {active.length > 0 && <Section title="待办与进行中">{active.map((t) => <Card key={t.id} t={t} onStart={start} onSubmit={submit} onFeedback={feedback} />)}</Section>}
        {submitted.length > 0 && <Section title="已提交 · 等待审核">{submitted.map((t) => <Card key={t.id} t={t} onSubmit={submit} onFeedback={feedback} />)}</Section>}
        {done.length > 0 && <Section title="已完成">{done.map((t) => <Card key={t.id} t={t} onFeedback={feedback} />)}</Section>}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h2 className="text-sm font-semibold text-zinc-500 mb-3">{title}</h2>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Card({ t, onStart, onSubmit, onFeedback }: { t: Task; onStart?: (t: Task) => void; onSubmit?: (t: Task) => void; onFeedback?: (t: Task) => void }) {
  const di = deadlineInfo(t.deadline);
  return (
    <div className={cn('bg-white rounded-2xl border shadow-sm p-5', t.status === 'revision' ? 'border-amber-200' : 'border-zinc-200')}>
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-zinc-900">{t.title}</h3>
            <span className={cn('text-[11px] px-1.5 py-0.5 rounded', PRIO_CLS[t.priority] || PRIO_CLS['中'])}>{t.priority}优先</span>
            <span className="text-[11px] px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-500">{STATUS_CN[t.status] || t.status}</span>
          </div>
          <p className="text-xs text-zinc-400 mt-1">{t.project_name} · {t.stage}阶段</p>
        </div>
        <div className={cn('text-sm shrink-0 ml-3 flex items-center', di.cls)}><Clock size={13} className="mr-1" />{di.label}</div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
        <div><span className="text-zinc-400">周期：</span><span className="text-zinc-700">{t.start_date || '—'} → {t.deadline || '—'}</span></div>
        <div><span className="text-zinc-400">协作人：</span><span className="text-zinc-700">{t.collaborators || '—'}</span></div>
        <div className="col-span-2"><span className="text-zinc-400">交付标准：</span><span className="text-zinc-700">{t.deliverable || '—'}</span></div>
      </div>
      {t.requirements && <p className="text-sm text-zinc-600 mt-2"><span className="text-zinc-400">任务要求：</span>{t.requirements}</p>}
      {(t.background || t.description) && <p className="text-sm text-zinc-500 mt-1">{t.background || t.description}</p>}
      {t.ref_material && <p className="text-xs text-zinc-400 mt-1">参考资料：{t.ref_material}</p>}

      {t.ai_note && (
        <div className="mt-3 bg-amber-50 border border-amber-100 rounded-lg p-3 text-sm">
          <span className="font-medium text-amber-700 flex items-center mb-1"><Bot size={14} className="mr-1.5" />诺亚的修改意见</span>
          <span className="text-amber-800">{t.ai_note}</span>
        </div>
      )}
      {t.submission && t.status !== 'pending' && (
        <p className="mt-2 text-xs text-zinc-400">我的提交：{t.submission}</p>
      )}

      <div className="mt-4 flex items-center gap-2">
        {onStart && t.status === 'pending' && (
          <button onClick={() => onStart(t)} className="text-sm px-3 py-1.5 rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-50">开始任务</button>
        )}
        {onSubmit && (
          <button onClick={() => onSubmit(t)} className="text-sm px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 inline-flex items-center">
            <Upload size={14} className="mr-1.5" />{t.status === 'submitted' ? '重新提交' : '提交成果'}
          </button>
        )}
        {onFeedback && (
          <button onClick={() => onFeedback(t)} className="text-sm px-3 py-1.5 rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-50 inline-flex items-center">
            <MessageSquare size={14} className="mr-1.5" />反馈问题
          </button>
        )}
      </div>
    </div>
  );
}

function Stat({ icon, color, label, value }: { icon: React.ReactNode; color: string; label: string; value: number }) {
  const colors: Record<string, string> = { orange: 'bg-orange-50 text-orange-600', blue: 'bg-blue-50 text-blue-600', purple: 'bg-purple-50 text-purple-600', green: 'bg-green-50 text-green-600' };
  return (
    <div className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-sm">
      <div className={`w-9 h-9 rounded-full flex items-center justify-center mb-3 ${colors[color]}`}>{icon}</div>
      <p className="text-sm font-medium text-zinc-500">{label}</p>
      <h3 className="text-2xl font-bold text-zinc-900 mt-0.5">{value}</h3>
    </div>
  );
}
