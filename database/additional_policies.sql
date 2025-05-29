-- Add policy to allow server to insert new games
-- This uses the service_role key's ability to bypass RLS
CREATE POLICY "Server can create games" ON games
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Add policy to allow server to update games
CREATE POLICY "Server can update games" ON games
  FOR UPDATE
  TO authenticated
  USING (true);

-- Add policy to allow server to insert game events
CREATE POLICY "Server can create game events" ON game_events
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Add policy to allow server to insert bet results
CREATE POLICY "Server can create bet results" ON bet_results
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow server to update users (needed for adding coins)
CREATE POLICY "Server can update users" ON users
  FOR UPDATE
  TO authenticated
  USING (true);

-- For development only - bypass RLS for the service role
ALTER TABLE games FORCE ROW LEVEL SECURITY;
ALTER TABLE game_events FORCE ROW LEVEL SECURITY;
ALTER TABLE bet_results FORCE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
