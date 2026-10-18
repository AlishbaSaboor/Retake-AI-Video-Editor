/**
 * The most one request to a Vercel Function may carry: 4.5 MB, Vercel's own
 * limit on a function's request body, which Server Actions are. Every action
 * stays under it: a long take's audio is uploaded to Supabase Storage instead
 * (src/server/storage/take-audio.ts), and Make it's pictures are capped
 * (MAX_FRAME_BASE64_LENGTH). next.config.ts lets Next accept up to this.
 */
export const MAX_ACTION_REQUEST_BYTES = 4_500_000
