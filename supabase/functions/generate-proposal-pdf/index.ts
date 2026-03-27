import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { deal_id } = await req.json();
    if (!deal_id) {
      return new Response(JSON.stringify({ error: 'deal_id required' }), { status: 400, headers: corsHeaders });
    }

    // Fetch deal + contact + settings
    const { data: deal, error: dealError } = await supabase
      .from('deals')
      .select('*, contacts(name, phone_number, email, city, address_full)')
      .eq('id', deal_id)
      .maybeSingle();

    if (dealError || !deal) {
      return new Response(JSON.stringify({ error: 'Deal not found' }), { status: 404, headers: corsHeaders });
    }

    const { data: settings } = await supabase
      .from('nina_settings')
      .select('company_name, sdr_name')
      .limit(1)
      .maybeSingle();

    const companyName = settings?.company_name || 'Empresa';
    const contact = (deal as any).contacts || {};
    const clientName = contact.name || 'Cliente';
    const clientPhone = contact.phone_number || '';
    const clientEmail = contact.email || '';
    const clientCity = contact.city || '';
    const clientAddress = contact.address_full || '';

    // Create PDF using pdf-lib (Deno-safe)
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]); // A4
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const { height } = page.getSize();

    let y = height - 60;
    const margin = 50;
    const contentWidth = 595.28 - margin * 2;

    // Header
    page.drawText(companyName.toUpperCase(), { x: margin, y, font: fontBold, size: 22, color: rgb(0.1, 0.1, 0.1) });
    y -= 30;
    page.drawText('PROPOSTA COMERCIAL', { x: margin, y, font: fontBold, size: 16, color: rgb(0.2, 0.5, 0.8) });
    y -= 8;
    page.drawRectangle({ x: margin, y, width: contentWidth, height: 2, color: rgb(0.2, 0.5, 0.8) });
    y -= 30;

    // Date
    const dateStr = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
    page.drawText(`Data: ${dateStr}`, { x: margin, y, font, size: 10, color: rgb(0.4, 0.4, 0.4) });
    y -= 30;

    // Client info
    page.drawText('DADOS DO CLIENTE', { x: margin, y, font: fontBold, size: 12, color: rgb(0.1, 0.1, 0.1) });
    y -= 20;
    const clientLines = [
      `Nome: ${clientName}`,
      clientPhone ? `Telefone: ${clientPhone}` : '',
      clientEmail ? `Email: ${clientEmail}` : '',
      clientCity ? `Cidade: ${clientCity}` : '',
      clientAddress ? `Endereço: ${clientAddress}` : '',
    ].filter(Boolean);

    for (const line of clientLines) {
      page.drawText(line, { x: margin + 10, y, font, size: 10, color: rgb(0.3, 0.3, 0.3) });
      y -= 16;
    }
    y -= 15;

    // Scope
    page.drawText('ESCOPO DO SERVIÇO', { x: margin, y, font: fontBold, size: 12, color: rgb(0.1, 0.1, 0.1) });
    y -= 20;
    const scopeText = deal.scope || deal.notes || 'A ser definido conforme alinhamento.';
    // Word-wrap scope
    const words = scopeText.split(' ');
    let line = '';
    for (const word of words) {
      const testLine = line + (line ? ' ' : '') + word;
      const testWidth = font.widthOfTextAtSize(testLine, 10);
      if (testWidth > contentWidth - 20) {
        page.drawText(line, { x: margin + 10, y, font, size: 10, color: rgb(0.3, 0.3, 0.3) });
        y -= 14;
        line = word;
      } else {
        line = testLine;
      }
    }
    if (line) {
      page.drawText(line, { x: margin + 10, y, font, size: 10, color: rgb(0.3, 0.3, 0.3) });
      y -= 20;
    }
    y -= 10;

    // Value
    page.drawText('INVESTIMENTO', { x: margin, y, font: fontBold, size: 12, color: rgb(0.1, 0.1, 0.1) });
    y -= 25;
    const valueFormatted = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(deal.value) || 0);
    page.drawText(valueFormatted, { x: margin + 10, y, font: fontBold, size: 20, color: rgb(0.1, 0.5, 0.3) });
    y -= 30;

    // Conditions
    if (deal.conditions) {
      page.drawText('CONDIÇÕES', { x: margin, y, font: fontBold, size: 12, color: rgb(0.1, 0.1, 0.1) });
      y -= 20;
      page.drawText(deal.conditions, { x: margin + 10, y, font, size: 10, color: rgb(0.3, 0.3, 0.3) });
      y -= 30;
    }

    // Footer
    y = 60;
    page.drawRectangle({ x: margin, y: y + 10, width: contentWidth, height: 1, color: rgb(0.8, 0.8, 0.8) });
    page.drawText(`${companyName} — Proposta gerada automaticamente`, { x: margin, y: y - 5, font, size: 8, color: rgb(0.6, 0.6, 0.6) });

    const pdfBytes = await pdfDoc.save();

    // Upload to storage
    const fileName = `proposals/${deal_id}_${Date.now()}.pdf`;
    const { error: uploadError } = await supabase.storage
      .from('whatsapp-media')
      .upload(fileName, pdfBytes, { contentType: 'application/pdf', upsert: true });

    if (uploadError) {
      console.error('[Proposal] Upload error:', uploadError);
      throw new Error('Failed to upload PDF');
    }

    // Get public URL
    const { data: urlData } = supabase.storage.from('whatsapp-media').getPublicUrl(fileName);

    // Update deal
    await supabase.from('deals').update({
      proposal_status: 'generated',
      proposal_file_path: fileName,
    }).eq('id', deal_id);

    // Save to proposals table
    await supabase.from('proposals').insert({
      deal_id,
      file_path: fileName,
    });

    // Log activity
    await supabase.from('deal_activities').insert({
      deal_id,
      type: 'note',
      title: `Proposta gerada: ${valueFormatted}`,
      description: `PDF disponível em: ${fileName}`,
    });

    console.log(`[Proposal] PDF generated for deal ${deal_id}: ${fileName}`);

    return new Response(JSON.stringify({
      success: true,
      file_path: fileName,
      public_url: urlData?.publicUrl,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[Proposal] Error:', error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
