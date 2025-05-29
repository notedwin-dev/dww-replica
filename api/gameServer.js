const supabase = require('../config/supabaseClient');

// Animal and special probabilities - copied from your original script.js
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

  return animals[0];
}

// Game server class
class GameServer {
  constructor() {
    this.gameInterval = null;
    this.roundDuration = 30000; // 30 seconds
    this.resultDelay = 2000; // 2 second delay to show results
    this.resetDelay = 5000; // 5 second delay before starting next round
  }

  // Broadcast game updates to clients
  async broadcastGameUpdate(eventType, data) {
    try {
      const channel = supabase.channel("game_updates");
      await channel.send({
        type: "broadcast",
        event: eventType,
        payload: data,
      });
      console.log(`Broadcasted ${eventType} event:`, data);
    } catch (error) {
      console.error("Failed to broadcast game update:", error);
    }
  }

  // Start the game loop
  startGameLoop() {
    if (this.gameInterval) {
      console.log("Game loop already running");
      return;
    }

    this.gameInterval = setInterval(async () => {
      try {
        // End the current game and broadcast results
        const result = getRandomAnimal();
        await this.broadcastGameUpdate("game_end", { result });

        // Wait for result delay before starting a new game
        setTimeout(async () => {
          const newGame = { id: Date.now(), status: "active" };
          await this.broadcastGameUpdate("game_start", newGame);
        }, this.resultDelay);
      } catch (error) {
        console.error("Error in game loop:", error);
      }
    }, this.roundDuration + this.resultDelay + this.resetDelay);

    console.log("Game loop started");
  }

  async startGameLoop() {
    if (this.gameInterval) {
      clearInterval(this.gameInterval);
    }

    console.log("Starting game server loop");
    await this.startNewRound();

    // Schedule the game loop to run continuously
    this.gameInterval = setInterval(async () => {
      await this.startNewRound();
    }, this.roundDuration + this.resultDelay + this.resetDelay);
  }

  async startNewRound() {
    try {
      // Calculate end time for this round
      const endTime = new Date(Date.now() + this.roundDuration);

      // Create a new game in the database
      const { data: gameData, error } = await supabase
        .from("games")
        .insert({
          status: "active",
          start_time: new Date(),
          end_time: endTime,
          created_at: new Date(),
        })
        .select()
        .single();

      if (error) throw error;

      console.log(`Started new game round: ${gameData.id}`);

      // Use setTimeout to determine the winner after round ends
      setTimeout(async () => {
        await this.endRound(gameData.id);
      }, this.roundDuration);

      return gameData;
    } catch (error) {
      console.error("Error starting new round:", error);
    }
  }

  async endRound(gameId) {
    try {
      // Get a random animal as the result
      const result = getRandomAnimal();

      console.log(`Game ${gameId} ended with result: ${result.name}`);

      // Update the game with the result
      const { error: updateError } = await supabase
        .from("games")
        .update({
          status: "ended",
          result: result.name,
          result_display_name: result.displayName,
          result_return_rate: result.return,
        })
        .eq("id", gameId);

      if (updateError) throw updateError;

      // Process all bets for this game
      await this.processBets(gameId, result);

      // Broadcast the result via Supabase Realtime
      const { error: broadcastError } = await supabase
        .from("game_events")
        .insert({
          game_id: gameId,
          event_type: "result",
          data: {
            result: result.name,
            displayName: result.displayName,
            return_rate: result.return,
          },
          created_at: new Date(),
        });

      if (broadcastError) throw broadcastError;
    } catch (error) {
      console.error("Error ending round:", error);
    }
  }

  async processBets(gameId, result) {
    try {
      // Get all bets for this game
      const { data: bets, error } = await supabase
        .from("bets")
        .select("*")
        .eq("game_id", gameId);

      if (error) throw error;

      // Process each bet and update user coins
      for (const bet of bets) {
        let winnings = 0;

        // Calculate winnings if user bet on the winning animal
        if (bet.animal === result.name) {
          winnings = bet.amount * result.return;

          // Update user's coins with their winnings
          const { error: updateError } = await supabase.rpc("add_coins", {
            user_id: bet.user_id,
            amount: winnings,
          });

          if (updateError) throw updateError;
        }

        // Record the result of this bet
        const { error: resultError } = await supabase
          .from("bet_results")
          .insert({
            bet_id: bet.id,
            game_id: gameId,
            user_id: bet.user_id,
            result: result.name,
            winnings: winnings,
            created_at: new Date(),
          });

        if (resultError) throw resultError;
      }

      console.log(`Processed ${bets.length} bets for game ${gameId}`);
    } catch (error) {
      console.error("Error processing bets:", error);
    }
  }

  // Serverless-compatible method to ensure there's always an active game
  async ensureActiveGame() {
    try {
      // Check if there's an active game
      const { data: activeGame, error } = await supabase
        .from("games")
        .select("*")
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== "PGRST116") {
        // PGRST116 = no rows returned
        throw error;
      }

      // If no active game or the active game has expired, start a new one
      if (!activeGame || new Date() > new Date(activeGame.end_time)) {
        if (activeGame && new Date() > new Date(activeGame.end_time)) {
          // End the expired game first
          await this.endRound(activeGame.id);
        }
        // Start a new game
        await this.startNewRound();
      }

      return true;
    } catch (error) {
      console.error("Error ensuring active game:", error);
      throw error;
    }
  }

  // Serverless-compatible method to process game cycle
  async processGameCycle() {
    try {
      // Check for games that need to be ended
      const { data: expiredGames, error } = await supabase
        .from("games")
        .select("*")
        .eq("status", "active")
        .lt("end_time", new Date().toISOString());

      if (error) throw error;

      // End expired games
      for (const game of expiredGames || []) {
        await this.endRound(game.id);
      }

      // Ensure there's always an active game
      await this.ensureActiveGame();

      return true;
    } catch (error) {
      console.error("Error processing game cycle:", error);
      throw error;
    }
  }
}

module.exports = { GameServer };
