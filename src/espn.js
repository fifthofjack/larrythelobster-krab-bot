// src/espn.js
// ESPN (undocumented) scoreboard + summary helper + normalization
// Supports: NFL, NBA, NHL, MLB, MLS, EPL, F1

const BASE = "https://site.api.espn.com/apis/site/v2/sports";

export const LEAGUES = {
  NFL: { sport: "football", league: "nfl" },
  NBA: { sport: "basketball", league: "nba" },
  NHL: { sport: "hockey", league: "nhl" },
  MLB: { sport: "baseball", league: "mlb" },
  MLS: { sport: "soccer", league: "usa.1" }, // MLS
  EPL: { sport: "soccer", league: "eng.1" }, // Premier League
  F1: { sport: "racing", league: "f1" }
};

function toYYYYMMDD(input) {
  // input: "YYYY-MM-DD" OR Date
  const d =
    input instanceof Date
      ? input
      : new Date(String(input).trim() + "T00:00:00Z");

  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid date: ${input}`);
  }

  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

async function getJson(url) {
  const res = await fetch(url, {
    headers: {
      "Accept": "application/json",
      // Friendly UA (ESPN may ignore, but it's good hygiene)
      "User-Agent": "larrythelobster-sportsbot/1.0 (discord bot)"
    }
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`ESPN request failed (${res.status}) ${text.slice(0, 120)}`);
  }

  return res.json();
}

export async function fetchScoreboard(leagueKey, date /* YYYY-MM-DD optional */) {
  const conf = LEAGUES[leagueKey];
  if (!conf) throw new Error(`Unknown league: ${leagueKey}`);

  const dates = date ? toYYYYMMDD(date) : toYYYYMMDD(new Date());
  const url = `${BASE}/${conf.sport}/${conf.league}/scoreboard?dates=${dates}`;
  return getJson(url);
}

export async function fetchSummary(leagueKey, eventId) {
  const conf = LEAGUES[leagueKey];
  if (!conf) throw new Error(`Unknown league: ${leagueKey}`);
  if (!eventId) throw new Error("Missing eventId");

  const url = `${BASE}/${conf.sport}/${conf.league}/summary?event=${encodeURIComponent(
    eventId
  )}`;
  return getJson(url);
}

/**
 * Extracts a stable, “bot-friendly” game object from a SCOREBOARD event object.
 * NOTE: ESPN "summary" payload shapes vary more; prefer scoreboard events for stability.
 */
export function extractGame(event) {
  const comp = event?.competitions?.[0];

  // Status can live either on event.status.type OR comp.status.type depending on payload
  const statusType = event?.status?.type || comp?.status?.type || {};
  const state = statusType?.state || "unknown"; // pre | in | post
  const status = statusType?.detail || statusType?.description || "Status unknown";

  const competitors = comp?.competitors || [];
  const home = competitors.find(c => c?.homeAway === "home");
  const away = competitors.find(c => c?.homeAway === "away");

  const venueObj = comp?.venue;
  const venue =
    venueObj?.fullName ||
    venueObj?.name ||
    "Unknown Venue";

  // Broadcasts (when present) are usually comp.broadcasts[].names[]
  const watch =
    comp?.broadcasts?.flatMap(b => Array.isArray(b?.names) ? b.names : [])
      ?.filter(Boolean) ?? [];

  // Team logos (when present) are usually team.logo
  const homeTeam = home?.team || {};
  const awayTeam = away?.team || {};

  return {
    id: event?.id ?? "Unknown",
    // ESPN often gives shortName like "BUF @ DEN"
    name: event?.shortName || event?.name || "Unknown matchup",
    start: event?.date || null,

    // status + state for live/next logic
    status,
    state,

    venue,

    home: {
      name: homeTeam?.displayName || "Home",
      abbr: homeTeam?.abbreviation || null,
      logo: homeTeam?.logo || null,
      score: home?.score ?? "-"
    },
    away: {
      name: awayTeam?.displayName || "Away",
      abbr: awayTeam?.abbreviation || null,
      logo: awayTeam?.logo || null,
      score: away?.score ?? "-"
    },

    watch
  };
}
