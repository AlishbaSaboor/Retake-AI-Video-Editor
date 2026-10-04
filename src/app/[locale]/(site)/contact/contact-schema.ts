import { z } from 'zod'

export const MAX_MESSAGE_LENGTH = 2000

export const contactSchema = z.object({
	name: z.string().trim().min(1).max(100),
	email: z.string().trim().email().max(254),
	message: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH)
})
