
-- Create whatsapp_templates table
CREATE TABLE public.whatsapp_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  content TEXT NOT NULL,
  variables JSONB NOT NULL DEFAULT '[]'::jsonb,
  language TEXT NOT NULL DEFAULT 'pt_BR',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage templates"
ON public.whatsapp_templates FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated can read active templates"
ON public.whatsapp_templates FOR SELECT
TO authenticated
USING (is_active = true);

CREATE TRIGGER update_whatsapp_templates_updated_at
BEFORE UPDATE ON public.whatsapp_templates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed default templates
INSERT INTO public.whatsapp_templates (name, display_name, content, variables) VALUES
('continuidade_atendimento_gg', 'Continuidade de Atendimento', 'Olá {{1}}, tudo bem?\n\nEstou dando continuidade ao seu atendimento com a GG Gesso Forros e Iluminação sobre {{2}}. Posso seguir com você por aqui.', '[{"key": "1", "label": "Nome do cliente", "auto_fill": "contact.name"}, {"key": "2", "label": "Serviço/assunto", "auto_fill": "contact.interest_services"}]'),
('continuidade_orcamento_gg', 'Continuidade de Orçamento', 'Olá {{1}}, tudo bem?\n\nEstou retomando seu atendimento com a GG sobre {{2}}, para avançarmos com as informações do seu orçamento.', '[{"key": "1", "label": "Nome do cliente", "auto_fill": "contact.name"}, {"key": "2", "label": "Serviço/assunto", "auto_fill": "contact.interest_services"}]'),
('aguardando_informacoes_gg', 'Aguardando Informações', 'Olá {{1}}, tudo bem?\n\nEstou dando sequência ao seu atendimento com a GG sobre {{2}}. Ficamos aguardando algumas informações para conseguirmos avançar.', '[{"key": "1", "label": "Nome do cliente", "auto_fill": "contact.name"}, {"key": "2", "label": "Serviço/assunto", "auto_fill": "contact.interest_services"}]'),
('continuidade_visita_gg', 'Continuidade de Visita', 'Olá {{1}}, tudo bem?\n\nEstou dando continuidade ao seu atendimento com a GG sobre {{2}} para verificarmos a possibilidade de agendamento da visita.', '[{"key": "1", "label": "Nome do cliente", "auto_fill": "contact.name"}, {"key": "2", "label": "Serviço/assunto", "auto_fill": "contact.interest_services"}]'),
('confirmacao_atendimento_gg', 'Confirmação de Atendimento', 'Olá {{1}}, tudo bem?\n\nEstou retomando seu atendimento com a GG Gesso Forros e Iluminação sobre {{2}} e sigo à disposição para avançarmos no próximo passo.', '[{"key": "1", "label": "Nome do cliente", "auto_fill": "contact.name"}, {"key": "2", "label": "Serviço/assunto", "auto_fill": "contact.interest_services"}]');

-- Add indexes for conversation_events (was pending)
CREATE INDEX IF NOT EXISTS idx_conversation_events_conversation_id ON public.conversation_events(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_events_contact_id ON public.conversation_events(contact_id);
CREATE INDEX IF NOT EXISTS idx_conversation_events_event_type ON public.conversation_events(event_type);
CREATE INDEX IF NOT EXISTS idx_conversation_events_created_at ON public.conversation_events(created_at);
