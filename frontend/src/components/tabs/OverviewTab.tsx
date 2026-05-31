import React, { useState } from 'react';
import { Target, Clock, DollarSign, Building } from 'lucide-react';
import { Project } from '../../store/useStore';

export function OverviewTab({ project }: { project: Project }) {
  const [detailKey, setDetailKey] = useState<string | null>(null);

  const detailContent: Record<string, { title: string; description: string; extra: string[] }> = {
    client: {
      title: '客户信息详情',
      description: project.client,
      extra: [project.industry, '项目联系人：潘映竹', '需求类型：品牌宣传片']
    },
    budget: {
      title: '预算详情',
      description: `总预算 ¥ ${(project.budget / 10000).toFixed(1)}万`,
      extra: [`当前评估 ¥ ${(project.usedBudget / 10000).toFixed(1)}万`, '预留风险金：¥ 3.0万', '主要成本：导演、摄影、场地']
    },
    timeline: {
      title: '交付时间详情',
      description: `交付时间：${project.deliveryDate}`,
      extra: [`制作周期：约 ${Math.round(project.days / 7)} 周`, '当前阶段：策划期', '下一节点：脚本大纲确认']
    },
    goal: {
      title: '核心目标详情',
      description: '品牌升级与营销传播',
      extra: ['核心主张：全球化科技伙伴形象', '传播场景：发布会/展会/客户拜访', '关键关键词：可靠、国际化、前沿']
    }
  };

  const detail = detailKey ? detailContent[detailKey] : null;

  return (
    <div className="p-8 max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-900">{project.name}</h1>
        <p className="text-zinc-500 mt-2">基于客户需求 Brief 智能提取</p>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-8">
        <div className="p-6 bg-white rounded-2xl border border-zinc-200 shadow-sm flex items-start space-x-4">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
            <Building size={24} />
          </div>
          <div>
            <p className="text-sm font-medium text-zinc-500 mb-1">客户信息</p>
            <p className="font-semibold text-zinc-900">{project.client}</p>
            <p className="text-sm text-zinc-500">{project.industry}</p>
            <button
              type="button"
              onClick={() => setDetailKey('client')}
              className="mt-3 text-xs px-3 py-1.5 rounded-full border border-zinc-200 text-zinc-600 hover:text-zinc-900 hover:border-zinc-300"
            >
              查看详情
            </button>
          </div>
        </div>

        <div className="p-6 bg-white rounded-2xl border border-zinc-200 shadow-sm flex items-start space-x-4">
          <div className="p-3 bg-green-50 text-green-600 rounded-xl">
            <DollarSign size={24} />
          </div>
          <div>
            <p className="text-sm font-medium text-zinc-500 mb-1">项目预算</p>
            <p className="font-semibold text-zinc-900">¥ {(project.budget / 10000).toFixed(1)}万</p>
            <p className="text-sm text-zinc-500">当前评估价: ¥ {(project.usedBudget / 10000).toFixed(1)}万</p>
            <button
              type="button"
              onClick={() => setDetailKey('budget')}
              className="mt-3 text-xs px-3 py-1.5 rounded-full border border-zinc-200 text-zinc-600 hover:text-zinc-900 hover:border-zinc-300"
            >
              查看详情
            </button>
          </div>
        </div>

        <div className="p-6 bg-white rounded-2xl border border-zinc-200 shadow-sm flex items-start space-x-4">
          <div className="p-3 bg-orange-50 text-orange-600 rounded-xl">
            <Clock size={24} />
          </div>
          <div>
            <p className="text-sm font-medium text-zinc-500 mb-1">交付时间</p>
            <p className="font-semibold text-zinc-900">{project.deliveryDate}</p>
            <p className="text-sm text-zinc-500">约 {Math.round(project.days / 7)} 周制作周期</p>
            <button
              type="button"
              onClick={() => setDetailKey('timeline')}
              className="mt-3 text-xs px-3 py-1.5 rounded-full border border-zinc-200 text-zinc-600 hover:text-zinc-900 hover:border-zinc-300"
            >
              查看详情
            </button>
          </div>
        </div>

        <div className="p-6 bg-white rounded-2xl border border-zinc-200 shadow-sm flex items-start space-x-4">
          <div className="p-3 bg-purple-50 text-purple-600 rounded-xl">
            <Target size={24} />
          </div>
          <div>
            <p className="text-sm font-medium text-zinc-500 mb-1">核心目标</p>
            <p className="font-semibold text-zinc-900">品牌升级与营销传播</p>
            <p className="text-sm text-zinc-500">塑造负责任、可持续的企业形象</p>
            <button
              type="button"
              onClick={() => setDetailKey('goal')}
              className="mt-3 text-xs px-3 py-1.5 rounded-full border border-zinc-200 text-zinc-600 hover:text-zinc-900 hover:border-zinc-300"
            >
              查看详情
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-6">
        <h3 className="font-semibold text-zinc-900 mb-4">内容核心要素</h3>
        <ul className="space-y-3">
          <li className="flex items-center text-sm text-zinc-700">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mr-3"></span>
            品牌立意：展现身份与实力，明确品牌核心定位
          </li>
          <li className="flex items-center text-sm text-zinc-700">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mr-3"></span>
            商业价值：呈现产品或技术如何改变现实，结合行业案例
          </li>
          <li className="flex items-center text-sm text-zinc-700">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mr-3"></span>
            应用场景：发布会、展会活动、客户拜访、自媒体平台
          </li>
        </ul>
      </div>

      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-xl bg-white rounded-2xl p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-zinc-900">{detail.title}</h3>
                <p className="text-sm text-zinc-500">{detail.description}</p>
              </div>
              <button
                type="button"
                onClick={() => setDetailKey(null)}
                className="text-zinc-500 hover:text-zinc-800"
              >
                关闭
              </button>
            </div>
            <ul className="space-y-2 text-sm text-zinc-600">
              {detail.extra.map((item, idx) => (
                <li key={idx}>• {item}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
