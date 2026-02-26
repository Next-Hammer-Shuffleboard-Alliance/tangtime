import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://ynwohnffmlfyejhfttxq.supabase.co'
const supabaseKey = 'sb_publishable_V6gptV3HmdIAdVfM1iQwZg_S1poN0C9'

export const supabase = createClient(supabaseUrl, supabaseKey)
