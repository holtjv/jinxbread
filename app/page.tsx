function isWindowAvailable() {
    const now = new Date()
    const sunday = new Date(now)
    const day = now.getDay() // 0 = Sunday
    const daysUntilSunday = day === 0 ? 7 : 7 - day
    sunday.setDate(now.getDate() + daysUntilSunday)
    sunday.setHours(12, 0, 0, 0)
    return now < sunday
  }