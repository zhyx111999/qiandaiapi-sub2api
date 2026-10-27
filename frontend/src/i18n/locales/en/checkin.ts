export default {
  checkin: {
    title: 'Daily Check-in',
    description: 'Resets daily at 08:00 Beijing time. Each check-in grants a random {min} – {max} of balance.',
    disabled: 'Check-in is not open yet',
    readyToday: 'You have not checked in today',
    doneToday: 'Checked in today, received {amount}',
    nextReset: 'Next reset: {time}',
    checkIn: 'Check in',
    checkingIn: 'Checking in…',
    checkedIn: 'Checked in',
    success: 'Checked in, received {amount}',
    failed: 'Check-in failed, please try again later',
    errors: {
      CHECKIN_DISABLED: 'Check-in is not open yet',
      CHECKIN_ALREADY_DONE: 'You have already checked in today',
      CHECKIN_ADMIN_ONLY: 'Only administrators can change check-in settings',
      CHECKIN_INVALID_RANGE: 'The minimum must be above 0 and not exceed the maximum',
      CHECKIN_CREDIT_FAILED: 'The reward could not be credited, please try again later',
      CHECKIN_BAD_REQUEST: 'Invalid request',
      CHECKIN_INTERNAL: 'The check-in service is temporarily unavailable'
    },
    admin: {
      title: 'Check-in Settings for All Users',
      description: 'Applies to every user, administrators included. Each check-in draws a random amount in the range.',
      enabled: 'Enable daily check-in',
      min: 'Minimum reward',
      max: 'Maximum reward',
      hint: 'In cents precision; equal minimum and maximum gives a fixed amount',
      invalidRange: 'The minimum must be above 0 and not exceed the maximum'
    }
  }
}
