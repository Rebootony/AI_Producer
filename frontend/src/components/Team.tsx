import React from 'react';
import { useStore } from '../store/useStore';
import { Mail, Phone, MoreVertical, Circle } from 'lucide-react';
import { cn } from '../utils';

export function Team() {
  const { team, currentProjectId } = useStore();

  const projectTeam = (team || []).filter(m => currentProjectId && m.projectIds.includes(currentProjectId));

  const renderSection = (title: string, department: 'client' | 'management' | 'execution') => {
    const members = projectTeam.filter(m => m.department === department);
    if (members.length === 0) return null;

    return (
      <div className="mb-10">
        <h3 className="text-lg font-bold text-zinc-800 mb-4">{title}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {members.map(member => (
            <div key={member.id} className="bg-white p-5 rounded-2xl border border-zinc-100 shadow-sm hover:shadow-md transition-shadow group">
              <div className="flex justify-between items-start mb-4">
                <div className="relative">
                  <img src={member.avatar} alt={member.name} className="w-14 h-14 rounded-full shadow-sm" />
                  <div className={cn(
                    "absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-white",
                    member.status === 'online' ? "bg-green-500" : member.status === 'busy' ? "bg-red-500" : "bg-zinc-400"
                  )}></div>
                </div>
                <button className="text-zinc-400 hover:text-zinc-600">
                  <MoreVertical size={18} />
                </button>
              </div>
              
              <div className="mb-4">
                <h4 className="font-bold text-zinc-800 text-lg">{member.name}</h4>
                <p className="text-sm text-blue-600 font-medium mb-1">{member.role}</p>
                {member.currentTask ? (
                  <p className="text-xs text-zinc-500 flex items-center mt-2 bg-zinc-50 p-2 rounded-lg">
                    <Circle size={8} className={cn(
                      "mr-2 shrink-0 fill-current",
                      member.status === 'busy' ? "text-red-500" : "text-green-500"
                    )} />
                    <span className="truncate">{member.currentTask}</span>
                  </p>
                ) : (
                  <p className="text-xs text-zinc-400 flex items-center mt-2 bg-zinc-50 p-2 rounded-lg">
                    <Circle size={8} className="mr-2 shrink-0 text-zinc-300 fill-current" />
                    空闲中
                  </p>
                )}
              </div>

              <div className="flex items-center space-x-2 border-t border-zinc-100 pt-4 mt-4">
                <button className="flex-1 flex items-center justify-center space-x-2 py-2 bg-zinc-50 text-zinc-600 rounded-xl hover:bg-blue-50 hover:text-blue-600 transition-colors text-sm font-medium">
                  <Mail size={16} />
                  <span>发消息</span>
                </button>
                <button className="p-2 bg-zinc-50 text-zinc-600 rounded-xl hover:bg-green-50 hover:text-green-600 transition-colors">
                  <Phone size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="h-full overflow-y-auto w-full p-8 pb-20">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h2 className="text-2xl font-bold text-zinc-800 mb-1">项目团队</h2>
            <p className="text-zinc-500 text-sm">管理当前项目流程中的所有参与角色。</p>
          </div>
          <button className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm">
            + 邀请成员
          </button>
        </div>

        {renderSection('客户团队 (Client)', 'client')}
        {renderSection('核心管理 (Management)', 'management')}
        {renderSection('执行团队 (Execution)', 'execution')}
      </div>
    </div>
  );
}