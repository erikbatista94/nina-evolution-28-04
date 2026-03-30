import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { contact_id, conversation_id, user_message, ai_response, current_memory, user_id } = await req.json();

    console.log(`[Analyze Conversation] Starting analysis for contact ${contact_id}`);

    // Calculate interaction count
    const interactionCount = (current_memory.interaction_summary?.total_conversations || 0) + 1;
    
    // Determine if full AI analysis should run (message 1, 5, 10, 15, 20...)
    const shouldAnalyze = interactionCount === 1 || interactionCount % 5 === 0;
    
    console.log(`[Analyze] Interaction #${interactionCount}, full analysis: ${shouldAnalyze}`);

    if (!shouldAnalyze) {
      // BASIC UPDATE: Just increment counter and add to history
      const basicMemory = {
        ...current_memory,
        last_updated: new Date().toISOString(),
        interaction_summary: {
          ...current_memory.interaction_summary,
          total_conversations: interactionCount,
          last_contact_reason: user_message?.substring(0, 100) || ''
        },
        conversation_history: [
          ...(current_memory.conversation_history || []).slice(-9),
          {
            timestamp: new Date().toISOString(),
            user_summary: user_message?.substring(0, 200),
            ai_action: ai_response?.substring(0, 200)
          }
        ]
      };
      
      await supabase.rpc('update_client_memory', {
        p_contact_id: contact_id,
        p_new_memory: basicMemory
      });

      // Update last_interaction_at
      await supabase.from('contacts').update({ last_interaction_at: new Date().toISOString() }).eq('id', contact_id);
      
      console.log('[Analyze] Basic update completed');
      return new Response(JSON.stringify({ updated: true, type: 'basic' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // FULL ANALYSIS: Fetch pipeline stages and current deal
    const { data: stages } = await supabase
      .from('pipeline_stages')
      .select('id, title, ai_trigger_criteria, position')
      .eq('is_ai_managed', true)
      .not('ai_trigger_criteria', 'is', null)
      .eq('is_active', true)
      .order('position', { ascending: true });

    const { data: currentDeal } = await supabase
      .from('deals')
      .select('id, stage_id, stage')
      .eq('contact_id', contact_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const hasAiManagedStages = stages && stages.length > 0;
    
    if (!hasAiManagedStages) {
      console.log('[Analyze] ⏭️ No AI-managed stages with criteria - skipping stage determination');
    }

    console.log(`[Analyze] Running full AI analysis${hasAiManagedStages ? ' with stage determination' : ' (insights only)'}...`);

    const stagesCriteria = hasAiManagedStages
      ? stages.map(s => `- ${s.title} (ID: ${s.id}): ${s.ai_trigger_criteria}`).join('\n')
      : '';

    const conversationSnippet = `
MENSAGEM DO CLIENTE:
${user_message}

RESPOSTA DO ASSISTENTE:
${ai_response}

CONTEXTO ATUAL:
- Interesses conhecidos: ${current_memory.lead_profile?.interests?.join(', ') || 'Nenhum'}
- Dores identificadas: ${current_memory.sales_intelligence?.pain_points?.join(', ') || 'Nenhuma'}
- Score atual: ${current_memory.lead_profile?.qualification_score || 0}/100
${hasAiManagedStages ? `
CRITÉRIOS DOS ESTÁGIOS DO PIPELINE:
${stagesCriteria}

ESTÁGIO ATUAL DO DEAL: ${currentDeal?.stage || 'Sem estágio'}` : ''}
    `.trim();

    // Build tools array
    const tools: any[] = [
      {
        type: "function",
        function: {
          name: "update_memory_insights",
          description: "Extrair insights estruturados da conversa para atualizar memória do cliente",
          parameters: {
            type: "object",
            properties: {
              interests: {
                type: "array",
                items: { type: "string" },
                description: "Lista de interesses ou necessidades mencionados pelo cliente (max 5)"
              },
              pain_points: {
                type: "array",
                items: { type: "string" },
                description: "Dores, problemas ou desafios mencionados (max 5)"
              },
              qualification_score: {
                type: "number",
                description: "Score de qualificação de 0 a 100 baseado em: interesse demonstrado, budget implícito, urgência, fit com produto",
                minimum: 0,
                maximum: 100
              },
              next_best_action: {
                type: "string",
                enum: ["qualify", "demo", "followup", "close", "nurture"],
                description: "Próxima melhor ação"
              },
              budget_indication: {
                type: "string",
                enum: ["unknown", "low", "medium", "high"],
                description: "Indicação de orçamento baseado em sinais implícitos"
              },
              decision_timeline: {
                type: "string",
                enum: ["unknown", "immediate", "1month", "3months", "6months+"],
                description: "Timeline de decisão baseado em urgência"
              },
              // NEW CRM structured fields
              customer_type: {
                type: "string",
                enum: ["arquiteto", "cliente_final", "engenheiro", "construtora", "empresa", "designer"],
                description: "Tipo de cliente identificado na conversa. Deixar null se não identificado."
              },
              city: {
                type: "string",
                description: "Cidade mencionada pelo cliente. Deixar null se não mencionada."
              },
              neighborhood: {
                type: "string",
                description: "Bairro mencionado pelo cliente. Deixar null se não mencionado."
              },
              job_size: {
                type: "string",
                enum: ["pequena", "media", "grande"],
                description: "Tamanho estimado da obra. Deixar null se não identificado."
              },
              has_project: {
                type: "boolean",
                description: "Se o cliente tem projeto arquitetônico/técnico. Null se não mencionado."
              },
              lead_status: {
                type: "string",
                enum: ["novo", "qualificando", "qualificado", "agendado", "perdido", "ganho"],
                description: "Status do lead baseado na conversa"
              },
              source: {
                type: "string",
                enum: ["indicacao", "google", "instagram", "whatsapp", "outro"],
                description: "Origem do lead se mencionada. Null se não identificada."
              },
              interest_services: {
                type: "array",
                items: { type: "string" },
                description: "Serviços específicos de interesse: drywall, forro, gesso, vinilico, ripado_pvc, molduras, iluminacao, etc."
              }
            },
            required: ["interests", "pain_points", "qualification_score", "next_best_action", "budget_indication", "decision_timeline"],
            additionalProperties: false
          }
        }
      }
    ];

    if (hasAiManagedStages) {
      tools.push({
        type: "function",
        function: {
          name: "determine_deal_stage",
          description: "Determinar para qual estágio do pipeline o deal deve ir com base nos critérios",
          parameters: {
            type: "object",
            properties: {
              suggested_stage_id: {
                type: "string",
                enum: stages.map(s => s.id),
                description: "ID do estágio sugerido"
              },
              confidence: {
                type: "number",
                minimum: 0,
                maximum: 100,
                description: "Confiança na sugestão (0-100)"
              },
              reasoning: {
                type: "string",
                description: "Justificativa breve para a mudança (max 200 chars)"
              }
            },
            required: ["suggested_stage_id", "confidence", "reasoning"],
            additionalProperties: false
          }
        }
      });
    }

    const systemPrompt = hasAiManagedStages 
      ? `Você é um analista de conversas de vendas de uma empresa de gesso, forros e iluminação. Analise a interação e:
1. Extraia insights estruturados para atualizar a memória do cliente, incluindo tipo de cliente, cidade, bairro, serviços de interesse, tamanho da obra e se tem projeto.
2. Determine para qual estágio do pipeline o deal deve ir com base nos critérios fornecidos.
Preencha o máximo de campos possível com base nas informações da conversa. Se um campo não pode ser determinado, omita-o.`
      : `Você é um analista de conversas de vendas de uma empresa de gesso, forros e iluminação. Analise a interação e extraia insights estruturados para atualizar a memória do cliente, incluindo tipo de cliente, cidade, bairro, serviços de interesse, tamanho da obra e se tem projeto. Preencha o máximo de campos possível com base nas informações da conversa.`;

    const analysisResponse = await fetch(LOVABLE_AI_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: conversationSnippet }
        ],
        tools: tools
      })
    });

    if (!analysisResponse.ok) {
      console.error('[Analyze] AI analysis failed:', analysisResponse.status);
      throw new Error('AI analysis failed');
    }

    const analysisData = await analysisResponse.json();
    const toolCalls = analysisData.choices?.[0]?.message?.tool_calls || [];
    
    if (toolCalls.length === 0) {
      console.error('[Analyze] No tool calls in AI response');
      throw new Error('No insights extracted');
    }

    let insights = null;
    let stageResult = null;

    for (const toolCall of toolCalls) {
      if (toolCall.function?.name === 'update_memory_insights') {
        insights = JSON.parse(toolCall.function.arguments);
      } else if (toolCall.function?.name === 'determine_deal_stage') {
        stageResult = JSON.parse(toolCall.function.arguments);
      }
    }

    console.log('[Analyze] Insights extracted:', insights);
    console.log('[Analyze] Stage suggestion:', stageResult);

    // Update client memory with insights
    if (insights) {
      const updatedMemory = {
        ...current_memory,
        last_updated: new Date().toISOString(),
        lead_profile: {
          ...current_memory.lead_profile,
          interests: Array.from(new Set([
            ...(current_memory.lead_profile?.interests || []),
            ...insights.interests
          ])).slice(0, 10),
          qualification_score: insights.qualification_score,
          lead_stage: insights.qualification_score > 70 ? 'qualified' : 
                      insights.qualification_score > 40 ? 'engaged' : 'new',
          budget_indication: insights.budget_indication,
          decision_timeline: insights.decision_timeline
        },
        sales_intelligence: {
          ...current_memory.sales_intelligence,
          pain_points: Array.from(new Set([
            ...(current_memory.sales_intelligence?.pain_points || []),
            ...insights.pain_points
          ])).slice(0, 10),
          next_best_action: insights.next_best_action
        },
        interaction_summary: {
          ...current_memory.interaction_summary,
          total_conversations: interactionCount,
          last_contact_reason: user_message?.substring(0, 100) || ''
        },
        conversation_history: [
          ...(current_memory.conversation_history || []).slice(-9),
          {
            timestamp: new Date().toISOString(),
            user_summary: user_message?.substring(0, 200),
            ai_action: ai_response?.substring(0, 200),
            insights_extracted: {
              qualification_score: insights.qualification_score,
              next_action: insights.next_best_action
            }
          }
        ]
      };

      await supabase.rpc('update_client_memory', {
        p_contact_id: contact_id,
        p_new_memory: updatedMemory
      });

      // === SYNC STRUCTURED CRM FIELDS TO CONTACTS ===
      // Calculate lead score from scoring weights
      let leadScore = insights.qualification_score || 0;
      
      // Try to get scoring weights from settings
      const { data: scoringSettings } = await supabase
        .from('nina_settings')
        .select('scoring_weights')
        .limit(1)
        .maybeSingle();
      
      const weights = (scoringSettings as any)?.scoring_weights || {};
      
      // Apply weights based on extracted data
      if (insights.customer_type && weights[insights.customer_type]) {
        leadScore += weights[insights.customer_type];
      }
      if (insights.has_project && weights.has_project) {
        leadScore += weights.has_project;
      }
      // Timeframe scoring
      const timeframeKey = insights.decision_timeline === 'immediate' ? 'imediato' :
                          insights.decision_timeline === '1month' ? '30d' :
                          insights.decision_timeline === '3months' ? '60d' :
                          insights.decision_timeline === '6months+' ? '90d' : null;
      if (timeframeKey && weights[timeframeKey]) {
        leadScore += weights[timeframeKey];
      }
      // City scoring
      if (insights.city) {
        const cityKey = insights.city.toLowerCase().replace(/\s+/g, '');
        if (weights[cityKey]) leadScore += weights[cityKey];
      }
      
      // Clamp score to 0-100
      leadScore = Math.max(0, Math.min(100, leadScore));
      
      const leadTemp = leadScore > 70 ? 'quente' : leadScore > 40 ? 'morno' : 'frio';
      const startTimeframe = insights.decision_timeline === 'immediate' ? 'imediato' :
                             insights.decision_timeline === '1month' ? '30d' :
                             insights.decision_timeline === '3months' ? '60d' :
                             insights.decision_timeline === '6months+' ? '90d' : null;

      const structuredUpdate: Record<string, any> = {
        lead_temperature: leadTemp,
        lead_score: leadScore,
        next_best_action: insights.next_best_action,
        last_interaction_at: new Date().toISOString(),
      };

      // Only set fields if the AI extracted them (don't overwrite with null)
      if (insights.interest_services?.length) structuredUpdate.interest_services = insights.interest_services;
      if (insights.customer_type) structuredUpdate.customer_type = insights.customer_type;
      if (insights.city) structuredUpdate.city = insights.city;
      if (insights.neighborhood) structuredUpdate.neighborhood = insights.neighborhood;
      if (insights.job_size) structuredUpdate.job_size = insights.job_size;
      if (insights.has_project !== undefined && insights.has_project !== null) structuredUpdate.has_project = insights.has_project;
      if (insights.lead_status) structuredUpdate.lead_status = insights.lead_status;
      if (insights.source) structuredUpdate.source = insights.source;
      if (startTimeframe) structuredUpdate.start_timeframe = startTimeframe;

      // === QUALIFICATION GAPS DETECTION ===
      // Only generate gaps after 3+ interactions (configurable threshold)
      const GAP_MIN_INTERACTIONS = 3;
      const gaps: { field: string; status: string; label: string }[] = [];
      
      if (interactionCount >= GAP_MIN_INTERACTIONS) {
        // Define critical fields and their current values
        const gapChecks = [
          { field: 'city', label: 'Cidade', val: insights.city || structuredUpdate.city },
          { field: 'customer_type', label: 'Tipo de cliente', val: insights.customer_type || structuredUpdate.customer_type },
          { field: 'interest_services', label: 'Serviços de interesse', val: insights.interest_services?.length ? insights.interest_services : null },
          { field: 'job_size', label: 'Tamanho da obra', val: insights.job_size || structuredUpdate.job_size },
          { field: 'has_project', label: 'Tem projeto', val: insights.has_project },
        ];

        // Fetch current contact data to check existing values
        const { data: currentContact } = await supabase
          .from('contacts')
          .select('city, customer_type, interest_services, job_size, has_project')
          .eq('id', contact_id)
          .maybeSingle();

        for (const check of gapChecks) {
          const existingVal = currentContact?.[check.field as keyof typeof currentContact];
          const newVal = check.val;
          
          // Missing: neither existing nor newly extracted
          if (!existingVal && !newVal) {
            gaps.push({ field: check.field, status: 'missing', label: check.label });
          }
        }

        // Check for vague responses in conversation text
        const vaguePatterns = ['talvez', 'não sei', 'ainda não decidi', 'vou ver', 'depois eu vejo', 'mais ou menos'];
        const userMsgLower = (user_message || '').toLowerCase();
        for (const pattern of vaguePatterns) {
          if (userMsgLower.includes(pattern)) {
            // Find which field might be vague based on context
            if (!insights.decision_timeline || insights.decision_timeline === 'unknown') {
              const existing = gaps.find(g => g.field === 'start_timeframe');
              if (!existing) gaps.push({ field: 'start_timeframe', status: 'vague', label: 'Prazo/timeline' });
            }
            break;
          }
        }

        if (gaps.length > 0) {
          structuredUpdate.qualification_gaps = gaps;
          console.log('[Analyze] ⚠️ Qualification gaps detected:', gaps.map(g => `${g.field}:${g.status}`));
        } else {
          // Clear gaps if all filled
          structuredUpdate.qualification_gaps = [];
        }
      }

      const { error: updateError } = await supabase
        .from('contacts')
        .update(structuredUpdate)
        .eq('id', contact_id);

      if (updateError) {
        console.error('[Analyze] Error syncing structured fields:', updateError);
      } else {
        console.log('[Analyze] ✅ Structured CRM fields synced (score:', leadScore, '):', Object.keys(structuredUpdate));
      }

      // === LOG CONVERSATION EVENT ===
      try {
        const eventType = dealMoved ? 'stage_moved' : 
                          insights.lead_status === 'qualificado' ? 'qualified' :
                          insights.qualification_score > 70 ? 'high_score' : 'analyzed';
        
        await supabase.from('conversation_events').insert({
          conversation_id,
          contact_id,
          event_type: eventType,
          event_data: {
            score: leadScore,
            temperature: leadTemp,
            gaps: gaps.length,
            next_action: insights.next_best_action,
            ...(dealMoved && stageResult ? { new_stage: stageResult.suggested_stage_id, confidence: stageResult.confidence } : {})
          }
        });
      } catch (evErr) {
        console.error('[Analyze] Event logging error:', evErr);
      }

      console.log('[Analyze] Memory updated successfully');
    }

    // Move deal if confidence > 70% and stage is different
    let dealMoved = false;
    if (stageResult && currentDeal && stageResult.suggested_stage_id !== currentDeal.stage_id && stageResult.confidence > 70) {
      const newStage = stages?.find(s => s.id === stageResult.suggested_stage_id);
      
      if (newStage) {
        const { error: updateError } = await supabase
          .from('deals')
          .update({ 
            stage_id: stageResult.suggested_stage_id,
            stage: newStage.title
          })
          .eq('id', currentDeal.id);

        if (!updateError) {
          dealMoved = true;
          console.log(`[Analyze] Deal moved to stage: ${newStage.title} (confidence: ${stageResult.confidence}%)`);
          console.log(`[Analyze] Reasoning: ${stageResult.reasoning}`);
        } else {
          console.error('[Analyze] Error moving deal:', updateError);
        }
      }
    } else if (stageResult && currentDeal) {
      console.log(`[Analyze] Deal NOT moved: same stage or low confidence (${stageResult.confidence}%)`);
    }

    return new Response(JSON.stringify({ 
      updated: true, 
      type: 'full',
      insights,
      stage_result: stageResult,
      deal_moved: dealMoved
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[Analyze] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
