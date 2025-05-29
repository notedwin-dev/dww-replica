// API URL - change this for production
const API_URL =
  window.location.hostname === "localhost"
    ? "http://localhost:3000/api"
    : "/api";

// Mode switching functions
function switchToSinglePlayer() {
  window.location.href = "index.html";
}

// We'll set these after fetching from the server
let supabase = null;
let isAnonymousUser = false; // Flag for anonymous users

// Game state variables
let coins = 10000;
let betAmount = 0;
let selectedAnimal = "";
let selectedBetAmount = 0;
let bets = {
  turtle: 0,
  hedgehog: 0,
  raccoon: 0,
  elephant: 0,
  cat: 0,
  fox: 0,
  pig: 0,
  lion: 0,
};
let currentGameId = null;
let user = null;
let authToken = null;
let countdown = 30;
let isCountdownActive = false;
let countdownInterval = null;

// Authentication state
const loadAuthState = async () => {
  const savedUser = localStorage.getItem("user");
  const savedToken = localStorage.getItem("token");
  const anonymousUser = localStorage.getItem("anonymousUser");
  const savedSupabaseSession = localStorage.getItem("supabaseSession");

  if (savedUser && savedToken) {
    // Temporarily use saved data to show something quickly
    const tempUser = JSON.parse(savedUser);
    user = tempUser;
    authToken = savedToken;
    updateUIForLoggedInUser(tempUser);

    // But immediately fetch the latest data from server
    try {
      await fetchUserData();
      console.log("Updated user data from server");
    } catch (error) {
      console.error("Failed to fetch user data, using cached data", error);
    }
  } else if (anonymousUser && anonymousUser === "true") {
    // Load anonymous user session
    if (savedSupabaseSession) {
      console.log("Restoring saved anonymous session");
      // If we have a saved Supabase session, manually set it before calling loginAnonymousUser
      // This helps Supabase auth recognize the existing session
      if (supabase) {
        // Try to set the auth state with the saved session
        supabase.auth
          .setSession(JSON.parse(savedSupabaseSession))
          .then(() => {
            console.log("Successfully restored Supabase session");
            isAnonymousUser = true;
            updateNavbarForAnonymousUser();
            loadGuestStats();
          })
          .catch(() => {
            console.log("Failed to restore session, creating new one");
            loginAnonymousUser();
          });
      } else {
        // Initialize Supabase first and then login
        initializeSupabaseClient().then(() => {
          loginAnonymousUser();
        });
      }
    } else {
      // No saved session, create a new one
      loginAnonymousUser();
    }
  } else if (!document.getElementById("auth-container")) {
    // Do not automatically show login UI - use navbar buttons instead
    updateNavbarForGuest();
  }
};

