import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Project } from '../../store/useStore';
import { Wand2, Loader2, AlertTriangle, Download, RotateCcw } from 'lucide-react';

interface QuoteItem {
  id: number; phase: string; phase_name: string; item_name: string;
  unit_price: number; qty_people: number; qty_days: number; unit: string;
  amount: number; is_overrun: boolean; note: string;
  client_unit_price: number; client_amount: number;
}
interface Totals {
  cost_total: number; tax_rate: number; tax: number; margin_rate: number;
  profit: number; client_price: number; subtotals: Record<string, number>;
  client_subtotals: Record<string, number>;
}
interface QuoteData { generated: boolean; film_type: string; duration_minutes: number; shoot_days: number; items: QuoteItem[]; totals: Totals; }

const yuan = (n: number) => '¥ ' + Math.round(n).toLocaleString();
const phaseName: Record<string, string> = { A: '前期筹备', B: '拍摄执行', C: '后期制作', D: '其他杂费' };
const phases = ['A', 'B', 'C', 'D'];

export function BudgetTab({ project }: { project: Project }) {
  const [data, setData] = useState<QuoteData | null>(null);
  const [generating, setGenerating] = useState(false);
  const [margin, setMargin] = useState(25);
  const [view, setView] = useState<'internal' | 'client'>('internal');
  const lastUserTs = useRef(0);
  const putTimer = useRef<any>(null);

  const fetchQuote = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${project.id}/quote?t=${Date.now()}`);
      if (res.ok) {
        const d: QuoteData = await res.json();
        setData(d);
        if (d.totals && Date.now() - lastUserTs.current > 5000) setMargin(Math.round(d.totals.margin_rate * 100));
      }
    } catch { /* ignore */ }
  }, [project.id]);

  useEffect(() => {
    fetchQuote();
    const id = setInterval(fetchQuote, 4000);
    return () => clearInterval(id);
  }, [fetchQuote]);

  const generate = async () => {
    if (!window.confirm('「重置」会丢弃你手动改过的明细，按当前 Brief 重新生成报价与排期。确定吗？')) return;
    setGenerating(true);
    try {
      await fetch(`/api/projects/${project.id}/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      await fetchQuote();
    } finally { setGenerating(false); }
  };

  const onMargin = (v: number) => {
    setMargin(v);
    lastUserTs.current = Date.now();
    if (putTimer.current) clearTimeout(putTimer.current);
    putTimer.current = setTimeout(() => {
      fetch(`/api/projects/${project.id}/margin`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ margin_rate: v / 100 }) });
    }, 350);
  };

  const editItem = (id: number, field: string, value: number) => {
    fetch(`/api/projects/${project.id}/quote/items/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [field]: value }),
    }).then(() => fetchQuote());
  };

  if (!data || !data.generated || data.items.length === 0) {
    return (
      <div className="p-8 max-w-3xl mx-auto">
        <h2 className="text-2xl font-bold text-zinc-900 mb-2">预算控制 · 报价单</h2>
        <p className="text-zinc-500 mb-8">基于客户 Brief 与价格单，由 AI 制片一键生成。</p>
        <div className="bg-white rounded-2xl border border-dashed border-zinc-300 p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-5"><Wand2 size={26} /></div>
          <h3 className="text-lg font-semibold text-zinc-900 mb-2">还没有报价单</h3>
          <p className="text-sm text-zinc-500 mb-6 max-w-md mx-auto">点击下方按钮，AI 将根据《{project.name}》的 Brief 自动拆解 4 段成本、按价格单算钱，并同步生成执行排期。</p>
          <button onClick={() => { setGenerating(true); fetch(`/api/projects/${project.id}/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then(() => fetchQuote()).finally(() => setGenerating(false)); }} disabled={generating}
            className="inline-flex items-center px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 disabled:opacity-60">
            {generating ? <Loader2 size={18} className="mr-2 animate-spin" /> : <Wand2 size={18} className="mr-2" />}{generating ? 'AI 正在生成…' : '一键按 Brief 生成报价 + 排期'}
          </button>
        </div>
      </div>
    );
  }

  const internal = view === 'internal';
  // 本地按当前滑杆即时算客户价（利润摊到每条明细），与后端逻辑一致
  const clientUnit = (cost: number) => Math.round(cost * (1 + margin / 100));
  const cost = data.totals.cost_total;
  const clientTotal = data.items.reduce((s, it) => s + clientUnit(it.unit_price) * it.qty_people * it.qty_days, 0);
  const profit = clientTotal - cost;
  const clientSub = (ph: string) => data.items.filter(i => i.phase === ph).reduce((s, it) => s + clientUnit(it.unit_price) * it.qty_people * it.qty_days, 0);
  const costSub = (ph: string) => data.totals.subtotals[ph] || 0;

  return (
    <div className="p-8 max-w-5xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mb-6 flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-bold text-zinc-900">预算控制 · 报价单</h2>
          <p className="text-zinc-500 mt-1.5">{data.film_type} · 约 {data.duration_minutes} 分钟 · 拍摄 {data.shoot_days} 天 · 由价格单引擎核算</p>
        </div>
        <div className="flex items-center gap-2">
          {/* 版本切换 */}
          <div className="flex items-center bg-zinc-100 rounded-lg p-0.5 mr-1">
            <button onClick={() => setView('internal')} className={`px-3 py-1.5 rounded-md text-sm transition-colors ${internal ? 'bg-white shadow-sm text-zinc-900 font-medium' : 'text-zinc-500'}`}>内部版</button>
            <button onClick={() => setView('client')} className={`px-3 py-1.5 rounded-md text-sm transition-colors ${!internal ? 'bg-white shadow-sm text-zinc-900 font-medium' : 'text-zinc-500'}`}>客户版</button>
          </div>
          <a href={`/api/projects/${project.id}/quote.xlsx?version=${view}`}
            className="text-sm px-3 py-2 rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-50 inline-flex items-center">
            <Download size={15} className="mr-1.5" />下载{internal ? '内部版' : '客户版'}
          </a>
          <button onClick={generate} disabled={generating} title="丢弃手动改动，按当前 Brief 重新生成"
            className="text-sm px-3 py-2 rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-50 inline-flex items-center">
            {generating ? <Loader2 size={15} className="mr-1.5 animate-spin" /> : <RotateCcw size={15} className="mr-1.5" />}重置
          </button>
        </div>
      </div>

      {internal ? (
        <div className="grid grid-cols-3 gap-6 mb-6">
          <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm">
            <p className="text-sm font-medium text-zinc-500 mb-1">成本核算</p>
            <h3 className="text-3xl font-bold text-zinc-900">{yuan(cost)}</h3>
            <p className="text-xs text-zinc-400 mt-2">税点 {(data.totals.tax_rate * 100).toFixed(0)}% ≈ {yuan(cost * data.totals.tax_rate)}</p>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm flex flex-col justify-center">
            <div className="flex justify-between items-baseline mb-2">
              <p className="text-sm font-medium text-zinc-500">利润率（拖动调整）</p>
              <span className="text-xl font-bold text-blue-600">{margin}%</span>
            </div>
            <input type="range" min={0} max={60} step={1} value={margin} onChange={(e) => onMargin(Number(e.target.value))} className="w-full accent-blue-600 cursor-pointer" />
            <p className="text-xs text-zinc-400 mt-2">毛利 {yuan(profit)}（已摊进每条明细）</p>
          </div>
          <div className="bg-blue-600 p-6 rounded-2xl shadow-sm text-white">
            <p className="text-sm font-medium text-blue-100 mb-1">对客户实收（含税）</p>
            <h3 className="text-3xl font-bold">{yuan(clientTotal)}</h3>
            <p className="text-xs text-blue-100 mt-3">= 各明细客户金额之和</p>
          </div>
        </div>
      ) : (
        <div className="bg-blue-600 p-6 rounded-2xl shadow-sm text-white mb-6 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-blue-100 mb-1">报价合计（含税）</p>
            <h3 className="text-3xl font-bold">{yuan(clientTotal)}</h3>
          </div>
          <p className="text-xs text-blue-100 max-w-[200px] text-right">这是给客户看的版本：报价已含服务费，不展示成本与利润。</p>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-zinc-200 flex items-center justify-between">
          <h3 className="font-bold text-lg text-zinc-900">报价明细{internal && <span className="text-xs font-normal text-zinc-400 ml-2">（成本单价/人数/天数可直接改）</span>}</h3>
        </div>
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="bg-zinc-50 text-zinc-500">
              <th className="p-3 pl-6 font-medium">阶段 / 项目</th>
              <th className="p-3 text-right font-medium">{internal ? '成本单价' : '单价'}</th>
              <th className="p-3 text-right font-medium">人数</th>
              <th className="p-3 text-right font-medium">天数/数量</th>
              <th className="p-3 font-medium">单位</th>
              {internal && <th className="p-3 text-right font-medium text-blue-600">客户单价</th>}
              <th className="p-3 pr-6 text-right font-medium">{internal ? '客户金额' : '金额'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {phases.map((ph) => {
              const rows = data.items.filter(i => i.phase === ph);
              if (rows.length === 0) return null;
              return (
                <React.Fragment key={ph}>
                  <tr className="bg-zinc-50/60"><td colSpan={internal ? 7 : 6} className="px-6 py-2 text-xs font-bold text-zinc-500 tracking-wide">{ph} · {phaseName[ph]}</td></tr>
                  {rows.map((r) => {
                    const cu = clientUnit(r.unit_price);
                    return (
                      <tr key={r.id} className={r.is_overrun ? 'bg-orange-50' : 'hover:bg-zinc-50'}>
                        <td className="p-3 pl-6 text-zinc-900">{r.item_name}{r.is_overrun && <span className="ml-2 text-[10px] px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded">超支</span>}</td>
                        <td className="p-3 text-right text-zinc-600">
                          {internal ? <EditNum key={`${r.id}-up-${r.unit_price}`} value={r.unit_price} onCommit={(v) => editItem(r.id, 'unit_price', v)} prefix="¥" /> : yuan(cu)}
                        </td>
                        <td className="p-3 text-right text-zinc-600">
                          {internal ? <EditNum key={`${r.id}-pp-${r.qty_people}`} value={r.qty_people} onCommit={(v) => editItem(r.id, 'qty_people', v)} /> : r.qty_people}
                        </td>
                        <td className="p-3 text-right text-zinc-600">
                          {internal ? <EditNum key={`${r.id}-dd-${r.qty_days}`} value={r.qty_days} onCommit={(v) => editItem(r.id, 'qty_days', v)} /> : r.qty_days}
                        </td>
                        <td className="p-3 text-zinc-500">{r.unit}</td>
                        {internal && <td className="p-3 text-right text-blue-600">{yuan(cu)}</td>}
                        <td className="p-3 pr-6 text-right font-medium text-zinc-900">{yuan(cu * r.qty_people * r.qty_days)}</td>
                      </tr>
                    );
                  })}
                  <tr>
                    <td colSpan={internal ? 6 : 5} className="px-6 py-2 text-right text-xs text-zinc-400">{internal ? '小计（客户）' : '小计'}</td>
                    <td className="p-3 pr-6 text-right text-sm font-semibold text-zinc-700">{yuan(clientSub(ph))}</td>
                  </tr>
                </React.Fragment>
              );
            })}
          </tbody>
        </table>

        <div className="border-t border-zinc-200 bg-zinc-50 px-6 py-4 flex justify-between items-end">
          <span className="text-xs text-zinc-400 flex items-center max-w-xs">
            <AlertTriangle size={13} className="mr-1.5 shrink-0" />{internal ? '利润已摊进每条「客户单价」；也可在对话里让 AI 调整。' : '此版本给客户：报价已含服务费，不显示成本/利润。'}
          </span>
          <div className="w-72 space-y-1.5 text-sm">
            {internal && (
              <>
                <div className="flex justify-between"><span className="text-zinc-500">成本小计</span><span className="font-medium text-zinc-900">{yuan(cost)}</span></div>
                <div className="flex justify-between"><span className="text-zinc-500">利润（{margin}%）</span><span className="font-medium text-green-600">+ {yuan(profit)}</span></div>
              </>
            )}
            <div className="flex justify-between border-t border-zinc-300 pt-1.5 mt-1.5">
              <span className="font-semibold text-zinc-900">{internal ? '对客户实收（含税）' : '报价合计（含税）'}</span>
              <span className="font-bold text-blue-600 text-base">{yuan(clientTotal)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// 可直接编辑的数字单元格（失焦或回车提交）
function EditNum({ value, onCommit, prefix }: { value: number; onCommit: (v: number) => void; prefix?: string }) {
  return (
    <span className="inline-flex items-center justify-end">
      {prefix && <span className="text-zinc-400 mr-0.5">{prefix}</span>}
      <input
        type="number" defaultValue={value} min={0}
        onBlur={(e) => { const v = Number(e.target.value); if (!isNaN(v) && v !== value) onCommit(v); }}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        className="w-16 text-right bg-transparent border border-transparent hover:border-zinc-200 focus:border-blue-400 focus:bg-white rounded px-1 py-0.5 outline-none"
      />
    </span>
  );
}
