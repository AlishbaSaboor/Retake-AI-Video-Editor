import { z } from 'zod'

export const MAX_MESSAGE_LENGTH = 2000

export const contactSchema = z.object({
	email: z.string().trim().email().max(254),
	message: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH)
})
