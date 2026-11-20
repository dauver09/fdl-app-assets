
require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  Events,
  MessageFlags,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

const { google } = require("googleapis");

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

const SHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;
const PREVIEW_ONLY = true;

function getSheets() {
  const credentials = JSON.parse(
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  );

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
    ],
  });

  return google.sheets({
    version: "v4",
    auth,
  });
}

async function readSchedule() {
  const sheets = getSheets();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: "Schedule!A3:H100",
  });

  return (response.data.values || [])
    .map((row, index) => ({
      rowNumber: index + 3,
      week: row[0] || "",
      player1: (row[3] || "").trim(),
      player2: (row[4] || "").trim(),
      winner: (row[6] || "").trim(),
      score: (row[7] || "").trim(),
    }))
    .filter(
      (match) =>
        match.player1 &&
        match.player2 &&
        !match.winner &&
        !match.score
    );
}

async function readRosters() {
  const sheets = getSheets();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: "Rosters!C2:M11",
  });

  const rosters = {};

  for (const row of response.data.values || []) {
    const trainer = (row[0] || "").trim();

    if (trainer) {
      rosters[trainer.toLowerCase()] = row
        .slice(1)
        .filter(Boolean)
        .map((pokemon) =>
          pokemon.replace(/\s+/g, " ").trim()
        );
    }
  }

  return rosters;
}

function battleRecap(match, winner, score, rosters) {
  const loser =
    winner === match.player1
      ? match.player2
      : match.player1;

  const winningTeam =
    rosters[winner.toLowerCase()] || [];

  const losingTeam =
    rosters[loser.toLowerCase()] || [];

  const first = winningTeam[0] || "their lead Pokémon";
  const second = winningTeam[1] || "their teammate";
  const rival = losingTeam[0] || "the opposing team";
  const rivalTwo = losingTeam[1] || "the opposition";

  return (
    `🏆 **${winner} defeats ${loser}, ${score}!**\n\n` +
    `🎙️ **FDL Battle Report**\n` +
    `${first} came out swinging as ${winner} took the fight to ${loser}. ` +
    `${rival} answered with a fierce counterattack, while ${rivalTwo} kept the pressure on. ` +
    `But ${second} helped swing the momentum back in ${winner}'s favor. ` +
    `When the dust settled, ${winner} walked away with a ${score} victory!\n\n` +
    `*Fictional recap inspired by the teams' rosters.*`
  );
}

const pending = new Map();

