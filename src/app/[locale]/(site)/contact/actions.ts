'use server'

import { headers } from 'next/headers'
import { AppError } from '@/lib/errors/app-error'
import { env } from '@/lib/env'
import { validatedAction } from '@/server/actions/validated-action'
import { db } from '@/server/db/client'
import { log } from '@/server/lib/logger'
import { clientIp, LIMIT_WINDOW_MS, limitFor, senderHash } from './contact-limit'
import { contactSchema, storedMessage } from './contact-schema'

/** Refused the same way whichever check caught it, so a bot learns nothing from it. */
const refused = () =>
	new AppError("Your message couldn't be sent right now. Please try again later.", {
		status: 429
	})

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
		const recent = await db.contactMessage.count({
			where: { ipHash, createdAt: { gt: new Date(Date.now() - LIMIT_WINDOW_MS) } }
		})
		if (recent >= limitFor(ipHash)) {
			log.warn('contact message refused', { check: 'limit', shared: ipHash === null })
			throw refused()
		}
		await db.contactMessage.create({
			data: { name, email, message: storedMessage(topic, message), ipHash }
		})
		return null
	}
})
