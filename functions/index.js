const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");

const tmdbReadAccessToken = defineSecret("TMDB_READ_ACCESS_TOKEN");
const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE_URL = "https://image.tmdb.org/t/p/w500";
const DRAMA_COUNTRIES = new Set(["KR", "CN", "TW", "HK"]);
const TV_GENRES = new Map([
  [10759, "action"],
  [16, "animation"],
  [35, "comedy"],
  [80, "crime"],
  [99, "documentary"],
  [18, "drama"],
  [10751, "family"],
  [10762, "kids"],
  [9648, "mystery"],
  [10763, "news"],
  [10764, "reality"],
  [10765, "sci-fi & fantasy"],
  [10766, "soap"],
  [10767, "talk"],
  [10768, "war & politics"],
  [37, "western"],
]);

exports.tmdbSearch = onRequest(
  {
    region: "us-central1",
    secrets: [tmdbReadAccessToken],
    cors: true,
  },
  async (request, response) => {
    if (request.method !== "GET") {
      response.status(405).json({ error: "Method not allowed" });
      return;
    }

    const query = String(request.query.q || "").trim();
    if (!query) {
      response.status(400).json({ error: "Missing query" });
      return;
    }

    try {
      const searchUrl = new URL(`${TMDB_BASE_URL}/search/tv`);
      searchUrl.searchParams.set("query", query);
      searchUrl.searchParams.set("include_adult", "false");
      searchUrl.searchParams.set("language", "en-US");
      searchUrl.searchParams.set("page", "1");

      const searchData = await searchTmdbTv(query);
      const shows = searchData
        .filter(isChineseOrKoreanDrama)
        .slice(0, 20);

      const dramas = await Promise.all(
        shows.map(async (show) => {
          try {
            const detailUrl = new URL(`${TMDB_BASE_URL}/tv/${show.id}`);
            detailUrl.searchParams.set("language", "en-US");
            detailUrl.searchParams.set("append_to_response", "keywords,credits,alternative_titles");
            const details = await fetchTmdb(detailUrl);
            return { ...show, ...details };
          } catch {
            return show;
          }
        }),
      );

      const rankedDramas = dramas
        .sort((a, b) => rankShow(b, query) - rankShow(a, query))
        .map(mapTmdbTvResult);

      response.json({ results: rankedDramas });
    } catch (error) {
      response.status(502).json({ error: error.message });
    }
  },
);

exports.tmdbPersonSearch = onRequest(
  {
    region: "us-central1",
    secrets: [tmdbReadAccessToken],
    cors: true,
  },
  async (request, response) => {
    if (request.method !== "GET") {
      response.status(405).json({ error: "Method not allowed" });
      return;
    }

    const query = String(request.query.q || "").trim();
    if (!query) {
      response.status(400).json({ error: "Missing query" });
      return;
    }

    try {
      const url = new URL(`${TMDB_BASE_URL}/search/person`);
      url.searchParams.set("query", query);
      url.searchParams.set("include_adult", "false");
      url.searchParams.set("language", "en-US");
      const data = await fetchTmdb(url);
      const results = (data.results || [])
        .map(mapTmdbPersonResult)
        .filter((person) => person.knownFor.length)
        .slice(0, 12);
      response.json({ results });
    } catch (error) {
      response.status(502).json({ error: error.message });
    }
  },
);

async function searchTmdbTv(query) {
  const queries = [...new Set([query, stripLeadingArticle(query)])].filter(Boolean);
  const allResults = [];

  for (const searchQuery of queries) {
    const searchUrl = new URL(`${TMDB_BASE_URL}/search/tv`);
    searchUrl.searchParams.set("query", searchQuery);
    searchUrl.searchParams.set("include_adult", "false");
    searchUrl.searchParams.set("language", "en-US");
    searchUrl.searchParams.set("page", "1");
    const data = await fetchTmdb(searchUrl);
    allResults.push(...(data.results || []));
  }

  const byId = new Map();
  allResults.forEach((show) => byId.set(show.id, show));
  return [...byId.values()].sort((a, b) => rankShow(b, query) - rankShow(a, query));
}

async function fetchTmdb(url) {
  const result = await fetch(url, {
    headers: {
      Authorization: `Bearer ${tmdbReadAccessToken.value()}`,
      accept: "application/json",
    },
  });

  if (!result.ok) {
    throw new Error(`TMDb request failed: ${result.status}`);
  }

  return result.json();
}

