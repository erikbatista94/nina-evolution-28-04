import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Use service role to bypass RLS — this is the IA access path
    const supabase = createClient(supabaseUrl, serviceKey)

    const { query, tenant_id = null, top_k = 5 } = await req.json()

    if (!query || typeof query !== 'string' || query.trim().length < 2) {
      return new Response(JSON.stringify({ results: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    console.log(`[knowledge-search] Query: "${query.substring(0, 80)}", tenant: ${tenant_id}, top_k: ${top_k}`)

    // Use the DB function for full-text search
    const { data, error } = await supabase.rpc('search_knowledge', {
      p_query: query.trim(),
      p_tenant_id: tenant_id,
      p_top_k: Math.min(top_k, 10),
    })

    if (error) {
      console.error('[knowledge-search] Search error:', error)
      // Fallback: return empty results instead of failing
      return new Response(JSON.stringify({ results: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    console.log(`[knowledge-search] Found ${data?.length || 0} results`)

    return new Response(JSON.stringify({ results: data || [] }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('[knowledge-search] Error:', err)
    return new Response(JSON.stringify({ results: [] }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
