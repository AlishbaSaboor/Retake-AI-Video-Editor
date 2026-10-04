'use client'

import { useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { SignOutIcon } from '@/components/ui/icons'
import { signOut } from '@/app/[locale]/(site)/login/actions'
import { useRouter } from '@/i18n/routing'

export function SignOutButton({ email }: { email: string }) {
	const t = useTranslations('Site.nav')
	const router = useRouter()
	const [pending, startTransition] = useTransition()
	return (
		<Button
			type="button"
			variant="outline"
			size="sm"
			title={email}
			disabled={pending}
			onClick={() =>
				startTransition(async () => {
					await signOut(undefined)
					router.push('/')
					router.refresh()
				})
			}
		>
			<SignOutIcon />
			{t('signOut')}
		</Button>
	)
}
