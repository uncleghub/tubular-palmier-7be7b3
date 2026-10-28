CREATE TABLE IF NOT EXISTS free_preview_allowances (
 user_id text PRIMARY KEY REFERENCES users(id),
 image_limit integer NOT NULL DEFAULT 3 CHECK(image_limit>=0),
 video_limit integer NOT NULL DEFAULT 1 CHECK(video_limit>=0),
 image_used integer NOT NULL DEFAULT 0 CHECK(image_used>=0),
 video_used integer NOT NULL DEFAULT 0 CHECK(video_used>=0),
 image_reserved integer NOT NULL DEFAULT 0 CHECK(image_reserved>=0),
 video_reserved integer NOT NULL DEFAULT 0 CHECK(video_reserved>=0),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(image_used+image_reserved<=image_limit),
 CHECK(video_used+video_reserved<=video_limit)
);
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS funding_source text NOT NULL DEFAULT 'wallet';
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS list_price_credits integer NOT NULL DEFAULT 0 CHECK(list_price_credits>=0);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS media_kind text CHECK(media_kind IN ('image','video'));
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS funding_source text NOT NULL DEFAULT 'wallet';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS list_price_credits integer NOT NULL DEFAULT 0 CHECK(list_price_credits>=0);
UPDATE quotes SET list_price_credits=credits WHERE list_price_credits=0 AND funding_source='wallet';
UPDATE jobs SET list_price_credits=credits WHERE list_price_credits=0 AND funding_source='wallet';
ALTER TABLE quotes DROP CONSTRAINT IF EXISTS quotes_credits_check;
ALTER TABLE quotes ADD CONSTRAINT quotes_credits_check CHECK((funding_source IN ('wallet','subscription') AND credits>0) OR (funding_source='free_preview' AND credits=0 AND list_price_credits>0));
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_credits_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_credits_check CHECK((funding_source IN ('wallet','subscription') AND credits>0) OR (funding_source='free_preview' AND credits=0 AND list_price_credits>0));
CREATE TABLE IF NOT EXISTS free_preview_events (
 id uuid PRIMARY KEY,
 user_id text NOT NULL REFERENCES users(id),
 job_id uuid NOT NULL REFERENCES jobs(id),
 kind text NOT NULL CHECK(kind IN ('reservation','spend','release')),
 media_kind text NOT NULL CHECK(media_kind IN ('image','video')),
 reference text NOT NULL UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now()
);
