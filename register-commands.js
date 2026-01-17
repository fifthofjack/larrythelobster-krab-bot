import "dotenv/config";
import { REST, Routes, SlashCommandBuilder } from "discord.js";

const leagues = ["NFL", "NBA", "NHL", "MLB", "MLS", "EPL", "F1"];

const commands = leagues.map(l =>
  new SlashCommandBuilder()
    .setName(l.toLowerCase())
    .setDescription(`Show the next or live ${l} game`)
    .toJSON()
);

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

await rest.put(
  Routes.applicationGuildCommands(
    process.env.DISCORD_CLIENT_ID,
    process.env.GUILD_ID
  ),
  { body: commands }
);

console.log("Slash commands registered.");