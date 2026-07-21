import React from 'react';
import { useStore } from '../store/useStore';
import { Briefcase, Camera, ArrowRight } from 'lucide-react';

// 用户是主体，身份是进入时选择的工作视角（0719 §6）
const USER = {
  id: 'zhangzixiong',
  name: '子雄',
  avatar: 'https://ui-avatars.com/api/?name=子&background=18181B&color=fff',
  identities: [
    { role: 'boss' as const, title: '老板' },
    { role: 'employee' as const, title: '导演' },
  ],
};

const IDENTITY_UI: Record<string, { icon: any; color: string; desc: string }> = {
  老板: { icon: Briefcase, color: 'bg-zinc-900', desc: '全局项目、报价利润、风险与团队执行状态' },
  导演: { icon: Camera, color: 'bg-amber-500', desc: '我的任务、排期、上传成果与反馈' },
};

export function Login() {
  const { login } = useStore();

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-xl mx-auto mb-6 text-2xl font-extrabold">
          N
        </div>
        <h2 className="text-3xl font-extrabold text-zinc-900">Noah</h2>
        <p className="mt-2 text-sm text-zinc-500">你的项目经理</p>
      </div>

      <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-6">
          <div className="flex items-center gap-3 mb-1">
            <img src={USER.avatar} alt="" className="w-10 h-10 rounded-full" />
            <div>
              <h3 className="text-lg font-bold text-zinc-900">欢迎回来，{USER.name}</h3>
              <p className="text-sm text-zinc-500">今天准备以哪个身份开始工作？</p>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {USER.identities.map((id) => {
              const ui = IDENTITY_UI[id.title];
              const Icon = ui.icon;
              return (
                <button
                  key={id.title}
                  onClick={() => login({ id: USER.id, name: USER.name, role: id.role, avatar: USER.avatar, title: id.title, identities: USER.identities })}
                  className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-zinc-100 hover:border-blue-300 hover:bg-blue-50/40 transition-all text-left group"
                >
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-white shadow-sm shrink-0 ${ui.color}`}>
                    <Icon size={22} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-zinc-900 group-hover:text-blue-700">{USER.name}｜{id.title}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">{ui.desc}</p>
                  </div>
                  <ArrowRight size={18} className="text-zinc-300 group-hover:text-blue-500 transition-colors" />
                </button>
              );
            })}
          </div>
          <p className="mt-4 text-[11px] text-zinc-400 text-center">进入后可在右上角随时切换身份</p>
        </div>
      </div>
    </div>
  );
}
