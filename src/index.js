// src/index.js
import "dotenv/config";
import {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  StringSelectMenuBuilder
} from "discord.js";

import { fetchScoreboard, extractGame } from "./espn.js";
import { buildGameEmbed } from "./format.js";

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

/** Slash commands supported (must match what you registered) */
const shortcutMap = {
  nfl: "NFL",
  nba: "NBA",
  nhl: "NHL",
  mlb: "MLB",
  mls: "MLS",
  epl: "EPL",
  f1: "F1"
};

function parseMs(event) {
  const t = Date.parse(event?.date || "");
  return Number.isFinite(t) ? t : null;
}

function stateOf(e) {
  return e?.status?.type?.state || "unknown"; // "pre" | "in" | "post"
}

/**
 * Pick what to show in the main embed:
 * 1) any live game ("in")
 * 2) else next scheduled ("pre" with earliest start >= now)
 * 3) else most recent final today ("post" with latest start <= now)
 */
function pickForMainEmbed(events) {
  const now = Date.now();

  const withTime = events
    .map(e => ({ e, t: parseMs(e), s: stateOf(e) }))
    .filter(x => x.t != null)
    .sort((a, b) => a.t - b.t);

  const live = withTime.find(x => x.s === "in");
  if (live) return live.e;

  const nextScheduled = withTime.find(x => x.s === "pre" && x.t >= now - 5 * 60 * 1000);
  if (nextScheduled) return nextScheduled.e;

  const finished = withTime.filter(x => x.s === "post" && x.t <= now);
  if (finished.length) return finished[finished.length - 1].e;

  return withTime[0]?.e || null;
}

/**
 * Fetch games for today; if none exist, look ahead up to maxDays.
 * Dropdown list = ALL games for the found day (pre/in/post).
 * pick = live if available else next scheduled else last final.
 */
async function fetchPickAndList(league, maxDays = 14) {
  const now = Date.now();

  // Build a list of date candidates:
  // Start with yesterday/today/tomorrow to capture "today" in US timezones vs UTC,
  // then look forward.
  const today = new Date();
  const candidates = [];

  // yesterday, today, tomorrow first
  for (let offset of [-1, 0, 1]) {
    const d = new Date(Date.UTC(
      today.getUTCFullYear(),
      today.getUTCMonth(),
      today.getUTCDate() + offset
    ));
    candidates.push(d);
  }

  // then forward lookahead (starting 2 days ahead)
  for (let i = 2; i <= maxDays; i++) {
    const d = new Date(Date.UTC(
      today.getUTCFullYear(),
      today.getUTCMonth(),
      today.getUTCDate() + i
    ));
    candidates.push(d);
  }

  // Helper: format YYYY-MM-DD for fetchScoreboard
  function fmt(d) {
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  // Pull boards for candidates (in order) and score them so we pick the "best day"
  let best = null;

  for (const d of candidates) {
    const dateStr = fmt(d);
    const board = await fetchScoreboard(league, dateStr);
    const events = board?.events || [];
    if (!events.length) continue;

    const list = events
      .slice()
      .sort((a, b) => (parseMs(a) ?? 0) - (parseMs(b) ?? 0));

    const hasLive = list.some(e => stateOf(e) === "in");

    // "Recent" window: include finals/started games within the last 18 hours
    // This catches "today" games even if they fell onto yesterday/tomorrow UTC scoreboard.
    const hasRecent = list.some(e => {
      const t = parseMs(e);
      if (t == null) return false;
      return (t <= now && t >= now - 18 * 60 * 60 * 1000) || stateOf(e) === "in";
    });

    // Base score to choose which day we should display:
    // live day > recent day > any day
    const score = (hasLive ? 100 : 0) + (hasRecent ? 50 : 0) + (list.length ? 1 : 0);

    if (!best || score > best.score) {
      best = { score, dateStr, list, pick: pickForMainEmbed(list) };
      // If we found live games, that's the best possible — stop early
      if (hasLive) break;
    }
  }

  if (!best) return { pick: null, list: [], dateStr: null };
  return { pick: best.pick, list: best.list, dateStr: best.dateStr };
}

function buildDropdown(league, list) {
  const options = (list || []).slice(0, 25).map(e => {
    const comp = e?.competitions?.[0];
    const competitors = comp?.competitors || [];
    const away = competitors.find(c => c?.homeAway === "away");
    const home = competitors.find(c => c?.homeAway === "home");

    const a = away?.team?.abbreviation;
    const h = home?.team?.abbreviation;

    const label = (a && h) ? `${a} @ ${h}` : (e.shortName || e.name || e.id);

    return {
      label: String(label).slice(0, 100),
      value: e.id
    };
  });

  if (!options.length) return [];

  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`select_${league}`)
      .setPlaceholder("Select a game...")
      .addOptions(options)
  );

  return [row];
}

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

/**
 * Handles:
 * - /nfl /nba /nhl /mlb /mls /epl /f1
 * - dropdown selection
 */
client.on("interactionCreate", async (interaction) => {
  try {
    // Slash commands
    if (interaction.isChatInputCommand()) {
      const league = shortcutMap[interaction.commandName];
      if (!league) return;

      await interaction.deferReply();

      const { pick, list, dateStr } = await fetchPickAndList(league, 14);
      if (!pick) {
        return interaction.editReply("No games found in the next 14 days.");
      }

      const game = extractGame(pick);

      // Optional page-like footer text (not true pagination)
      const pageInfo = dateStr ? `Games for ${dateStr}` : null;

      const components = buildDropdown(league, list);

      return interaction.editReply({
        embeds: [buildGameEmbed(league, game, pageInfo)],
        components
      });
    }

    // Dropdown selection
    if (interaction.isStringSelectMenu()) {
      const league = interaction.customId.split("_")[1];
      const eventId = interaction.values?.[0];
      if (!league || !eventId) return;

      await interaction.deferUpdate();

      const { list, dateStr } = await fetchPickAndList(league, 14);
      const selected = (list || []).find(e => e.id === eventId);

      if (!selected) {
        return interaction.editReply({ content: "Could not find that game." });
      }

      const game = extractGame(selected);
      const pageInfo = dateStr ? `Games for ${dateStr}` : null;

      return interaction.editReply({
        embeds: [buildGameEmbed(league, game, pageInfo)]
      });
    }
  } catch (err) {
    console.error(err);

    const msg = `Error: ${err?.message || String(err)}`;

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: msg });
    } else {
      await interaction.reply({ content: msg, ephemeral: true });
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
