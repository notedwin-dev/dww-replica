const express = require('express');
const router = express.Router();
const supabase = require('../../config/supabaseClient');
const jwt = require("jsonwebtoken");

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
  // Send configuration directly - much simpler!
  res.json({
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_ANON_KEY,
  });
});

// Get current game state
router.get("/state", async (req, res) => {
  try {
    // Get current game from games table (sorted by created_at desc)
    const { data: gameData, error: gameError } = await supabase
      .from("games")
      .select("*")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (gameError && gameError.code !== "PGRST116") {
      // PGRST116 = no rows returned
      throw gameError;
    }

    // If no active game, return waiting status
    if (!gameData) {
      return res.status(200).json({
        message: "No active game",
        status: "waiting",
        countdown: 30,
        result: null,
      });
    }

    // Check if the game has expired
    const currentTime = new Date();
    const gameEndTime = new Date(gameData.end_time);

    if (currentTime >= gameEndTime && gameData.status === "active") {
      // End the expired game
      const result = await endGame(gameData.id);

      // Return the ended game with result
      return res.status(200).json({
        game: { ...gameData, status: "ended", result: result.name },
        status: "ended",
        countdown: 0,
        result: result,
        bets: [],
      });
    }

    // Get all bets for current game
    const { data: bets, error: betsError } = await supabase
      .from("bets")
      .select(
        `
        amount,
        animal,
        users (
          username
        )
      `
      )
      .eq("game_id", gameData.id);

    if (betsError) throw betsError;

    // Calculate time left
    const endTime = new Date(gameData.end_time);
    const now = new Date();
    const timeLeftSeconds = Math.max(0, Math.floor((endTime - now) / 1000));

    res.status(200).json({
      game: gameData,
      bets,
      status: timeLeftSeconds > 0 ? "active" : "ended",
      countdown: timeLeftSeconds,
      result: gameData.result,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Place a bet
router.post("/bet", authenticateToken, async (req, res) => {
  if (!req.user.id) {
    return res
      .status(401)
      .json({ error: "You must be logged in to place bets" });
  }

  try {
    const { animal, amount } = req.body;

    if (!animal || !amount) {
      return res.status(400).json({ error: "Animal and amount are required" });
    }

    // Get current game
    const { data: gameData, error: gameError } = await supabase
      .from("games")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (gameError) throw gameError;

    // Check if game is still active
    if (new Date(gameData.end_time) < new Date()) {
      return res
        .status(400)
        .json({ error: "Betting time has ended for this round" });
    }

    // Check if user has enough coins
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("coins")
      .eq("id", req.user.id)
      .single();

    if (userError) throw userError;

    if (userData.coins < amount) {
      return res.status(400).json({ error: "Not enough coins" });
    }

    // Start a transaction for consistency
    // 1. Subtract coins from user
    // 2. Record the bet
    const { data: updatedUser, error: updateError } = await supabase
      .from("users")
      .update({ coins: userData.coins - amount })
      .eq("id", req.user.id)
      .select()
      .single();

    if (updateError) throw updateError;

    // Record the bet
    const { data: bet, error: betError } = await supabase
      .from("bets")
      .insert({
        user_id: req.user.id,
        game_id: gameData.id,
        animal,
        amount,
        created_at: new Date(),
      })
      .select()
      .single();

    if (betError) throw betError;

    res.status(201).json({
      message: "Bet placed successfully",
      bet,
      user: updatedUser,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get game history
router.get("/history", authenticateToken, async (req, res) => {
  try {
    const { limit = 20, page = 0 } = req.query;
    const userId = req.user?.id;

    // Get past games with their results
    const { data: gamesData, error: gamesError } = await supabase
      .from("games")
      .select("*")
      .order("created_at", { ascending: false })
      .range(page * limit, page * limit + limit - 1);

    if (gamesError) throw gamesError;

    // If user is logged in, fetch their bets for these games
    if (userId) {
      // Get all game IDs from the results
      const gameIds = gamesData.map((game) => game.id);

      // Fetch all bets for this user for these games
      const { data: userBets, error: betsError } = await supabase
        .from("bets")
        .select("*")
        .eq("user_id", userId)
        .in("game_id", gameIds);

      if (betsError) throw betsError;

      // Add user's bets to each game object
      gamesData.forEach((game) => {
        // Filter bets for current game
        game.user_bets = userBets.filter((bet) => bet.game_id === game.id);
      });
    }

    res.status(200).json(gamesData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Heartbeat endpoint for serverless game management
router.get("/heartbeat", async (req, res) => {
  try {
    // Check if there are any active games
    const { data: activeGames, error: activeError } = await supabase
      .from("games")
      .select("*")
      .eq("status", "active")
      .order("created_at", { ascending: false });

    if (activeError) throw activeError;

    let gameStatus = "no_active_games";
    let message = "No active games found";

    if (activeGames && activeGames.length > 0) {
      const latestGame = activeGames[0];
      const now = new Date();
      const endTime = new Date(latestGame.end_time);

      if (now > endTime && latestGame.status === "active") {
        // Game should be ended - this would normally be handled by the game server
        // For now, just report that a game needs ending
        gameStatus = "game_needs_ending";
        message = `Game ${latestGame.id} has expired and needs to be ended`;
      } else {
        gameStatus = "active_game_running";
        message = `Game ${latestGame.id} is active`;
      }
    } else {
      // No active games - would normally start a new one
      // For serverless, we might need to create games on-demand
      gameStatus = "no_active_games";
      message = "No active games - new game needed";
    }

    res.status(200).json({
      status: "ok",
      gameStatus,
      message,
      timestamp: new Date(),
      activeGames: activeGames?.length || 0,
    });
  } catch (error) {
    console.error("Heartbeat error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Create a new game (for serverless environments)
router.post("/create", async (req, res) => {
  try {
    // Check if there's already an active game
    const { data: activeGame, error: activeError } = await supabase
      .from("games")
      .select("*")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (activeError && activeError.code !== "PGRST116") {
      // PGRST116 = no rows returned
      throw activeError;
    }

    // If there's an active game that hasn't expired, return it
    if (activeGame && new Date() < new Date(activeGame.end_time)) {
      return res.status(200).json({
        message: "Active game already exists",
        game: activeGame,
      });
    }

    // If there's an expired active game, end it first
    if (activeGame && new Date() >= new Date(activeGame.end_time)) {
      await endGame(activeGame.id);
    }

    // Create a new game
    const roundDuration = 30000; // 30 seconds
    const endTime = new Date(Date.now() + roundDuration);

    const { data: newGame, error: createError } = await supabase
      .from("games")
      .insert({
        status: "active",
        start_time: new Date(),
        end_time: endTime,
        created_at: new Date(),
      })
      .select()
      .single();

    if (createError) throw createError;

    console.log(`Created new game: ${newGame.id}`);

    res.status(201).json({
      message: "New game created",
      game: newGame,
    });
  } catch (error) {
    console.error("Create game error:", error);
    res.status(500).json({ error: error.message });
  }
});

// End a game and determine winner
async function endGame(gameId) {
  try {
    // Animal definitions for result calculation
    const animals = [
      { name: "turtle", displayName: "🐢乌龟", prob: 19.4, return: 5 },
      { name: "hedgehog", displayName: "🦔刺猬", prob: 19.4, return: 5 },
      { name: "raccoon", displayName: "🦝浣熊", prob: 19.4, return: 5 },
      { name: "elephant", displayName: "🐘小象", prob: 19.4, return: 5 },
      { name: "cat", displayName: "😼猫咪", prob: 9.7, return: 10 },
      { name: "fox", displayName: "🦊狐狸", prob: 6.5, return: 15 },
      { name: "pig", displayName: "🐖猪猪", prob: 3.9, return: 25 },
      { name: "lion", displayName: "🦁狮子", prob: 2.2, return: 45 },
    ];

    const specials = [
      {
        name: "vegetarian_festival",
        displayName: "🐢🦔🦝🐘",
        prob: 0.05,
        return: 20,
      },
      {
        name: "carnivorous_festival",
        displayName: "😼🦊🐖🦁",
        prob: 0.05,
        return: 95,
      },
    ];

    // Function to get a random animal based on probability
    function getRandomAnimal() {
      let totalProb =
        animals.reduce((sum, animal) => sum + animal.prob, 0) +
        specials.reduce((sum, special) => sum + special.prob, 0);
      let random = Math.random() * totalProb;
      let cumulativeProb = 0;

      for (let animal of animals) {
        cumulativeProb += animal.prob;
        if (random < cumulativeProb) {
          return animal;
        }
      }

      for (let special of specials) {
        cumulativeProb += special.prob;
        if (random < cumulativeProb) {
          return special;
        }
      }

      return animals[0]; // fallback
    }

    // Determine the winning animal
    const result = getRandomAnimal();

    // Update the game with the result
    const { error: updateError } = await supabase
      .from("games")
      .update({
        status: "ended",
        result: result.name,
        result_display_name: result.displayName,
        result_return_rate: result.return,
        end_time: new Date(),
      })
      .eq("id", gameId);

    if (updateError) throw updateError;

    // Get all bets for this game
    const { data: bets, error: betsError } = await supabase
      .from("bets")
      .select("*")
      .eq("game_id", gameId);

    if (betsError) throw betsError; // Process winning bets and update user coins
    for (const bet of bets || []) {
      if (bet.animal === result.name) {
        const winnings = bet.amount * result.return;

        // Get current user coins first
        const { data: userData, error: getUserError } = await supabase
          .from("users")
          .select("coins")
          .eq("id", bet.user_id)
          .single();

        if (getUserError) {
          console.error("Error getting user data:", getUserError);
          continue;
        }

        // Add winnings to user's account
        const { error: updateUserError } = await supabase
          .from("users")
          .update({
            coins: userData.coins + winnings,
          })
          .eq("id", bet.user_id);

        if (updateUserError) {
          console.error("Error updating user coins:", updateUserError);
        } else {
          console.log(`Added ${winnings} coins to user ${bet.user_id}`);
        }
      }
    }

    console.log(`Game ${gameId} ended. Winner: ${result.displayName}`);
    return result;
  } catch (error) {
    console.error("Error ending game:", error);
    throw error;
  }
}

module.exports = router;
