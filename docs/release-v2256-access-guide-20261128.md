# v2.25.6 合并与用户接入指南

合入 `ranxi2001/sub2api` 正式标签 `v2.25.6`（`82988694ae4cece6493562cd06bc323c8b290b14`），保留千代的 NovelAI 平台、Chat 图片结算、原生工具定价、参考图附加费、模型广场、账号状态检测和 v4 渠道监控。

## 合并处理

- 保留既有贡献者提交历史，在 v2.25.0 千代主线上合并 v2.25.6；不使用覆盖式源码替换。
- 上游已移除旧请求诊断页面，删除该页面遗留的千代样式测试。
- 多分组开关的新提示角标接入千代已有的紧凑悬浮布局，并统一同一导航里的 Exa 提示。检查全部角标的布局与独立关闭行为，避免新增提示挤占标签宽度。
- Wire 在构建机重新生成，与合并结果一致；本次上游没有 Ent schema 变化。

## 接入指南

用户文档源文件为 `docs/qiandai-api-access-guide.md`，按三个章节组织：

1. 注册登录、创建 Key、绑定分组、填写地址、查询模型。
2. 当前分组与 Anthropic Messages、OpenAI Responses / Chat / Images、Gemini 原生格式的对应关系。
3. NovelAI Images、Chat 内层 JSON、原生 ZIP 请求，以及流式、参考图、原生工具和常见错误说明。

复用已有 `CustomPageView.vue`、`PageHandler`、`custom_menu_items` 和 `doc_url`。将文档部署到应用持久卷的 `pages/access-guide.md`，登记 `md:access-guide` 用户菜单，文档地址为 `/custom/access-guide`。目录导航、Markdown 渲染、代码复制和登录校验均使用原有实现，没有新增路由或旁路文档服务。

上线时只更新文档内容及两项入口设置；分组、账号、定价、密钥与其他管理员设置保留。文档里的分组名称以部署时线上记录为依据，NAI 参数按当时正在运行的 nai-station 实现核对。

## 数据迁移与回退

此次有 6 个新迁移：399 的监控模型与旧 OAuth 标记清理、400 的质量检测轮次和请求诊断表退役、401 的 SLA 排除标记、402 的免费加速成本统计视图。

`400_drop_request_diagnostics.sql` 删除 `request_timing_details`、`request_connection_traces`。部署前保存完整数据库转储及这两张表的独立转储；应用镜像回退不会自动恢复已删除的表。需要恢复旧诊断功能时，单独处理诊断表，不能用旧全库覆盖后续生产账单。

`402_free_service_tier_statistics.sql` 更新统计视图并将历史汇总加入重算队列，客户历史扣款保留原值。`399_remove_oauth_429_model_blocks.sql` 清除上游已废弃的账号标记，原账号启停、调度及凭据配置不因此改变。

构建、定点检查、数据库副本迁移演练、生产切换与文档示例实测证据另存交付目录。生产密钥、登录令牌与数据库备份不进入仓库。
