-- Create tables for our application

-- Users table (extends Supabase Auth)
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  coins INTEGER NOT NULL DEFAULT 10000,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Games table to track game rounds
CREATE TABLE games (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  status TEXT NOT NULL DEFAULT 'active',
  result TEXT,
  result_display_name TEXT,
  result_return_rate NUMERIC,
  start_time TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  end_time TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Bets table to track user bets
CREATE TABLE bets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id),
  game_id UUID REFERENCES games(id),
  animal TEXT NOT NULL,
  amount INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Bet results table
CREATE TABLE bet_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bet_id UUID REFERENCES bets(id),
  game_id UUID REFERENCES games(id),
  user_id UUID REFERENCES users(id),
  result TEXT NOT NULL,
  winnings INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Game events table for Realtime updates
CREATE TABLE game_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  game_id UUID REFERENCES games(id),
  event_type TEXT NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Function to add coins to a user's balance
CREATE OR REPLACE FUNCTION add_coins(user_id UUID, amount INTEGER)
RETURNS void AS $$
BEGIN
  UPDATE users
  SET coins = coins + amount,
      updated_at = TIMEZONE('utc', NOW())
  WHERE id = user_id;
END;
$$ LANGUAGE plpgsql;

-- Enable Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE bets ENABLE ROW LEVEL SECURITY;
ALTER TABLE bet_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_events ENABLE ROW LEVEL SECURITY;

-- Create policies for Row Level Security
-- Users can only read/update their own data
CREATE POLICY "Users can view their own data" ON users
  FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own data" ON users
  FOR UPDATE
  USING (auth.uid() = id);

-- Anyone can read games data
CREATE POLICY "Anyone can view games" ON games
  FOR SELECT
  USING (true);

-- Anyone can read bets
CREATE POLICY "Anyone can view bets" ON bets
  FOR SELECT
  USING (true);

-- Users can only create their own bets
CREATE POLICY "Users can create their own bets" ON bets
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Anyone can read bet results
CREATE POLICY "Anyone can view bet results" ON bet_results
  FOR SELECT
  USING (true);

-- Anyone can read game events
CREATE POLICY "Anyone can view game events" ON game_events
  FOR SELECT
  USING (true);

-- Set up Realtime subscriptions for relevant tables
BEGIN;
  -- Enable realtime for these tables
  ALTER PUBLICATION supabase_realtime ADD TABLE games;
  ALTER PUBLICATION supabase_realtime ADD TABLE game_events;
COMMIT;
