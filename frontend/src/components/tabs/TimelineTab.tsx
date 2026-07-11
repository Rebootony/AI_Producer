import React, { useEffect, useState, useCallback } from 'react';
import { cn } from '../../utils';
import { Project, useStore } from '../../store/useStore';
import { CheckCircle2, Wand2, Loader2, Star, Users, Flag, Download, List, Pencil, AlertTriangle } from 'lucide-react';
import { GenerationOverlay, complexityOf, DURATION_MS } from '../GenerationOverlay';
import { ScheduleEditor } from '../ScheduleEditor';
import { displayStatus } from '../../taskStatus';

interface SchedItem {
  id: number; stage: string; task: string; start_date: string; end_date: string;
  is_milestone: boolean; needs_client: boolean; status: string;
}
interface SchedData { generated: boolean; delivery_date: string; shoot_days: number; items: SchedItem[]; }

const stageColor: Record<string, string> = {
  '前期': 'text-blue-600 bg-blue-50',
  '拍摄': 'text-purple-600 bg-purple-50',
  '后期': 'text-emerald-600 bg-emerald-50',
  '交付': 'text-orange-600 bg-orange-50',
};

export function TimelineTab({ project }: { project: Project }) {
  const [data, setData] = useState<SchedData | null>(null);
  const [taskList, setTaskList] = useState<any[]>([]);   // 真实任务状态，用于覆盖时间线（§4：不再按日期显示假对勾）
  const [generating, setGenerating] = useState(false);
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const isBoss = useStore(s => s.currentUser?.role === 'boss');

  const fetchSchedule = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${project.id}/schedule?t=${Date.now()}`);
      if (res.ok) setData(await res.json());
      const tr = await fetch(`/api/projects/${project.id}/task-schedule?t=${Date.now()}`);
      if (tr.ok) setTaskList((await tr.json()).tasks || []);
    } catch { /* ignore */ }
  }, [project.id]);

  useEffect(() => {
    fetchSchedule();
    const id = setInterval(fetchSchedule, 4000);
    return () => clearInterval(id);
  }, [fetchSchedule]);

  const [genOpen, setGenOpen] = useState(false);
  const genMs = DURATION_MS[complexityOf(data?.shoot_days, undefined)];
  const generate = async () => {
    setGenerating(true); setGenOpen(true);
    const start = Date.now();
    try {
      await fetch(`/api/projects/${project.id}/generate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
      });
    } catch { /* ignore */ }
    const wait = genMs - (Date.now() - start);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    setGenOpen(false); setGenerating(false);
    await fetchSchedule();
  };

  if (!data || !data.generated || data.items.length === 0) {
    return (
      <div className="p-8 max-w-3xl mx-auto">
        <GenerationOverlay open={genOpen} projectName={project.name} totalMs={genMs} />
        <h2 className="text-2xl font-bold text-zinc-900 mb-2">执行排期</h2>
        <p className="text-zinc-500 mb-8">按客户交付日倒推，自动生成各阶段节点。</p>
        <div className="bg-white rounded-2xl border border-dashed border-zinc-300 p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-5">
            <Wand2 size={26} />
          </div>
          <h3 className="text-lg font-semibold text-zinc-900 mb-2">还没有排期</h3>
          <p className="text-sm text-zinc-500 mb-6">生成报价的同时会自动按交付日倒推排期。</p>
          {isBoss ? (
            <button onClick={generate} disabled={generating}
              className="inline-flex items-center px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 disabled:opacity-60">
              {generating ? <Loader2 size={18} className="mr-2 animate-spin" /> : <Wand2 size={18} className="mr-2" />}
              {generating ? 'AI 正在生成…' : '一键生成报价 + 排期'}
            </button>
          ) : (
            <p className="text-sm text-zinc-400">等老板生成后，这里会展示完整排期。</p>
          )}
        </div>
      </div>
    );
  }

  const done = data.items.filter(i => i.status === 'completed').length;
  const pct = Math.round((done / data.items.length) * 100);

  return (
    <div className="p-8 max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mb-6 flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold text-zinc-900">执行排期</h2>
          <p className="text-zinc-500 mt-2">交付日 {data.delivery_date}（倒推）· 拍摄 {data.shoot_days} 天 · 进度 {pct}%</p>
        </div>
        <div className="flex items-center gap-2">
          {isBoss && (
            <div className="flex items-center bg-zinc-100 rounded-lg p-0.5">
              <button onClick={() => setMode('view')} className={`px-3 py-1.5 rounded-md text-sm inline-flex items-center ${mode === 'view' ? 'bg-white shadow-sm text-zinc-900 font-medium' : 'text-zinc-500'}`}><List size={14} className="mr-1.5" />时间线</button>
              <button onClick={() => setMode('edit')} className={`px-3 py-1.5 rounded-md text-sm inline-flex items-center ${mode === 'edit' ? 'bg-white shadow-sm text-zinc-900 font-medium' : 'text-zinc-500'}`}><Pencil size={14} className="mr-1.5" />编辑排期</button>
            </div>
          )}
          <a href={`/api/projects/${project.id}/schedule.xlsx`}
            className="text-sm px-4 py-2 rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-50 inline-flex items-center">
            <Download size={15} className="mr-1.5" />下载 Excel
          </a>
        </div>
      </div>

      {isBoss && mode === 'edit' ? (
        <ScheduleEditor projectId={project.id} />
      ) : (
      <>
      <div className="flex items-center gap-4 mb-8 text-xs text-zinc-500">
        <span className="flex items-center"><Star size={13} className="mr-1 text-amber-500" />关键节点（锁定）</span>
        <span className="flex items-center"><Users size={13} className="mr-1 text-rose-500" />需客户配合</span>
        <span className="flex items-center"><span className="w-2.5 h-2.5 rounded-full bg-blue-600 mr-1" />进行中</span>
        <span className="flex items-center"><span className="w-2.5 h-2.5 rounded-full bg-green-500 mr-1" />已完成</span>
      </div>

      <div className="relative border-l-2 border-zinc-200 ml-3 space-y-5 pb-4">
        {data.items.map((it, i) => {
          // 用真实任务状态覆盖（按标题优先、否则按顺序匹配）——不再按日期显示假对勾
          const task = taskList.find((t) => t.title === it.task) || taskList[i];
          const done = task ? task.status === 'done' : it.status === 'completed';
          const overdue = task ? task.overdue : false;
          const inProgress = task ? task.status === 'in_progress' : it.status === 'current';
          const submitted = task ? task.status === 'submitted' : false;
          const st = task ? displayStatus(task.status, task.overdue) : null;
          return (
          <div key={it.id} className="relative pl-7">
            <div className={cn(
              "absolute -left-[9px] top-2 w-4 h-4 rounded-full border-4 border-white shadow-sm",
              overdue ? "bg-red-500 ring-4 ring-red-100" :
              done ? "bg-green-500" :
              submitted ? "bg-amber-500" :
              inProgress ? "bg-blue-600 ring-4 ring-blue-100" : "bg-zinc-300"
            )} />
            <div className={cn(
              "bg-white p-4 rounded-xl border shadow-sm flex items-center justify-between",
              overdue ? "border-red-200 ring-1 ring-red-50" :
              inProgress ? "border-blue-200 ring-1 ring-blue-50" :
              it.is_milestone ? "border-amber-200" : "border-zinc-200"
            )}>
              <div className="flex items-center gap-3">
                <span className={cn("text-[11px] font-bold px-2 py-0.5 rounded", stageColor[it.stage] || 'text-zinc-500 bg-zinc-100')}>
                  {it.stage}
                </span>
                <div>
                  <p className="font-medium text-zinc-900 flex items-center gap-1.5">
                    {it.task}
                    {it.is_milestone && <Star size={13} className="text-amber-500" />}
                    {it.needs_client && <Users size={13} className="text-rose-500" />}
                  </p>
                  <p className="text-xs text-zinc-400 mt-0.5">{it.start_date} → {it.end_date}</p>
                </div>
              </div>
              <div className="shrink-0">
                {overdue ? <span className="text-xs font-medium text-red-600 bg-red-50 px-2 py-1 rounded-full inline-flex items-center"><AlertTriangle size={12} className="mr-1" />已逾期</span>
                  : done ? <CheckCircle2 size={18} className="text-green-500" />
                  : st ? <span className={cn("text-xs font-medium px-2 py-1 rounded-full", st.style)}>{st.label}</span>
                  : it.stage === '交付' ? <Flag size={16} className="text-orange-500" />
                  : <span className="text-xs text-zinc-400">未开始</span>}
              </div>
            </div>
          </div>
          );
        })}
      </div>
      <p className="text-xs text-zinc-400 mt-4 ml-3">提示：可在对话里让 AI 调整，如「拍摄加一天」会同时影响排期与 B 段报价（关键节点变更需二次确认）。</p>
      </>
      )}
    </div>
  );
}
