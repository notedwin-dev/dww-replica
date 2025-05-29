# 大胃王 (replica)

## Introduction

大胃王 is one of the most common betting game that can be found in popular Voice Live Streaming platforms such as [MOMI](https://www.momitw.com/#/) and [Dino](https://dinoapp.chat/). Usually it requires the user to topup into the platform before they can start playing. In some platforms, the earnings from the game will not only double your virtual currency for gifting their favorite streamers, it will also enable them to withdraw their earnings into their bank account. This is the replica of the "大胃王" game from the voice live streaming platform known as [Dino](https://dinoapp.chat/), implemented using HTML, CSS, and JavaScript.

## Getting Started

### For Single Player Mode

To get started with the single-player version:

1. Clone the repository to your local machine.
2. Open the `index.html` file in your web browser.
3. Start playing the game!

### For Multiplayer Mode

The multiplayer version requires server setup:

1. Clone the repository to your local machine.
2. Install dependencies:
   ```
   npm install
   ```
3. Create a `.env` file based on `.env.example` with your Supabase credentials:
   ```
   # Required environment variables
   SUPABASE_URL=your-supabase-url
   SUPABASE_ANON_KEY=your-public-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   SERVER_SECRET=your-server-encryption-secret
   JWT_SECRET=your-jwt-secret-for-auth
   ```
4. Set up the database by running the SQL scripts in the `database` folder in your Supabase SQL editor.
5. Start the server:
   ```
   npm start
   ```
6. Open `index-multiplayer.html` in your browser or navigate to `http://localhost:3000` if deployed.

## Game Rules

- For starters, you will get 10,000 coins for free to try out the game.
- The objective of the game is to place bets on different animals and try to win coins.
- You can select the amount of coins you want to bet by clicking on the corresponding buttons.
- Choose an animal to place your bet on by clicking on the animal button.
- The game will randomly select an animal as the outcome.

## Security Implementation

The multiplayer version includes several security features:

1. **Encrypted Communication**: Supabase credentials are encrypted on the server and securely transmitted to clients.
2. **Environment Variables**: Sensitive information is stored in environment variables, not in code.
3. **JWT Authentication**: User sessions are secured with JWT tokens.
4. **Row Level Security**: Database tables use Postgres RLS policies to restrict data access.
5. **Service Role Separation**: Server-side operations use a service role key that never reaches clients.
- If you win the bet, you will receive a certain number of coins based on the return rate of the animal.
- The game keeps track of your total coins and past results.

## Possible additions / TO-DO List

- [ ] Total Investment in game
- [ ] Total Winnings
- [ ] Total number of rounds occurred
- [x] Multiplayer mode
- [x] Multiplayer leaderboard
- [ ] Sound effects for buttons
- [ ] Music
- [ ] In-game tutorial
- [ ] Ability to export data to CSV and analyze game data for AI model prediction.
- [ ] In-game AI model prediction
- [x] Save game progress using database / browser storage.

## Technologies Used

- [x] HTML
- [x] CSS
- [x] JavaScript

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
