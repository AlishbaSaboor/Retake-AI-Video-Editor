'use server'

import { validatedAction } from '@/server/actions/validated-action'
import { db } from '@/server/db/client'
import { contactSchema, storedMessage } from './contact-schema'

/** Keeps a Contact us message in the database. */
export const sendContactMessage = validatedAction({
	input: contactSchema,
	handler: async ({ name, email, topic, message }) => {
		await db.contactMessage.create({
			data: { name, email, message: storedMessage(topic, message) }
		})
		return null
	}
})
