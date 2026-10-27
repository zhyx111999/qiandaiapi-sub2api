export default {
  checkin: {
    title: '每日签到',
    description: '每天北京时间 08:00 刷新，签到可随机获得 {min} – {max} 余额',
    disabled: '签到暂未开放',
    readyToday: '今天还没有签到',
    doneToday: '今日已签到，获得 {amount}',
    nextReset: '下次刷新：{time}',
    checkIn: '立即签到',
    checkingIn: '签到中…',
    checkedIn: '已签到',
    success: '签到成功，获得 {amount}',
    failed: '签到失败，请稍后重试',
    errors: {
      CHECKIN_DISABLED: '签到暂未开放',
      CHECKIN_ALREADY_DONE: '今天已经签到过了',
      CHECKIN_ADMIN_ONLY: '只有管理员可以修改签到配置',
      CHECKIN_INVALID_RANGE: '最少奖励需大于 0，且不能超过最多奖励',
      CHECKIN_CREDIT_FAILED: '奖励发放失败，请稍后重试',
      CHECKIN_BAD_REQUEST: '请求格式不正确',
      CHECKIN_INTERNAL: '签到服务暂时不可用'
    },
    admin: {
      title: '全体用户签到配置',
      description: '对所有用户生效（包括管理员），每次签到在区间内随机发放',
      enabled: '开启每日签到',
      min: '最少奖励',
      max: '最多奖励',
      hint: '精确到分，最少与最多相同即为固定金额',
      invalidRange: '最少奖励需大于 0，且不能超过最多奖励'
    }
  }
}
