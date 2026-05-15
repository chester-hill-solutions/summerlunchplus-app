import { Outlet } from 'react-router'

import AuthStickerBackground from '@/components/auth/sticker-background'

export default function SignUpLayout() {
  return (
    <AuthStickerBackground maxWidthClassName="max-w-lg" dense scrollContent>
      <div className="w-full">
        <Outlet />
      </div>
    </AuthStickerBackground>
  )
}
