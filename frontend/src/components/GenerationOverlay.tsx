import React, { useEffect, useState } from 'react';
import { Bot, CheckCircle2, Loader2 } from 'lucide-react';

const STEPS = [
  '正在理解项目 Brief…',
  '正在识别项目目标与交付物…',
  '正在拆解项目执行阶段…',
  '正在按价格单测算预算与报价…',
  '正在评估利润率与成本结构…',
  '正在按交付日倒推执行排期…',
  '正在识别周期与成本风险…',
  '正在生成项目方案…',
];

export type Complexity = 'simple' | 'medium' | 'complex';

export function complexityOf(shootDays?: number, durationMin?: number): Complexity {
  const d = shootDays || 0, m = durationMin || 0;
  if (d >= 5 || m >= 8) return 'complex';
  if (d <= 1 && m <= 1) return 'simple';
  return 'medium';
}
export const DURATION_MS: Record<Complexity, number> = { simple: 6000, medium: 12000, complex: 20000 };

export function GenerationOverlay({ open, projectName, totalMs }: { open: boolean; projectName?: string; totalMs: number }) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!open) { setStep(0); return; }
    setStep(0);
    const per = Math.max(600, totalMs / STEPS.length);
    const id = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), per);
    return () => clearInterval(id);
  }, [open, totalMs]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-zinc-900/50 backdrop-blur-sm">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-7 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-11 h-11 rounded-xl bg-blue-600 flex items-center justify-center text-white shrink-0">
            <Bot size={22} />
          </div>
          <div>
            <h3 className="font-semibold text-zinc-900">诺亚正在工作…</h3>
            <p className="text-xs text-zinc-400">{projectName ? `项目：${projectName}` : '正在分析并生成方案'}</p>
          </div>
        </div>

        <div className="space-y-2.5">
          {STEPS.map((s, i) => {
            const done = i < step;
            const active = i === step;
            return (
              <div key={i} className={`flex items-center text-sm transition-all ${active ? 'text-zinc-900 font-medium' : done ? 'text-zinc-500' : 'text-zinc-300'}`}>
                <span className="w-5 h-5 mr-2.5 shrink-0 flex items-center justify-center">
                  {done ? <CheckCircle2 size={16} className="text-green-500" />
                    : active ? <Loader2 size={16} className="text-blue-600 animate-spin" />
                      : <span className="w-1.5 h-1.5 rounded-full bg-zinc-300" />}
                </span>
                {s}
              </div>
            );
          })}
        </div>

        <div className="w-full h-1.5 bg-zinc-100 rounded-full mt-6 overflow-hidden">
          <div className="h-full bg-blue-600 rounded-full transition-all" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
        </div>
      </div>
    </div>
  );
}
