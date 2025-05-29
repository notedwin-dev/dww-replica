// API URL - change this for production
const API_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:3000/api'
  : '/api';

// Mode switching functions
function switchToSinglePlayer() {
  window.location.href = 'index.html';
}

// We'll set these after fetching from the server
let supabase = null;

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

// Authentication state
const loadAuthState = () => {
  const savedUser = localStorage.getItem("user");
  const savedToken = localStorage.getItem("token");

  if (savedUser && savedToken) {
    user = JSON.parse(savedUser);
    authToken = savedToken;
    updateUIForLoggedInUser(user);
  } else if (!document.getElementById("auth-container")) {
    // Only show login UI if it's not already shown and no guest session in progress
    showLoginUI();
  }
};

// Initialize UI states
const initializeGame = async () => {
  // First, fetch Supabase configuration
  await initializeSupabaseClient();

  loadAuthState();
  await fetchGameState();

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
        countdown = data.countdown || 30;
        updateCountdownDisplay();

        // If user is logged in, update coins
        if (user && data.userCoins !== undefined) {
          coins = data.userCoins;
          updateCoinsDisplay();
        }

        // Update bet display if there are any bets
        if (data.bets && data.bets.length > 0) {
          updateAllBetsDisplay(data.bets);
        }

        // If game has ended, display result
        if (data.game.status === "ended" && data.result) {
          displayResult(data.result);
        } else {
          // Start local countdown if not ended
          startCountdown();
        }
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

  // Subscribe to game events channel
  const gameEvents = supabase
    .channel("game_events")
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "game_events",
      },
      (payload) => {
        handleGameEvent(payload.new);
      }
    )
    .subscribe();

  // Subscribe to bets channel to see other players' bets in real-time
  const betEvents = supabase
    .channel("bet_events")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "bets",
      },
      (payload) => {
        if (payload.new && payload.new.game_id === currentGameId) {
          updateBetDisplay(payload.new);
        }
      }
    )
    .subscribe();
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
  if (isCountdownActive) return;
  isCountdownActive = true;

  updateCountdownDisplay();

  const countdownInterval = setInterval(() => {
    countdown--;
    updateCountdownDisplay();

    if (countdown <= 0 || !isCountdownActive) {
      clearInterval(countdownInterval);
      isCountdownActive = false;
    }
  }, 1000);
};

// Update countdown display
const updateCountdownDisplay = () => {
  document.getElementById("countdown").textContent = countdown;
};

// Display game result
const displayResult = (result) => {
  const resultElement = document.getElementById("result");
  let winnings = 0;

  if (result) {
    // Calculate winnings if user placed bet on the winning animal
    if (bets[result.name] > 0) {
      winnings = bets[result.name] * result.return;
      coins += winnings;
      updateCoinsDisplay();
    }

    // Display result message
    if (winnings > 0) {
      resultElement.textContent = `You win! The outcome was ${result.displayName}. You won ${winnings} coins!`;
    } else {
      resultElement.textContent = `The outcome was ${result.displayName}. ${
        Object.values(bets).some((bet) => bet > 0)
          ? "Better luck next time!"
          : "You didn't place any bets."
      }`;
    }

    // Add result to history
    addResultToHistory(result);
  }

  // Reset bets for next game
  resetBets();
};

// Add result to history display
const addResultToHistory = (result) => {
  // Update past results list
  const pastResultsList = document.getElementById("past-results-list");
  const li = document.createElement("li");
  li.textContent = result.displayName;
  pastResultsList.prepend(li);

  // Limit the number of displayed results to 8
  while (pastResultsList.children.length > 8) {
    pastResultsList.removeChild(pastResultsList.lastChild);
  }

  // Update history table if visible
  const tableVisible =
    document.getElementById("history-table").style.display !== "none";
  if (tableVisible) {
    updateHistoryTable(result);
  }
};

// Update history table
const updateHistoryTable = (result) => {
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

  // Calculate winnings for this result
  const winnings = bets[result.name] ? bets[result.name] * result.return : 0;

  // Populate cells
  animalCell.textContent = result.displayName;
  betsCell.textContent = totalBets > 0 ? totalBets : "No bets placed";
  winningsCell.textContent = winnings;
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
  } else {
    popupModal.classList.remove("popup-modal");
    historyTable.style.display = "none";
    closeButton.style.display = "none";
  }
}

