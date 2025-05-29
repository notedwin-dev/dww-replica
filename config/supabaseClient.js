// Create a single supabase client for interacting with your database
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;

// For server-side operations, we use the service role key which can bypass RLS
// Never expose this key on the client side!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase credentials');
}

// Create client with service role key for server-side operations
// This allows bypassing RLS policies
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Set auth context to identify this client as service_role
supabase.auth.onAuthStateChange((event, session) => {
  console.log('Supabase auth state changed:', event);
});

module.exports = supabase;
