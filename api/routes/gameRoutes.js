const express = require('express');
const router = express.Router();
const supabase = require('../../config/supabaseClient');
const jwt = require('jsonwebtoken');
const cryptoUtils = require('../../utils/crypto');

// Middleware to verify JWT tokens
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    // Allow anonymous access for getting game state
    if (req.method === 'GET') {
      req.user = { id: null };
      return next();
    }
    return res.status(401).json({ error: 'Access denied' });
  }

  try {
    const verified = jwt.verify(token, process.env.JWT_SECRET);
    req.user = verified;
    next();
  } catch (error) {
    res.status(400).json({ error: 'Invalid token' });
  }
};

// Get Supabase configuration for client
router.get('/config', (req, res) => {
  // Generate a session ID for this client
  const crypto = require('crypto');
  const sessionId = crypto.randomBytes(16).toString('hex');
  
  // Data to encrypt
  const configData = JSON.stringify({
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_ANON_KEY
  });
  
  // Encrypt the data using our utility
  const { encryptedData, iv, salt } = cryptoUtils.encrypt(configData);
  
  // Send encrypted data with info needed for decryption
  res.json({
    sessionId,
    iv,
    salt,
    encryptedConfig: encryptedData,
    verification: cryptoUtils.createVerificationHash(configData)
  });
});

// Get current game state
router.get('/state', async (req, res) => {
  try {
    // Get current game from games table (sorted by created_at desc)
    const { data: gameData, error: gameError } = await supabase
      .from('games')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (gameError) throw gameError;

    // If no active game or if the game has ended, create a new game
    if (!gameData || new Date(gameData.end_time) < new Date()) {
      return res.status(200).json({
        message: 'No active game',
        status: 'waiting',
        countdown: 30,
        result: null
      });
    }

    // Get all bets for current game
    const { data: bets, error: betsError } = await supabase
      .from('bets')
      .select(`
        amount,
        animal,
        users (
          username
        )
      `)
      .eq('game_id', gameData.id);

    if (betsError) throw betsError;

    // Calculate time left
    const endTime = new Date(gameData.end_time);
    const now = new Date();
    const timeLeftSeconds = Math.max(0, Math.floor((endTime - now) / 1000));

    res.status(200).json({
      game: gameData,
      bets,
      status: timeLeftSeconds > 0 ? 'active' : 'ended',
      countdown: timeLeftSeconds,
      result: gameData.result
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Place a bet
router.post('/bet', authenticateToken, async (req, res) => {
  if (!req.user.id) {
    return res.status(401).json({ error: 'You must be logged in to place bets' });
  }

  try {
    const { animal, amount } = req.body;
    
    if (!animal || !amount) {
      return res.status(400).json({ error: 'Animal and amount are required' });
    }

    // Get current game
    const { data: gameData, error: gameError } = await supabase
      .from('games')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (gameError) throw gameError;

    // Check if game is still active
    if (new Date(gameData.end_time) < new Date()) {
      return res.status(400).json({ error: 'Betting time has ended for this round' });
    }

    // Check if user has enough coins
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('coins')
      .eq('id', req.user.id)
      .single();

    if (userError) throw userError;

    if (userData.coins < amount) {
      return res.status(400).json({ error: 'Not enough coins' });
    }

    // Start a transaction for consistency
    // 1. Subtract coins from user
    // 2. Record the bet
    const { data: updatedUser, error: updateError } = await supabase
      .from('users')
      .update({ coins: userData.coins - amount })
      .eq('id', req.user.id)
      .select()
      .single();

    if (updateError) throw updateError;

    // Record the bet
    const { data: bet, error: betError } = await supabase
      .from('bets')
      .insert({
        user_id: req.user.id,
        game_id: gameData.id,
        animal,
        amount,
        created_at: new Date()
      })
      .select()
      .single();

    if (betError) throw betError;

    res.status(201).json({
      message: 'Bet placed successfully',
      bet,
      user: updatedUser
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get game history
router.get('/history', async (req, res) => {
  try {
    const { limit = 20, page = 0 } = req.query;
    
    // Get past games with their results
    const { data: gamesData, error: gamesError } = await supabase
      .from('games')
      .select('*')
      .order('created_at', { ascending: false })
      .range(page * limit, (page * limit) + limit - 1);

    if (gamesError) throw gamesError;

    res.status(200).json(gamesData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
