import type { SupabaseClient } from '@supabase/supabase-js'

// The auth surface of a Supabase client and nothing else. Both wrappers in
// this directory return it, so `supabase.from()`, `.rpc()` and `.storage` are
// type errors rather than a rule to remember — Prisma owns every byte of
// application data (docs/rules/database.md, docs/rules/auth.md). A project
// that adopts Supabase realtime widens this to add 'channel' | 'removeChannel'
// deliberately, in this one place; never to 'from' or 'rpc'.
export type AuthOnlySupabaseClient = Pick<SupabaseClient, 'auth'>
