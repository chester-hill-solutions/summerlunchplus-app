
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import AuthStickerBackground from '@/components/auth/sticker-background'
import { useSearchParams } from 'react-router'

export default function Page() {
  let [searchParams] = useSearchParams()

  return (
    <AuthStickerBackground dense>
      <div className="w-full">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">Sorry, something went wrong.</CardTitle>
            </CardHeader>
            <CardContent>
              {searchParams?.get('error') ? (
                <p className="text-sm text-muted-foreground">
                  Code error: {searchParams?.get('error')}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">An unspecified error occurred.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AuthStickerBackground>
  )
}
