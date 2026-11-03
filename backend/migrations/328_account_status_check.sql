-- 账号状态检测（降智检测）：每个普通 OpenAI 账号一行检测配置，计划与结果用官方 scheduled_test_*。
-- disable_on_degraded：答错（降智）时关闭该账号的调度，默认关闭。
CREATE TABLE IF NOT EXISTS account_status_check (
    account_id          BIGINT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
    enabled             BOOLEAN NOT NULL DEFAULT TRUE,
    check_enabled       BOOLEAN NOT NULL DEFAULT TRUE,
    interval_minutes    INT NOT NULL DEFAULT 5,
    model               TEXT NOT NULL DEFAULT '',
    reasoning_effort    TEXT NOT NULL DEFAULT 'low',
    timeout_seconds     INT NOT NULL DEFAULT 600,
    disable_on_degraded BOOLEAN NOT NULL DEFAULT FALSE,
    plan_id             BIGINT UNIQUE REFERENCES scheduled_test_plans(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
