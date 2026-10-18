import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// The Storage surface of a Supabase client and nothing else, with the secret
// key: for the one bucket Retake uses, take audio waiting to be transcribed
// (src/server/storage/take-audio.ts). Files there are temporary: uploaded by
// the browser, read once by the server and deleted. Never application data:
// that's Prisma's (docs/rules/database.md). `from()` and `.rpc()` are type
// errors here, as on the auth-only clients (auth-only.ts).
export type StorageOnlySupabaseClient = Pick<SupabaseClient, 'storage'>

/** Server-only: the secret key bypasses Storage's access rules, so only signed-in, checked requests reach it. */
export function createStorageOnlyClient(url: string, secretKey: string): StorageOnlySupabaseClient {
	return createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } })
}
