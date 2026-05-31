import React from 'react';
import { Project } from '../../store/useStore';

export function BudgetTab({ project }: { project: Project }) {
  const maxBudget = project.budget;
  const currentBudget = project.usedBudget;
  const percentage = maxBudget > 0 ? (currentBudget / maxBudget) * 100 : 0;

  return (
    <div className="p-8 max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-zinc-900">预算控制</h2>
        <p className="text-zinc-500 mt-2">基于最新需求与报价智能核算</p>
      </div>

      <div className="grid grid-cols-3 gap-6 mb-8">
        <div className="col-span-2 bg-white p-8 rounded-2xl border border-zinc-200 shadow-sm flex flex-col justify-center">
          <div className="flex justify-between items-end mb-4">
            <div>
              <p className="text-sm font-medium text-zinc-500 mb-1">当前已规划预算</p>
              <h3 className="text-4xl font-bold text-zinc-900">¥ {currentBudget.toLocaleString()}</h3>
            </div>
            <div className="text-right">
              <p className="text-sm font-medium text-zinc-500 mb-1">项目总预算</p>
              <p className="text-xl font-semibold text-zinc-700">¥ {maxBudget.toLocaleString()}</p>
            </div>
          </div>
          <div className="w-full bg-zinc-100 rounded-full h-4 overflow-hidden mt-4">
            <div 
              className={`h-4 rounded-full transition-all duration-1000 ${percentage > 90 ? 'bg-red-500' : percentage > 70 ? 'bg-orange-500' : 'bg-green-500'}`}
              style={{ width: `${percentage}%` }}
            ></div>
          </div>
          <p className="text-sm text-zinc-500 mt-3 text-right">预算水位: {percentage.toFixed(1)}%</p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm flex flex-col justify-center items-center text-center">
          <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-4 ${percentage > 90 ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
            <span className="text-2xl font-bold">{percentage > 90 ? '超标' : '健康'}</span>
          </div>
          <p className="font-semibold text-zinc-900">成本状态评估</p>
          <p className="text-sm text-zinc-500 mt-1">
            {percentage > 90 ? '预算告急，请控制支出' : '目前预算仍在安全控制范围内'}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-zinc-200">
          <h3 className="font-bold text-lg text-zinc-900">核心报价明细</h3>
        </div>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-zinc-50 text-sm font-medium text-zinc-500">
              <th className="p-4 border-b border-zinc-200">项目类别</th>
              <th className="p-4 border-b border-zinc-200">细项</th>
              <th className="p-4 border-b border-zinc-200 text-right">单价</th>
              <th className="p-4 border-b border-zinc-200 text-right">数量</th>
              <th className="p-4 border-b border-zinc-200 text-right">金额小计</th>
            </tr>
          </thead>
          <tbody className="text-zinc-800 text-sm divide-y divide-zinc-100">
            <tr>
              <td className="p-4 font-medium text-zinc-900" rowSpan={2}>前期筹备 (Preparation)</td>
              <td className="p-4">创意方案</td>
              <td className="p-4 text-right">¥ 3,000</td>
              <td className="p-4 text-right">1 项</td>
              <td className="p-4 text-right font-medium">¥ 3,000</td>
            </tr>
            <tr>
              <td className="p-4">执行脚本</td>
              <td className="p-4 text-right">¥ 3,000</td>
              <td className="p-4 text-right">1 项</td>
              <td className="p-4 text-right font-medium">¥ 3,000</td>
            </tr>
            <tr>
              <td className="p-4 font-medium text-zinc-900" rowSpan={3}>拍摄执行 (Production)</td>
              <td className="p-4">导演</td>
              <td className="p-4 text-right">¥ 3,000</td>
              <td className="p-4 text-right">{currentBudget > 120000 ? '4' : '3'} 天</td>
              <td className="p-4 text-right font-medium text-blue-600">
                ¥ {currentBudget > 120000 ? '12,000' : '9,000'}
              </td>
            </tr>
            <tr>
              <td className="p-4">制片</td>
              <td className="p-4 text-right">¥ 1,500</td>
              <td className="p-4 text-right">3 天</td>
              <td className="p-4 text-right font-medium">¥ 4,500</td>
            </tr>
            <tr>
              <td className="p-4">摄影</td>
              <td className="p-4 text-right">¥ 2,500</td>
              <td className="p-4 text-right">{currentBudget > 120000 ? '4' : '3'} 天</td>
              <td className="p-4 text-right font-medium text-blue-600">
                ¥ {currentBudget > 120000 ? '10,000' : '7,500'}
              </td>
            </tr>
          </tbody>
        </table>
        {currentBudget > 118860 && project.id === 'p1' && (
          <div className="p-4 bg-orange-50 border-t border-orange-100 text-sm text-orange-800">
            <span className="font-semibold mr-2">更新记录:</span>
            根据最新沟通，拍摄天数增加 1 天，导演和摄影费用总计增加 5,500 元。
          </div>
        )}
      </div>
    </div>
  );
}
