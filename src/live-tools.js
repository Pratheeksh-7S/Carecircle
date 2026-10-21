// Live information tools: web search, web pages, weather, time, facts and news.
import { z } from "zod";

const reply = (text) => ({ content: [{ type: "text", text }] });

async function getJson(url) {
  const res = await fetch(url, { headers: { "User-Agent": "CareCircle/1.0 (hackathon demo)" }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`${res.status} from ${new URL(url).host}`);
  return res.json();
}

// Find a city's coordinates and time zone with Open-Meteo geocoding
async function findPlace(name) {
  const data = await getJson(`https://geocoding-api.open-meteo.com/v1/search?count=1&name=${encodeURIComponent(name)}`);
  return data.results?.[0];
}

const WEATHER = {
  0: "clear sky", 1: "mainly clear", 2: "partly cloudy", 3: "overcast", 45: "fog", 48: "fog",
  51: "light drizzle", 53: "drizzle", 55: "heavy drizzle", 61: "light rain", 63: "rain", 65: "heavy rain",
  71: "light snow", 73: "snow", 75: "heavy snow", 80: "rain showers", 81: "rain showers", 82: "violent rain showers",
  95: "thunderstorms", 96: "thunderstorms with hail", 99: "thunderstorms with hail",
};

const decode = (s) => s.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"')
  .replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

// Turn an HTML page into plain text
const htmlToText = (html) => decode(html
  .replace(/<(script|style|noscript|svg|head)\b[\s\S]*?<\/\1>/gi, " ")
  .replace(/<[^>]+>/g, " ")).replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

// Web search: Tavily if TAVILY_API_KEY is set (best results), otherwise DuckDuckGo
async function searchWeb(query) {
  if (process.env.TAVILY_API_KEY) {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.TAVILY_API_KEY}` },
      body: JSON.stringify({ query, max_results: 5, include_answer: true }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`${res.status} from Tavily`);
    const data = await res.json();
    return { answer: data.answer, results: data.results.map((r) => ({ title: r.title, url: r.url, snippet: r.content })) };
  }
  const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
    headers: { "User-Agent": BROWSER_UA }, signal: AbortSignal.timeout(10000),
  });
  const html = await res.text();
  const links = [...html.matchAll(/class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
  const snippets = [...html.matchAll(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g)];
  const results = links.slice(0, 5).map((m, i) => {
    const raw = decode(m[1]);
    const url = raw.includes("uddg=") ? decodeURIComponent(raw.split("uddg=")[1].split("&")[0]) : raw;
    return { title: htmlToText(m[2]), url, snippet: htmlToText(snippets[i]?.[1] ?? "") };
  });
  return { results };
}

export function registerLiveTools(server) {
  server.registerTool(
    "search_web",
    {
      title: "Search the web",
      description:
        "Search the whole web for anything: current events, prices, sports scores, products, places, how-to guides, health information and more. " +
        "Returns the top results with links. Use it whenever the answer could be recent or you are not sure.",
      inputSchema: { query: z.string().describe("A clear search query, e.g. 'IPL 2026 final result'") },
    },
    async ({ query }) => {
      try {
        const { answer, results } = await searchWeb(query);
        if (!results.length) return reply(`I found no web results for ${query}.`);
        const list = results.map((r, i) => `${i + 1}. ${r.title} (${r.url}): ${r.snippet}`).join("\n");
        return reply(`${answer ? `Quick answer: ${answer}\n` : ""}Web results for "${query}":\n${list}`);
      } catch (err) {
        return reply(`I couldn't search the web right now (${err.message}).`);
      }
    }
  );

  server.registerTool(
    "read_webpage",
    {
      title: "Read a web page",
      description: "Open a web page and read its text, to get full details from a search result link.",
      inputSchema: { url: z.string().describe("The full https link to read") },
    },
    async ({ url }) => {
      try {
        if (!/^https?:\/\//.test(url)) return reply("That doesn't look like a web link.");
        const res = await fetch(url, { headers: { "User-Agent": BROWSER_UA }, signal: AbortSignal.timeout(10000) });
        if (!res.ok) return reply(`That page answered with an error (${res.status}).`);
        const text = htmlToText(await res.text());
        return reply(`Text of ${url}:\n${text.slice(0, 5000)}`);
      } catch (err) {
        return reply(`I couldn't open that page (${err.message}).`);
      }
    }
  );

  server.registerTool(
    "get_weather",
    {
      title: "Live weather",
      description: "Get the current weather and today's forecast for a city. Use for any weather question.",
      inputSchema: { place: z.string().describe("City name, e.g. 'Bengaluru'") },
    },
    async ({ place }) => {
      try {
        const where = await findPlace(place);
        if (!where) return reply(`I couldn't find a place called ${place}.`);
        const w = await getJson(
          `https://api.open-meteo.com/v1/forecast?latitude=${where.latitude}&longitude=${where.longitude}&timezone=auto` +
            "&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m" +
            "&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=1"
        );
        const c = w.current, d = w.daily;
        return reply(
          `Weather in ${where.name}, ${where.country}: ${WEATHER[c.weather_code] ?? "mixed conditions"}, ` +
            `${Math.round(c.temperature_2m)}°C (feels like ${Math.round(c.apparent_temperature)}°C), ` +
            `humidity ${c.relative_humidity_2m}%, wind ${Math.round(c.wind_speed_10m)} km/h. ` +
            `Today: high ${Math.round(d.temperature_2m_max[0])}°C, low ${Math.round(d.temperature_2m_min[0])}°C, ` +
            `${d.precipitation_probability_max[0]}% chance of rain.`
        );
      } catch (err) {
        return reply(`I couldn't reach the weather service right now (${err.message}).`);
      }
    }
  );

  server.registerTool(
    "get_current_time",
    {
      title: "Current date and time",
      description: "Get the current date and time, here or in a city. Use for questions about the time, date or day.",
      inputSchema: { place: z.string().optional().describe("City name, leave empty for local time") },
    },
    async ({ place }) => {
      try {
        const where = place ? await findPlace(place) : null;
        const now = new Date().toLocaleString("en-IN", {
          dateStyle: "full", timeStyle: "short", ...(where ? { timeZone: where.timezone } : {}),
        });
        return reply(where ? `In ${where.name} it is ${now}.` : `It is ${now}.`);
      } catch (err) {
        return reply(`It is ${new Date().toLocaleString("en-IN", { dateStyle: "full", timeStyle: "short" })}.`);
      }
    }
  );

  server.registerTool(
    "look_up_facts",
    {
      title: "Look up facts",
      description:
        "Look up up-to-date facts about people, places, events, health topics or anything else on Wikipedia. Use when unsure or when the question needs current facts.",
      inputSchema: { query: z.string().describe("What to look up, e.g. 'Chandrayaan-3'") },
    },
    async ({ query }) => {
      try {
        const data = await getJson(
          "https://en.wikipedia.org/w/api.php?action=query&format=json&prop=extracts&exintro=1&explaintext=1" +
            `&generator=search&gsrlimit=1&gsrsearch=${encodeURIComponent(query)}`
        );
        const page = Object.values(data.query?.pages ?? {})[0];
        if (!page) return reply(`I couldn't find anything about ${query}.`);
        return reply(`From Wikipedia, "${page.title}": ${page.extract.slice(0, 1500)}`);
      } catch (err) {
        return reply(`I couldn't reach Wikipedia right now (${err.message}).`);
      }
    }
  );

  server.registerTool(
    "get_news",
    {
      title: "Latest news",
      description: "Get the latest news headlines, in general or about a topic. Use for any news or 'what's happening' question.",
      inputSchema: { topic: z.string().optional().describe("News topic, e.g. 'cricket'. Leave empty for top news.") },
    },
    async ({ topic }) => {
      try {
        const url = topic
          ? `https://news.google.com/rss/search?q=${encodeURIComponent(topic)}&hl=en-IN&gl=IN&ceid=IN:en`
          : "https://news.google.com/rss?hl=en-IN&gl=IN&ceid=IN:en";
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        const xml = await res.text();
        const titles = [...xml.matchAll(/<item>[\s\S]*?<title>([\s\S]*?)<\/title>/g)].slice(0, 5).map((m) => decode(m[1]));
        if (!titles.length) return reply("I couldn't find any news on that right now.");
        return reply(`Latest headlines${topic ? ` about ${topic}` : ""}: ${titles.join(" | ")}`);
      } catch (err) {
        return reply(`I couldn't reach the news service right now (${err.message}).`);
      }
    }
  );
}
