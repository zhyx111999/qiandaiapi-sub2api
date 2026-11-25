# NovelAI Chat 图片结算与 v2.25.0 合并

本次合并上游 `ranxi2001/sub2api` 的正式标签 `v2.25.0`（`0fa2cb6ac91effee2a45b933bb44b460f05a8c49`），保留千代 NovelAI 原生接口、像素阶梯和参考图价格、状态检测、v4 监控及定制模型广场。

## 修复行为

NAI 渠道通过 `/v1/chat/completions` 返回 Markdown 内嵌 PNG 时，旧路径只记录了上游 token usage，没有记录图片数量。渠道价卡选择 `billing_mode=image` 后，结算数量为 0，最终不扣余额。线上记录 68857（`nai-diffusion-5-full`，输入 1、输出 900000、图片 0、费用 0）确认了该触发条件。

`internal/service/novelai_chat_images.go` 作为响应观察模块，在原有 raw Chat 转发的非流式 JSON 和 SSE payload 解析处接入：

- 按 choice 累积 assistant 内容，识别完整 Markdown PNG data URL，支持跨 SSE chunk。
- 复用现有图片头解析函数提取实际宽高，填入图片数量、像素数和 NovelAI 面积档位。832×1216 仍属 1K 面积档；请求尺寸不覆盖实际返回尺寸。
- 参考图附加费只读取最后一条 user 消息 JSON 的 `character_references[].image`，兼容单 text part；底图和历史消息不计入。
- 复用 `OpenAIGatewayService.RecordUsage` 及其原有价卡解析、倍率、扣款和幂等逻辑。图片价卡、显式免费阶梯、独立图片倍率、显式 token 价卡均保留优先级。
- 请求内容、上游响应内容和 token usage 均不改写。未返回完整图片时不虚构图片数量；其他平台不启用该观察器。

## 合并要点

- 免费 NovelAI 元数据/discovery 的鉴权行为与上游 group-health、usage/records 只读路由共存。
- 千代账号状态检测完成回调与上游质量检测、独立完成 context 共存；在构建机重新生成 Wire。
- 模型广场保留厂商筛选、token/media 分表和官方价格切换，接入上游客户币种、钱包单位价值、官方模型币种及最低费用展示；NAI 原生工具附加费基价也通过同一币种格式化函数展示。
- 上游 v2.25.0 移除旧用户流量功能，迁移会删除 `user_traffic_events` 与 `user_traffic_hourly`。部署前须导出这些表；应用镜像回退不会自动恢复表。正常用量账单仍保留。

## 定点验证

构建机使用 Go 1.27.4、项目锁定依赖与 Node 工具链，未在个人电脑构建或跑应用测试。

- 后端四个包专项：176 个顶层测试通过。包含 NovelAI 价卡/原生路由/Chat、参考图、最低费用、状态检测、v4 监控、API Key 鉴权和只读 usage/group-health。
- 新增 Chat→RecordUsage 验证覆盖流式与非流式、实际尺寸、普通/独立图片倍率、参考图附加费、显式免费档、显式 token 卡；同时检查调用扣款仓库的金额。另覆盖完整/多张/截断/非法图片、平台隔离、最后 user 消息参考图解析。
- 前端模型广场、币种、v4、状态检测和侧栏相关 23 文件/194 测试；币种表头和 NAI 原生工具币种调整后仅重跑受影响文件。Settings 通知和平台列表另作定点验证。
- locale 完整性、类型检查与生产前端构建通过。

迁移演练、生产切换、真实生成及余额验收的结果记录在独立交付目录，不将管理凭据、数据库转储或生成图片纳入源码仓库。
