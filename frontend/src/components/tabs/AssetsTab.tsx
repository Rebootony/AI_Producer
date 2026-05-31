import React from 'react';
import { FileText, Image as ImageIcon, FileSpreadsheet, Download, Search } from 'lucide-react';
import { Project } from '../../store/useStore';

const assets = [
  { name: '需求Brief.pdf', type: 'pdf', size: '2.4 MB', date: '3月16日', category: '需求文档' },
  { name: '实际执行周期表.xlsx', type: 'excel', size: '1.1 MB', date: '3月16日', category: '项目管理' },
  { name: '宣传片报价.xls', type: 'excel', size: '0.8 MB', date: '3月16日', category: '项目管理' },
  { name: '脚本大纲_v1_内部版.docx', type: 'doc', size: '1.5 MB', date: '3月23日', category: '创意资产' },
  { name: '堪景参考图_场景A.jpg', type: 'image', size: '4.2 MB', date: '3月25日', category: '视觉资产' },
];

export function AssetsTab({ project }: { project: Project }) {
  return (
    <div className="p-8 max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mb-8 flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-bold text-zinc-900">角色资产与资源管理</h2>
          <p className="text-zinc-500 mt-2">集中沉淀制片过程中的所有文档与视觉资产</p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
          <input 
            type="text" 
            placeholder="搜索文件..." 
            className="pl-9 pr-4 py-2 bg-white border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
          />
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-8">
        {['全部文件', '需求文档', '创意资产', '视觉资产'].map((cat, i) => (
          <button key={i} className={`p-4 rounded-xl border text-left transition-colors ${i === 0 ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50'}`}>
            <p className="font-medium">{cat}</p>
            <p className="text-sm mt-1 opacity-70">{i === 0 ? assets.length : assets.filter(a => a.category === cat).length} 个文件</p>
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-zinc-50 text-sm font-medium text-zinc-500">
              <th className="p-4 border-b border-zinc-200">文件名称</th>
              <th className="p-4 border-b border-zinc-200">分类</th>
              <th className="p-4 border-b border-zinc-200">大小</th>
              <th className="p-4 border-b border-zinc-200">上传时间</th>
              <th className="p-4 border-b border-zinc-200 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="text-zinc-800 text-sm divide-y divide-zinc-100">
            {assets.map((file, idx) => (
              <tr key={idx} className="hover:bg-zinc-50 transition-colors group">
                <td className="p-4 flex items-center">
                  <div className="w-8 h-8 rounded bg-zinc-100 flex items-center justify-center mr-3 text-zinc-500 shrink-0">
                    {file.type === 'pdf' ? <FileText size={16} className="text-red-500" /> :
                     file.type === 'excel' ? <FileSpreadsheet size={16} className="text-green-500" /> :
                     file.type === 'image' ? <ImageIcon size={16} className="text-purple-500" /> :
                     <FileText size={16} className="text-blue-500" />}
                  </div>
                  <span className="font-medium text-zinc-900 truncate max-w-[200px]">{project.id === 'p1' ? file.name : `新_${file.name}`}</span>
                </td>
                <td className="p-4 text-zinc-500">
                  <span className="px-2.5 py-1 bg-zinc-100 rounded-md text-xs">{file.category}</span>
                </td>
                <td className="p-4 text-zinc-500">{file.size}</td>
                <td className="p-4 text-zinc-500">{file.date}</td>
                <td className="p-4 text-right">
                  <button className="p-2 text-zinc-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100">
                    <Download size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
