import { Outlet } from 'react-router'

import AuthStickerBackground from '@/components/auth/sticker-background'

export default function SignUpLayout() {
  return (
    <AuthStickerBackground maxWidthClassName="max-w-lg" dense>
      <div className="w-full">
        <Outlet />
      </div>
    </AuthStickerBackground>
  )
}
