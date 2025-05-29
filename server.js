const app = require('./api/index');
const { GameServer } = require("./api/gameServer");
require("dotenv").config();

const PORT = process.env.PORT || 3000;

// Start the server
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);

    // Start the game loop
    new GameServer().startGameLoop();
  });
}
