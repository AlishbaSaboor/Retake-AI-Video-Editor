import { z } from 'zod'

export const MAX_MESSAGE_LENGTH = 2000
export const MAX_NAME_LENGTH = 100
const MAX_HONEYPOT_LENGTH = 500
/** The field a person never sees and so leaves empty; a bot filling every field fills it too. */
export const HONEYPOT_FIELD = 'website'

/** What a message is about, as the form's select offers it. */
export const CONTACT_TOPICS = ['question', 'idea', 'broken', 'other'] as const
export type ContactTopic = (typeof CONTACT_TOPICS)[number]

export const contactSchema = z.object({
	/** Optional: an empty name is kept as none. */
	name: z
		.string()
		.trim()
		.max(MAX_NAME_LENGTH)
		.optional()
		.transform((name) => name || null),
	email: z.string().trim().email().max(254),
	topic: z.enum(CONTACT_TOPICS).default('question'),
	message: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
	/** The hidden field, HONEYPOT_FIELD: a person leaves it empty. */
	website: z.string().max(MAX_HONEYPOT_LENGTH).optional()
})

/**
 * The message as it's kept: its topic on the first line, so whoever reads
 * the table sees what it's about without a column of its own.
 */
export function storedMessage(topic: ContactTopic, message: string): string {
	return `[${topic}] ${message}`
}
