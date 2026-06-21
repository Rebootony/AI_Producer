import React, { useEffect, useState, useCallback, useRef } from 'react';
import { FileText, Image as ImageIcon, FileSpreadsheet, FolderOpen, Download, Upload, Loader2, Sparkles } from 'lucide-react';
import { Project } from '../../store/useStore';

interface Asset { id: number; name: string; type: string; kind: string; downloadable: boolean; }

function iconFor(type: string, name: string) {
  const t = (type + ' ' + name).toLowerCase();
  if (t.includes('pdf')) return <FileText size={16} className="text-red-500" />;
  if (t.includes('xls') || t.includes('excel') || t.includes('csv')) return <FileSpreadsheet size={16} className="text-green-500" />;
  if (t.includes('jpg') || t.includes('png') || t.includes('image') || t.includes('jpeg')) return <ImageIcon size={16} className="text-purple-500" />;
  return <FileText size={16} className="text-blue-500" />;
}

export function AssetsTab({ project }: { project: Project }) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [generated, setGenerated] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [aRes, pRes] = await Promise.all([
        fetch(`/api/projects/${project.id}/assets?t=${Date.now()}`),
        fetch(`/api/projects/${project.id}?t=${Date.now()}`),
      ]);
      if (aRes.ok) setAssets((await aRes.json()).assets || []);
      if (pRes.ok) setGenerated(!!(await pRes.json()).generated);
    } catch { /* ignore */ }
  }, [project.id]);

  useEffect(() => {
    fetchAll();
    const id = setInterval(fetchAll, 4000);
    return () => clearInterval(id);
  }, [fetchAll]);

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', f);
      await fetch(`/api/projects/${project.id}/assets/upload`, { method: 'POST', body: fd });
      await fetchAll();
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mb-8 flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-bold text-zinc-900">资产管理</h2>
          <p className="text-zinc-500 mt-2">平台生成的报价/排期可随时下载当前状态；也可上传项目相关文件集中沉淀。</p>
        </div>
        <input ref={fileRef} type="file" className="hidden" onChange={onUpload} />
        <button onClick={() => fileRef.current?.click()} disabled={uploading}
          className="text-sm px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 inline-flex items-center">
          {uploading ? <Loader2 size={15} className="mr-1.5 animate-spin" /> : <Upload size={15} className="mr-1.5" />}
          {uploading ? '上传中…' : '上传文件'}
        </button>
      </div>

      {/* 平台生成（下载当前状态） */}
      <div className="mb-8">
        <h3 className="text-sm font-semibold text-zinc-500 mb-3 flex items-center">
          <Sparkles size={15} className="mr-1.5 text-blue-500" />平台生成（下载当前状态）
        </h3>
        {generated ? (
          <div className="grid grid-cols-3 gap-4">
            <ExportCard label="报价单 · 客户版" desc="利润已含，不显示成本"
              href={`/api/projects/${project.id}/quote.xlsx?version=client`} icon={<FileSpreadsheet size={20} className="text-green-600" />} />
            <ExportCard label="报价单 · 内部版" desc="含成本/利润/实收"
              href={`/api/projects/${project.id}/quote.xlsx?version=internal`} icon={<FileSpreadsheet size={20} className="text-amber-600" />} />
            <ExportCard label="执行排期" desc="按当前排期导出"
              href={`/api/projects/${project.id}/schedule.xlsx`} icon={<FileSpreadsheet size={20} className="text-blue-600" />} />
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-400">
            还没生成报价/排期。去「项目总览」点「立即生成」后，这里就能下载。
          </div>
        )}
      </div>

      {/* 上传的项目文件 */}
      <h3 className="text-sm font-semibold text-zinc-500 mb-3 flex items-center">
        <FolderOpen size={15} className="mr-1.5 text-zinc-400" />项目文件（{assets.length}）
      </h3>
      {assets.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-zinc-300 p-10 text-center text-sm text-zinc-400">
          还没有文件。点右上角「上传文件」，或在「项目总览」上传 Brief，都会归档到这里。
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-zinc-50 text-sm font-medium text-zinc-500">
                <th className="p-4">文件名称</th>
                <th className="p-4">类型</th>
                <th className="p-4 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="text-zinc-800 text-sm divide-y divide-zinc-100">
              {assets.map((a) => (
                <tr key={a.id} className="hover:bg-zinc-50 transition-colors">
                  <td className="p-4 flex items-center">
                    <div className="w-8 h-8 rounded bg-zinc-100 flex items-center justify-center mr-3 shrink-0">{iconFor(a.type, a.name)}</div>
                    <span className="font-medium text-zinc-900 truncate max-w-[320px]">{a.name}</span>
                  </td>
                  <td className="p-4 text-zinc-400 text-xs">{a.type}</td>
                  <td className="p-4 text-right">
                    {a.downloadable ? (
                      <a href={`/api/projects/${project.id}/assets/${a.id}/download`}
                        className="inline-flex items-center text-blue-600 hover:text-blue-700 text-sm">
                        <Download size={15} className="mr-1" />下载
                      </a>
                    ) : (
                      <span className="text-xs text-zinc-300">无原件</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ExportCard({ label, desc, href, icon }: { label: string; desc: string; href: string; icon: React.ReactNode }) {
  return (
    <a href={href} className="bg-white rounded-xl border border-zinc-200 shadow-sm p-4 flex items-center justify-between hover:border-blue-300 hover:shadow-md transition-all group">
      <div className="flex items-center">
        <div className="w-10 h-10 rounded-lg bg-zinc-100 flex items-center justify-center mr-3">{icon}</div>
        <div>
          <p className="font-medium text-zinc-900">{label}</p>
          <p className="text-xs text-zinc-400">{desc}</p>
        </div>
      </div>
      <span className="text-zinc-400 group-hover:text-blue-600 inline-flex items-center text-sm"><Download size={16} className="mr-1" />下载</span>
    </a>
  );
}
