/**
 * 模型厂商：按模型身份（而非转发平台，如 Antigravity 转发 Claude）归类，用于广场的厂商切换。
 * 识别规则沿用千代原站价格看板（FairPricingBoard.vendorOf）。
 */
import type { PlazaModel } from '@/api/modelPlaza'

export interface PlazaVendor {
  id: string
  /** PlatformIcon 的平台图标；无专属图标的厂商为空。 */
  icon: string
  /** 品牌色；单色 logo 跟随文字颜色。 */
  color?: string
}

const VENDORS: Record<string, PlazaVendor> = {
  claude: { id: 'claude', icon: 'anthropic', color: '#D97757' },
  openai: { id: 'openai', icon: 'openai' },
  gemini: { id: 'gemini', icon: 'gemini', color: '#4285F4' },
  grok: { id: 'grok', icon: 'grok' },
  zhipu: { id: 'zhipu', icon: 'zhipu', color: '#3859FF' },
  kimi: { id: 'kimi', icon: 'kimi' },
  deepseek: { id: 'deepseek', icon: 'deepseek', color: '#4D6BFE' },
  minimax: { id: 'minimax', icon: 'minimax', color: '#F23F5D' },
  qwen: { id: 'qwen', icon: '' },
  novelai: { id: 'novelai', icon: 'novelai' }
}

/** 模型所属厂商 id；名字认不出时退回模型平台。 */
export function vendorOf(model: PlazaModel): string {
  if (model.platform === 'novelai') return 'novelai'
  const name = model.name.toLowerCase()
  if (name.includes('claude')) return 'claude'
  if (name.includes('gemini')) return 'gemini'
  if (name.includes('grok')) return 'grok'
  if (/(gpt|chatgpt|codex|(?:^|\/)o[134](?:-|$))/.test(name)) return 'openai'
  if (/(glm|zhipu)/.test(name)) return 'zhipu'
  if (/(kimi|moonshot)/.test(name)) return 'kimi'
  if (name.includes('deepseek')) return 'deepseek'
  if (name.includes('minimax')) return 'minimax'
  if (/(qwen|qwq)/.test(name)) return 'qwen'
  return model.platform || 'other'
}

/** 厂商展示信息；未登记的厂商（平台兜底）用其平台图标。 */
export function plazaVendor(id: string): PlazaVendor {
  return VENDORS[id] ?? { id, icon: id }
}

/** 已登记厂商的名称走 i18n（modelPlaza.vendors.*），其余显示平台名。 */
export function isKnownVendor(id: string): boolean {
  return id in VENDORS
}
