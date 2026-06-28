import { createHash, randomBytes } from 'node:crypto'

export const hashZlrToken = (token: string) => createHash('sha256').update(token).digest('hex')

export const newZlrToken = () => randomBytes(24).toString('base64url')
