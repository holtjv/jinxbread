// Validate minimums
    const violations: string[] = []
    products.forEach(p => {
      const weeklyTotal = deliveryWindows.reduce((t, w) => t + mergedQty(w.id, p.id), 0)
      const min = p.minimum_quantity ?? 10
      if (weeklyTotal > 0 && weeklyTotal < min) {
        violations.push(`${p.name} requires a minimum of ${min}/week (you have ${weeklyTotal})`)
      }
    })
    if (violations.length > 0) {
      setError(violations.join(' · '))
      setSubmitting(false)
      return
    }