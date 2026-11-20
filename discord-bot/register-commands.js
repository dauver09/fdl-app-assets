
require("dotenv").config();

const { REST, Routes, SlashCommandBuilder } = require("discord.js");

const commands = [
  new SlashCommandBuilder()
    .setName("report")
    .setDescription("Report an FDL Season 7 match result")
    .toJSON()
];

const rest = new REST({ version: "10" })
  .setToken(process.env.DISCORD_BOT_TOKEN);

async function registerCommands() {
  try {
    console.log("Registering FDL slash commands...");

    await rest.put(
      Routes.applicationGuildCommands(
        process.env.DISCORD_CLIENT_ID,
        process.env.DISCORD_GUILD_ID
      ),
      { body: commands }
    );

    console.log("Successfully registered /report!");
  } catch (error) {
    console.error("Failed to register commands:", error);
    process.exitCode = 1;
  }
}

registerCommands();
