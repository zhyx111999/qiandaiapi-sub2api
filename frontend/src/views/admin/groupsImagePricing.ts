export const imagePricingPlatforms = new Set([
  "antigravity",
  "composite",
  "gemini",
  "grok",
  "novelai",
  "openai",
]);

export const supportsImagePricingPlatform = (platform: string): boolean =>
  imagePricingPlatforms.has(platform);

// 与后端 DefaultAllowImageGenerationForPlatform 一致：这些平台新建分组默认允许生图。
const imageGenerationDefaultPlatforms = new Set(["antigravity", "gemini", "grok", "novelai"]);

export const defaultAllowImageGenerationForPlatform = (platform: string): boolean =>
  imageGenerationDefaultPlatforms.has(platform);

export const supportsVideoPricingPlatform = (platform: string): boolean =>
  platform === "grok";

export const imagePricingI18nKey = (_platform: string, key: string): string =>
  `admin.groups.imagePricing.${key}`;

export const videoPricingI18nKey = (key: string): string =>
  `admin.groups.videoPricing.${key}`;

type ImagePricingTierKey = "image_price_1k" | "image_price_2k" | "image_price_4k";
type VideoPricingTierKey =
  | "video_price_480p"
  | "video_price_720p"
  | "video_price_1080p";

// 默认单张价（USD）。NovelAI 按模型族各有一套（V4.5 / V5），与后端 novelAIDefaultImagePrices 一致。
const defaultImagePrices: Record<string, Record<ImagePricingTierKey, number[]>> = {
  default: {
    image_price_1k: [0.134],
    image_price_2k: [0.201],
    image_price_4k: [0.268],
  },
  grok: {
    image_price_1k: [0.02],
    image_price_2k: [0.02],
    image_price_4k: [0.02],
  },
  novelai: {
    image_price_1k: [0.001, 0.035],
    image_price_2k: [0.6, 0.9],
    image_price_4k: [0.6, 0.9],
  },
};

const defaultImagePriceCard = (platform: string) =>
  defaultImagePrices[platform] ?? defaultImagePrices.default;

// 视频价为每秒单价（USD/s）。480p/720p 取 grok-imagine-video（文生视频实际走该模型）的
// 官方每秒价；1080p 仅 grok-imagine-video-1.5 图生视频支持，取 1.5 的每秒价。
const defaultVideoPricePlaceholders: Record<
  string,
  Record<VideoPricingTierKey, string>
> = {
  grok: {
    video_price_480p: "0.05",
    video_price_720p: "0.07",
    video_price_1080p: "0.25",
  },
};

export const getImagePricePlaceholder = (
  platform: string,
  tier: ImagePricingTierKey,
): string => defaultImagePriceCard(platform)[tier].join(" / ");

export const getVideoPricePlaceholder = (
  platform: string,
  tier: VideoPricingTierKey,
): string => {
  const card = defaultVideoPricePlaceholders[platform];
  return card?.[tier] ?? "";
};

/** 默认单张价；按模型族定价的平台（NovelAI）每族一个。 */
export const getDefaultImagePreviewPrices = (
  platform: string,
  tier: ImagePricingTierKey,
): number[] => [...defaultImagePriceCard(platform)[tier]];

export const getDefaultVideoPreviewPrice = (
  platform: string,
  tier: VideoPricingTierKey,
): number | null => {
  const placeholder = getVideoPricePlaceholder(platform, tier);
  if (placeholder === "") {
    return null;
  }
  const value = Number(placeholder);
  return Number.isFinite(value) ? value : null;
};