// Authentication functions
// Show login/register UI
const showLoginUI = () => {
  const authContainer = document.createElement("div");
  authContainer.id = "auth-container";
  authContainer.classList.add("auth-container");

  authContainer.innerHTML = `
    <div class="auth-tabs">
      <button id="login-tab" class="active">Login</button>
      <button id="register-tab">Register</button>
    </div>
    <div id="login-form" class="auth-form">
      <input type="text" id="login-username" placeholder="Username" />
      <input type="password" id="login-password" placeholder="Password" />
      <button id="login-button">Login</button>
    </div>
    <div id="register-form" class="auth-form" style="display: none;">
      <input type="text" id="register-username" placeholder="Username" />
      <input type="email" id="register-email" placeholder="Email" />
      <input type="password" id="register-password" placeholder="Password" />
      <button id="register-button">Register</button>
    </div>
    <button id="play-as-guest">Play as Guest</button>
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
    const username = document.getElementById("login-username").value;
    const password = document.getElementById("login-password").value;
    loginUser(username, password);
  });

  document.getElementById("register-button").addEventListener("click", () => {
    const username = document.getElementById("register-username").value;
    const email = document.getElementById("register-email").value;
    const password = document.getElementById("register-password").value;
    registerUser(username, email, password);
  });
  document.getElementById("play-as-guest").addEventListener("click", () => {
    // Remove auth UI and start game as guest
    document.body.removeChild(authContainer);
    // Don't call initializeGame() again, just continue with the current game
    // Set guest state explicitly
    user = null;
    authToken = null;
    coins = 10000;
    updateCoinsDisplay();
  });
};

// Login user
const loginUser = async (username, password) => {
  try {
    const response = await fetch(`${API_URL}/user/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username, password })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      // Store user info and token
      user = data.user;
      authToken = data.token;
      localStorage.setItem('user', JSON.stringify(user));
      localStorage.setItem('token', data.token);
      
      // Remove auth UI
      const authContainer = document.getElementById('auth-container');
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
    console.error('Login error:', error);
    alert('An error occurred during login.');
  }
};

// Register user
const registerUser = async (username, email, password) => {
  try {
    const response = await fetch(`${API_URL}/user/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username, email, password })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      alert('Registration successful! Please log in.');
      // Switch to login tab
      document.getElementById('login-tab').click();
      document.getElementById('login-username').value = username;
    } else {
      alert(`Registration failed: ${data.error}`);
    }
  } catch (error) {
    console.error('Registration error:', error);
    alert('An error occurred during registration.');
  }
};

// Update UI for logged-in user
const updateUIForLoggedInUser = (userData) => {
  // Add username display and logout button
  const container = document.querySelector('.container');
  
  if (!document.getElementById('user-info')) {
    const userInfo = document.createElement('div');
    userInfo.id = 'user-info';
    userInfo.classList.add('user-info');
    userInfo.innerHTML = `
      <span>Welcome, <strong id="username-display">${userData.username}</strong></span>
      <button id="logout-button">Logout</button>
    `;
    container.insertBefore(userInfo, container.firstChild);
    
    // Add logout functionality
    document.getElementById('logout-button').addEventListener('click', logoutUser);
  } else {
    document.getElementById('username-display').textContent = userData.username;
  }
  
  // Update coins display
  coins = userData.coins;
  updateCoinsDisplay();
};

// Fetch user data
const fetchUserData = async () => {
  if (!user || !authToken) return;
  
  try {
    const response = await fetch(`${API_URL}/user/profile`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });
    
    const data = await response.json();
    
    if (response.ok) {
      user = data.user;
      coins = user.coins;
      localStorage.setItem('user', JSON.stringify(user));
      updateCoinsDisplay();
    } else {
      console.error('Failed to fetch user data:', data.error);
    }
  } catch (error) {
    console.error('Error fetching user data:', error);
  }
};

// Logout user
const logoutUser = () => {
  localStorage.removeItem('user');
  localStorage.removeItem('token');
  user = null;
  authToken = null;
  
  // Remove user info from UI
  const userInfo = document.getElementById('user-info');
  if (userInfo) {
    userInfo.parentNode.removeChild(userInfo);
  }
  
  // Reset coins to default
  coins = 10000;
  updateCoinsDisplay();
  
  // Show login UI
  showLoginUI();
};

// Show the leaderboard
function showLeaderboard() {
  const leaderboardModal = document.getElementById("leaderboard-modal");
  leaderboardModal.style.display = "block";
  
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
    
    if (response.ok) {
      updateLeaderboardUI(data);
    } else {
      console.error('Error fetching leaderboard:', data.error);
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

// Update the leaderboard UI with data
function updateLeaderboardUI(leaderboardData) {
  const leaderboardBody = document.getElementById("leaderboard-body");
  leaderboardBody.innerHTML = '';
  
  leaderboardData.forEach((player, index) => {
    const row = document.createElement('tr');
    
    // Create rank cell
    const rankCell = document.createElement('td');
    rankCell.textContent = index + 1;
    row.appendChild(rankCell);
    
    // Create username cell
    const usernameCell = document.createElement('td');
    usernameCell.textContent = player.username;
    row.appendChild(usernameCell);
    
    // Create coins cell
    const coinsCell = document.createElement('td');
    coinsCell.textContent = player.coins;
    row.appendChild(coinsCell);
    
    // Create wins cell (if available)
    const winsCell = document.createElement('td');
    winsCell.textContent = player.wins || '0';
    row.appendChild(winsCell);
    
    leaderboardBody.appendChild(row);
  });
}

// Initialize the game when page loads
document.addEventListener('DOMContentLoaded', () => {
  const closeButton = document.getElementById('close-button');
  closeButton.addEventListener('click', toggleFoldResults);
  
  // Add event listener for close-leaderboard button
  const closeLeaderboardButton = document.getElementById('close-leaderboard');
  if (closeLeaderboardButton) {
    closeLeaderboardButton.addEventListener('click', hideLeaderboard);
  }
  
  initializeGame();
});
