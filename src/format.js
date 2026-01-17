import { EmbedBuilder } from "discord.js";

const LEAGUE_COLORS = {
  NFL: 0x013369,
  NBA: 0x1d428a,
  NHL: 0x111111,
  MLB: 0x002d72,
  MLS: 0x0b6e4f,
  EPL: 0x3d195b,
  F1:  0xe10600
};

export function buildGameEmbed(league, game, pageInfo = null) {
  const title = `${game.away.name} at ${game.home.name}`;
  const color = LEAGUE_COLORS[league] ?? 0x1e1f22;

  const scoreLine =
    game.away.score !== "-" && game.home.score !== "-"
      ? `**${game.away.score} – ${game.home.score}**`
      : "**0 – 0**";

  const teamsLine = (() => {
    const a = game.away.abbr || game.away.name;
    const h = game.home.abbr || game.home.name;
    return `${a} – ${h}`;
  })();

  const watchLine = game.watch?.length ? game.watch.join(", ") : "Varies by region";

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(
      [
        `📍 **${game.venue}**`,
        ``,
        `**Status:** ${game.status}`,
        `**Teams:** ${teamsLine}`,
        `**Score:** ${scoreLine}`,
        `**Watch:** ${watchLine}`
      ].join("\n")
    )
    // Bleed-like: put a logo on the right
    .setThumbnail(game.home.logo || game.away.logo || null)
    .setFooter({
      text: pageInfo ? `${pageInfo} • MADE BY FIFTHOFJACK` : "MADE BY FIFTHOFJACK"
    })
    .setTimestamp();

  return embed;
}
