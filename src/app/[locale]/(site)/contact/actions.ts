'use server'

import { headers } from 'next/headers'
import { AppError } from '@/lib/errors/app-error'
import { env } from '@/lib/env'
import { validatedAction } from '@/server/actions/validated-action'
import { db, Prisma } from '@/server/db/client'
import { log } from '@/server/lib/logger'
import { clientIp, LIMIT_WINDOW_MS, limitFor, senderHash } from './contact-limit'
import { contactSchema, storedMessage } from './contact-schema'

/** Refused the same way whichever check caught it, so a bot learns nothing from it. */
const refused = () =>
	new AppError("Your message couldn't be sent right now. Please try again later.", {
		status: 429
	})

/** How many times a send is tried when another send from the same sender overlapped it. */
const ATTEMPTS = 3

/**
 * Counts the sender's recent messages and keeps this one, as one step: in a
 * Serializable transaction, so two sends at once can't both pass the count
 * (Postgres aborts one of them, P2034, and it's tried again from the count).
 * Says what happened: kept, over the limit, or still overlapping after
 * ATTEMPTS tries (a burst from one sender, refused like the limit).
 */
async function keepWithinLimit(
	data: { name: string | null; email: string; message: string },
	ipHash: string | null
): Promise<'kept' | 'limit' | 'overlap'> {
	for (let attempt = 1; ; attempt++) {
		try {
			return await db.$transaction(
				async (tx) => {
					const recent = await tx.contactMessage.count({
						where: { ipHash, createdAt: { gt: new Date(Date.now() - LIMIT_WINDOW_MS) } }
					})
					if (recent >= limitFor(ipHash)) return 'limit'
					await tx.contactMessage.create({ data: { ...data, ipHash } })
					return 'kept'
				},
				{ isolationLevel: 'Serializable' }
			)
		} catch (error) {
			const overlapped =
				error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034'
			if (!overlapped) throw error
			if (attempt === ATTEMPTS) return 'overlap'
		}
	}
}

/**
 * Keeps a Contact us message in the database: unless the hidden field was
 * filled in, or its sender (or, unknown, everyone unknown) has already sent
 * as many as the window allows (contact-limit.ts).
 */
export const sendContactMessage = validatedAction({
	input: contactSchema,
	handler: async ({ name, email, topic, message, website }) => {
		if (website) {
			log.warn('contact message refused', { check: 'honeypot' })
			throw refused()
		}
		const ipHash = senderHash(
			clientIp((await headers()).get('x-forwarded-for')),
			env.CONTACT_IP_SECRET
		)
		const outcome = await keepWithinLimit(
			{ name, email, message: storedMessage(topic, message) },
			ipHash
		)
		if (outcome !== 'kept') {
			log.warn('contact message refused', { check: outcome, shared: ipHash === null })
			throw refused()
		}
		return null
	}
})
