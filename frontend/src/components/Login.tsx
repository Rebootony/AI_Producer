import React from 'react';
import { useStore } from '../store/useStore';
import { Video, Briefcase, Camera } from 'lucide-react';

export function Login() {
  const { login } = useStore();

  const roles = [
    {
      id: 'boss',
      name: '创始人 / 老板',
      role: 'boss' as const,
      desc: '负责全局监控、预算审批、立项与需求下发',
      icon: Briefcase,
      avatar: 'https://ui-avatars.com/api/?name=老板&background=18181B&color=fff',
      color: 'bg-zinc-900',
      hover: 'hover:border-zinc-900'
    },
    {
      id: 'employee',
      name: '张导 / 执行团队',
      role: 'employee' as const,
      desc: '负责接收任务、现场勘景、反馈执行进度与阻力',
      icon: Camera,
      avatar: 'https://ui-avatars.com/api/?name=张导&background=F59E0B&color=fff',
      color: 'bg-amber-500',
      hover: 'hover:border-amber-500'
    }
  ];

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-xl mx-auto mb-6">
          <Video size={32} />
        </div>
        <h2 className="text-3xl font-extrabold text-zinc-900">AI 制片工作台</h2>
        <p className="mt-2 text-sm text-zinc-600">
          请选择您要扮演的角色以进入系统
        </p>
      </div>

      <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-2xl">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {roles.map((role) => {
            const Icon = role.icon;
            return (
              <button
                key={role.id}
                onClick={() => login({ id: role.id, name: role.name, role: role.role, avatar: role.avatar })}
                className={`bg-white overflow-hidden shadow rounded-2xl border-2 border-transparent ${role.hover} transition-all duration-200 text-left group`}
              >
                <div className="p-6">
                  <div className="flex items-center">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white shadow-sm ${role.color}`}>
                      <Icon size={24} />
                    </div>
                    <div className="ml-4">
                      <h3 className="text-lg font-bold text-zinc-900 group-hover:text-blue-600 transition-colors">{role.name}</h3>
                      <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider">{role.role === 'boss' ? 'MANAGEMENT' : 'EXECUTION'}</p>
                    </div>
                  </div>
                  <div className="mt-4 text-sm text-zinc-600 leading-relaxed">
                    {role.desc}
                  </div>
                </div>
                <div className="bg-zinc-50 px-6 py-3 border-t border-zinc-100 flex justify-between items-center group-hover:bg-blue-50 transition-colors">
                  <span className="text-sm font-medium text-zinc-600 group-hover:text-blue-700">进入沙盒</span>
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
