-- Push subscriptions table for Web Push API
-- Note: 'role' is a reserved word in PostgreSQL, using sub_role instead
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id  uuid REFERENCES order_sessions(id) ON DELETE CASCADE,
  seller_id   text,
  sub_role    text NOT NULL CHECK (sub_role IN ('buyer', 'seller')),
  subscription jsonb NOT NULL,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_subs_session ON push_subscriptions(session_id, sub_role);
CREATE INDEX IF NOT EXISTS idx_push_subs_seller  ON push_subscriptions(seller_id, sub_role);
