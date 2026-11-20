
require("dotenv").config();
const { Client, GatewayIntentBits, Events } = require("discord.js");

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.once(Events.ClientReady, (readyClient) => {
  console.log(`FDL Match Reporter online as ${readyClient.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== "report") return;

  await interaction.reply({
    content:
      "🏆 **FDL Match Reporter**\n\n" +
      "Your match reporting command is working!\n\n" +
      "Next, we'll connect your Season 7 schedule so you can select your opponent, winner, and match score.",
    ephemeral: true
  });
});

client.login(process.env.DISCORD_BOT_TOKEN);
