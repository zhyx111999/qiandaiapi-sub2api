-- Per-reference-image surcharge on image generation (QiandaiAPI).
-- Resolution order in billing: per-model map → flat column → code defaults (NovelAI V4/V4.5 $0.05, V5 $0.075).
ALTER TABLE groups
    ADD COLUMN IF NOT EXISTS image_reference_price DECIMAL(20,8),
    ADD COLUMN IF NOT EXISTS image_reference_model_prices JSONB;

COMMENT ON COLUMN groups.image_reference_price IS
    '每张参考图的附加单价 (USD)，按图片倍率结算；NULL 表示不覆盖，回退到模型默认价';
COMMENT ON COLUMN groups.image_reference_model_prices IS
    '可选：按模型族覆盖参考图单价 (USD/张)。key 为规范模型族 (nai-diffusion-4-5 / nai-diffusion-5) 或模型 ID；NULL/空表示不覆盖';
