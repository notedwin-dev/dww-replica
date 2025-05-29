const express = require('express');
const router = express.Router();
const supabase = require('../../config/supabaseClient');
const jwt = require("jsonwebtoken");

// Middleware to verify JWT tokens
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) return res.status(401).json({ error: "Access denied" });

  try {
    const verified = jwt.verify(token, process.env.JWT_SECRET);
    req.user = verified;
    next();
  } catch (error) {
    res.status(400).json({ error: "Invalid token" });
  }
};

// Register new user
router.post("/register", async (req, res) => {
  try {
    const { email, password, username } = req.body; // Check if user exists by email or username
    const { data: existingUserByEmail } = await supabase
      .from("users")
      .select()
      .eq("email", email)
      .single();

    if (existingUserByEmail) {
      return res
        .status(400)
        .json({ error: "User with this email already exists" });
    }

    const { data: existingUserByUsername } = await supabase
      .from("users")
      .select()
      .eq("username", username)
      .single();

    if (existingUserByUsername) {
      return res.status(400).json({ error: "Username is already taken" });
    }

    // Register user with Supabase auth
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {},
      },
    });

    if (authError) throw authError;

    if (!user || !user.id) {
      console.error("Supabase signUp response:", { user, authError });
      return res.status(500).json({ error: "Failed to register user" });
    } // Create user profile in our custom users table
    const { data, error: insertError } = await supabase
      .from("users")
      .insert({
        id: user.id,
        email,
        username,
        coins: 10000, // Starting coins
      })
      .select()
      .single();

    console.log("Insert operation result:", { data, insertError });

    if (insertError) {
      console.error("Database insert error:", insertError);
      throw new Error(`Failed to create user profile: ${insertError.message}`);
    }

    if (!data) {
      throw new Error("User profile was not created - no data returned");
    }

    console.log("User profile created successfully:", data);
    // Create JWT token
    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET);

    res.status(201).json({
      message: "User registered successfully",
      token,
      user: {
        id: user.id,
        email,
        username,
        coins: 10000,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Login user
router.post("/login", async (req, res) => {
  try {
    const { usernameOrEmail, password } = req.body;

    let email = usernameOrEmail;

    // Check if input is username (doesn't contain @)
    if (usernameOrEmail && !usernameOrEmail.includes("@")) {
      // Look up email by username
      const { data: userByUsername, error: lookupError } = await supabase
        .from("users")
        .select("email")
        .eq("username", usernameOrEmail)
        .single();

      if (lookupError || !userByUsername) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      email = userByUsername.email;
    }

    // Sign in with Supabase auth using email
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) throw authError;

    // Get user details from our custom table
    const { data: userData, error } = await supabase
      .from("users")
      .select("*")
      .eq("id", user.id)
      .single();

    if (error) throw error;

    // Create JWT token
    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET);

    res.status(200).json({
      message: "Login successful",
      token,
      user: userData,
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(401).json({ error: "Invalid credentials" });
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
