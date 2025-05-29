const express = require('express');
const router = express.Router();
const supabase = require('../../config/supabaseClient');

// Get leaderboard (top users by coins)
router.get('/', async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    
    const { data, error } = await supabase
      .from('users')
      .select('username, coins')
      .order('coins', { ascending: false })
      .limit(limit);

    if (error) throw error;

    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get user's rank
router.get('/rank/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Get all users ordered by coins
    const { data: users, error } = await supabase
      .from('users')
      .select('id, coins')
      .order('coins', { ascending: false });

    if (error) throw error;

    // Find the user's position
    const userIndex = users.findIndex(user => user.id === userId);
    
    if (userIndex === -1) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.status(200).json({ 
      rank: userIndex + 1,
      total: users.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
