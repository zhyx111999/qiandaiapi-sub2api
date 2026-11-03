// 参考图附加费（USD/张）：每张随生图请求发送的参考图在出图价之外加收。分组可设一个统一单价，
// 并按模型族覆盖；单价取值顺序与后端 ReferenceImageUnitPrice 一致：族价 → 统一单价 → 模型默认价
// （DefaultReferenceImagePrice：NovelAI V4.5 $0.05、V5 $0.075，其他模型 0）。

export type ImageReferenceModelPricesForm = Record<string, number | string | null>;

export interface ImageReferenceFamily {
  key: string;
  label: string;
  defaultPrice: number;
}

export const novelAIReferenceFamilies: readonly ImageReferenceFamily[] = [
  { key: "nai-diffusion-4-5", label: "NovelAI V4.5", defaultPrice: 0.05 },
  { key: "nai-diffusion-5", label: "NovelAI V5", defaultPrice: 0.075 },
];

/** 分组表单中列出的模型族：NovelAI 与组合分组列出 NovelAI 两族。 */
export const referenceFamiliesForPlatform = (platform: string): readonly ImageReferenceFamily[] =>
  platform === "novelai" || platform === "composite" ? novelAIReferenceFamilies : [];

/** 表单值 → 单价；空串、空值、负数与非数字视为未配置。 */
export const parseReferencePrice = (value: number | string | null | undefined): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const price = Number(value);
  return Number.isFinite(price) && price >= 0 ? price : null;
};

/** 某模型族的最终单价（未乘倍率）。 */
export const referenceUnitPrice = (
  familyPrice: number | string | null | undefined,
  flatPrice: number | string | null | undefined,
  defaultPrice: number,
): number => parseReferencePrice(familyPrice) ?? parseReferencePrice(flatPrice) ?? defaultPrice;

export const createImageReferenceModelPricesForm = (
  prices?: Record<string, number> | null,
): ImageReferenceModelPricesForm => ({ ...(prices ?? {}) });

/** 提交用：丢弃未配置的族；编辑时提交空对象即清除全部族价。 */
export const serializeImageReferenceModelPrices = (
  form: ImageReferenceModelPricesForm,
): Record<string, number> => {
  const prices: Record<string, number> = {};
  for (const [key, value] of Object.entries(form)) {
    const price = parseReferencePrice(value);
    if (price !== null) prices[key] = price;
  }
  return prices;
};