// Save guest stats to localStorage
const saveGuestStats = () => {
  // Create or get the guest ID
  const guestId =
    localStorage.getItem("guestId") ||
    `guest_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  // Save current state
  localStorage.setItem("guestBets", JSON.stringify(bets));
  localStorage.setItem("guestCoins", coins);
  localStorage.setItem("guestId", guestId);

  // Also save to the persistent guest data store
  const guestData = {
    id: guestId,
    coins: coins,
    bets: bets,
    lastSeen: new Date().toISOString(),
  };

  localStorage.setItem(`guestData_${guestId}`, JSON.stringify(guestData));
  localStorage.setItem("lastGuestId", guestId);
};

// Reset guest stats from localStorage
const resetGuestStats = () => {
  localStorage.removeItem("guestBets");
}

// Load guest stats from localStorage or from previous guest data
const loadGuestStats = (previousGuestData = null) => {
  // Try to load from current session storage first
  const savedBets = localStorage.getItem("guestBets");
  const savedCoins = localStorage.getItem("guestCoins");

  if (savedBets) {
    bets = JSON.parse(savedBets);
  }

  if (savedCoins) {
    coins = parseInt(savedCoins, 10);
  }

  // If previous guest data exists and we don't have current session data, use that instead
  if (previousGuestData && (!savedBets || !savedCoins)) {
    console.log("Restoring previous guest data:", previousGuestData);

    // If no current bets, restore from previous guest data
    if (!savedBets && previousGuestData.bets) {
      bets = previousGuestData.bets;
      localStorage.setItem("guestBets", JSON.stringify(bets));
    }

    // If no current coins, restore from previous guest data
    if (!savedCoins && previousGuestData.coins) {
      coins = previousGuestData.coins;
      localStorage.setItem("guestCoins", coins.toString());
    }

    // Store the guest ID for future reference
    localStorage.setItem("guestId", previousGuestData.id);

    // Show a message to the user that their data was restored
    document.getElementById(
      "result"
    ).textContent = `Welcome back! Your previous guest data (${previousGuestData.coins} coins) has been restored.`;
  }

  updateCoinsDisplay();
  resetBetDisplays();
};

// Initialize UI states
const initializeGame = async () => {
  // First, fetch Supabase configuration
  await initializeSupabaseClient();

  // Load auth state and wait for it to complete since it's now async
  await loadAuthState();

  if (!user) {
    loadGuestStats();
  }

  await fetchGameState();

  // Load synchronized past results for all players
  fetchPastResultsList();

  // Only subscribe to realtime if we have a Supabase client
  if (supabase) {
    subscribeToRealtime();
  }
};

// Initialize Supabase client
const initializeSupabaseClient = async () => {
  // Prevent multiple initializations
  if (supabase) {
    console.log("Supabase client already initialized");
    return;
  }

  try {
    console.log("Fetching Supabase configuration from server...");

    // Fetch configuration directly from server - much simpler!
    const response = await fetch(`${API_URL}/game/config`);
    const config = await response.json();

    console.log("Configuration received:", {
      hasUrl: !!config.supabaseUrl,
      hasKey: !!config.supabaseKey,
    });

    // Initialize Supabase with the received configuration
    if (config.supabaseUrl && config.supabaseKey) {
      supabase = window.supabase.createClient(
        config.supabaseUrl,
        config.supabaseKey
      );
      console.log("Supabase client initialized successfully");

      // Set up a listener for auth state changes to keep localStorage in sync
      supabase.auth.onAuthStateChange((event, session) => {
        if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
          if (isAnonymousUser) {
            localStorage.setItem("supabaseSession", JSON.stringify(session));
            console.log("Updated anonymous session in localStorage");
          }
        } else if (event === "SIGNED_OUT") {
          localStorage.removeItem("supabaseSession");
        }
      });
    } else {
      console.error("Incomplete Supabase configuration received");
    }
  } catch (error) {
    console.error("Failed to fetch Supabase configuration:", error);
  }
};

// Fetch current game state from API
const fetchGameState = async () => {
  try {
    const headers = {};
    if (authToken) {
      headers.Authorization = `Bearer ${authToken}`;
    }

    const response = await fetch(`${API_URL}/game/state`, { headers });
    const data = await response.json();
    if (response.ok) {
      if (data.game) {
        currentGameId = data.game.id;

        // Stop any existing countdown before setting new values
        stopCountdown();

        // Calculate remaining time from server data
        const now = new Date();
        const endTime = new Date(data.game.end_time);
        const timeLeftSeconds = Math.max(0, Math.floor((endTime - now) / 1000));

        console.log(
          `Game ${data.game.id}: Server time left: ${timeLeftSeconds}s, End time: ${data.game.end_time}`
        ); // Use calculated time, but ensure we have at least 1 second for new games
        countdown = Math.max(timeLeftSeconds, 0);

        console.log(`Setting countdown to ${countdown} seconds`);

        updateCountdownDisplay(); // If user is logged in, update coins
        if (user && data.userCoins !== undefined) {
          coins = data.userCoins;
          updateCoinsDisplay();

          // Update localStorage with the latest coins value
          if (user) {
            user.coins = data.userCoins;
            localStorage.setItem("user", JSON.stringify(user));
          }
        }

        // Update bet display if there are any bets
        if (data.bets && data.bets.length > 0) {
          updateAllBetsDisplay(data.bets);
        }

        // If game has ended, display result
        if (data.game.status === "ended" && data.result) {
          displayResult(data.result);
          // After showing result, wait a bit then start a new game
          setTimeout(() => {
            console.log("Creating new game after result display...");
            createNewGame();
          }, 3000);
        } else if (countdown > 0) {
          // Start local countdown if game is active and has time left
          console.log(`Starting countdown with ${countdown} seconds`);
          startCountdown();
        } else {
          // Game should have ended but hasn't - trigger end
          console.log("Game time expired, should end soon...");
          setTimeout(() => fetchGameState(), 1000);
        }
      } else {
        // No active game found, try to create one
        console.log("No active game found, attempting to create one...");
        createNewGame();
      }
    } else {
      console.error("Error fetching game state:", data.error);
    }
  } catch (error) {
    console.error("Error connecting to game server:", error);
  }
};

// Subscribe to Supabase Realtime for game updates
const subscribeToRealtime = () => {
  // Make sure supabase client is initialized
  if (!supabase) {
    console.error(
      "Supabase client not initialized, cannot subscribe to realtime events"
    );
    return;
  }

  // Subscribe to game updates channel
  const gameUpdates = supabase
    .channel("game_updates")
    .on("broadcast", { event: "game_start" }, (payload) => {
      console.log("Game started:", payload);
      currentGameId = payload.id;
      resetBets();
      startCountdown();
    })
    .on("broadcast", { event: "game_end" }, (payload) => {
      console.log("Game ended:", payload);
      displayResult(payload.result);
      fetchPastResultsList();
    })
    .subscribe();

  console.log("Subscribed to game updates channel");
};

// Handle game events from Supabase
const handleGameEvent = (event) => {
  if (!event || !event.data) return;

  switch (event.event_type) {
    case "countdown_update":
      countdown = event.data.countdown;
      updateCountdownDisplay();
      break;
    case "game_start":
      currentGameId = event.game_id;
      resetBets();
      startCountdown();
      break;
    case "game_end":
      if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
      }
      isCountdownActive = false;
      displayResult(event.data.result);
      // Refresh user data after game end to get updated coins
      if (user) {
        fetchUserData();
      }

      // Show leaderboard for 10 seconds after game end
      showLeaderboard();
      setTimeout(() => {
        hideLeaderboard();
      }, 10000);
      break;
  }
};

// Update the UI for a new bet
const updateBetDisplay = (bet) => {
  // Skip if it's the current user's bet (already displayed locally)
  if (user && bet.user_id === user.id) return;

  // Update global bets display to show others' bets
  const betElement = document.getElementById(`bet-${bet.animal}`);
  if (!betElement) return;

  // Parse existing value and add the new bet amount
  const currentAmount =
    parseInt(betElement.textContent.replace(/\D/g, "")) || 0;
  const newAmount = currentAmount + bet.amount;

  // Update displayed amount
  betElement.textContent = `${newAmount}`;
};

// Update display for all bets in the game
const updateAllBetsDisplay = (betsArray) => {
  // Reset all bet displays first
  resetBetDisplays();

  // Group bets by animal
  const totalBetsByAnimal = {};
  betsArray.forEach((bet) => {
    if (!totalBetsByAnimal[bet.animal]) {
      totalBetsByAnimal[bet.animal] = 0;
    }
    totalBetsByAnimal[bet.animal] += bet.amount;
  });

  // Update displays
  Object.keys(totalBetsByAnimal).forEach((animal) => {
    const betElement = document.getElementById(`bet-${animal}`);
    if (betElement) {
      betElement.textContent = `${totalBetsByAnimal[animal]}`;
    }
  });
};

// Reset bet displays to zero
const resetBetDisplays = () => {
  Object.keys(bets).forEach((animal) => {
    const betElement = document.getElementById(`bet-${animal}`);
    if (betElement) {
      betElement.textContent = "0";
    }
  });
};

// Place a bet through the API
const placeBet = async (animal) => {
  if (!selectedBetAmount || selectedBetAmount <= 0) {
    alert("Please select a bet amount first.");
    return;
  }

  if (coins < selectedBetAmount) {
    alert("You don't have enough coins to place this bet.");
    return;
  }

  try {
    // If not logged in, only update local UI
    if (!user) {
      updateLocalBet(animal, selectedBetAmount);
      return;
    }

    const response = await fetch(`${API_URL}/game/bet`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        gameId: currentGameId,
        animal,
        amount: selectedBetAmount,
      }),
    });

    const data = await response.json();

    if (response.ok) {
      // Update local state and UI
      updateLocalBet(animal, selectedBetAmount);

      // Update user object in localStorage with new coin amount
      if (user) {
        user.coins = coins;
        localStorage.setItem("user", JSON.stringify(user));
      }
    } else {
      alert(`Failed to place bet: ${data.error}`);
    }
  } catch (error) {
    console.error("Error placing bet:", error);
    alert("There was an error placing your bet. Please try again.");
  }
};

// Update local bet state and UI
const updateLocalBet = (animal, amount) => {
  bets[animal] += amount;
  coins -= amount;

  // For guest users, store bet info by game ID for history tracking
  if (!user && currentGameId) {
    const storedBets = JSON.parse(
      localStorage.getItem(`bets_game_${currentGameId}`) || "[]"
    );
    storedBets.push({
      animal: animal,
      amount: amount,
      timestamp: new Date().toISOString(),
      game_id: currentGameId,
    });
    localStorage.setItem(
      `bets_game_${currentGameId}`,
      JSON.stringify(storedBets)
    );
  }

  // Save updated stats to localStorage
  saveGuestStats();

  // Update UI
  document.getElementById(`bet-${animal}`).textContent = bets[animal];
  updateCoinsDisplay();
};

// Update the coins display
const updateCoinsDisplay = () => {
  document.getElementById("coins").textContent = coins;
};

// Select bet amount
const selectBetAmount = (amount) => {
  selectedBetAmount = amount;
  document
    .querySelectorAll(".bet-options button")
    .forEach((button) => button.classList.remove("selected"));
  document.getElementById(`bet-${amount}`).classList.add("selected");
};

// Select animal for betting
const selectAnimal = (animal) => {
  // Use our new method that calls the API
  placeBet(animal);
};

// Start countdown locally
const startCountdown = () => {
  // Clear any existing countdown interval
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }

  // Reset the countdown state
  isCountdownActive = true;
  console.log(`Starting countdown from ${countdown} seconds`);

  updateCountdownDisplay();

  countdownInterval = setInterval(() => {
    countdown--;
    updateCountdownDisplay();
    console.log(`Countdown: ${countdown}s`);
    if (countdown <= 0) {
      console.log("Countdown reached 0, stopping interval");
      clearInterval(countdownInterval);
      countdownInterval = null;
      isCountdownActive = false;

      // Show waiting message
      document.getElementById("result").textContent =
        "Game ending, waiting for result...";

      // Don't immediately fetch new state - let the server end the game first
      // The server will end the game and we'll get the result via fetchGameState polling
    }
  }, 1000);
};

// Update countdown display
const updateCountdownDisplay = () => {
  document.getElementById("countdown").textContent = countdown;
};

// Stop countdown
const stopCountdown = () => {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
  isCountdownActive = false;
};

// Display game result
const displayResult = (result) => {
  const resultElement = document.getElementById("result");
  let totalBet = Object.values(bets).reduce((sum, amount) => sum + amount, 0);
  let winnings = 0;

  if (result) {
    // Calculate winnings if user placed bet on the winning animal
    if (bets[result.name] > 0) {
      winnings = bets[result.name] * result.return;
      coins += winnings;
      updateCoinsDisplay();

      // Update user object in localStorage with new coin amount
      if (user) {
        user.coins = coins;
        localStorage.setItem("user", JSON.stringify(user));
      }
    }

    // Display result message
    if (winnings > 0) {
      resultElement.textContent = `You win! The outcome was ${result.displayName}. You won ${winnings} coins!`;
    } else {
      resultElement.textContent = `The outcome was ${result.displayName}. ${
        Object.values(bets).some((bet) => bet > 0)
          ? `You lost ${totalBet} coins.`
          : "You didn't place any bets."
      }`;
    }

    // Add result to history
    addResultToHistory(result, winnings);
  }

  // Reset bets for next game
  resetBets();
};

// Add result to history display
const addResultToHistory = (result, winnings) => {
  // Don't add to past results list here - it will be synced from server
  // Just update the history table if it's currently visible
  const tableVisible =
    document.getElementById("history-table").style.display !== "none";
  if (tableVisible) {
    updateHistoryTable(result, winnings);
  }

  // Refresh the past results list from server to ensure synchronization
  fetchPastResultsList();
};

// Fetch and update the past results list (synchronized for all players)
async function fetchPastResultsList() {
  try {
    const response = await fetch(`${API_URL}/game/history?limit=8`);
    const data = await response.json();

    if (response.ok) {
      updatePastResultsList(data);
    } else {
      console.error("Error fetching past results:", data.error);
    }
  } catch (error) {
    console.error("Error:", error);
  }
}

// Update the past results list with synchronized data
function updatePastResultsList(gameHistory) {
  const pastResultsList = document.getElementById("past-results-list");

  // Clear existing results
  pastResultsList.innerHTML = "";

  // Add each recent game result to the list
  gameHistory.slice(0, 8).forEach((game) => {
    if (game.result && game.status === "ended") {
      const li = document.createElement("li");
      li.textContent = game.result_display_name || game.result;
      pastResultsList.appendChild(li);
    }
  });
}

// Update history table
const updateHistoryTable = (result, winnings) => {
  const tableRow = document
    .getElementById("history-table")
    .querySelector("tbody");

  const newRow = tableRow.insertRow(1); // Insert after header row

  // Add cells to the row
  const animalCell = newRow.insertCell(0);
  const betsCell = newRow.insertCell(1);
  const winningsCell = newRow.insertCell(2);
  const timeCell = newRow.insertCell(3);

  // Calculate total bets placed on all animals
  const totalBets = Object.values(bets).reduce((sum, bet) => sum + bet, 0);

  // Populate cells
  animalCell.textContent = result.displayName;
  betsCell.textContent = totalBets > 0 ? totalBets : "No bets placed";
  winningsCell.textContent = winnings || 0; // Ensure we display 0 when no winnings
  timeCell.textContent = new Date().toLocaleString();
};

// Reset bets for a new game
const resetBets = () => {
  // Reset object
  Object.keys(bets).forEach((animal) => {
    bets[animal] = 0;
  });

  // Reset UI displays
  resetBetDisplays();

  // Reset bet amount selection
  selectedBetAmount = 0;
  document
    .querySelectorAll(".bet-options button")
    .forEach((button) => button.classList.remove("selected"));

  // Reset guest bets in localStorage
  if (isAnonymousUser) {
    resetGuestStats();
  }
};

// Toggle visibility of the history table
function toggleFoldResults() {
  const popupModal = document.getElementById("popup-modal");
  const historyTable = document.getElementById("history-table");
  const closeButton = document.getElementById("close-button");

  if (!popupModal.classList.contains("popup-modal")) {
    popupModal.classList.add("popup-modal");
    historyTable.style.display = "block";
    closeButton.style.display = "block";

    // Fetch and display synchronized game history
    fetchGameHistory();
  } else {
    popupModal.classList.remove("popup-modal");
    historyTable.style.display = "none";
    closeButton.style.display = "none";
  }
}

// Fetch game history from the server (synchronized for all players)
async function fetchGameHistory() {
  try {
    // Set up headers if user is logged in
    const headers = {};
    if (user && authToken) {
      headers.Authorization = `Bearer ${authToken}`;
    }

    const response = await fetch(`${API_URL}/game/history?limit=10`, {
      headers: headers,
    });
    const data = await response.json();

    if (response.ok) {
      // Add local bet data for guest users only if truly playing as guest (anonymous user)
      if (!user && isAnonymousUser) {
        // For anonymous users, add local bets to game history
        data.forEach((game) => {
          if (game.id && game.status === "ended") {
            // Use localStorage information for this guest user
            const storedBets = JSON.parse(
              localStorage.getItem(`bets_game_${game.id}`) || "[]"
            );
            game.user_bets = storedBets;
          }
        });
      }
      updateGameHistoryTable(data);
    } else {
      console.error("Error fetching game history:", data.error);
    }
  } catch (error) {
    console.error("Error:", error);
  }
}

// Update the game history table with synchronized data
function updateGameHistoryTable(gameHistory) {
  const tableBody = document.getElementById("folded-result-tbody");

  // Clear existing content except the header row
  tableBody.innerHTML = '<tr id="past-results-trow"></tr>';

  // Add each game result to the table
  gameHistory.forEach((game) => {
    if (game.result && game.status === "ended") {
      const newRow = tableBody.insertRow();

      const animalCell = newRow.insertCell(0);
      const betsCell = newRow.insertCell(1);
      const winningsCell = newRow.insertCell(2);
      const timeCell = newRow.insertCell(3);

      // Find the animal data to get display name and return multiplier
      const resultAnimal =
        animals.find((a) => a.name === game.result) ||
        specials.find((s) => s.name === game.result); // Display animal name (use display name from game data or find from animals array)
      animalCell.textContent =
        game.result_display_name ||
        (resultAnimal ? resultAnimal.displayName : game.result); // Use the total bets and winnings from the server when available
      let userBetsTotal = game.total_bets || 0;
      let userWinnings = game.total_winnings || 0;

      // Only calculate from local data for authenticated guests (anonymous users)
      // This ensures non-logged in users don't see any bets
      if (isAnonymousUser && !user) {
        // If server didn't provide totals for anonymous guest users, calculate from local data
        if (
          userBetsTotal === 0 &&
          game.user_bets &&
          Array.isArray(game.user_bets)
        ) {
          // Sum up all bets placed by the user for this game
          userBetsTotal = game.user_bets.reduce(
            (sum, bet) => sum + bet.amount,
            0
          );
        }

        // For anonymous guest users or if the backend hasn't been updated yet
        if (
          userWinnings === 0 &&
          !game.total_winnings &&
          game.user_bets &&
          Array.isArray(game.user_bets)
        ) {
          // Calculate winnings if the user bet on the winning animal
          const winningBet = game.user_bets.find(
            (bet) => bet.animal === game.result
          );
          if (winningBet) {
            const multiplier = resultAnimal ? resultAnimal.return : 5; // Default to 5x if not found
            userWinnings = winningBet.amount * multiplier;
          }
        }
      }

      // Show user's bets or "No bets placed"
      betsCell.textContent =
        userBetsTotal > 0 ? userBetsTotal : "No bets placed";

      // Show user's winnings
      winningsCell.textContent = userWinnings;

      // Format the timestamp
      const gameDate = new Date(game.end_time);
      timeCell.textContent = gameDate.toLocaleString();
    }
  });
}

// Authentication functions
// Show login/register UI
const showLoginUI = (activeTab = "login") => {
  // Remove any existing auth container
  const existingAuthContainer = document.getElementById("auth-container");
  if (existingAuthContainer) {
    document.body.removeChild(existingAuthContainer);
  }

  const authContainer = document.createElement("div");
  authContainer.id = "auth-container";
  authContainer.classList.add("auth-container");

  authContainer.innerHTML = `
    <div class="auth-tabs">
      <button id="login-tab" ${
        activeTab === "login" ? 'class="active"' : ""
      }>Login</button>
      <button id="register-tab" ${
        activeTab === "register" ? 'class="active"' : ""
      }>Register</button>
    </div>
    <div id="login-form" class="auth-form" ${
      activeTab === "login" ? "" : 'style="display: none;"'
    }>
      <input type="text" id="login-username" placeholder="Username or Email" />
      <input type="password" id="login-password" placeholder="Password" />
      <button id="login-button">Login</button>
    </div>
    <div id="register-form" class="auth-form" ${
      activeTab === "register" ? "" : 'style="display: none;"'
    }>
      <input type="text" id="register-username" placeholder="Username" />
      <input type="email" id="register-email" placeholder="Email" />
      <input type="password" id="register-password" placeholder="Password" />
      <button id="register-button">Register</button>
    </div>
    <button id="close-auth">Cancel</button>
  `;

  document.body.appendChild(authContainer);

  // Add event listeners
  document.getElementById("login-tab").addEventListener("click", () => {
    document.getElementById("login-form").style.display = "block";
    document.getElementById("register-form").style.display = "none";
    document.getElementById("login-tab").classList.add("active");
    document.getElementById("register-tab").classList.remove("active");
  });

  document.getElementById("register-tab").addEventListener("click", () => {
    document.getElementById("login-form").style.display = "none";
    document.getElementById("register-form").style.display = "block";
    document.getElementById("register-tab").classList.add("active");
    document.getElementById("login-tab").classList.remove("active");
  });

  document.getElementById("login-button").addEventListener("click", () => {
    const usernameOrEmail = document.getElementById("login-username").value;
    const password = document.getElementById("login-password").value;
    loginUser(usernameOrEmail, password);
  });

  document.getElementById("register-button").addEventListener("click", () => {
    const username = document.getElementById("register-username").value;
    const email = document.getElementById("register-email").value;
    const password = document.getElementById("register-password").value;
    registerUser(username, email, password);
  });

  document.getElementById("close-auth").addEventListener("click", () => {
    document.body.removeChild(authContainer);
  });
};

// Login user
const loginUser = async (usernameOrEmail, password) => {
  try {
    const response = await fetch(`${API_URL}/users/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ usernameOrEmail, password }),
    });

    const data = await response.json();

    if (response.ok) {
      // Store user info and token
      user = data.user;
      authToken = data.token;
      localStorage.setItem("user", JSON.stringify(user));
      localStorage.setItem("token", data.token);

      // Remove auth UI
      const authContainer = document.getElementById("auth-container");
      if (authContainer) {
        document.body.removeChild(authContainer);
      }

      // Update UI and fetch game state
      coins = user.coins;
      updateUIForLoggedInUser(user);
      initializeGame();
    } else {
      alert(`Login failed: ${data.error}`);
    }
  } catch (error) {
    console.error("Login error:", error);
    alert("An error occurred during login.");
  }
};

