CREATE TABLE IF NOT EXISTS subscriptions (
 id uuid PRIMARY KEY,
 user_id text NOT NULL UNIQUE REFERENCES users(id),
 plan_id text NOT NULL,
 mode text NOT NULL DEFAULT 'test' CHECK(mode='test'),
 status text NOT NULL CHECK(status IN ('active','past_due','canceled','expired')),
 cancel_at_period_end boolean NOT NULL DEFAULT false,
 current_period_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS subscription_periods (
 id uuid PRIMARY KEY,
 subscription_id uuid NOT NULL REFERENCES subscriptions(id),
 user_id text NOT NULL REFERENCES users(id),
 plan_id text NOT NULL,
 cents integer NOT NULL CHECK(cents>0),
 total integer NOT NULL CHECK(total>0),
 available integer NOT NULL CHECK(available>=0),
 reserved integer NOT NULL DEFAULT 0 CHECK(reserved>=0),
 spent integer NOT NULL DEFAULT 0 CHECK(spent>=0),
 period_start timestamptz NOT NULL,
 period_end timestamptz NOT NULL,
 payment_reference text NOT NULL UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(period_end>period_start),
 CHECK(available+reserved+spent=total)
);
CREATE INDEX IF NOT EXISTS subscription_periods_user ON subscription_periods(user_id,period_end);
CREATE TABLE IF NOT EXISTS subscription_checkouts (
 id uuid PRIMARY KEY,
 user_id text NOT NULL REFERENCES users(id),
 plan_id text NOT NULL,
 cents integer NOT NULL CHECK(cents>0),
 credits integer NOT NULL CHECK(credits>0),
 mode text NOT NULL DEFAULT 'test' CHECK(mode='test'),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','paid','failed','canceled')),
 subscription_id uuid REFERENCES subscriptions(id),
 period_id uuid REFERENCES subscription_periods(id),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '30 minutes',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS subscription_checkout_pending ON subscription_checkouts(user_id) WHERE status='pending';
CREATE TABLE IF NOT EXISTS subscription_events (
 id uuid PRIMARY KEY,
 user_id text NOT NULL REFERENCES users(id),
 subscription_id uuid REFERENCES subscriptions(id),
 period_id uuid REFERENCES subscription_periods(id),
 job_id uuid REFERENCES jobs(id),
 kind text NOT NULL CHECK(kind IN ('paid','failed','canceled','cancel_scheduled','resumed','reservation','spend','release')),
 reference text NOT NULL UNIQUE,
 amount integer NOT NULL DEFAULT 0,
 proof jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS subscription_period_id uuid REFERENCES subscription_periods(id);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS subscription_period_id uuid REFERENCES subscription_periods(id);
ALTER TABLE quotes DROP CONSTRAINT IF EXISTS quotes_credits_check;
ALTER TABLE quotes ADD CONSTRAINT quotes_credits_check CHECK((funding_source IN ('wallet','subscription') AND credits>0) OR (funding_source='free_preview' AND credits=0 AND list_price_credits>0));
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_credits_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_credits_check CHECK((funding_source IN ('wallet','subscription') AND credits>0) OR (funding_source='free_preview' AND credits=0 AND list_price_credits>0));
ALTER TABLE quotes DROP CONSTRAINT IF EXISTS quotes_subscription_period_check;
ALTER TABLE quotes ADD CONSTRAINT quotes_subscription_period_check CHECK((funding_source='subscription')=(subscription_period_id IS NOT NULL));
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_subscription_period_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_subscription_period_check CHECK((funding_source='subscription')=(subscription_period_id IS NOT NULL));
