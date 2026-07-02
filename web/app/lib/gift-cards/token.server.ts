import { createHash, randomBytes } from 'node:crypto'

export const hashGlrToken = (token: string) => createHash('sha256').update(token).digest('hex')

export const newGlrToken = () => randomBytes(24).toString('base64url')
