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

const animals = [
  { name: "turtle", displayName: "乌龟", prob: 19.4, return: 5 },
  { name: "hedgehog", displayName: "刺猬", prob: 19.4, return: 5 },
  { name: "raccoon", displayName: "浣熊", prob: 19.4, return: 5 },
  { name: "elephant", displayName: "小象", prob: 19.4, return: 5 },
  { name: "cat", displayName: "猫咪", prob: 9.7, return: 10 },
  { name: "fox", displayName: "狐狸", prob: 6.5, return: 15 },
  { name: "pig", displayName: "猪猪", prob: 3.9, return: 25 },
  { name: "lion", displayName: "狮子", prob: 2.2, return: 45 },
];

const specials = [
  { name: "vegetarian_festival", prob: 0.05, return: 20 }, // Sum of turtle, hedgehog, raccoon, elephant returns
  { name: "carnivorous_festival", prob: 0.05, return: 95 }, // Sum of cat, fox, pig, lion returns
];

function selectBetAmount(amount) {
  selectedBetAmount = amount;
  document
    .querySelectorAll(".bet-options button")
    .forEach((button) => button.classList.remove("selected"));
  document.getElementById(`bet-${amount}`).classList.add("selected");
  betAmount = amount;
}

function selectAnimal(animal) {
  if (selectedBetAmount === 0) {
    alert("Please select a bet amount first.");
    return;
  }

  if (coins < selectedBetAmount) {
    alert("You don't have enough coins to place this bet.");
    return;
  }

  bets[animal] += selectedBetAmount;
  document.getElementById(`bet-${animal}`).textContent = `${bets[animal]}`;

  document.getElementById("coins").textContent = coins -= selectedBetAmount;
}

// Implement a self resetting countdown timer that resets itself after each round of games.
let countdown = 30;

function startCountdown() {
  const countdownElement = document.getElementById("countdown");
  countdownElement.textContent = countdown;
  countdown--;

  if (countdown < 0) {
    // Change this line
    countdownElement.textContent = "0";
    new Promise((resolve) => {
      document.getElementById("result").textContent = "Loading results...";

      //disable all the buttons

      document.querySelectorAll("button").forEach((button) => {
        if (button.id !== "view-records" && button.id !== "close-button")
          button.disabled = true;
      });

      setTimeout(resolve, 2000);
    })
      .then(() => {
        playGame();

        //enable all the buttons
        document.querySelectorAll("button").forEach((button) => {
          button.disabled = false;
        });
      })
      .finally(() => {
        countdown = 30; // Reset countdown
        startCountdown(); // Restart the countdown after resetting
      });
    return; // Prevent further execution in this cycle
  }

  setTimeout(startCountdown, 1000);
}

startCountdown();

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

let closeButton = document.getElementById("close-button");

closeButton.addEventListener("click", toggleFoldResults);

function toggleFoldResults() {
  let popupModal = document.getElementById("popup-modal");

  let historyTable = document.getElementById("history-table");

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

function playGame() {
  // if (!Object.values(bets).some((amount) => amount > 0)) {
  //   alert("Please place a bet on at least one animal.");
  //   return;
  // }

  const result = getRandomAnimal();

  const resultElement = document.getElementById("result");
  const pastResultsList = document.getElementById("past-results-list");

  let totalBet = Object.values(bets).reduce((sum, amount) => sum + amount, 0);
  let winnings = 0;

  if (bets[result.name] > 0) {
    winnings = bets[result.name] * result.return;
    coins += winnings;
  }

  document.getElementById("coins").textContent = coins;

  if (winnings > 0) {
    resultElement.textContent = `You win! The outcome was ${
      result.displayName || result.name
    }. You won ${winnings} coins!`;
  } else if (winnings === 0 && totalBet > 0) {
    resultElement.textContent = `You lose! The outcome was ${
      result.displayName || result.name
    }. You lost ${totalBet} coins.`;
  } else {
    resultElement.textContent = `The outcome was ${
      result.displayName || result.name
    }. You didn't place any bets.`;
  }

  // Append result to ul with id of "past-results-list" from newest to oldest
  const li = document.createElement("li");
  li.textContent = result.displayName || result.name;
  pastResultsList.prepend(li);

  // Add result to history results table

  const tableRow = document
    .getElementById("history-table")
    .querySelector("tbody");

  const newRow = tableRow.insertRow(1);

  const newCell = newRow.insertCell(0);
  const newCell2 = newRow.insertCell(1);
  const newCell3 = newRow.insertCell(2);
  const newCell4 = newRow.insertCell(3);

  newCell.textContent = result.displayName || result.name;
  newCell2.textContent = totalBet > 0 ? totalBet : "No bets placed";
  newCell3.textContent = winnings;
  newCell4.textContent = new Date().toLocaleString();

  // Limit the number of displayed results to 8
  while (pastResultsList.children.length > 8) {
    pastResultsList.removeChild(pastResultsList.lastChild);
  }

  // Reset bets
  for (let animal in bets) {
    bets[animal] = 0;
    document.getElementById(`bet-${animal}`).textContent = "0";
  }

  selectedBetAmount = 0;
  document
    .querySelectorAll(".bet-options button")
    .forEach((button) => button.classList.remove("selected"));
}
