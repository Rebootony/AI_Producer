import { create } from 'zustand';

export type TabType = 'overview' | 'timeline' | 'budget' | 'assets' | 'team';
export type ViewType = 'dashboard' | 'project_dashboard' | 'project_chat';

export interface CurrentUser {
  id: string;
  name: string;
  role: 'boss' | 'employee';
  avatar: string;
}

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  department: 'client' | 'management' | 'execution';
  status: 'online' | 'busy' | 'offline';
  currentTask?: string;
  avatar: string;
  projectIds: string[];
}

export interface Message {
  id: string;
  role: 'user' | 'ai' | 'employee';
  content: string;
  timestamp: Date;
}

export interface Project {
  id: string;
  name: string;
  client: string;
  industry: string;
  budget: number;
  usedBudget: number;
  days: number;
  deliveryDate: string;
  status: 'planning' | 'in_progress' | 'completed';
  health: 'good' | 'warning' | 'danger';
}

export interface Session {
  id: string;
  name?: string;
  timestamp: string;
  unreadCount?: number;
}

interface AppState {
  currentUser: CurrentUser | null;
  login: (user: CurrentUser) => void;
  logout: () => void;

  view: ViewType;
  setView: (view: ViewType) => void;
  
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  
  currentProjectId: string | null;
  setCurrentProject: (id: string) => void;

  currentSessionId: string | null;
  setCurrentSessionId: (id: string) => void;
  
  sessions: Session[];
  setSessions: (sessions: Session[]) => void;

  projects: Project[];
  setProjects: (projects: Project[]) => void;
  addProject: (project: Project) => void;
  updateProject: (id: string, data: Partial<Project>) => void;
  
  messages: Message[];
  setMessages: (messages: Message[]) => void;
  addMessage: (message: Omit<Message, 'id' | 'timestamp'>) => void;

  team: TeamMember[];
}

const initialProjects: Project[] = [
  {
    id: 'p1',
    name: '达梦英文宣传片',
    client: '武汉达梦数据库股份有限公司',
    industry: 'IT-基础软件',
    budget: 0,
    usedBudget: 0,
    days: 35,
    deliveryDate: '—',
    status: 'planning',
    health: 'good'
  },
  {
    id: 'p2',
    name: '泰康之家·海琴府',
    client: '泰康之家·海琴府',
    industry: '高端康养地产',
    budget: 0,
    usedBudget: 0,
    days: 35,
    deliveryDate: '—',
    status: 'planning',
    health: 'good'
  }
];



const initialTeam: TeamMember[] = [
  { id: 't1', name: '潘映竹', role: '客户代表 (达梦)', department: 'client', status: 'online', currentTask: '审核《达梦英文宣传片》脚本大纲', avatar: 'https://ui-avatars.com/api/?name=潘&background=0D8ABC&color=fff', projectIds: ['p1'] },
  { id: 't2', name: '张导', role: '广告导演', department: 'execution', status: 'busy', currentTask: '勘景中', avatar: 'https://ui-avatars.com/api/?name=张&background=F59E0B&color=fff', projectIds: ['p1', 'p2'] },
  { id: 't3', name: '李制片', role: '执行制片', department: 'management', status: 'online', currentTask: '协调拍摄场地与器材', avatar: 'https://ui-avatars.com/api/?name=李&background=10B981&color=fff', projectIds: ['p1', 'p2', 'p3'] },
  { id: 't4', name: '王摄影', role: '摄影指导 (DP)', department: 'execution', status: 'offline', avatar: 'https://ui-avatars.com/api/?name=王&background=6366F1&color=fff', projectIds: ['p1'] },
  { id: 't5', name: '赵剪辑', role: '后期剪辑', department: 'execution', status: 'busy', currentTask: '剪辑蔚来TVC初版', avatar: 'https://ui-avatars.com/api/?name=赵&background=8B5CF6&color=fff', projectIds: ['p2', 'p3'] },
  { id: 't6', name: 'AI 制片', role: '智能统筹', department: 'management', status: 'online', currentTask: '全局监控 & 风险预警', avatar: 'https://ui-avatars.com/api/?name=AI&background=2563EB&color=fff', projectIds: ['p1', 'p2', 'p3'] }
];

export const useStore = create<AppState>((set) => ({
  currentUser: null,
  login: (user) => set({ currentUser: user }),
  logout: () => set({ currentUser: null, view: 'dashboard' }),

  view: 'dashboard',
  setView: (view) => set({ view }),
  
  activeTab: 'overview',
  setActiveTab: (tab) => set({ activeTab: tab }),
  
  currentProjectId: null,
  setCurrentProject: (id) => set({ currentProjectId: id, view: 'project_dashboard', currentSessionId: 'default' }),
  
  currentSessionId: null,
  setCurrentSessionId: (id) => set({ currentSessionId: id, view: 'project_chat' }),
  
  sessions: [],
  setSessions: (sessions) => set({ sessions }),
  
  projects: initialProjects,
  setProjects: (projects) => set({ projects }),
  addProject: (project) => set((state) => ({ projects: [project, ...state.projects] })),
  updateProject: (id, data) => set((state) => ({
    projects: state.projects.map(p => p.id === id ? { ...p, ...data } : p)
  })),

  messages: [],
  setMessages: (messages) => set({ messages }),
  addMessage: (msg) => set((state) => ({
    messages: [
      ...state.messages,
      { ...msg, id: Date.now().toString(), timestamp: new Date() }
    ]
  })),
  
  team: initialTeam,
}));
