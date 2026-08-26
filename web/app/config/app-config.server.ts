const assertValidIsoTimestamp = (name: string, value: string) => {
  if (!Number.isFinite(Date.parse(value))) {
    throw new Error(`appConfig.${name} must be a valid ISO timestamp, got: ${value}`)
  }
}

const GIFT_CARD_SEND_CUTOFF_AT_ISO = '2026-08-26T04:00:00.000Z'

assertValidIsoTimestamp('giftCard.sendCutoffAtIso', GIFT_CARD_SEND_CUTOFF_AT_ISO)

export const appConfig = {
  giftCard: {
    sendCutoffAtIso: GIFT_CARD_SEND_CUTOFF_AT_ISO,
  },
} as const
