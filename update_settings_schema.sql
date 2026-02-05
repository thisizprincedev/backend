ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS telegram_alerts_enabled boolean DEFAULT true;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS alert_on_login boolean DEFAULT true;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS alert_on_logout boolean DEFAULT true;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS alert_on_device_activity boolean DEFAULT true;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS alert_on_new_messages boolean DEFAULT true;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS sound_notifications boolean DEFAULT true;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS dark_mode boolean DEFAULT true;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS auto_sync_interval integer DEFAULT 30;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS auto_sync_enabled boolean DEFAULT false;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS auto_sync_interval_minutes integer DEFAULT 5;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS scan_batch_size integer DEFAULT 8;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_settings_scan_batch_size_check') THEN
        ALTER TABLE public.user_settings ADD CONSTRAINT user_settings_scan_batch_size_check CHECK (((scan_batch_size >= 5) AND (scan_batch_size <= 20)));
    END IF;
END $$;