client.once(Events.ClientReady, (readyClient) => {
  console.log(
    `FDL Match Reporter online as ${readyClient.user.tag}`
  );
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (
      interaction.isChatInputCommand() &&
      interaction.commandName === "report"
    ) {
      await interaction.deferReply({
        flags: MessageFlags.Ephemeral,
      });

      const matches = await readSchedule();

      if (!matches.length) {
        return interaction.editReply(
          "No unreported matches were found."
        );
      }

      const weeks = [
        ...new Set(matches.map((m) => String(m.week))),
      ];

      const menu = new StringSelectMenuBuilder()
        .setCustomId("fdl_week")
        .setPlaceholder("Select a week")
        .addOptions(
          weeks.slice(0, 25).map((week) => ({
            label: `Week ${week}`,
            value: week,
          }))
        );

      return interaction.editReply({
        content: "🏆 **FDL Match Reporter**\nSelect a week:",
        components: [
          new ActionRowBuilder().addComponents(menu),
        ],
      });
    }

    if (!interaction.isStringSelectMenu() &&
        !interaction.isButton()) {
      return;
    }

    if (interaction.customId === "fdl_week") {
      const matches = (await readSchedule()).filter(
        (m) => String(m.week) === interaction.values[0]
      );

      const menu = new StringSelectMenuBuilder()
        .setCustomId("fdl_match")
        .setPlaceholder("Select the match")
        .addOptions(
          matches.slice(0, 25).map((match) => ({
            label: `${match.player1} vs ${match.player2}`,
            description: `Week ${match.week}`,
            value: String(match.rowNumber),
          }))
        );

      return interaction.update({
        content: "Select the match to report:",
        components: [
          new ActionRowBuilder().addComponents(menu),
        ],
      });
    }

    if (interaction.customId === "fdl_match") {
      const rowNumber = Number(interaction.values[0]);
      const match = (await readSchedule()).find(
        (m) => m.rowNumber === rowNumber
      );

      if (!match) {
        return interaction.update({
          content: "This match is no longer available.",
          components: [],
        });
      }

      pending.set(interaction.user.id, {
        match,
        channelId: interaction.channelId,
        createdAt: Date.now(),
      });

      const menu = new StringSelectMenuBuilder()
        .setCustomId("fdl_winner")
        .setPlaceholder("Select the winner")
        .addOptions([
          {
            label: match.player1,
            value: match.player1,
          },
          {
            label: match.player2,
            value: match.player2,
          },
        ]);

      return interaction.update({
        content:
          `**${match.player1} vs ${match.player2}**\n` +
          "Who won?",
        components: [
          new ActionRowBuilder().addComponents(menu),
        ],
      });
    }

    if (interaction.customId === "fdl_winner") {
      const state = pending.get(interaction.user.id);

      if (!state) {
        return interaction.update({
          content: "Session expired. Run /report again.",
          components: [],
        });
      }

      state.winner = interaction.values[0];

      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("fdl_score_2-0")
          .setLabel("2–0")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId("fdl_score_2-1")
          .setLabel("2–1")
          .setStyle(ButtonStyle.Primary)
      );

      return interaction.update({
        content: `Winner: **${state.winner}**\nSelect the score:`,
        components: [buttons],
      });
    }

    if (interaction.customId.startsWith("fdl_score_")) {
      const state = pending.get(interaction.user.id);

      if (!state) {
        return interaction.update({
          content: "Session expired. Run /report again.",
          components: [],
        });
      }

      state.score = interaction.customId.replace(
        "fdl_score_",
        ""
      );

      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("fdl_confirm")
          .setLabel("Confirm Result")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId("fdl_cancel")
          .setLabel("Cancel")
          .setStyle(ButtonStyle.Secondary)
      );

      return interaction.update({
        content:
          `**Confirm Match Result**\n` +
          `${state.match.player1} vs ${state.match.player2}\n` +
          `Winner: **${state.winner}**\n` +
          `Score: **${state.score}**\n\n` +
          (PREVIEW_ONLY
            ? "🧪 Preview mode: No spreadsheet changes will be made."
            : "This will update the FDL spreadsheet."),
        components: [buttons],
      });
    }

    if (interaction.customId === "fdl_cancel") {
      pending.delete(interaction.user.id);

      return interaction.update({
        content: "Match report cancelled.",
        components: [],
      });
    }

    if (interaction.customId === "fdl_confirm") {
      const state = pending.get(interaction.user.id);

      if (!state || Date.now() - state.createdAt > 600000) {
        pending.delete(interaction.user.id);

        return interaction.update({
          content: "Session expired. Run /report again.",
          components: [],
        });
      }

      await interaction.deferUpdate();

      const available = (await readSchedule()).find(
        (m) => m.rowNumber === state.match.rowNumber
      );

      if (
        !available ||
        available.player1 !== state.match.player1 ||
        available.player2 !== state.match.player2
      ) {
        pending.delete(interaction.user.id);

        return interaction.editReply({
          content: "Match changed or was already reported.",
          components: [],
        });
      }

      const rosters = await readRosters();

      const recap = battleRecap(
        state.match,
        state.winner,
        state.score,
        rosters
      );

      if (!PREVIEW_ONLY) {
        const sheets = getSheets();

        await sheets.spreadsheets.values.update({
          spreadsheetId: SHEET_ID,
          range: `Schedule!G${state.match.rowNumber}:H${state.match.rowNumber}`,
          valueInputOption: "USER_ENTERED",
          requestBody: {
            values: [[state.winner, state.score]],
          },
        });
      }

      pending.delete(interaction.user.id);

      await interaction.editReply({
        content: PREVIEW_ONLY
          ? "🧪 Preview successful! No spreadsheet changes made."
          : "✅ Match result submitted!",
        components: [],
      });

      await interaction.channel.send({
        content:
          (PREVIEW_ONLY ? "🧪 **TEST REPORT**\n\n" : "") +
          recap +
          `\n\n📝 Reported by <@${interaction.user.id}>`,
        allowedMentions: { parse: [] },
      });
    }
  } catch (error) {
    console.error("FDL bot error:", error);

    const message =
      "Something went wrong. Check Railway logs for details.";

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({
        content: message,
        components: [],
      }).catch(console.error);
    } else {
      await interaction.reply({
        content: message,
        flags: MessageFlags.Ephemeral,
      }).catch(console.error);
    }
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);
