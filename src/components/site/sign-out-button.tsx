'use client'

import { useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { signOut } from '@/app/[locale]/(auth)/login/actions'
import { useRouter } from '@/i18n/routing'

export function SignOutButton({ email }: { email: string }) {
	const t = useTranslations('Site.nav')
	const router = useRouter()
	const [pending, startTransition] = useTransition()
	return (
		<Button
			type="button"
			variant="ghost"
			title={email}
			className="h-[38px] rounded-[10px] px-3 text-[14.5px] font-normal"
			disabled={pending}
			onClick={() =>
				startTransition(async () => {
					await signOut(undefined)
					router.push('/')
					router.refresh()
				})
			}
		>
			{t('signOut')}
		</Button>
	)
}
