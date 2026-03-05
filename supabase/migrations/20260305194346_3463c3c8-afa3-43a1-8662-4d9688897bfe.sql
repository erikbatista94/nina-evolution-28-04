ALTER TABLE public.messages ADD COLUMN sender_user_id uuid NULL;
CREATE INDEX idx_messages_sender_user_id ON public.messages (sender_user_id);