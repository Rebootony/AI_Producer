import React, { useState } from 'react';
import { cn } from '../../utils';
import { Project } from '../../store/useStore';
import { CheckCircle2, MessageSquare, AlertCircle } from 'lucide-react';

const timelineData = [
  { 
    week: '第一周', 
    date: '3月16日 - 3月22日', 
    tasks: ['需求沟通', '前期资料提供及沟通'], 
    status: 'completed',
    aiSummary: '本周已顺利完成客户需求 Brief 解析，立项并完成初步报价。所有前期基础资料已归档。',
    feedbacks: []
  },
  { 
    week: '第二周', 
    date: '3月23日 - 3月29日', 
    tasks: ['脚本大纲撰写', '出镜人员明细需求', '客户反馈'], 
    status: 'current',
    aiSummary: '正在推进脚本大纲的撰写，目前遇到一些阻力。我已经向导演组催促了出镜人员明细，预计今晚下班前能拿到反馈。',
    feedbacks: [
      { role: '导演(张导)', time: '10:30', content: '脚本大纲初稿已经发群里了，出镜人员名单还在和客户确认。', type: 'info' },
      { role: '制片(AI)', time: '10:32', content: '收到。请注意客户要求今天下班前必须定下人员名单，以免影响后续勘景。', type: 'warning' }
    ]
  },
  { 
    week: '第三周', 
    date: '3月30日 - 4月5日', 
    tasks: ['提交脚本大纲v2', '提交工作人员入住信息', 'PPM会议'], 
    status: 'pending',
    aiSummary: '下周的核心节点是 Final PPM 会议。我会在周二提前收集好所有工作人员信息并预定酒店。',
    feedbacks: []
  },
  { 
    week: '第四周', 
    date: '4月6日 - 4月12日', 
    tasks: ['现场堪景', '拍摄前准备', '提交拍摄计划'], 
    status: 'pending',
    aiSummary: '准备进入拍摄阶段，我将持续跟进现场堪景结果与风险排查。',
    feedbacks: []
  },
  { 
    week: '第五周', 
    date: '4月13日 - 4月19日', 
    tasks: ['拍摄DAY1-3', '整理素材', '后期剪辑/包装'], 
    status: 'pending',
    aiSummary: '后期阶段，我将每日向您同步粗剪进度。',
    feedbacks: []
  },
];

export function TimelineTab({ project }: { project: Project }) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const selectedItem = selectedIndex !== null ? timelineData[selectedIndex] : null;

  return (
    <div className="p-8 max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-zinc-900">执行排期与 AI 工作述职</h2>
        <p className="text-zinc-500 mt-2">预计总周期: {Math.round(project.days / 7)}周 | 交付时间: {project.deliveryDate}</p>
      </div>

      <div className="relative border-l-2 border-zinc-200 ml-4 space-y-8 pb-8">
        {timelineData.map((item, idx) => (
          <div key={idx} className="relative pl-8">
            {/* Status dot */}
            <div className={cn(
              "absolute -left-[9px] top-1 w-4 h-4 rounded-full border-4 border-white shadow-sm",
              item.status === 'completed' ? "bg-green-500" :
              item.status === 'current' ? "bg-blue-600 ring-4 ring-blue-100" :
              "bg-zinc-300"
            )}></div>

            <div className={cn(
              "bg-white p-6 rounded-2xl border shadow-sm transition-all",
              item.status === 'current' ? "border-blue-200 shadow-md ring-1 ring-blue-50" : "border-zinc-200"
            )}>
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-lg text-zinc-900">{item.week}</h3>
                <span className="text-sm font-medium text-zinc-500 bg-zinc-100 px-3 py-1 rounded-full">
                  {item.date}
                </span>
              </div>
              <div className="mb-4">
                <button
                  type="button"
                  onClick={() => setSelectedIndex(idx)}
                  className="text-xs px-3 py-1.5 rounded-full border border-zinc-200 text-zinc-600 hover:text-zinc-900 hover:border-zinc-300"
                >
                  查看详情
                </button>
              </div>

              {/* Tasks List */}
              <ul className="space-y-3 mb-5">
                {item.tasks.map((task, i) => (
                  <li key={i} className="flex items-center text-zinc-700">
                    <span className={cn(
                      "w-5 h-5 rounded-full flex items-center justify-center mr-3 text-xs",
                      item.status === 'completed' ? "bg-green-100 text-green-600" :
                      item.status === 'current' ? "bg-blue-100 text-blue-600" :
                      "bg-zinc-100 text-zinc-400"
                    )}>
                      {item.status === 'completed' ? <CheckCircle2 size={12} /> : i + 1}
                    </span>
                    {task}
                  </li>
                ))}
              </ul>

              {/* AI Debriefing (述职) */}
              {project.id === 'p1' && (
                <div className="bg-zinc-50 rounded-xl p-4 border border-zinc-100 mb-4">
                  <div className="flex items-center mb-2">
                    <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center mr-2">
                      <span className="text-xs font-bold">AI</span>
                    </div>
                    <span className="font-semibold text-sm text-zinc-800">阶段工作述职</span>
                  </div>
                  <p className="text-sm text-zinc-600 leading-relaxed">
                    {item.aiSummary}
                  </p>
                </div>
              )}

              {/* Executor Feedback (执行反馈) */}
              {item.feedbacks.length > 0 && project.id === 'p1' && (
                <div className="bg-white rounded-xl p-4 border border-zinc-200">
                  <div className="flex items-center mb-3">
                    <MessageSquare size={16} className="text-zinc-400 mr-2" />
                    <span className="font-semibold text-sm text-zinc-800">执行层实时沟通记录</span>
                  </div>
                  <div className="space-y-3">
                    {item.feedbacks.map((fb, fi) => (
                      <div key={fi} className="flex items-start text-sm">
                        <span className="text-zinc-400 text-xs mt-0.5 w-12 shrink-0">{fb.time}</span>
                        <div className="flex-1">
                          <span className={cn(
                            "font-medium mr-2",
                            fb.role.includes('AI') ? "text-blue-600" : "text-zinc-700"
                          )}>
                            {fb.role}:
                          </span>
                          <span className={fb.type === 'warning' ? 'text-orange-600' : 'text-zinc-600'}>
                            {fb.content}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-xl bg-white rounded-2xl p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-zinc-900">{selectedItem.week} 详情</h3>
                <p className="text-sm text-zinc-500">{selectedItem.date}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedIndex(null)}
                className="text-zinc-500 hover:text-zinc-800"
              >
                关闭
              </button>
            </div>

            <div className="mb-4">
              <p className="text-sm font-medium text-zinc-700 mb-2">阶段任务</p>
              <ul className="space-y-2 text-sm text-zinc-600">
                {selectedItem.tasks.map((task, i) => (
                  <li key={i}>• {task}</li>
                ))}
              </ul>
            </div>

            <div className="mb-4">
              <p className="text-sm font-medium text-zinc-700 mb-2">AI 述职摘要</p>
              <p className="text-sm text-zinc-600">{selectedItem.aiSummary}</p>
            </div>

            {selectedItem.feedbacks.length > 0 && (
              <div>
                <p className="text-sm font-medium text-zinc-700 mb-2">执行层反馈</p>
                <div className="space-y-2 text-sm text-zinc-600">
                  {selectedItem.feedbacks.map((fb, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="text-zinc-400">{fb.time}</span>
                      <span>
                        <span className={cn("font-medium", fb.role.includes('AI') ? "text-blue-600" : "text-zinc-700")}>{fb.role}</span>
                        ：{fb.content}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
