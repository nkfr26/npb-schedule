import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import { generateTicketUrls } from "./generate-ticket-urls.js";

(async () => {
  mkdirSync("docs", { recursive: true });
  const browser = await chromium.launch({ headless: true });

  const year = new Date().getFullYear();
  const months = ["03", "04", "05", "06", "07", "08", "09", "10", "11"];

  const promises = months.map(async (month) => {
    const page = await browser.newPage();
    await page.goto(
      `https://npb.jp/games/${year}/schedule_${month}_detail.html`,
    );

    const games = await page.evaluate(() => {
      const rows = Array.from(
        document.querySelectorAll("#schedule_detail tbody tr"),
      );
      let date: string;
      return rows.map((row) => {
        date = row.querySelector("th[rowspan]")?.textContent || date;

        const [match, info] = Array.from(row.querySelectorAll("td"));
        if (!match || !info) return undefined;
        if (match.textContent === "\u00A0") return undefined;

        const [home, visitor] = [
          match.querySelector(".team1")?.textContent,
          match.querySelector(".team2")?.textContent,
        ];
        if (!home || !visitor) return undefined;

        const [stadium, time] = [
          info.querySelector(".place")?.textContent.replace(/\u3000/g, ""),
          info.querySelector(".time")?.textContent,
        ];
        if (!stadium || !time) return undefined;

        return {
          date,
          match: { home, visitor },
          info: { stadium, time },
        };
      });
    });

    const formatted = games
      .filter((game) => game !== undefined)
      .map((game) => {
        const formattedDate = formatDate(year, game.date);
        const ticket = generateTicketUrls(game.match.home, formattedDate);
        return {
          ...game,
          date: formattedDate,
          ...(ticket && { ticket }),
        };
      });

    writeFileSync(
      `docs/schedule_${month}_detail.json`,
      JSON.stringify(formatted, null, 2),
    );
    await page.close();
  });

  await Promise.all(promises);
  await browser.close();
})();

const formatDate = (year: number, dateString: string) => {
  const dateMatch = dateString.match(/(\d+)\/(\d+)/);
  if (!dateMatch) return "";

  const [month, day] = [
    dateMatch[1]?.padStart(2, "0"),
    dateMatch[2]?.padStart(2, "0"),
  ];
  if (!month || !day) return "";

  return `${year}-${month}-${day}`;
};
