import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Project } from '../../store/useStore';
import { Wand2, Loader2, AlertTriangle, Download, RotateCcw, Lock, Unlock, Trash2, Plus, Target, ChevronUp, ChevronDown } from 'lucide-react';
import { GenerationOverlay, complexityOf, DURATION_MS } from '../GenerationOverlay';

interface QuoteItem {
  id: number; phase: string; phase_name: string; item_name: string;
  unit_price: number; qty_people: number; qty_days: number; unit: string;
  amount: number; is_overrun: boolean; note: string;
  client_unit_price: number; client_amount: number; profit: number; gross_margin: number; is_locked: boolean;
}
interface Totals { cost_total: number; tax_rate: number; margin_rate: number; profit: number; client_price: number; gross_margin: number; tax?: number; client_price_tax?: number; }
interface QuoteData { generated: boolean; film_type: string; duration_minutes: number; shoot_days: number; items: QuoteItem[]; totals: Totals; }

const yuan = (n: number) => '¥ ' + Math.round(n).toLocaleString();
const pct = (n: number) => (n * 100).toFixed(0) + '%';
const phaseName: Record<string, string> = { A: '前期筹备', B: '拍摄执行', C: '后期制作', D: '其他杂费' };
const phases = ['A', 'B', 'C', 'D'];

