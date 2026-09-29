'use server'

import { z } from 'zod'
import { validatedAction } from '@/server/actions/validated-action'
import { trackProcess } from '@/lib/analytics/server'
import { ANALYTICS_PROCESSES } from '@/lib/analytics/events'

// Reference server action for the analytics demo: a backend process funnel
// (payment_initiated -> payment_succeeded) recorded from the server with
// trackProcess. In a real flow distinctId is the authenticated user's id, so
// these events land on the same PostHog person as the client-side ones; the
// demo uses a fixed id since it has no auth. Delete with the demo page.
export const simulatePayment = validatedAction({
	input: z.object({ amount: z.number().positive(), payment_id: z.string().min(1) }),
	handler: async (input) => {
		const context = { distinctId: 'demo-user', payment_id: input.payment_id }
		trackProcess(context, { process: ANALYTICS_PROCESSES.PAYMENT, phase: 'initiated' })
		// A real handler charges a PSP here; anything it throws would be caught
		// by validatedAction, and the catch would emit payment_failed.
		trackProcess(context, { process: ANALYTICS_PROCESSES.PAYMENT, phase: 'succeeded' })
		return { status: 'succeeded' as const, payment_id: input.payment_id }
	}
})
