import React from 'react';
import { Target, Clock, DollarSign, Building } from 'lucide-react';
import { Project } from '../../store/useStore';

export function OverviewTab({ project }: { project: Project }) {
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
    </div>
  );
}
