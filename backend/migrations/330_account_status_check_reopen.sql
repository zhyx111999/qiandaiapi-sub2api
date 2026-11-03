-- 账号状态检测「恢复后打开调度」：
-- reopen_on_recovered：开启后，降智关闭调度的账号继续检测，答对（21）就重新打开调度；不开启时，
--   降智关闭调度后停止自动检测。默认关闭；没开「降智时关闭调度」时没有可恢复的账号，不起作用。
-- degraded_closed_at：本模块因降智把调度从开改为关的时间；只有它非空的账号才会被恢复，
--   管理员自己关掉调度的账号不会被打开。恢复后清空。
ALTER TABLE account_status_check
    ADD COLUMN IF NOT EXISTS reopen_on_recovered BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS degraded_closed_at TIMESTAMPTZ;
