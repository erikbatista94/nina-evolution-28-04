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
    // Validate admin caller
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    // Verify caller is admin using their token
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } }
    })
    const { data: claims, error: claimsErr } = await userClient.auth.getUser()
    if (claimsErr || !claims?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
    }

    // Use service role for all DB operations (bypass RLS)
    const supabase = createClient(supabaseUrl, serviceKey)

    // Check admin role
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', claims.user.id)
      .maybeSingle()

    if (roleData?.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: corsHeaders })
    }

    const { source_id } = await req.json()
    if (!source_id) {
      return new Response(JSON.stringify({ error: 'source_id required' }), { status: 400, headers: corsHeaders })
    }

    console.log(`[knowledge-index] Indexing source: ${source_id}`)

    // Load source
    const { data: source, error: srcErr } = await supabase
      .from('knowledge_sources')
      .select('*')
      .eq('id', source_id)
      .single()

    if (srcErr || !source) {
      return new Response(JSON.stringify({ error: 'Source not found' }), { status: 404, headers: corsHeaders })
    }

    let rawText = ''

    if (source.type === 'text') {
      rawText = source.raw_text || ''
    } else if (source.type === 'file' && source.file_path) {
      // Download file from storage
      const { data: fileData, error: dlErr } = await supabase.storage
        .from('knowledge-files')
        .download(source.file_path)

      if (dlErr || !fileData) {
        await supabase.from('knowledge_sources').update({
          last_index_error: `Erro ao baixar arquivo: ${dlErr?.message || 'unknown'}`,
          indexed_at: null,
        }).eq('id', source_id)
        return new Response(JSON.stringify({ error: 'File download failed' }), { status: 500, headers: corsHeaders })
      }

      const fileName = source.file_path.toLowerCase()
      if (fileName.endsWith('.txt') || fileName.endsWith('.md')) {
        rawText = await fileData.text()
      } else if (fileName.endsWith('.pdf')) {
        // Basic PDF text extraction - extract readable text between stream markers
        const bytes = new Uint8Array(await fileData.arrayBuffer())
        const textDecoder = new TextDecoder('utf-8', { fatal: false })
        const pdfText = textDecoder.decode(bytes)
        // Extract text between BT and ET markers, or parenthesized strings
        const textParts: string[] = []
        const regex = /\(([^)]+)\)/g
        let match
        while ((match = regex.exec(pdfText)) !== null) {
          const part = match[1]
          if (part.length > 2 && /[a-zA-ZÀ-ÿ]/.test(part)) {
            textParts.push(part)
          }
        }
        rawText = textParts.join(' ')
        if (rawText.length < 50) {
          // Fallback: try to get any readable text
          rawText = pdfText.replace(/[^\x20-\x7EÀ-ÿ\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim()
        }
      } else if (fileName.endsWith('.docx')) {
        // Basic DOCX: it's a zip with XML, try to extract raw text
        const text = await fileData.text()
        rawText = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      } else {
        rawText = await fileData.text()
      }
    }

    if (!rawText || rawText.trim().length < 10) {
      await supabase.from('knowledge_sources').update({
        last_index_error: 'Conteúdo vazio ou muito curto para indexar',
        indexed_at: null,
      }).eq('id', source_id)
      return new Response(JSON.stringify({ error: 'Empty content' }), { status: 400, headers: corsHeaders })
    }

    // Chunking: ~800 chars with ~120 overlap
    const CHUNK_SIZE = 800
    const OVERLAP = 120
    const chunks: { content: string; chunk_index: number }[] = []
    let i = 0
    let idx = 0
    while (i < rawText.length) {
      const end = Math.min(i + CHUNK_SIZE, rawText.length)
      chunks.push({ content: rawText.slice(i, end).trim(), chunk_index: idx })
      idx++
      i += CHUNK_SIZE - OVERLAP
    }

    console.log(`[knowledge-index] Generated ${chunks.length} chunks for source ${source_id}`)

    // Delete old chunks
    await supabase.from('knowledge_chunks').delete().eq('source_id', source_id)

    // Insert new chunks
    const chunkRows = chunks.filter(c => c.content.length > 0).map(c => ({
      source_id,
      tenant_id: source.tenant_id || null,
      chunk_index: c.chunk_index,
      content: c.content,
    }))

    if (chunkRows.length > 0) {
      const { error: insertErr } = await supabase.from('knowledge_chunks').insert(chunkRows)
      if (insertErr) {
        console.error('[knowledge-index] Insert error:', insertErr)
        await supabase.from('knowledge_sources').update({
          last_index_error: `Erro ao inserir chunks: ${insertErr.message}`,
          indexed_at: null,
        }).eq('id', source_id)
        return new Response(JSON.stringify({ error: 'Chunk insert failed' }), { status: 500, headers: corsHeaders })
      }
    }

    // Mark as indexed
    await supabase.from('knowledge_sources').update({
      indexed_at: new Date().toISOString(),
      last_index_error: null,
    }).eq('id', source_id)

    console.log(`[knowledge-index] Successfully indexed source ${source_id} with ${chunkRows.length} chunks`)

    return new Response(JSON.stringify({ 
      success: true, 
      chunks: chunkRows.length 
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (err) {
    console.error('[knowledge-index] Error:', err)
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders })
  }
})
