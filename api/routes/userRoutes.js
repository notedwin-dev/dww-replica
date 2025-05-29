const express = require('express');
const router = express.Router();
const supabase = require('../../config/supabaseClient');
const jwt = require('jsonwebtoken');

// Middleware to verify JWT tokens
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.status(401).json({ error: 'Access denied' });

  try {
    const verified = jwt.verify(token, process.env.JWT_SECRET);
    req.user = verified;
    next();
  } catch (error) {
    res.status(400).json({ error: 'Invalid token' });
  }
};

// Register new user
router.post('/register', async (req, res) => {
  try {
    const { email, password, username } = req.body;
    
    // Check if user exists
    const { data: existingUser } = await supabase
      .from('users')
      .select()
      .eq('email', email)
      .single();

    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Register user with Supabase auth
    const { user, error: authError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (authError) throw authError;

    // Create user profile in our custom users table
    const { data, error } = await supabase
      .from('users')
      .insert({
        id: user.id,
        email,
        username,
        coins: 10000, // Starting coins
        created_at: new Date()
      });

    if (error) throw error;

    // Create JWT token
    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET);

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: user.id,
        email,
        username,
        coins: 10000
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Login user
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Sign in with Supabase auth
    const { user, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) throw authError;

    // Get user details from our custom table
    const { data: userData, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single();

    if (error) throw error;

    // Create JWT token
    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET);

    res.status(200).json({
      message: 'Login successful',
      token,
      user: userData
    });
  } catch (error) {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

// Get user profile
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', req.user.id)
      .single();

    if (error) throw error;

    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update user coins
router.put('/coins', authenticateToken, async (req, res) => {
  try {
    const { coins } = req.body;
    
    if (typeof coins !== 'number') {
      return res.status(400).json({ error: 'Coins must be a number' });
    }

    const { data, error } = await supabase
      .from('users')
      .update({ coins })
      .eq('id', req.user.id)
      .select()
      .single();

    if (error) throw error;

    res.status(200).json({ 
      message: 'Coins updated successfully',
      user: data
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
