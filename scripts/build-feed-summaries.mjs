#!/usr/bin/env node
/**
 * Fetches recent Hacker News (Algolia) + Reddit headlines for day/week/month windows,
 * then writes summaries.json via OpenAI (OPENAI_API_KEY) or heuristic fallback prose.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const UA =
  "identity.rommy-io/1.0 (summaries bot; https://github.com/fingerguns/identity)";
const REDDIT_MULTI =
  "programming+hackernews+technology+webdev+experienceddevs";

const OUT = path.join(process.cwd(), "summaries.json");

function nowUnix() {
  return Math.floor(Date.now() / 1000);
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": UA },
  });
  if (!res.ok) throw new Error(`${url}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function hnStoriesSince(secondsAgo, maxHits = 45) {
  const cutoff = nowUnix() - secondsAgo;
  const url = `https://hn.algolia.com/api/v1/search?tags=story&numericFilters=created_at_i%3E${cutoff}&hitsPerPage=${maxHits}`;
  const data = await fetchJson(url);
  const hits = data.hits ?? [];
  return hits.map((h) => ({
    title: h.title,
    url:
      (typeof h.url === "string" && h.url) ||
      `https://news.ycombinator.com/item?id=${h.objectID}`,
  }));
}

async function redditListing(suffixPath) {
  const url = `https://www.reddit.com/r/${REDDIT_MULTI}${suffixPath}`;
  const data = await fetchJson(url);
  const children = data.data?.children ?? [];
  return children
    .map((c) => {
      const d = c.data;
      if (!d?.title) return null;
      return {
        title: d.title,
        url: `https://www.reddit.com${d.permalink}`,
      };
    })
    .filter(Boolean);
}

async function gatherWindows() {
  const dayS = 86400;
  const weekS = 7 * dayS;
  const monthS = 30 * dayS;

  const [
    hnDay,
    hnWeek,
    hnMonth,
    redditDay,
    redditWeek,
    redditMonth,
  ] = await Promise.all([
    hnStoriesSince(dayS),
    hnStoriesSince(weekS),
    hnStoriesSince(monthS),
    redditListing("/top.json?t=day&limit=35"),
    redditListing("/top.json?t=week&limit=35"),
    redditListing("/top.json?t=month&limit=35"),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    day: { hn: hnDay, reddit: redditDay },
    week: { hn: hnWeek, reddit: redditWeek },
    month: { hn: hnMonth, reddit: redditMonth },
  };
}

function formatHeadlinesForPrompt(label, hn, reddit, cap = 25) {
  const hnLines = hn.slice(0, cap).map((h, i) => `${i + 1}. ${h.title}`);
  const rdLines = reddit
    .slice(0, cap)
    .map((h, i) => `${i + 1}. ${h.title}`);
  return `${label}\nHacker News:\n${hnLines.join("\n")}\n\nReddit (${REDDIT_MULTI.replace(/\+/g, "/r/")}):\n${rdLines.join("\n")}`;
}

function truncateProse(s, max) {
  if (s.length <= max) return s;
  const cut = s.slice(0, max).trimEnd();
  return cut.replace(/\s[^\s]*$/, "") + "…";
}

function fallbackSummaries(data) {
  const narrate = (key, leadIn) => {
    const { hn, reddit } = data[key];
    const hnLine = truncateProse(
      hn.slice(0, 14).map((x) => x.title).join(" · "),
      720,
    );
    const rdLine = truncateProse(
      reddit.slice(0, 14).map((x) => x.title).join(" · "),
      720,
    );
    return (
      `${leadIn} signal on Hacker News tilts toward ${hnLine}` +
      ` Reddit’s counterpart multireddit adds ${rdLine}`
    );
  };

  return {
    day: narrate("day", "In the latest day"),
    week: narrate("week", "Across the trailing week"),
    month: narrate("month", "Across the trailing month"),
  };
}

async function openAiSummarize(data) {
  const apiKey = (process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) return null;

  const bundles = [
    ["DAY (last ~24 hours)", data.day],
    ["WEEK (~7 days)", data.week],
    ["MONTH (~30 days)", data.month],
  ]
    .map(([label, b]) =>
      formatHeadlinesForPrompt(label, b.hn, b.reddit),
    )
    .join("\n\n---\n\n");

  const user = `${bundles}

Write three narrative summaries for a personal site's fixed sidebar panel.
Audience: practiced engineers skim-reading over coffee.

Rules:
- Return ONLY valid JSON with keys exactly: day, week, month (all strings).
- Each string is 3–5 sentences, flowing prose, no bullet characters, no markdown.
- Compare and contrast Reddit vs HN where it adds signal; synthesize themes, don't list headlines.
- Neutral, understated tone; skip moralizing and hype adjectives unless the sources clearly imply it.`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      response_format: { type: "json_object" },
      temperature: 0.45,
      messages: [
        {
          role: "system",
          content:
            "You compress noisy tech headline feeds into short narrative summaries.",
        },
        { role: "user", content: user },
      ],
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`OpenAI error ${res.status}: ${txt}`);
  }

  const body = await res.json();
  const raw = body.choices?.[0]?.message?.content;
  if (!raw) throw new Error("OpenAI returned empty content");
  const parsed = JSON.parse(raw);
  if (
    typeof parsed.day !== "string" ||
    typeof parsed.week !== "string" ||
    typeof parsed.month !== "string"
  ) {
    throw new Error("OpenAI JSON missing day/week/month strings");
  }
  return { day: parsed.day, week: parsed.week, month: parsed.month };
}

async function main() {
  console.error("Fetching HN + Reddit…");
  const raw = await gatherWindows();
  let texts;
  try {
    texts = await openAiSummarize(raw);
    if (texts) console.error("OpenAI summaries OK.");
  } catch (e) {
    console.error("OpenAI failed, using fallback:", e.message || e);
    texts = null;
  }
  if (!texts) texts = fallbackSummaries(raw);

  const payload = {
    generatedAt: raw.generatedAt,
    feeds: ["Hacker News (Algolia windowed search)", `Reddit /r/${REDDIT_MULTI}`],
    windows: {
      day: "~24 hours (HN created_at + Reddit top?t=day)",
      week: "~7 days + Reddit top?t=week",
      month: "~30 days + Reddit top?t=month",
    },
    day: texts.day,
    week: texts.week,
    month: texts.month,
  };

  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2) + "\n", "utf8");
  console.error("Wrote", OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
