// 全端统一的任务状态：名称 + 颜色（7.10 §4.3 / §4.4）
// 未开始=灰 进行中=蓝 待审核=黄 已完成=绿 需修改/已逾期=红
export const STATUS_LABEL: Record<string, string> = {
  pending: '未开始',
  in_progress: '进行中',
  submitted: '待审核',
  done: '已完成',
  revision: '需修改',
  delayed: '已逾期',
};

export const STATUS_STYLE: Record<string, string> = {
  pending: 'bg-zinc-100 text-zinc-500',
  in_progress: 'bg-blue-50 text-blue-600',
  submitted: 'bg-amber-50 text-amber-700',
  done: 'bg-green-50 text-green-700',
  revision: 'bg-red-50 text-red-600',
  delayed: 'bg-red-50 text-red-600',
};

// 逾期覆盖：任何"未完成但已逾期"的任务，统一按【已逾期·红】显示——Boss 端不再出现假对勾
export function displayStatus(status: string, overdue?: boolean): { key: string; label: string; style: string } {
  if (overdue && status !== 'done') {
    return { key: 'delayed', label: '已逾期', style: STATUS_STYLE.delayed };
  }
  return {
    key: status,
    label: STATUS_LABEL[status] || status,
    style: STATUS_STYLE[status] || STATUS_STYLE.pending,
  };
}
