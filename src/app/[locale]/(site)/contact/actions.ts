'use server'

import { validatedAction } from '@/server/actions/validated-action'
import { db } from '@/server/db/client'
import { contactSchema } from './contact-schema'

/** Keeps a Contact us message in the database. */
export const sendContactMessage = validatedAction({
	input: contactSchema,
	handler: async ({ email, message }) => {
		await db.contactMessage.create({ data: { email, message } })
		return null
	}
})
