export const DISPLAY_LIMIT = 200

export const selectDisplayFunds = (funds = [], limit = DISPLAY_LIMIT) => ({
  items: funds.slice(0, limit),
  total: funds.length,
  truncated: funds.length > limit,
})