// Register user
const registerUser = async (username, email, password) => {
  try {
    const response = await fetch(`${API_URL}/users/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username, email, password }),
    });

    const data = await response.json();

    if (response.ok) {
      alert("Registration successful! Please log in.");
      // Switch to login tab
      document.getElementById("login-tab").click();
      document.getElementById("login-username").value = username;
    } else {
      alert(`Registration failed: ${data.error}`);
    }
  } catch (error) {
    console.error("Registration error:", error);
    alert("An error occurred during registration.");
  }
};

// Update UI for logged-in user
const updateUIForLoggedInUser = (userData) => {
  // Update the navbar
  updateNavbarForLoggedInUser(userData);

  // Update coins display
  coins = userData.coins;
  updateCoinsDisplay();
};

// Fetch user data
const fetchUserData = async () => {
  if (!user || !authToken) return;

  try {
    const response = await fetch(`${API_URL}/users/profile`, {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    });

    const data = await response.json();

    if (response.ok) {
      coins = data.coins;
      localStorage.setItem("user", JSON.stringify(data));
      updateCoinsDisplay();
    } else {
      console.error("Failed to fetch user data:", data.error);
    }
  } catch (error) {
    console.error("Error fetching user data:", error);
  }
};

// Logout user
const logoutUser = () => {
  localStorage.removeItem("user");
  localStorage.removeItem("token");
  user = null;
  authToken = null;

  // Reset coins to default
  coins = 10000;
  updateCoinsDisplay();

  // Update navbar
  updateNavbarForGuest();
};

// Login as anonymous user using Supabase
const loginAnonymousUser = async () => {
  try {
    // Make sure Supabase client is initialized
    if (!supabase) {
      await initializeSupabaseClient();
    }

    // Check if we have a previous guest identity to try to recover
    const lastGuestId = localStorage.getItem("lastGuestId");
    let previousGuestData = null;

    if (lastGuestId) {
      const storedData = localStorage.getItem(`guestData_${lastGuestId}`);
      if (storedData) {
        previousGuestData = JSON.parse(storedData);
        console.log("Found previous guest data:", previousGuestData);
      }
    }

    // Try to restore existing anonymous session
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (session) {
      console.log("Restored anonymous session");
      isAnonymousUser = true;
      // Store the session in localStorage to persist between page loads
      localStorage.setItem("anonymousUser", "true");
      localStorage.setItem("supabaseSession", JSON.stringify(session));
      updateNavbarForAnonymousUser();

      // Regular load or recover previous data if session is new
      loadGuestStats(previousGuestData);
    } else {
      // Sign in anonymously
      const { data, error } = await supabase.auth.signInAnonymously();

      if (error) throw error;

      console.log("Created new anonymous session");
      isAnonymousUser = true;
      // Store the session in localStorage to persist between page loads
      localStorage.setItem("anonymousUser", "true");
      localStorage.setItem("supabaseSession", JSON.stringify(data.session));

      // For new sessions, try to recover previous guest data
      updateNavbarForAnonymousUser();
      loadGuestStats(previousGuestData);
    }
  } catch (error) {
    console.error("Anonymous login error:", error);
    alert("Could not create guest session. Playing as local guest instead.");
    // Fallback to regular guest mode
    updateNavbarForGuest();
    loadGuestStats();
  }
};

// Logout anonymous user
const logoutAnonymousUser = async () => {
  // Before logging out, save guest data with a unique guest ID if it doesn't exist
  const guestId =
    localStorage.getItem("guestId") ||
    `guest_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  // Save all guest data to localStorage
  const guestData = {
    id: guestId,
    coins: coins,
    bets: bets,
    lastSeen: new Date().toISOString(),
  };

  // Store under a specific key for this guest ID
  localStorage.setItem(`guestData_${guestId}`, JSON.stringify(guestData));
  localStorage.setItem("lastGuestId", guestId);

  // Now proceed with actual logout
  if (supabase) {
    await supabase.auth.signOut();
  }

  isAnonymousUser = false;

  // Remove session data but keep the guest ID reference
  localStorage.removeItem("anonymousUser");
  localStorage.removeItem("supabaseSession");
  localStorage.removeItem("guestBets");
  localStorage.removeItem("guestCoins");

  // Reset to default state
  coins = 10000;
  updateCoinsDisplay();
  resetBets();
  updateNavbarForGuest();
};

// Update navbar for logged in user
const updateNavbarForLoggedInUser = (userData) => {
  // Hide auth buttons
  document.getElementById("auth-buttons-nav").style.display = "none";

  // Show user info
  document.getElementById("user-info-nav").style.display = "flex";
  document.getElementById(
    "welcome-message"
  ).textContent = `Welcome, ${userData.username}`;

  // Add logout functionality if not already set
  if (!document.getElementById("logout-btn").hasClickListener) {
    document.getElementById("logout-btn").addEventListener("click", logoutUser);
    document.getElementById("logout-btn").hasClickListener = true;
  }
};

// Update navbar for anonymous user
const updateNavbarForAnonymousUser = () => {
  // Hide auth buttons
  document.getElementById("auth-buttons-nav").style.display = "none";

  // Show user info with Guest username
  document.getElementById("user-info-nav").style.display = "flex";
  document.getElementById("welcome-message").textContent = "Welcome, Guest";

  // Setup logout functionality
  if (!document.getElementById("logout-btn").hasClickListener) {
    document
      .getElementById("logout-btn")
      .addEventListener("click", logoutAnonymousUser);
    document.getElementById("logout-btn").hasClickListener = true;
  }
};

// Update navbar for guest/not logged in
const updateNavbarForGuest = () => {
  // Show auth buttons
  document.getElementById("auth-buttons-nav").style.display = "flex";

  // Hide user info
  document.getElementById("user-info-nav").style.display = "none";
};

// Show the leaderboard
function showLeaderboard() {
  const leaderboardModal = document.getElementById("leaderboard-modal");
  leaderboardModal.style.display = "flex"; // Use flex to ensure proper centering

  // Fetch leaderboard data
  fetchLeaderboard();
}

// Hide the leaderboard
function hideLeaderboard() {
  const leaderboardModal = document.getElementById("leaderboard-modal");
  leaderboardModal.style.display = "none";
}

// Fetch leaderboard data from API
async function fetchLeaderboard() {
  try {
    const response = await fetch(`${API_URL}/leaderboard`);
    const data = await response.json();

    if (response.ok && Array.isArray(data) && data.length > 0) {
      updateLeaderboardUI(data);
    } else {
      const leaderboardBody = document.getElementById("leaderboard-body");
      leaderboardBody.innerHTML =
        "<tr><td colspan='3'>No one placed any bets this round.</td></tr>";
    }
  } catch (error) {
    console.error("Error fetching leaderboard data:", error);
    const leaderboardBody = document.getElementById("leaderboard-body");
    leaderboardBody.innerHTML =
      "<tr><td colspan='3'>No one placed any bets this round.</td></tr>";
  }
}

// Update the leaderboard UI with data
function updateLeaderboardUI(leaderboardData) {
  const leaderboardBody = document.getElementById("leaderboard-body");
  leaderboardBody.innerHTML = "";

  if (leaderboardData.length === 0) {
    leaderboardBody.innerHTML =
      "<tr><td colspan='3'>No one placed any bets this round.</td></tr>";
    return;
  }

  leaderboardData.forEach((player, index) => {
    const row = document.createElement("tr");

    // Create rank cell
    const rankCell = document.createElement("td");
    rankCell.textContent = index + 1;
    row.appendChild(rankCell);

    // Create username cell
    const usernameCell = document.createElement("td");
    usernameCell.textContent = player.username;
    row.appendChild(usernameCell);

    // Create coins cell
    const coinsCell = document.createElement("td");
    coinsCell.textContent = player.coins;
    row.appendChild(coinsCell);

    // Create winnings cell
    const winningsCell = document.createElement("td");
    winningsCell.textContent = player.winnings;
    row.appendChild(winningsCell);

    leaderboardBody.appendChild(row);
  });
}

// Animal definitions matching single player
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

// Create a new game
const createNewGame = async () => {
  try {
    console.log("Creating new game...");
    const createResponse = await fetch(`${API_URL}/game/create`, {
      method: "POST",
    });

    if (createResponse.ok) {
      const createData = await createResponse.json();
      console.log("Created new game:", createData.game?.id);

      // Set the new game ID and start fresh countdown
      currentGameId = createData.game.id;
      countdown = 30;

      // Reset bets and UI for new game
      resetBets();
      updateCountdownDisplay();

      // Start countdown immediately
      console.log("Starting fresh countdown for new game");
      startCountdown();
    } else {
      const errorText = await createResponse.text();
      console.error("Failed to create game:", errorText);

      // Retry after a delay
      setTimeout(() => {
        console.log("Retrying game creation...");
        createNewGame();
      }, 3000);
    }
  } catch (createError) {
    console.error("Failed to create new game:", createError);

    // Retry after a delay
    setTimeout(() => {
      console.log("Retrying game creation after error...");
      createNewGame();
    }, 3000);
  }
};

// Initialize the game when page loads
document.addEventListener("DOMContentLoaded", () => {
  const closeButton = document.getElementById("close-button");
  closeButton.addEventListener("click", toggleFoldResults);

  // Add event listener for close-leaderboard button
  const closeLeaderboardButton = document.getElementById("close-leaderboard");
  if (closeLeaderboardButton) {
    closeLeaderboardButton.addEventListener("click", hideLeaderboard);
  }

  // Initialize navbar
  initializeNavbar();

  // Initialize game
  initializeGame();

  // Start heartbeat for serverless compatibility
  startHeartbeat();
});

// Serverless heartbeat to keep games running
function startHeartbeat() {
  // Call heartbeat every 5 seconds to ensure games are active
  setInterval(async () => {
    try {
      const response = await fetch(`${API_URL}/game/heartbeat`);
      const data = await response.json();

      if (response.ok) {
        // If no active games, try to create one
        if (data.gameStatus === "no_active_games") {
          try {
            await fetch(`${API_URL}/game/create`, { method: "POST" });
            console.log("Created new game due to no active games");
          } catch (createError) {
            console.error("Failed to create game:", createError);
          }
        }

        // If game needs ending, fetch current state to trigger updates
        if (data.gameStatus === "game_needs_ending") {
          try {
            await fetchGameState();
            console.log("Fetched game state to check for updates");
          } catch (stateError) {
            console.error("Failed to fetch game state:", stateError);
          }
        }
      }
    } catch (error) {
      console.error("Heartbeat failed:", error);
    }
  }, 5000);

  // Initial heartbeat call
  fetch(`${API_URL}/game/heartbeat`).catch(console.error);
}

// Initialize the navbar buttons
const initializeNavbar = () => {
  // Login button
  document.getElementById("login-nav-btn").addEventListener("click", () => {
    showLoginUI("login");
  });

  // Signup button
  document.getElementById("signup-nav-btn").addEventListener("click", () => {
    showLoginUI("register");
  });

  // Guest button
  document.getElementById("guest-nav-btn").addEventListener("click", () => {
    loginAnonymousUser();
  });
};

// Call navbar initialization on DOMContentLoaded
document.addEventListener("DOMContentLoaded", () => {
  initializeNavbar();
});
