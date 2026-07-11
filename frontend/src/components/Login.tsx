import React from 'react';
import { useStore } from '../store/useStore';
import { Video, Briefcase, Camera } from 'lucide-react';

export function Login() {
  const { login } = useStore();

  // 账号 = 正式用户名 + 一个或多个身份（§10 用户名+身份、§11 多身份切换）
  const accounts = [
    {
      id: 'zhangzixiong', name: '张子雄', icon: Briefcase,
      avatar: 'https://ui-avatars.com/api/?name=张&background=18181B&color=fff',
      color: 'bg-zinc-900', hover: 'hover:border-zinc-900',
      desc: '全局监控、预算审批、立项与需求下发；也可切到导演视角执行任务。',
      identities: [{ role: 'boss' as const, title: '老板' }, { role: 'employee' as const, title: '导演' }],
    },
    {
      id: 'zhangdao', name: '张导', icon: Camera,
      avatar: 'https://ui-avatars.com/api/?name=导&background=F59E0B&color=fff',
      color: 'bg-amber-500', hover: 'hover:border-amber-500',
      desc: '接收任务、现场勘景、上传成果、反馈执行进度与阻力。',
      identities: [{ role: 'employee' as const, title: '导演' }],
    },
  ];

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-xl mx-auto mb-6">
          <Video size={32} />
        </div>
        <h2 className="text-3xl font-extrabold text-zinc-900">诺亚 · 制片工作台</h2>
        <p className="mt-2 text-sm text-zinc-600">
          请选择登录账号（含身份，可进入后切换）
        </p>
      </div>

      <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-2xl">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {accounts.map((acc) => {
            const Icon = acc.icon;
            const first = acc.identities[0];
            return (
              <button
                key={acc.id}
                onClick={() => login({ id: acc.id, name: acc.name, role: first.role, avatar: acc.avatar, title: first.title, identities: acc.identities })}
                className={`bg-white overflow-hidden shadow rounded-2xl border-2 border-transparent ${acc.hover} transition-all duration-200 text-left group`}
              >
                <div className="p-6">
                  <div className="flex items-center">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white shadow-sm ${acc.color}`}>
                      <Icon size={24} />
                    </div>
                    <div className="ml-4">
                      <h3 className="text-lg font-bold text-zinc-900 group-hover:text-blue-600 transition-colors">{acc.name}</h3>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {acc.identities.map((id) => (
                          <span key={id.title} className="text-[11px] px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600">{acc.name}｜{id.title}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 text-sm text-zinc-600 leading-relaxed">
                    {acc.desc}
                  </div>
                </div>
                <div className="bg-zinc-50 px-6 py-3 border-t border-zinc-100 flex justify-between items-center group-hover:bg-blue-50 transition-colors">
                  <span className="text-sm font-medium text-zinc-600 group-hover:text-blue-700">
                    {acc.identities.length > 1 ? `以「${first.title}」进入 · 可切换身份` : `以「${first.title}」进入`}
                  </span>
                  <span className="text-zinc-400 group-hover:text-blue-600">→</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
