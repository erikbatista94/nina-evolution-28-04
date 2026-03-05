-- Create whatsapp-media bucket (public for easy access)
INSERT INTO storage.buckets (id, name, public)
VALUES ('whatsapp-media', 'whatsapp-media', true)
ON CONFLICT (id) DO NOTHING;

-- Allow service role and authenticated users to read
CREATE POLICY "Public read access for whatsapp-media"
ON storage.objects FOR SELECT
USING (bucket_id = 'whatsapp-media');

-- Allow service role to insert (edge functions use service key)
CREATE POLICY "Service role insert for whatsapp-media"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'whatsapp-media');

-- Allow service role to update
CREATE POLICY "Service role update for whatsapp-media"
ON storage.objects FOR UPDATE
USING (bucket_id = 'whatsapp-media');