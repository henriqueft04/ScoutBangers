import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://ofksdksyicndihxxxbto.supabase.co',
  'sb_publishable_u8CisZvaV2h0rkzYyuyAig_oAdo9Lzn'
)

async function run() {
  const { data, error } = await supabase.from('song_submissions').select('*').eq('status', 'processing')
  console.log(data)
}
run()