export function BudgetTab({ project }: { project: Project }) {
  const [data, setData] = useState<QuoteData | null>(null);
  const [generating, setGenerating] = useState(false);
  const [margin, setMargin] = useState(25);
  const [view, setView] = useState<'internal' | 'client'>('internal');
  const [genOpen, setGenOpen] = useState(false);
  const lastUserTs = useRef(0);
  const putTimer = useRef<any>(null);

  const fetchQuote = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${project.id}/quote?t=${Date.now()}`);
      if (res.ok) {
        const d: QuoteData = await res.json();
        // 用户最近 5s 在拖滑杆/改东西就不用后端值覆盖，避免抖动
        if (Date.now() - lastUserTs.current > 5000) {
          setData(d);
          if (d.totals) setMargin(Math.round(d.totals.margin_rate * 100));
        }
      }
    } catch { /* ignore */ }
  }, [project.id]);

  useEffect(() => {
    fetchQuote();
    const id = setInterval(fetchQuote, 4000);
    return () => clearInterval(id);
  }, [fetchQuote]);

  const genMs = DURATION_MS[complexityOf(data?.shoot_days, data?.duration_minutes)];
  const runGenerate = async () => {
    setGenerating(true); setGenOpen(true);
    const start = Date.now();
    try { await fetch(`/api/projects/${project.id}/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); } catch {}
    const wait = genMs - (Date.now() - start);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    setGenOpen(false); setGenerating(false);
    lastUserTs.current = 0; await fetchQuote();
  };
  const reset = async () => {
    if (!window.confirm('「重置」会丢弃手动改过的明细（含锁定/客户价），按当前 Brief 重新生成。确定吗？')) return;
    await runGenerate();
  };

  // 批量调利润率：本地乐观更新未锁定项 + 防抖落库
  const onMargin = (v: number) => {
    setMargin(v); lastUserTs.current = Date.now();
    setData((d) => d ? {
      ...d, items: d.items.map((it) => it.is_locked ? it : (() => {
        const cu = Math.round(it.unit_price * (1 + v / 100));
        const ca = cu * it.qty_people * it.qty_days;
        return { ...it, client_unit_price: cu, client_amount: ca, profit: ca - it.amount, gross_margin: ca ? (ca - it.amount) / ca : 0 };
      })()),
    } : d);
    if (putTimer.current) clearTimeout(putTimer.current);
    putTimer.current = setTimeout(() => {
      fetch(`/api/projects/${project.id}/margin`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ margin_rate: v / 100 }) });
    }, 350);
  };

  const patchItem = async (id: number, body: any) => {
    lastUserTs.current = Date.now();
    await fetch(`/api/projects/${project.id}/quote/items/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    lastUserTs.current = 0; await fetchQuote();
  };
  const addItem = async (phase: string) => {
    lastUserTs.current = Date.now();
    await fetch(`/api/projects/${project.id}/quote/items`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phase, item_name: '新增项', unit_price: 0, qty_people: 1, qty_days: 1, unit: '项' }) });
    lastUserTs.current = 0; await fetchQuote();
  };
  const removeItem = async (id: number) => {
    lastUserTs.current = Date.now();
    await fetch(`/api/projects/${project.id}/quote/items/${id}`, { method: 'DELETE' });
    lastUserTs.current = 0; await fetchQuote();
  };
  const moveItem = async (id: number, direction: 'up' | 'down') => {
    lastUserTs.current = Date.now();
    await fetch(`/api/projects/${project.id}/quote/items/${id}/move`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ direction }) });
    lastUserTs.current = 0; await fetchQuote();
  };
  const [targetPrice, setTargetPrice] = useState('');
  const [targetMargin, setTargetMargin] = useState('');
  const [taxInput, setTaxInput] = useState('');
  const applyTax = async (rate: number) => {
    lastUserTs.current = Date.now();
    await fetch(`/api/projects/${project.id}/tax`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rate }) });
    setTaxInput(''); lastUserTs.current = 0; await fetchQuote();
  };
  const applyTarget = async (body: any) => {
    lastUserTs.current = Date.now();
    const res = await fetch(`/api/projects/${project.id}/quote/target`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await res.json().catch(() => ({}));
    if (d?.result && d.result.ok === false) window.alert(d.result.msg);
    lastUserTs.current = 0; await fetchQuote();
  };

  if (!data || !data.generated || data.items.length === 0) {
    return (
      <div className="p-8 max-w-3xl mx-auto">
        <GenerationOverlay open={genOpen} projectName={project.name} totalMs={genMs} />
        <h2 className="text-2xl font-bold text-zinc-900 mb-2">预算控制 · 报价单</h2>
        <p className="text-zinc-500 mb-8">基于客户 Brief 与价格单，由项目经理诺亚一键生成。</p>
        <div className="bg-white rounded-2xl border border-dashed border-zinc-300 p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-5"><Wand2 size={26} /></div>
          <h3 className="text-lg font-semibold text-zinc-900 mb-2">还没有报价单</h3>
          <p className="text-sm text-zinc-500 mb-6 max-w-md mx-auto">点击下方按钮，AI 将根据《{project.name}》的 Brief 自动拆解 4 段成本、按价格单算钱，并同步生成执行排期。</p>
          <button onClick={runGenerate} disabled={generating} className="inline-flex items-center px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 disabled:opacity-60">
            {generating ? <Loader2 size={18} className="mr-2 animate-spin" /> : <Wand2 size={18} className="mr-2" />}{generating ? 'AI 正在生成…' : '一键按 Brief 生成报价 + 排期'}
          </button>
        </div>
      </div>
    );
  }

  const internal = view === 'internal';
  const cost = data.items.reduce((s, it) => s + it.amount, 0);
  const clientTotal = data.items.reduce((s, it) => s + it.client_amount, 0);
  const profit = clientTotal - cost;
  const overallGm = clientTotal ? profit / clientTotal : 0;
  const taxRate = data.totals.tax_rate || 0;
  const clientTaxTotal = clientTotal * (1 + taxRate);   // 含税报价 = 不含税 ×(1+税点)
  const clientSub = (ph: string) => data.items.filter((i) => i.phase === ph).reduce((s, it) => s + it.client_amount, 0);

  return (
    <div className="p-8 max-w-6xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <GenerationOverlay open={genOpen} projectName={project.name} totalMs={genMs} />
      <div className="mb-6 flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-bold text-zinc-900">预算控制 · 报价单</h2>
          <p className="text-zinc-500 mt-1.5">{data.film_type} · 约 {data.duration_minutes} 分钟 · 拍摄 {data.shoot_days} 天</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-zinc-100 rounded-lg p-0.5 mr-1">
            <button onClick={() => setView('internal')} className={`px-3 py-1.5 rounded-md text-sm ${internal ? 'bg-white shadow-sm text-zinc-900 font-medium' : 'text-zinc-500'}`}>内部版</button>
            <button onClick={() => setView('client')} className={`px-3 py-1.5 rounded-md text-sm ${!internal ? 'bg-white shadow-sm text-zinc-900 font-medium' : 'text-zinc-500'}`}>客户版</button>
          </div>
          <a href={`/api/projects/${project.id}/quote.xlsx?version=${view}`} className="text-sm px-3 py-2 rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-50 inline-flex items-center"><Download size={15} className="mr-1.5" />下载{internal ? '内部版' : '客户版'}</a>
          <button onClick={reset} disabled={generating} title="丢弃手动改动，按 Brief 重新生成" className="text-sm px-3 py-2 rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-50 inline-flex items-center">
            {generating ? <Loader2 size={15} className="mr-1.5 animate-spin" /> : <RotateCcw size={15} className="mr-1.5" />}重置
          </button>
        </div>
      </div>

      {internal ? (
        <div className="grid grid-cols-4 gap-4 mb-6">
          <Card label="成本核算" value={yuan(cost)} sub={`税点 ${(data.totals.tax_rate * 100).toFixed(0)}%`} />
          <div className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-sm flex flex-col justify-center">
            <div className="flex justify-between items-baseline mb-1.5"><p className="text-sm font-medium text-zinc-500">批量利润率</p><span className="text-lg font-bold text-blue-600">{margin}%</span></div>
            <input type="range" min={0} max={80} step={1} value={margin} onChange={(e) => onMargin(Number(e.target.value))} className="w-full accent-blue-600 cursor-pointer" />
            <p className="text-[11px] text-zinc-400 mt-1.5">只调未锁定项 · 锁定项不动</p>
          </div>
          <Card label="毛利额" value={yuan(profit)} sub={`整体毛利率 ${pct(overallGm)}`} accent="green" />
          <Card label="对客户实收（不含税）" value={yuan(clientTotal)} sub={`含税 ${yuan(clientTaxTotal)} · 税点 ${(taxRate * 100).toFixed(0)}%`} accent="blue" />
        </div>
      ) : (
        <div className="bg-blue-600 p-6 rounded-2xl shadow-sm text-white mb-6 flex items-center justify-between">
          <div><p className="text-sm font-medium text-blue-100 mb-1">报价合计（含税 {(taxRate * 100).toFixed(0)}%）</p><h3 className="text-3xl font-bold">{yuan(clientTaxTotal)}</h3></div>
          <p className="text-xs text-blue-100 max-w-[200px] text-right">给客户的版本：报价已含服务费，不展示成本与利润。</p>
        </div>
      )}

      {internal && (
        <div className="flex flex-wrap items-center gap-2.5 mb-6 bg-white border border-zinc-200 rounded-xl px-4 py-3 text-sm">
          <span className="font-medium text-zinc-700 flex items-center"><Target size={15} className="mr-1.5 text-blue-600" />目标反推</span>
          <span className="text-zinc-400">客户给定总价</span>
          <input value={targetPrice} onChange={(e) => setTargetPrice(e.target.value)} placeholder="如 200000" type="number"
            className="w-28 px-2 py-1 border border-zinc-200 rounded-lg outline-none focus:border-blue-400" />
          <button onClick={() => targetPrice && applyTarget({ target_client_price: Number(targetPrice) })}
            className="px-3 py-1 rounded-lg bg-blue-600 text-white hover:bg-blue-700">按总价拉匀</button>
          <span className="text-zinc-300 mx-1">或</span>
          <span className="text-zinc-400">目标毛利率</span>
          <input value={targetMargin} onChange={(e) => setTargetMargin(e.target.value)} placeholder="35" type="number"
            className="w-16 px-2 py-1 border border-zinc-200 rounded-lg outline-none focus:border-blue-400" />
          <span className="text-zinc-400 -ml-1">%</span>
          <button onClick={() => targetMargin && applyTarget({ target_margin: Number(targetMargin) / 100 })}
            className="px-3 py-1 rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50">按毛利率反推</button>
          <span className="w-px h-5 bg-zinc-200 mx-1" />
          <span className="text-zinc-400">税点</span>
          <input value={taxInput} onChange={(e) => setTaxInput(e.target.value)} placeholder={(taxRate * 100).toFixed(0)} type="number"
            className="w-14 px-2 py-1 border border-zinc-200 rounded-lg outline-none focus:border-blue-400" />
          <span className="text-zinc-400 -ml-1">%</span>
          <button onClick={() => taxInput !== '' && applyTax(Number(taxInput) / 100)}
            className="px-3 py-1 rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50">应用</button>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="p-4 px-6 border-b border-zinc-200 flex items-center justify-between">
          <h3 className="font-bold text-lg text-zinc-900">报价明细{internal && <span className="text-xs font-normal text-zinc-400 ml-2">成本单价/人数/天数/客户单价 都可点着改 · 🔒锁定后批量调利润率不动它</span>}</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm min-w-[720px]">
            <thead>
              <tr className="bg-zinc-50 text-zinc-500">
                <th className="p-3 pl-6 font-medium">项目</th>
                <th className="p-3 text-right font-medium">{internal ? '成本单价' : '单价'}</th>
                <th className="p-3 text-right font-medium">人数</th>
                <th className="p-3 text-right font-medium">天数</th>
                <th className="p-3 font-medium">单位</th>
                {internal && <th className="p-3 text-right font-medium text-blue-600">客户单价</th>}
                <th className="p-3 text-right font-medium">{internal ? '客户小计' : '金额'}</th>
                {internal && <th className="p-3 text-right font-medium">毛利率</th>}
                {internal && <th className="p-3 text-center font-medium">操作</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {phases.map((ph) => {
                const rows = data.items.filter((i) => i.phase === ph);
                if (rows.length === 0 && !internal) return null;
                const span = internal ? 9 : 6;
                return (
                  <React.Fragment key={ph}>
                    <tr className="bg-zinc-50/60"><td colSpan={span} className="px-6 py-2 text-xs font-bold text-zinc-500 tracking-wide">{ph} · {phaseName[ph]}</td></tr>
                    {rows.map((r) => (
                      <tr key={r.id} className={r.is_overrun ? 'bg-orange-50' : r.is_locked ? 'bg-amber-50/40' : 'hover:bg-zinc-50'}>
                        <td className="p-3 pl-6 text-zinc-900">
                          {internal ? <EditText key={`${r.id}-nm-${r.item_name}`} value={r.item_name} onCommit={(v) => patchItem(r.id, { item_name: v })} /> : r.item_name}
                          {r.is_overrun && <span className="ml-2 text-[10px] px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded">超支</span>}
                          {r.is_locked && <Lock size={11} className="inline ml-1.5 text-amber-500" />}
                        </td>
                        <td className="p-3 text-right text-zinc-600">{internal ? <EditNum key={`${r.id}-up-${r.unit_price}`} value={r.unit_price} onCommit={(v) => patchItem(r.id, { unit_price: v })} prefix="¥" /> : yuan(r.client_unit_price)}</td>
                        <td className="p-3 text-right text-zinc-600">{internal ? <EditNum key={`${r.id}-pp-${r.qty_people}`} value={r.qty_people} onCommit={(v) => patchItem(r.id, { qty_people: v })} /> : r.qty_people}</td>
                        <td className="p-3 text-right text-zinc-600">{internal ? <EditNum key={`${r.id}-dd-${r.qty_days}`} value={r.qty_days} onCommit={(v) => patchItem(r.id, { qty_days: v })} /> : r.qty_days}</td>
                        <td className="p-3 text-zinc-500">{r.unit}</td>
                        {internal && <td className="p-3 text-right text-blue-600 font-medium"><EditNum key={`${r.id}-cu-${r.client_unit_price}`} value={r.client_unit_price} onCommit={(v) => patchItem(r.id, { client_unit_price: v })} prefix="¥" /></td>}
                        <td className="p-3 text-right font-medium text-zinc-900">{yuan(r.client_amount)}</td>
                        {internal && <td className="p-3 text-right text-zinc-500">{pct(r.gross_margin)}</td>}
                        {internal && (
                          <td className="p-3">
                            <div className="flex items-center justify-center gap-0.5">
                              <button onClick={() => moveItem(r.id, 'up')} title="上移" className="p-1 rounded text-zinc-300 hover:text-zinc-600 hover:bg-zinc-100"><ChevronUp size={14} /></button>
                              <button onClick={() => moveItem(r.id, 'down')} title="下移" className="p-1 rounded text-zinc-300 hover:text-zinc-600 hover:bg-zinc-100"><ChevronDown size={14} /></button>
                              <button onClick={() => patchItem(r.id, { is_locked: !r.is_locked })} title={r.is_locked ? '解锁' : '锁定价格'} className={`p-1 rounded ${r.is_locked ? 'text-amber-500 hover:bg-amber-50' : 'text-zinc-300 hover:text-zinc-500 hover:bg-zinc-100'}`}>
                                {r.is_locked ? <Lock size={14} /> : <Unlock size={14} />}
                              </button>
                              <button onClick={() => removeItem(r.id)} title="删除" className="p-1 rounded text-zinc-300 hover:text-red-500 hover:bg-red-50"><Trash2 size={14} /></button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                    {internal && (
                      <tr>
                        <td colSpan={span} className="px-6 py-1.5">
                          <button onClick={() => addItem(ph)} className="text-xs text-blue-600 hover:text-blue-700 inline-flex items-center"><Plus size={13} className="mr-1" />在「{phaseName[ph]}」新增一项</button>
                        </td>
                      </tr>
                    )}
                    <tr>
                      <td colSpan={span - 1} className="px-6 py-2 text-right text-xs text-zinc-400">{phaseName[ph]} 小计</td>
                      <td className="p-3 pr-6 text-right text-sm font-semibold text-zinc-700" colSpan={internal ? 2 : 1}>{yuan(clientSub(ph))}</td>
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="border-t border-zinc-200 bg-zinc-50 px-6 py-4 flex justify-between items-end">
          <span className="text-xs text-zinc-400 flex items-center max-w-sm"><AlertTriangle size={13} className="mr-1.5 shrink-0" />{internal ? '成本与客户单价相互独立：改成本只影响毛利，不改客户报价。也能在对话里让 AI 改/锁/增删。' : '给客户的报价：已含服务费，不显示成本与利润。'}</span>
          <div className="w-72 space-y-1.5 text-sm">
            {internal && <>
              <div className="flex justify-between"><span className="text-zinc-500">成本小计</span><span className="font-medium text-zinc-900">{yuan(cost)}</span></div>
              <div className="flex justify-between"><span className="text-zinc-500">毛利额（毛利率 {pct(overallGm)}）</span><span className="font-medium text-green-600">+ {yuan(profit)}</span></div>
            </>}
            <div className="flex justify-between text-xs text-zinc-400"><span>不含税实收 {yuan(clientTotal)}</span><span>税点 {(taxRate * 100).toFixed(0)}% · 税额 {yuan(clientTaxTotal - clientTotal)}</span></div>
            <div className="flex justify-between border-t border-zinc-300 pt-1.5 mt-1.5"><span className="font-semibold text-zinc-900">{internal ? '对客户实收（含税）' : '报价合计（含税）'}</span><span className="font-bold text-blue-600 text-base">{yuan(clientTaxTotal)}</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Card({ label, value, sub, accent }: { label: string; value: string; sub: string; accent?: 'green' | 'blue' }) {
  const cls = accent === 'blue' ? 'bg-blue-600 text-white' : 'bg-white border border-zinc-200';
  const subc = accent === 'blue' ? 'text-blue-100' : 'text-zinc-400';
  const labc = accent === 'blue' ? 'text-blue-100' : 'text-zinc-500';
  return (
    <div className={`p-5 rounded-2xl shadow-sm ${cls}`}>
      <p className={`text-sm font-medium mb-1 ${labc}`}>{label}</p>
      <h3 className={`text-2xl font-bold ${accent === 'blue' ? '' : accent === 'green' ? 'text-green-600' : 'text-zinc-900'}`}>{value}</h3>
      <p className={`text-[11px] mt-1.5 ${subc}`}>{sub}</p>
    </div>
  );
}

function EditNum({ value, onCommit, prefix }: { value: number; onCommit: (v: number) => void; prefix?: string }) {
  return (
    <span className="inline-flex items-center justify-end">
      {prefix && <span className="text-zinc-400 mr-0.5">{prefix}</span>}
      <input type="number" defaultValue={value} min={0}
        onBlur={(e) => { const v = Number(e.target.value); if (!isNaN(v) && v !== value) onCommit(v); }}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        className="w-16 text-right bg-transparent border border-transparent hover:border-zinc-200 focus:border-blue-400 focus:bg-white rounded px-1 py-0.5 outline-none" />
    </span>
  );
}

function EditText({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  return (
    <input type="text" defaultValue={value}
      onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== value) onCommit(v); }}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      className="w-28 bg-transparent border border-transparent hover:border-zinc-200 focus:border-blue-400 focus:bg-white rounded px-1 py-0.5 outline-none font-medium" />
  );
}