function isChineseOrKoreanDrama(show) {
  return show.origin_country?.some((country) => DRAMA_COUNTRIES.has(country));
}

function rankShow(show, query) {
  const normalizedQuery = normalizeForRank(query);
  const titles = [
    show.name,
    show.original_name,
    ...(show.alternative_titles?.results || []).map((title) => title.title),
  ]
    .filter(Boolean)
    .map(normalizeForRank);
  const bestTitleScore = titles.reduce((best, title) => Math.max(best, titleMatchScore(title, normalizedQuery)), 0);
  const voteCount = Math.min(Number(show.vote_count || 0), 5000) / 5000;
  const popularity = Math.min(Number(show.popularity || 0), 250) / 250;
  const rating = Number(show.vote_average || 0) / 10;
  const episodeCount = Number(show.number_of_episodes || 0);
  const posterBoost = show.poster_path ? 0.15 : 0;
  const overviewBoost = show.overview ? 0.08 : 0;
  const fullDramaBoost = episodeCount > 1 ? 1.5 : -1.5;
  const recentBoost = Number(show.first_air_date?.slice(0, 4)) >= 2020 ? 0.6 : 0;
  const liveActionBoost = isAnimation(show) ? -4 : 1.2;

  return bestTitleScore * 10 + popularity * 4 + voteCount * 2 + rating + fullDramaBoost + recentBoost + liveActionBoost + posterBoost + overviewBoost;
}

function isAnimation(show) {
  const genres = show.genres?.length
    ? show.genres.map((genre) => normalizeForRank(genre.name))
    : normalizeTextList(show.genre_ids?.map((genreId) => TV_GENRES.get(genreId))).map(normalizeForRank);
  const keywords = (show.keywords?.results || []).map((keyword) => normalizeForRank(keyword.name));
  return [...genres, ...keywords].some((value) => value.includes("animation") || value.includes("anime"));
}

function titleMatchScore(title, query) {
  if (!query) return 0;
  if (title === query) return 4;
  if (title.startsWith(query)) return 3;
  if (title.includes(query)) return 2;
  return 0;
}

function normalizeForRank(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function stripLeadingArticle(value) {
  return normalizeForRank(value).replace(/^(the|a|an)\s+/, "");
}

function mapTmdbTvResult(show, index) {
  const genres = show.genres?.length
    ? show.genres.map((genre) => genre.name.toLowerCase())
    : normalizeTextList(show.genre_ids?.map((genreId) => TV_GENRES.get(genreId))).map((genre) => genre.toLowerCase());
  const keywordResults = show.keywords?.results || [];
  const keywordTags = keywordResults.slice(0, 5).map((keyword) => keyword.name.toLowerCase());
  const cast = show.credits?.cast?.slice(0, 3).map((person) => person.name) || [];
  const meta = normalizeTextList([
    show.origin_country?.join(", "),
    show.first_air_date?.slice(0, 4),
    show.number_of_episodes ? `${show.number_of_episodes} episodes` : "",
    show.vote_average ? `TMDb ${Number(show.vote_average).toFixed(1)}` : "",
    cast.length ? `Cast: ${cast.join(", ")}` : "",
  ]);

  return {
    id: `tmdb-tv-${show.id}`,
    title: show.name || show.original_name || "Untitled Drama",
    genres: normalizeTextList([...genres, ...keywordTags]).slice(0, 8),
    summary: stripHtml(show.overview),
    image: show.poster_path ? `${TMDB_IMAGE_BASE_URL}${show.poster_path}` : "",
    source: "TMDb",
    meta,
    colors: paletteFor(index),
  };
}

function normalizeTextList(values) {
  return [...new Set((values || []).filter(Boolean).map((value) => String(value).trim()).filter(Boolean))];
}

function mapTmdbPersonResult(person) {
  return {
    id: `tmdb-person-${person.id}`,
    name: person.name,
    image: person.profile_path ? `${TMDB_IMAGE_BASE_URL}${person.profile_path}` : "",
    knownFor: normalizeTextList((person.known_for || []).map((item) => item.name || item.title)).slice(0, 4),
    source: "TMDb",
  };
}

function stripHtml(value = "") {
  return String(value).replace(/<[^>]*>/g, "").trim() || "No description available yet.";
}

function paletteFor(index) {
  return [
    ["#197b73", "#e8b44f"],
    ["#e5484d", "#344e5c"],
    ["#623b70", "#f0c27b"],
    ["#4d6fb3", "#d59121"],
  ][index % 4];
}
