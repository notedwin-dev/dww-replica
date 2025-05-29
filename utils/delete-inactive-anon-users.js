// Script to delete all anonymous users from Supabase Auth
// This file should not be committed to GitHub as it uses admin credentials
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Configuration - Set these from environment variables
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY; // Service Role key required for admin operations
const DRY_RUN = false; // Default to no dry run

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables are required.');
  console.error('Create a .env file with these values or set them in your environment.');
  process.exit(1);
}

// Initialize Supabase Admin client with service role key
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

/**
 * Delete all anonymous users
 */
async function deleteAnonymousUsers() {
  console.log(`Starting deletion of anonymous users in ${DRY_RUN ? 'DRY RUN' : 'LIVE'} mode...`);
  
  try {
    // Retrieve all users with the is_anonymous flag
    const { data, error } = await supabase.auth.admin.listUsers();
    
    if (error) {
      throw new Error(`Failed to list users: ${error.message}`);
    }
    
    // Filter to find anonymous users
    // Supabase identifies anonymous users in app_metadata
    const anonymousUsers = data.users.filter(user => {
      return user.is_anonymous === true || 
             (user.app_metadata && user.app_metadata.provider === 'anonymous');
    });
    
    console.log(`Found ${anonymousUsers.length} anonymous users.`);
    
    if (anonymousUsers.length === 0) {
      console.log('No anonymous users to delete.');
      return;
    }
    
    // Delete each anonymous user one by one
    let successCount = 0;
    let failCount = 0;
    
    for (let i = 0; i < anonymousUsers.length; i++) {
      const user = anonymousUsers[i];
      console.log(`Processing user ${i+1}/${anonymousUsers.length}: ${user.id}`);
      
      if (!DRY_RUN) {
        // Delete the user using admin API
        const { error: deleteError } = await supabase.auth.admin.deleteUser(user.id);
        
        if (deleteError) {
          console.error(`Failed to delete user ${user.id}: ${deleteError.message}`);
          failCount++;
        } else {
          console.log(`Successfully deleted user ${user.id}`);
          successCount++;
        }
      } else {
        console.log(`[DRY RUN] Would delete user ${user.id}`);
        successCount++;
      }
    }
    
    console.log('\nSummary:');
    console.log(`Total anonymous users found: ${anonymousUsers.length}`);
    console.log(`Successfully ${DRY_RUN ? 'simulated deletion of' : 'deleted'}: ${successCount} users`);
    if (failCount > 0) {
      console.log(`Failed to delete: ${failCount} users`);
    }
    
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

// Run the script
deleteAnonymousUsers()
  .then(() => {
    console.log('Script execution completed.');
  })
  .catch(err => {
    console.error('Script execution failed:', err);
    process.exit(1);
  });