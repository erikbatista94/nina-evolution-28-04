
-- Add is_urgent to contacts
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS is_urgent BOOLEAN DEFAULT false;

-- Create source normalization function
CREATE OR REPLACE FUNCTION public.normalize_contact_source()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.source IS NOT NULL THEN
    NEW.source := CASE lower(trim(NEW.source))
      WHEN 'insta' THEN 'Instagram'
      WHEN 'instagram' THEN 'Instagram'
      WHEN 'instagram ads' THEN 'Instagram'
      WHEN 'ig' THEN 'Instagram'
      WHEN 'google' THEN 'Google'
      WHEN 'google ads' THEN 'Google'
      WHEN 'google adwords' THEN 'Google'
      WHEN 'indicacao' THEN 'Indicação'
      WHEN 'indicação' THEN 'Indicação'
      WHEN 'indicaçao' THEN 'Indicação'
      WHEN 'site' THEN 'Site'
      WHEN 'website' THEN 'Site'
      WHEN 'bni' THEN 'BNI'
      WHEN 'club & casa' THEN 'Club & Casa'
      WHEN 'club e casa' THEN 'Club & Casa'
      WHEN 'club casa' THEN 'Club & Casa'
      WHEN 'arquiteto' THEN 'Arquiteto parceiro'
      WHEN 'arquiteto parceiro' THEN 'Arquiteto parceiro'
      WHEN 'trafego pago' THEN 'Tráfego pago'
      WHEN 'tráfego pago' THEN 'Tráfego pago'
      WHEN 'trafego' THEN 'Tráfego pago'
      WHEN 'whatsapp' THEN 'WhatsApp direto'
      WHEN 'whatsapp direto' THEN 'WhatsApp direto'
      WHEN 'facebook' THEN 'Facebook'
      WHEN 'facebook ads' THEN 'Facebook'
      ELSE initcap(trim(NEW.source))
    END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_normalize_contact_source ON public.contacts;
CREATE TRIGGER trigger_normalize_contact_source
  BEFORE INSERT OR UPDATE OF source ON public.contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_contact_source();
