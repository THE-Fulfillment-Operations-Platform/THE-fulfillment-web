// Nguồn DUY NHẤT cho màu nhãn trạng thái. Mỗi tông Tailwind một dòng; các bảng
// trạng thái (utils/enums.ts, utils/batch.ts và các màn) chỉ chọn tông, không tự
// viết class màu. Ý nghĩa: xám = chờ/mới, xanh dương = đang làm, tím = có file/thiết kế,
// cam = cần chú ý, lime = đã QC, lục = xong/bàn giao (lục đậm đặc = chặng cuối),
// đỏ = lỗi/huỷ. Viết class nguyên văn (không ghép chuỗi) để Tailwind JIT thấy.
// Nền vừa + viền ring để các nhãn cạnh nhau vẫn tách bạch ở cả sáng và tối.
export type Tone = 'slate' | 'violet' | 'blue' | 'sky' | 'cyan' | 'teal' | 'emerald' | 'lime' | 'yellow' | 'amber' | 'orange' | 'red' | 'pink' | 'fuchsia' | 'indigo' | 'redSolid' | 'greenSolid' | 'emeraldSolid'

export const TONE: Record<Tone, string> = {
  slate: 'bg-slate-100 text-slate-800 ring-1 ring-inset ring-slate-300 dark:bg-slate-500/25 dark:text-slate-200 dark:ring-slate-400/50',
  violet: 'bg-violet-100 text-violet-800 ring-1 ring-inset ring-violet-300 dark:bg-violet-500/25 dark:text-violet-200 dark:ring-violet-400/50',
  blue: 'bg-blue-100 text-blue-800 ring-1 ring-inset ring-blue-300 dark:bg-blue-500/25 dark:text-blue-200 dark:ring-blue-400/50',
  sky: 'bg-sky-100 text-sky-800 ring-1 ring-inset ring-sky-300 dark:bg-sky-500/25 dark:text-sky-200 dark:ring-sky-400/50',
  cyan: 'bg-cyan-100 text-cyan-800 ring-1 ring-inset ring-cyan-300 dark:bg-cyan-500/25 dark:text-cyan-200 dark:ring-cyan-400/50',
  teal: 'bg-teal-100 text-teal-800 ring-1 ring-inset ring-teal-300 dark:bg-teal-500/25 dark:text-teal-200 dark:ring-teal-400/50',
  emerald: 'bg-emerald-100 text-emerald-800 ring-1 ring-inset ring-emerald-300 dark:bg-emerald-500/25 dark:text-emerald-200 dark:ring-emerald-400/50',
  lime: 'bg-lime-100 text-lime-800 ring-1 ring-inset ring-lime-300 dark:bg-lime-500/25 dark:text-lime-200 dark:ring-lime-400/50',
  yellow: 'bg-yellow-100 text-yellow-800 ring-1 ring-inset ring-yellow-300 dark:bg-yellow-500/25 dark:text-yellow-200 dark:ring-yellow-400/50',
  amber: 'bg-amber-100 text-amber-800 ring-1 ring-inset ring-amber-300 dark:bg-amber-500/25 dark:text-amber-200 dark:ring-amber-400/50',
  orange: 'bg-orange-100 text-orange-800 ring-1 ring-inset ring-orange-300 dark:bg-orange-500/25 dark:text-orange-200 dark:ring-orange-400/50',
  red: 'bg-red-100 text-red-800 ring-1 ring-inset ring-red-300 dark:bg-red-500/25 dark:text-red-200 dark:ring-red-400/50',
  pink: 'bg-pink-100 text-pink-800 ring-1 ring-inset ring-pink-300 dark:bg-pink-500/25 dark:text-pink-200 dark:ring-pink-400/50',
  fuchsia: 'bg-fuchsia-100 text-fuchsia-800 ring-1 ring-inset ring-fuchsia-300 dark:bg-fuchsia-500/25 dark:text-fuchsia-200 dark:ring-fuchsia-400/50',
  indigo: 'bg-indigo-100 text-indigo-800 ring-1 ring-inset ring-indigo-300 dark:bg-indigo-500/25 dark:text-indigo-200 dark:ring-indigo-400/50',
  redSolid: 'bg-red-700 text-white ring-1 ring-inset ring-red-800 dark:bg-red-600 dark:text-white dark:ring-red-400/60',
  greenSolid: 'bg-green-700 text-white ring-1 ring-inset ring-green-800 dark:bg-green-600 dark:text-white dark:ring-green-400/60',
  emeraldSolid: 'bg-emerald-700 text-white ring-1 ring-inset ring-emerald-800 dark:bg-emerald-600 dark:text-white dark:ring-emerald-400/60',
}
