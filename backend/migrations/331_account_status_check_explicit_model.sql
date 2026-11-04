-- 账号状态检测不再替管理员挑模型：检测模型就是填写的模型，不填不检测。已有记录里模型留空（原来由
-- 系统自动选择）的，写成它的检测计划当前在用的模型，正在运行的检测照常、设置页显示实际模型。
UPDATE account_status_check s
SET model = p.model_id, updated_at = NOW()
FROM scheduled_test_plans p
WHERE p.id = s.plan_id AND s.model = '' AND p.model_id <> '';
