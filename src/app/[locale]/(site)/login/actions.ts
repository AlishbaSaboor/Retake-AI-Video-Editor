'use server'

import { z } from 'zod'
import { AppError } from '@/lib/errors/app-error'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { validatedAction } from '@/server/actions/validated-action'
import { authConfigured } from '@/server/auth/session'
import { provisionUser } from '@/server/auth/provision-user'

// Supabase's own minimum.
const MIN_PASSWORD_LENGTH = 6

const credentials = z.object({
	email: z.string().trim().email().max(254),
	password: z.string().min(MIN_PASSWORD_LENGTH).max(128)
})

function requireAuth() {
	if (!authConfigured()) {
		throw new AppError('Accounts aren’t set up on this copy of Retake.', { status: 503 })
	}
}

/** Signs in with an email and password; the session cookie is set on the response. */
export const signIn = validatedAction({
	input: credentials,
	handler: async ({ email, password }) => {
		requireAuth()
		const supabase = await createServerSupabaseClient()
		const { data, error } = await supabase.auth.signInWithPassword({ email, password })
		if (error || !data.user) {
			throw new AppError('That email and password don’t match an account.', { status: 401 })
		}
		await provisionUser({ id: data.user.id, email })
		return null
	}
})

/** Creates an account and signs it in (this project's Supabase asks for no email confirmation). */
export const signUp = validatedAction({
	input: credentials,
	handler: async ({ email, password }) => {
		requireAuth()
		const supabase = await createServerSupabaseClient()
		const { data, error } = await supabase.auth.signUp({ email, password })
		if (error?.code === 'user_already_exists') {
			throw new AppError('There’s already an account with that email. Log in instead.', {
				status: 409
			})
		}
		if (error || !data.user) {
			throw new AppError('That account couldn’t be created. Try again.', { status: 400 })
		}
		await provisionUser({ id: data.user.id, email })
		return null
	}
})

export const signOut = validatedAction({
	input: z.undefined(),
	handler: async () => {
		if (!authConfigured()) return null
		const supabase = await createServerSupabaseClient()
		await supabase.auth.signOut()
		return null
	}
})
