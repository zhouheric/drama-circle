import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  collection,
  doc,
  getFirestore,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const STORAGE_KEY = "drama-circle-state-v3";
const LEGACY_STORAGE_KEY = "drama-circle-state-v2";
const THEME_STORAGE_KEY = "drama-circle-theme";
const DEFAULT_CIRCLE_ID = "main";
const DEMO_USER_IDS = new Set(["maya", "jules", "nina", "sam"]);
const TITLE_SEARCH_VIEWS = new Set(["my-reviews", "matches", "friends"]);
const PROVIDER_CONFIG = {
  mdlApiKey: "",
  tmdbProxyUrl: "https://us-central1-dramacircle-aa198.cloudfunctions.net/tmdbSearch",
  tmdbPersonProxyUrl: "https://us-central1-dramacircle-aa198.cloudfunctions.net/tmdbPersonSearch",
};
const VIEW_COPY = {
  discover: {
    title: "Discover",
    description: "Find friend-approved dramas that match your taste.",
  },
  "my-reviews": {
    title: "My Reviews",
    description: "Track your ratings, statuses, and personal watch order.",
  },
  matches: {
    title: "Circle Picks",
    description: "See dramas more than one person in your circle has added.",
  },
  friends: {
    title: "Friends",
    description: "Browse each friend's list, scores, and profile picks.",
  },
};
const firebaseConfig = {
  apiKey: "AIzaSyB4UhjyM6uIejGMk8aoTjd3JEs5DxA3LDU",
  authDomain: "dramacircle-aa198.firebaseapp.com",
  projectId: "dramacircle-aa198",
  storageBucket: "dramacircle-aa198.firebasestorage.app",
  messagingSenderId: "961116973970",
  appId: "1:961116973970:web:077824c1d2e3c2607f2f4b",
  measurementId: "G-MLT1R93QS4",
};
const MDL_BASE_URL = "https://api.mydramalist.com/v1";

const catalogFallback = [
  {
    id: "alchemy-of-souls",
    title: "Alchemy of Souls",
    genres: ["fantasy", "romance"],
    summary: "Young mages become entangled with forbidden soul-shifting magic, rival families, and messy romance.",
    meta: ["South Korea", "Drama"],
    image: "",
    source: "Starter catalog",
    colors: ["#344e5c", "#e8b44f"],
  },
  {
    id: "hospital-playlist",
    title: "Hospital Playlist",
    genres: ["slice of life", "friendship"],
    summary: "Five longtime friends work through hospital life, music, love, and all the tiny ways people care for each other.",
    meta: ["South Korea", "16 episodes"],
    image: "",
    source: "Starter catalog",
    colors: ["#197b73", "#f0c27b"],
  },
  {
    id: "crash-landing-on-you",
    title: "Crash Landing on You",
    genres: ["romance", "comedy"],
    summary: "A South Korean heiress crash lands across the border and finds danger, friendship, and a very complicated love story.",
    meta: ["South Korea", "16 episodes"],
    image: "",
    source: "Starter catalog",
    colors: ["#4d6fb3", "#e5484d"],
  },
  {
    id: "weak-hero-class-1",
    title: "Weak Hero Class 1",
    genres: ["action", "school"],
    summary: "A quiet top student fights back against school violence with strategy, nerve, and a few painful friendships.",
    meta: ["South Korea", "8 episodes"],
    image: "",
    source: "Starter catalog",
    colors: ["#2d2f36", "#d59121"],
  },
  {
    id: "moving",
    title: "Moving",
    genres: ["supernatural", "family"],
    summary: "Parents with hidden powers try to protect their children from the forces that once used them.",
    meta: ["South Korea", "20 episodes"],
    image: "",
    source: "Starter catalog",
    colors: ["#623b70", "#58a4b0"],
  },
];

const seedState = {
  activeUserId: "local-user",
  users: [
    { id: "local-user", name: "You" },
  ],
  dramas: catalogFallback,
  reviews: [],
  comparisons: [],
};

let state = loadState();
const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const googleProvider = new GoogleAuthProvider();
let activeView = "discover";
let searchTerm = "";
let discoverFilters = {
  year: "any",
  episodes: "any",
  cast: "any",
  rating: "any",
};
let lookupResults = [];
let selectedDrama = null;
let lookupAbortController = null;
let lookupTimer = null;
let selectedFriendId = "";
let myReviewsMode = "cards";
let circlePicksMode = "shared";
let reviewSubmitFeedback = "";
let resetSortConfirming = false;
let draggedReviewDramaId = "";
let suppressReviewClick = false;
let firebaseUser = null;
let syncReady = false;
let syncError = "";
let syncSnapshots = {
  members: false,
  dramas: false,
  reviews: false,
  comparisons: false,
};
let syncTimer = null;
let unsubscribeMembers = null;
let unsubscribeDramas = null;
let unsubscribeReviews = null;
let unsubscribeComparisons = null;

const els = {
  authName: document.querySelector("#auth-name"),
  authDetail: document.querySelector("#auth-detail"),
  emailAuthForm: document.querySelector("#email-auth-form"),
  authDisplayName: document.querySelector("#auth-display-name"),
  authEmail: document.querySelector("#auth-email"),
  authPassword: document.querySelector("#auth-password"),
  emailSignUpButton: document.querySelector("#email-sign-up-button"),
  signInButton: document.querySelector("#sign-in-button"),
  signOutButton: document.querySelector("#sign-out-button"),
  sourceStatus: document.querySelector("#source-status"),
  tabs: document.querySelectorAll(".tab-button"),
  topbar: document.querySelector(".topbar"),
  viewTitle: document.querySelector("#view-title"),
  viewDescription: document.querySelector("#view-description"),
  viewContent: document.querySelector("#view-content"),
  viewSearch: document.querySelector("#view-search"),
  viewSearchInput: document.querySelector("#view-search-input"),
  themeToggle: document.querySelector("#theme-toggle"),
  nightModeStyles: document.querySelector("#night-mode-styles"),
  discoverFilters: document.querySelector("#discover-filters"),
  filterYear: document.querySelector("#filter-year"),
  filterEpisodes: document.querySelector("#filter-episodes"),
  filterCast: document.querySelector("#filter-cast"),
  filterRating: document.querySelector("#filter-rating"),
  lookupForm: document.querySelector("#lookup-form"),
  dramaQuery: document.querySelector("#drama-query"),
  lookupResults: document.querySelector("#lookup-results"),
  selectedDrama: document.querySelector("#selected-drama"),
  selectedDramaId: document.querySelector("#selected-drama-id"),
  selectedDramaSource: document.querySelector("#selected-drama-source"),
  reviewForm: document.querySelector("#review-form"),
  rating: document.querySelector("#rating"),
  ratingOutput: document.querySelector("#rating-output"),
  recommendation: document.querySelector("#recommendation"),
  watchStatus: document.querySelector("#watch-status"),
  reviewSubmitButton: document.querySelector("#review-submit-button"),
  personSearchForms: document.querySelectorAll(".person-search"),
  favoritePersonCurrent: document.querySelector("#favorite-person-current"),
  favoritePersonResults: document.querySelector("#favorite-person-results"),
  favoritePersonQuery: document.querySelector("#favorite-person-query"),
  hottestPersonCurrent: document.querySelector("#hottest-person-current"),
  hottestPersonResults: document.querySelector("#hottest-person-results"),
  hottestPersonQuery: document.querySelector("#hottest-person-query"),
  goatDramaCurrent: document.querySelector("#goat-drama-current"),
  goatDramaResults: document.querySelector("#goat-drama-results"),
  goatDramaQuery: document.querySelector("#goat-drama-query"),
  statDramas: document.querySelector("#stat-dramas"),
  statReviews: document.querySelector("#stat-reviews"),
  statOverlap: document.querySelector("#stat-overlap"),
  statDramasLabel: document.querySelector("#stat-dramas-label"),
  statReviewsLabel: document.querySelector("#stat-reviews-label"),
  statOverlapLabel: document.querySelector("#stat-overlap-label"),
  statsStrip: document.querySelector(".stats-strip"),
  cardTemplate: document.querySelector("#drama-card-template"),
};

function reviewSeed(id, dramaId, userId, rating, recommendation, status) {
  return {
    id,
    dramaId,
    userId,
    rating,
    recommendation,
    status,
    createdAt: "2026-04-20T10:00:00.000Z",
  };
}

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return normalizeState(JSON.parse(saved));

    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy) return normalizeState(JSON.parse(legacy));
  } catch {
    return structuredClone(seedState);
  }

  return structuredClone(seedState);
}

function normalizeState(rawState) {
  const containsDemoUsers = (rawState.users ?? []).some((user) => DEMO_USER_IDS.has(user.id));
  const fallbackById = new Map(catalogFallback.map((drama) => [drama.id, drama]));
  const dramas = (rawState.dramas ?? []).map((drama, index) => {
    const fallback = fallbackById.get(drama.id) ?? {};
    return {
      id: drama.id ?? slugify(drama.title) ?? crypto.randomUUID(),
      title: drama.title ?? "Untitled Drama",
      genres: drama.genres?.length ? drama.genres : fallback.genres ?? ["drama"],
      summary: drama.summary ?? fallback.summary ?? "No description available yet.",
      image: drama.image ?? "",
      source: drama.source ?? fallback.source ?? "Your circle",
      meta: drama.meta ?? fallback.meta ?? [],
      colors: drama.colors ?? fallback.colors ?? paletteFor(index),
    };
  });

  catalogFallback.forEach((drama) => {
    if (!dramas.some((item) => item.id === drama.id)) dramas.push(drama);
  });

  return {
    activeUserId: containsDemoUsers ? "local-user" : rawState.activeUserId ?? rawState.users?.[0]?.id ?? "local-user",
    users: containsDemoUsers || !rawState.users?.length ? structuredClone(seedState.users) : rawState.users,
    dramas,
    reviews: (rawState.reviews ?? [])
      .filter((review) => !containsDemoUsers && !DEMO_USER_IDS.has(review.userId))
      .map((review) => ({
        id: review.id ?? crypto.randomUUID(),
        dramaId: review.dramaId,
        userId: review.userId,
        rating: review.rating == null ? null : Number(review.rating),
        recommendation: review.recommendation ?? "",
        status: review.status ?? "finished",
        sortOrder: review.sortOrder ?? null,
        createdAt: review.createdAt ?? new Date().toISOString(),
      })),
    comparisons: (rawState.comparisons ?? [])
      .filter((comparison) => !containsDemoUsers && !DEMO_USER_IDS.has(comparison.userId))
      .map((comparison) => ({
        id: comparison.id ?? crypto.randomUUID(),
        userId: comparison.userId,
        dramaAId: comparison.dramaAId,
        dramaBId: comparison.dramaBId,
        winnerDramaId: comparison.winnerDramaId ?? null,
        loserDramaId: comparison.loserDramaId ?? null,
        result: comparison.result ?? "win",
        createdAt: comparison.createdAt ?? new Date().toISOString(),
      })),
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function applyTheme(theme) {
  const isNight = theme === "night";
  document.body.classList.toggle("theme-cinematic", isNight);
  if (els.nightModeStyles) els.nightModeStyles.disabled = !isNight;
  if (els.themeToggle) {
    els.themeToggle.textContent = isNight ? "Normal mode" : "Night mode";
    els.themeToggle.setAttribute("aria-pressed", String(isNight));
  }
}

function circleDoc(...segments) {
  return doc(db, "circles", DEFAULT_CIRCLE_ID, ...segments);
}

function circleCollection(...segments) {
  return collection(db, "circles", DEFAULT_CIRCLE_ID, ...segments);
}

function serializeDrama(drama) {
  return {
    title: drama.title,
    genres: drama.genres ?? [],
    summary: drama.summary ?? "",
    image: drama.image ?? "",
    source: drama.source ?? "Drama Circle",
    meta: drama.meta ?? [],
    colors: drama.colors ?? paletteFor(0),
    updatedAt: serverTimestamp(),
  };
}

function hydrateDrama(id, data, index = 0) {
  return {
    id,
    title: data.title ?? "Untitled Drama",
    genres: data.genres?.length ? data.genres : ["drama"],
    summary: data.summary ?? "No description available yet.",
    image: data.image ?? "",
    source: data.source ?? "Drama Circle",
    meta: data.meta ?? [],
    colors: data.colors ?? paletteFor(index),
  };
}

function serializeReview(review) {
  return {
    dramaId: review.dramaId,
    userId: review.userId,
    rating: review.rating == null ? null : Number(review.rating),
    recommendation: review.recommendation ?? "",
    status: review.status,
    sortOrder: review.sortOrder ?? null,
    updatedAt: serverTimestamp(),
  };
}

function hydrateReview(id, data) {
  return {
    id,
    dramaId: data.dramaId,
    userId: data.userId,
    rating: data.rating == null ? null : Number(data.rating),
    recommendation: data.recommendation ?? "",
    status: data.status ?? "finished",
    sortOrder: data.sortOrder ?? null,
    createdAt: data.updatedAt?.toDate?.().toISOString?.() ?? data.createdAt ?? new Date().toISOString(),
  };
}

function serializeComparison(comparison) {
  return {
    userId: comparison.userId,
    dramaAId: comparison.dramaAId,
    dramaBId: comparison.dramaBId,
    winnerDramaId: comparison.winnerDramaId ?? null,
    loserDramaId: comparison.loserDramaId ?? null,
    result: comparison.result ?? "win",
    updatedAt: serverTimestamp(),
  };
}

function hydrateComparison(id, data) {
  return {
    id,
    userId: data.userId,
    dramaAId: data.dramaAId,
    dramaBId: data.dramaBId,
    winnerDramaId: data.winnerDramaId ?? null,
    loserDramaId: data.loserDramaId ?? null,
    result: data.result ?? "win",
    createdAt: data.updatedAt?.toDate?.().toISOString?.() ?? data.createdAt ?? new Date().toISOString(),
  };
}

async function ensureCircleForUser(user) {
  const circleRef = doc(db, "circles", DEFAULT_CIRCLE_ID);
  await setDoc(
    circleRef,
    {
      name: "Drama Circle",
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  await setDoc(
    circleDoc("members", user.uid),
    {
      name: user.displayName || user.email || "Drama Friend",
      email: user.email ?? "",
      photoURL: user.photoURL ?? "",
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

}

function startRealtimeSync(user) {
  stopRealtimeSync();
  syncReady = false;
  syncError = "";
  syncSnapshots = {
    members: false,
    dramas: false,
    reviews: false,
    comparisons: false,
  };
  state.activeUserId = user.uid;
  render();
  window.clearTimeout(syncTimer);
  syncTimer = window.setTimeout(() => {
    if (!syncReady && !syncError) render();
  }, 5000);

  unsubscribeMembers = onSnapshot(
    circleCollection("members"),
    (snapshot) => {
      const members = snapshot.docs.map((memberDoc) => ({
        id: memberDoc.id,
        name: memberDoc.data().name ?? "Drama Friend",
        email: memberDoc.data().email ?? "",
        photoURL: memberDoc.data().photoURL ?? "",
        favoritePerson: memberDoc.data().favoritePerson ?? null,
        hottestPerson: memberDoc.data().hottestPerson ?? null,
        goatDrama: memberDoc.data().goatDrama ?? null,
        reviewOrderMode: memberDoc.data().reviewOrderMode ?? "rating",
      }));
      state.users = members.length ? members : [{ id: user.uid, name: user.displayName || user.email || "You" }];
      markSyncSnapshot("members");
    },
    handleSyncError,
  );

  unsubscribeDramas = onSnapshot(
    circleCollection("dramas"),
    (snapshot) => {
      const remoteDramas = snapshot.docs.map((dramaDoc, index) => hydrateDrama(dramaDoc.id, dramaDoc.data(), index));
      state.dramas = remoteDramas.length ? remoteDramas : structuredClone(catalogFallback);
      if (selectedDrama) {
        selectedDrama = state.dramas.find((drama) => drama.id === selectedDrama.id) ?? selectedDrama;
      }
      markSyncSnapshot("dramas");
    },
    handleSyncError,
  );

  unsubscribeReviews = onSnapshot(
    circleCollection("reviews"),
    (snapshot) => {
      state.reviews = snapshot.docs.map((reviewDoc) => hydrateReview(reviewDoc.id, reviewDoc.data()));
      saveState();
      markSyncSnapshot("reviews");
    },
    handleSyncError,
  );

  unsubscribeComparisons = onSnapshot(
    circleCollection("comparisons"),
    (snapshot) => {
      state.comparisons = snapshot.docs.map((comparisonDoc) => hydrateComparison(comparisonDoc.id, comparisonDoc.data()));
      saveState();
      markSyncSnapshot("comparisons");
    },
    handleSyncError,
  );
}

function markSyncSnapshot(key) {
  syncSnapshots[key] = true;
  syncReady = syncSnapshots.members && syncSnapshots.dramas && syncSnapshots.reviews;
  render();
}

function handleSyncError(error) {
  syncError = error.message;
  syncReady = false;
  render();
}

function stopRealtimeSync() {
  [unsubscribeMembers, unsubscribeDramas, unsubscribeReviews, unsubscribeComparisons].forEach((unsubscribe) => unsubscribe?.());
  unsubscribeMembers = null;
  unsubscribeDramas = null;
  unsubscribeReviews = null;
  unsubscribeComparisons = null;
  syncReady = false;
  syncError = "";
  window.clearTimeout(syncTimer);
}

function slugify(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function stripHtml(value = "") {
  const node = document.createElement("div");
  node.innerHTML = value;
  return node.textContent?.trim() || "No description available yet.";
}

function paletteFor(index) {
  return [
    ["#197b73", "#e8b44f"],
    ["#e5484d", "#344e5c"],
    ["#623b70", "#f0c27b"],
    ["#4d6fb3", "#d59121"],
  ][index % 4];
}

function userName(userId) {
  return state.users.find((user) => user.id === userId)?.name ?? "Friend";
}

function dramaDetailUrl(drama) {
  if (drama.id?.startsWith("tmdb-tv-")) {
    return `https://www.themoviedb.org/tv/${drama.id.replace("tmdb-tv-", "")}`;
  }
  if (drama.id?.startsWith("mdl-")) {
    return `https://mydramalist.com/${drama.id.replace("mdl-", "")}`;
  }
  return `https://www.themoviedb.org/search?query=${encodeURIComponent(drama.title)}`;
}

function goatOwnersForDrama(dramaId) {
  return state.users.filter((user) => user.goatDrama?.id === dramaId);
}

function ownerListText(owners) {
  const names = owners.map((owner) => owner.id === state.activeUserId ? "you" : owner.name);
  if (names.length === 1) return owners[0].id === state.activeUserId ? "Your GOAT drama" : `${names[0]}'s GOAT drama`;
  const joinedNames = names.length === 2 ? names.join(" and ") : `${names.slice(0, -1).join(", ")}, and ${names.at(-1)}`;
  return `GOAT drama for ${joinedNames}`;
}

function memberFor(userId) {
  return state.users.find((user) => user.id === userId) ?? null;
}

function reviewOrderModeForUser(userId) {
  return memberFor(userId)?.reviewOrderMode ?? "rating";
}

function dramaReviews(dramaId) {
  return state.reviews.filter((review) => review.dramaId === dramaId);
}

function averageRating(reviews) {
  const ratedReviews = reviews.filter((review) => review.rating != null);
  if (!ratedReviews.length) return 0;
  return ratedReviews.reduce((sum, review) => sum + Number(review.rating), 0) / ratedReviews.length;
}

function averageFriendRating(dramaId, excludingUserId = state.activeUserId) {
  const friendReviews = dramaReviews(dramaId).filter((review) => review.userId !== excludingUserId && review.rating != null);
  return friendReviews.length ? averageRating(friendReviews) : null;
}

function latestReviewForUser(dramaId, userId) {
  return state.reviews
    .filter((review) => review.dramaId === dramaId && review.userId === userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
}

function reviewsByCurrentUser() {
  return state.reviews.filter((review) => review.userId === state.activeUserId);
}

function reviewsByUser(userId) {
  return state.reviews.filter((review) => review.userId === userId);
}

function profilePickCompletion(user) {
  return [user.favoritePerson, user.hottestPerson, user.goatDrama].filter(Boolean).length;
}

function compareFriendProfiles(a, b) {
  const completionDelta = profilePickCompletion(b) - profilePickCompletion(a);
  if (completionDelta) return completionDelta;
  const dramaDelta = new Set(reviewsByUser(b.id).map((review) => review.dramaId)).size
    - new Set(reviewsByUser(a.id).map((review) => review.dramaId)).size;
  if (dramaDelta) return dramaDelta;
  return a.name.localeCompare(b.name);
}

function comparisonsByUser(userId) {
  return state.comparisons.filter((comparison) => comparison.userId === userId);
}

function comparisonKey(dramaAId, dramaBId) {
  return [dramaAId, dramaBId].sort().join("__");
}

function ratingForUserDrama(userId, dramaId) {
  const review = latestReviewForUser(dramaId, userId);
  return review?.rating == null ? null : Number(review.rating);
}

function reviewedDramasForUser(userId) {
  const dramaIds = new Set(reviewsByUser(userId).map((review) => review.dramaId));
  return state.dramas.filter((drama) => dramaIds.has(drama.id));
}

function pairwiseEligibleDramasForUser(userId) {
  const eligibleDramaIds = new Set(
    reviewsByUser(userId)
      .filter((review) => review.rating != null && review.status !== "planned" && review.status !== "watching")
      .map((review) => review.dramaId),
  );
  return state.dramas.filter((drama) => eligibleDramaIds.has(drama.id));
}

function compareBaseReviewedDramasForUser(userId) {
  return (a, b) => {
    const aReview = latestReviewForUser(a.id, userId);
    const bReview = latestReviewForUser(b.id, userId);
    const aOrder = aReview?.sortOrder;
    const bOrder = bReview?.sortOrder;
    if (reviewOrderModeForUser(userId) === "manual" && (aOrder != null || bOrder != null)) {
      return (aOrder ?? Number.MAX_SAFE_INTEGER) - (bOrder ?? Number.MAX_SAFE_INTEGER);
    }
    const aRating = aReview?.rating == null ? -1 : Number(aReview.rating);
    const bRating = bReview?.rating == null ? -1 : Number(bReview.rating);
    if (bRating !== aRating) return bRating - aRating;
    return new Date(bReview?.createdAt ?? 0) - new Date(aReview?.createdAt ?? 0);
  };
}

function compareReviewedDramasForUser(userId) {
  if (reviewOrderModeForUser(userId) === "manual") return compareBaseReviewedDramasForUser(userId);
  const comparisons = comparisonsByUser(userId);
  const dramaIds = reviewedDramasForUser(userId).map((drama) => drama.id);
  const scores = pairwiseScoresForUser(userId, dramaIds);
  return (a, b) => {
    const aRating = ratingForUserDrama(userId, a.id);
    const bRating = ratingForUserDrama(userId, b.id);
    if (aRating !== bRating) return compareBaseReviewedDramasForUser(userId)(a, b);
    if (comparisons.length && scores[b.id] !== scores[a.id]) return scores[b.id] - scores[a.id];
    return compareBaseReviewedDramasForUser(userId)(a, b);
  };
}

function pairwiseScoresForUser(userId, dramaIds) {
  const scores = Object.fromEntries(dramaIds.map((dramaId) => [dramaId, 0]));
  comparisonsByUser(userId).forEach((comparison) => {
    if (!dramaIds.includes(comparison.dramaAId) || !dramaIds.includes(comparison.dramaBId)) return;
    if (ratingForUserDrama(userId, comparison.dramaAId) !== ratingForUserDrama(userId, comparison.dramaBId)) return;
    if (comparison.result === "tie") {
      scores[comparison.dramaAId] += 0.15;
      scores[comparison.dramaBId] += 0.15;
      return;
    }
    if (comparison.winnerDramaId) scores[comparison.winnerDramaId] += 1;
    if (comparison.loserDramaId) scores[comparison.loserDramaId] -= 1;
  });
  return scores;
}

function pairwiseSortedDramasForUser(userId) {
  const dramas = reviewedDramasForUser(userId);
  const dramaIds = dramas.map((drama) => drama.id);
  const scores = pairwiseScoresForUser(userId, dramaIds);
  const comparisons = comparisonsByUser(userId);
  return dramas.sort((a, b) => {
    if (reviewOrderModeForUser(userId) === "manual") return compareBaseReviewedDramasForUser(userId)(a, b);
    const aRating = ratingForUserDrama(userId, a.id);
    const bRating = ratingForUserDrama(userId, b.id);
    if (aRating !== bRating) return compareBaseReviewedDramasForUser(userId)(a, b);
    if (comparisons.length && scores[b.id] !== scores[a.id]) return scores[b.id] - scores[a.id];
    return compareBaseReviewedDramasForUser(userId)(a, b);
  });
}

function nextPairwiseDramas(dramas) {
  if (dramas.length < 2) return null;
  const comparisons = comparisonsByUser(state.activeUserId);
  const comparedKeys = new Set(comparisons.map((comparison) => comparisonKey(comparison.dramaAId, comparison.dramaBId)));
  const comparisonCounts = Object.fromEntries(dramas.map((drama) => [drama.id, 0]));
  comparisons.forEach((comparison) => {
    if (comparisonCounts[comparison.dramaAId] != null) comparisonCounts[comparison.dramaAId] += 1;
    if (comparisonCounts[comparison.dramaBId] != null) comparisonCounts[comparison.dramaBId] += 1;
  });

  const pairs = [];
  dramas.forEach((dramaA, aIndex) => {
    dramas.slice(aIndex + 1).forEach((dramaB) => {
      if (ratingForUserDrama(state.activeUserId, dramaA.id) !== ratingForUserDrama(state.activeUserId, dramaB.id)) return;
      pairs.push({
        dramaA,
        dramaB,
        isNew: !comparedKeys.has(comparisonKey(dramaA.id, dramaB.id)),
        exposure: comparisonCounts[dramaA.id] + comparisonCounts[dramaB.id],
      });
    });
  });

  if (!pairs.length) return null;
  return pairs.sort((a, b) => Number(b.isNew) - Number(a.isNew) || a.exposure - b.exposure)[0] ?? null;
}

function dramasMatchingSearch(dramas) {
  const term = titleSearchIsActive() ? searchTerm.trim().toLowerCase() : "";
  if (!term) return dramas;

  return dramas.filter((drama) => {
    return drama.title.toLowerCase().includes(term);
  });
}

function titleSearchIsActive() {
  if (activeView === "my-reviews" && myReviewsMode === "pairwise") return false;
  return TITLE_SEARCH_VIEWS.has(activeView);
}

function dramaYear(drama) {
  const yearText = [...(drama.meta ?? []), drama.summary].join(" ").match(/\b(19|20)\d{2}\b/)?.[0];
  return yearText ? Number(yearText) : null;
}

function dramaEpisodeCount(drama) {
  const episodeText = (drama.meta ?? []).find((value) => /episode/i.test(value));
  return episodeText?.match(/\d+/) ? Number(episodeText.match(/\d+/)[0]) : null;
}

function castPickCounts(drama) {
  return (drama.meta ?? []).reduce((counts, value) => {
    const match = castPickMatch(value);
    counts.favorite += match.favorite.length;
    counts.hottest += match.hottest.length;
    return counts;
  }, { favorite: 0, hottest: 0 });
}

function discoverItemMatchesFilters(item) {
  const year = dramaYear(item.drama);
  const episodeCount = dramaEpisodeCount(item.drama);

  if (discoverFilters.year === "new" && (!year || year < 2023)) return false;
  if (discoverFilters.year === "recent" && (!year || year < 2020 || year > 2022)) return false;
  if (discoverFilters.year === "older" && (!year || year >= 2020)) return false;

  if (discoverFilters.episodes === "short" && (!episodeCount || episodeCount > 12)) return false;
  if (discoverFilters.episodes === "standard" && (!episodeCount || episodeCount < 13 || episodeCount > 24)) return false;
  if (discoverFilters.episodes === "long" && (!episodeCount || episodeCount < 25)) return false;

  const castCounts = castPickCounts(item.drama);
  if (discoverFilters.cast === "hot" && castCounts.hottest < 1) return false;
  if (discoverFilters.cast === "favorite" && castCounts.favorite < 1) return false;
  if (discoverFilters.cast === "pick" && castCounts.hottest + castCounts.favorite < 1) return false;
  if (discoverFilters.rating !== "any" && item.average < Number(discoverFilters.rating)) return false;

  return true;
}

function recommendationLabel(value) {
  return {
    "": "No recommendation",
    "must-watch": "Must watch",
    "worth-it": "Worth it",
    mixed: "Mixed feelings",
    skip: "Skip",
  }[value];
}

function statusLabel(value) {
  return {
    finished: "Finished",
    watching: "Still watching",
    dropped: "Dropped",
    planned: "Planned",
  }[value];
}

function consensusText(drama, reviews) {
  if (!reviews.length) return `${drama.summary} Be the first in your circle to rate it.`;
  const ratedReviews = reviews.filter((review) => review.rating != null);
  const avg = ratedReviews.length ? averageRating(ratedReviews).toFixed(1) : "N/A";
  const mustWatchCount = reviews.filter((review) => review.recommendation === "must-watch").length;
  return `${drama.summary} Circle average: ${avg}. ${mustWatchCount} friend${mustWatchCount === 1 ? "" : "s"} marked it must-watch.`;
}

function reviewReadout(review, ownerName = "You") {
  const status = statusLabel(review.status).toLowerCase();
  const rec = recommendationLabel(review.recommendation).toLowerCase();
  if (review.status === "planned") return `${ownerName} plans to watch this.`;
  if (review.rating == null && review.recommendation) return `${ownerName} is ${status} and marked it ${rec}.`;
  if (review.rating == null) return `${ownerName} is ${status}.`;
  if (!review.recommendation) return `${ownerName} scored it ${Number(review.rating).toFixed(1)} and marked it ${status}.`;
  return `${ownerName} scored it ${Number(review.rating).toFixed(1)}, marked it ${status}, and called it ${rec}.`;
}

function ordinal(value) {
  const suffix = value % 100 >= 11 && value % 100 <= 13
    ? "th"
    : { 1: "st", 2: "nd", 3: "rd" }[value % 10] ?? "th";
  return `${value}${suffix}`;
}

function reviewTagText(review, ownerName, rank) {
  const score = review.rating == null ? "No score" : Number(review.rating).toFixed(1);
  const rankText = rank == null ? "Unranked" : `Rank ${ordinal(rank)}`;
  return `${ownerName} · ${score} · ${rankText} · ${statusLabel(review.status)}`;
}

function consensusRecommendation(reviews) {
  const value = consensusRecommendationValue(reviews);
  return value ? recommendationLabel(value) : "No consensus";
}

function consensusRecommendationValue(reviews) {
  const counts = reviews.reduce((totals, review) => {
    if (!review.recommendation) return totals;
    totals[review.recommendation] = (totals[review.recommendation] ?? 0) + 1;
    return totals;
  }, {});
  const [value] = Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || recommendationRankWeight(b[0]) - recommendationRankWeight(a[0]))[0] ?? [];
  return value ?? "";
}

function recommendationRankWeight(value) {
  return {
    "must-watch": 0.62,
    "worth-it": 0.34,
    mixed: 0.04,
    skip: -0.45,
  }[value] ?? 0;
}

function renderTagList(target, values, limit = 6, highlightCastPicks = false) {
  target.replaceChildren();
  target.classList.add("tag-row");
  normalizeTextList(values).slice(0, limit).forEach((value) => {
    const chip = document.createElement("span");
    chip.className = "tag-chip";
    chip.dataset.tone = tagTone(value);
    if (highlightCastPicks) {
      const castMatch = castPickMatch(value);
      chip.classList.toggle("has-hot-cast", castMatch.hottest.length > 0);
      chip.classList.toggle("has-favorite-cast", castMatch.favorite.length > 0);
      if (castMatch.hottest.length || castMatch.favorite.length) {
        chip.title = [
          ...castMatch.favorite.map((match) => `${match.userName}'s fav ${match.personName}`),
          ...castMatch.hottest.map((match) => `${match.userName}'s roman empire ${match.personName}`),
        ].filter(Boolean).join(" / ");
      }
    }
    chip.textContent = value;
    target.append(chip);
  });
}

function castPickMatch(value) {
  const normalized = String(value).trim();
  if (!normalized.toLowerCase().startsWith("cast:")) return { favorite: [], hottest: [] };
  const castNames = new Set(normalized
    .replace(/^cast:\s*/i, "")
    .split(",")
    .map(normalizePersonName)
    .filter(Boolean));
  const favorite = [];
  const hottest = [];

  state.users.forEach((user) => {
    const favoriteName = normalizePersonName(user.favoritePerson?.name);
    const hottestName = normalizePersonName(user.hottestPerson?.name);
    if (favoriteName && castNames.has(favoriteName)) favorite.push({ userName: user.name, personName: user.favoritePerson.name });
    if (hottestName && castNames.has(hottestName)) hottest.push({ userName: user.name, personName: user.hottestPerson.name });
  });

  return {
    favorite: favorite.filter((match, index, matches) => matches.findIndex((item) => item.userName === match.userName && item.personName === match.personName) === index),
    hottest: hottest.filter((match, index, matches) => matches.findIndex((item) => item.userName === match.userName && item.personName === match.personName) === index),
  };
}

function normalizePersonName(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function tagTone(value) {
  const normalized = String(value).toLowerCase();
  if (["kr", "south korea", "korea", "cn", "china", "chinese", "taiwan", "hong kong"].some((term) => normalized.includes(term))) return "slate";
  if (["romance", "comedy"].some((term) => normalized.includes(term))) return "rose";
  if (["thriller", "mystery", "crime", "action"].some((term) => normalized.includes(term))) return "blue";
  if (["fantasy", "supernatural", "historical"].some((term) => normalized.includes(term))) return "violet";
  if (["friendship", "family", "slice"].some((term) => normalized.includes(term))) return "gold";
  return "slate";
}

function recommendationTone(value) {
  return {
    "must-watch": "must",
    "worth-it": "worth",
    mixed: "mixed",
    skip: "skip",
    "": "none",
  }[value] ?? "none";
}

function statusTone(value) {
  return {
    finished: "finished",
    watching: "watching",
    dropped: "dropped",
    planned: "planned",
  }[value] ?? "planned";
}

function userTone(userId) {
  const tones = ["mint", "rose", "blue", "violet", "coral", "sky", "olive", "plum", "cyan", "slate"];
  const hash = String(userId || "")
    .split("")
    .reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return tones[hash % tones.length];
}

function renderAuthControls() {
  if (firebaseUser) {
    els.authName.textContent = firebaseUser.displayName || firebaseUser.email || "Signed in";
    const streamStatus = Object.entries(syncSnapshots)
      .map(([key, connected]) => `${key} ${connected ? "ok" : "..."}`)
      .join(" · ");
    els.authDetail.textContent = syncError || (syncReady
      ? `Realtime sync is on. ${streamStatus}`
      : `Connecting to your circle... ${streamStatus}`);
  } else {
    els.authName.textContent = "Not signed in";
    els.authDetail.textContent = "Sign in to sync ratings with your circle.";
  }

  els.signInButton.classList.toggle("is-hidden", Boolean(firebaseUser));
  els.emailAuthForm.classList.toggle("is-hidden", Boolean(firebaseUser));
  els.signOutButton.classList.toggle("is-hidden", !firebaseUser);
}

function renderProfilePicks() {
  const currentMember = memberFor(state.activeUserId);
  renderCurrentPick(els.favoritePersonCurrent, currentMember?.favoritePerson, "No favorite selected");
  renderCurrentPick(els.hottestPersonCurrent, currentMember?.hottestPerson, "No hottest pick selected");
  renderCurrentPick(els.goatDramaCurrent, currentMember?.goatDrama, "No GOAT drama selected");
  togglePickSelection(els.favoritePersonCurrent.closest(".person-search"), Boolean(currentMember?.favoritePerson));
  togglePickSelection(els.hottestPersonCurrent.closest(".person-search"), Boolean(currentMember?.hottestPerson));
  togglePickSelection(els.goatDramaCurrent.closest(".person-search"), Boolean(currentMember?.goatDrama));
}

function togglePickSelection(form, hasSelection) {
  if (!form) return;
  form.classList.toggle("has-selection", hasSelection);
  form.classList.remove("is-editing");
}

function renderCurrentPick(target, person, emptyText) {
  target.replaceChildren();
  target.classList.toggle("is-empty", !person);
  if (!person) {
    target.textContent = emptyText;
    return;
  }

  const avatar = document.createElement("span");
  const text = document.createElement("span");
  const name = document.createElement("strong");
  const knownFor = document.createElement("small");
  const changeButton = document.createElement("button");

  avatar.className = "person-avatar";
  avatar.style.backgroundImage = person.image ? `url("${person.image}")` : "";
  name.textContent = person.name ?? person.title;
  knownFor.textContent = person.knownFor?.length
    ? person.knownFor.join(", ")
    : [...(person.meta ?? []), ...(person.genres ?? [])].slice(0, 3).join(" · ") || (person.source ?? "TMDb");
  changeButton.type = "button";
  changeButton.className = "change-pick";
  changeButton.dataset.action = "change-person-pick";
  changeButton.textContent = "Change";
  text.append(name, knownFor, changeButton);
  target.append(avatar, text);
}

function likedTagSet() {
  const tags = new Set();
  reviewsByCurrentUser()
    .filter((review) => review.rating != null && review.rating >= 8 && review.recommendation !== "skip" && review.status !== "dropped")
    .forEach((review) => {
      const drama = state.dramas.find((item) => item.id === review.dramaId);
      drama?.genres.forEach((genre) => tags.add(genre));
    });
  return tags;
}

function discoverSummary(item) {
  const ratedReviews = item.reviews.filter((review) => review.rating != null);
  const count = ratedReviews.length;
  const average = count ? averageRating(ratedReviews).toFixed(1) : "N/A";
  const high = count ? ratedReviews.slice().sort((a, b) => Number(b.rating) - Number(a.rating))[0] : null;
  const low = count ? ratedReviews.slice().sort((a, b) => Number(a.rating) - Number(b.rating))[0] : null;
  const scoreLine = count
    ? `Your friends average ${average} across ${count} rating${count === 1 ? "" : "s"}.`
    : "No friend scores yet, but it matches your taste profile.";
  const rangeLine = high && low && high.userId !== low.userId
    ? `${userName(high.userId)} is highest at ${Number(high.rating).toFixed(1)}; ${userName(low.userId)} is lowest at ${Number(low.rating).toFixed(1)}.`
    : high
      ? `${userName(high.userId)} rated it ${Number(high.rating).toFixed(1)}.`
      : "";
  const tagLine = item.tagOverlap.length
    ? `Taste match: ${item.tagOverlap.join(", ")}.`
    : "";
  return [scoreLine, rangeLine, tagLine].filter(Boolean).join(" ");
}

function discoverRankFor(drama, likedTags) {
  const reviews = dramaReviews(drama.id).filter((review) => review.userId !== state.activeUserId);
  const ratedReviews = reviews.filter((review) => review.rating != null);
  const reviewerCount = new Set(reviews.map((review) => review.userId)).size;
  const goatCount = goatOwnersForDrama(drama.id).filter((owner) => owner.id !== state.activeUserId).length;
  const tagOverlap = drama.genres.filter((genre) => likedTags.has(genre));
  const average = ratedReviews.length ? averageRating(ratedReviews) : 0;
  const consensusValue = consensusRecommendationValue(reviews);
  const volumeBoost = reviewerCount * 1.6;
  const goatBoost = goatCount * 2.4;
  const ratingBoost = average * 0.28;
  const statusBoost = reviews.filter((review) => review.status === "finished" || review.status === "watching").length * 0.14;
  const recBoost = reviews.reduce((total, review) => total + recommendationRankWeight(review.recommendation), 0);
  const consensusBoost = recommendationRankWeight(consensusValue) * 1.25;
  const tagTieBreaker = tagOverlap.length * 0.18;

  return {
    drama,
    reviews,
    ratedReviews,
    reviewerCount,
    goatCount,
    tagOverlap,
    average,
    consensusValue,
    score: volumeBoost + goatBoost + ratingBoost + statusBoost + recBoost + consensusBoost + tagTieBreaker,
  };
}

function renderStats() {
  const shouldShowStats = activeView === "my-reviews";
  els.statsStrip.classList.toggle("is-hidden", !shouldShowStats);
  if (!shouldShowStats) return;

  const userReviews = reviewsByUser(state.activeUserId);
  const reviewedDramaIds = new Set(userReviews.map((review) => review.dramaId));
  const sharedCount = [...reviewedDramaIds].filter((dramaId) => {
    const reviewers = new Set(dramaReviews(dramaId).map((review) => review.userId));
    return reviewers.size > 1;
  }).length;
  const ratedReviews = userReviews.filter((review) => review.rating != null);
  const avgRating = ratedReviews.length ? averageRating(ratedReviews).toFixed(1) : "N/A";

  els.statDramas.textContent = reviewedDramaIds.size;
  els.statReviews.textContent = avgRating;
  els.statOverlap.textContent = sharedCount;
  els.statDramasLabel.textContent = "Dramas reviewed";
  els.statReviewsLabel.textContent = "Average score";
  els.statOverlapLabel.textContent = "Shared with friends";
}

function renderPoster(target, drama) {
  target.style.setProperty("--poster-a", drama.colors?.[0] ?? "#197b73");
  target.style.setProperty("--poster-b", drama.colors?.[1] ?? "#d59121");
  target.style.backgroundImage = drama.image
    ? `linear-gradient(180deg, rgba(0, 0, 0, 0), rgba(0, 0, 0, 0.32)), url("${drama.image}")`
    : "";
  target.classList.toggle("has-image", Boolean(drama.image));
}

function renderDramaCard(drama, options = {}) {
  const card = els.cardTemplate.content.firstElementChild.cloneNode(true);
  const reviews = dramaReviews(drama.id).sort((a, b) => Number(b.rating ?? -1) - Number(a.rating ?? -1));
  const ratedReviews = reviews.filter((review) => review.rating != null);
  const currentReview = latestReviewForUser(drama.id, state.activeUserId);
  const goatOwners = goatOwnersForDrama(drama.id);
  const poster = card.querySelector(".poster");

  card.classList.toggle("is-compact-scan", Boolean(options.compactCard));
  card.classList.toggle("has-centered-title", Boolean(options.centerTitle));
  if (options.rankLabel) {
    const rankBadge = document.createElement("span");
    rankBadge.className = "recommendation-rank";
    rankBadge.textContent = options.rankLabel;
    card.append(rankBadge);
  }
  renderPoster(poster, drama);
  const genres = card.querySelector(".genres");
  renderTagList(genres, [...(drama.meta ?? []), ...drama.genres], 5, options.highlightCastPicks);
  card.querySelector("h3").textContent = drama.title;
  const scorePill = card.querySelector(".score-pill");
  scorePill.textContent = options.scoreLabel ?? (ratedReviews.length ? averageRating(ratedReviews).toFixed(1) : "New");
  if (options.scoreSubLabel) {
    const subLabel = document.createElement("small");
    scorePill.classList.add("has-sub-label");
    subLabel.textContent = options.scoreSubLabel;
    scorePill.append(subLabel);
  }
  const consensus = card.querySelector(".consensus");
  consensus.textContent = options.detailText ?? consensusText(drama, reviews);
  consensus.classList.toggle("is-empty", !consensus.textContent);
  if (goatOwners.length && !options.hideGoatCallout) {
    const goatCallout = document.createElement("p");
    goatCallout.className = options.moveGoatCalloutToCorner
      ? "goat-callout goat-corner-tag"
      : options.moveGoatCalloutToTags
        ? `goat-callout goat-tag-chip${options.largeTagGoatCallout ? " is-large" : ""}`
        : "goat-callout";
    goatCallout.textContent = ownerListText(goatOwners);
    card.classList.add("is-goat-drama");
    if (options.moveGoatCalloutToCorner) {
      card.append(goatCallout);
    } else if (options.moveGoatCalloutToTags) {
      genres.append(goatCallout);
    } else {
      card.querySelector(".card-body").insertBefore(goatCallout, card.querySelector(".review-row"));
    }
  }

  const reviewRow = card.querySelector(".review-row");
  if (options.showDetails) {
    reviewRow.className = "review-grid";
    reviews.forEach((review) => {
      const detail = document.createElement("article");
      detail.className = "review-detail";
      const rating = document.createElement("strong");
      const meta = document.createElement("div");
      const rec = document.createElement("span");
      const status = document.createElement("span");
      rating.textContent = reviewReadout(review, userName(review.userId));
      if (options.compactDetails) {
        const score = review.rating == null ? "No score" : Number(review.rating).toFixed(1);
        rating.textContent = `${userName(review.userId)} · ${score}`;
      }
      meta.className = "review-meta";
      rec.className = "rec-pill";
      status.className = "status-pill";
      rec.dataset.tone = recommendationTone(review.recommendation);
      status.dataset.tone = statusTone(review.status);
      rec.textContent = recommendationLabel(review.recommendation);
      status.textContent = statusLabel(review.status);
      meta.append(rec, status);
      detail.append(rating, meta);
      reviewRow.append(detail);
    });
  } else {
    if (options.featuredReview) {
      const featured = document.createElement("span");
      featured.className = "friend-rating is-featured-rank";
      featured.dataset.tone = userTone(options.featuredReview.review.userId);
      featured.textContent = reviewTagText(
        options.featuredReview.review,
        options.featuredReview.ownerName,
        options.featuredReview.rank,
      );
      reviewRow.append(featured);
    }
    if (!options.hidePeerRatings) {
      reviews.forEach((review) => {
        if (options.featuredReview?.review.userId === review.userId) return;
        const pill = document.createElement("span");
        pill.className = "friend-rating";
        pill.dataset.tone = userTone(review.userId);
        pill.textContent = `${userName(review.userId)} ${review.rating == null ? "No score" : Number(review.rating).toFixed(1)} · ${statusLabel(review.status)}`;
        reviewRow.append(pill);
      });
    }
  }

  if (currentReview) card.dataset.reviewedByMe = "true";
  if (options.linkToDetails) {
    card.classList.add("is-clickable");
    card.tabIndex = 0;
    card.role = "link";
    card.dataset.action = "open-drama-link";
    card.dataset.href = dramaDetailUrl(drama);
    card.ariaLabel = `Open more information for ${drama.title}`;
    card.title = `Open ${drama.source === "MyDramaList" ? "MyDramaList" : "TMDb"} page`;
  }
  if (options.action === "edit-review") {
    card.classList.add("is-clickable");
    card.tabIndex = 0;
    card.role = "button";
    card.dataset.action = "edit-review";
    card.dataset.dramaId = drama.id;
    card.ariaLabel = `Edit your review for ${drama.title}`;
  }
  if (options.draggable) {
    card.classList.add("is-draggable");
    card.draggable = true;
    card.title = "Drag to reorder your reviews";
  }
  return card;
}

function renderEmpty(message) {
  const empty = document.createElement("div");
  empty.className = "empty-state";
  empty.textContent = message;
  els.viewContent.replaceChildren(empty);
}

function setViewHeader(view) {
  const copy = VIEW_COPY[view] ?? VIEW_COPY.discover;
  els.viewTitle.textContent = copy.title;
  els.viewDescription.textContent = copy.description;
}

function renderMyReviewsToolbar(dramaCount) {
  const toolbar = document.createElement("div");
  const modeGroup = document.createElement("div");
  const cardsButton = document.createElement("button");
  const pairwiseButton = document.createElement("button");
  const status = document.createElement("p");
  const resetButton = document.createElement("button");

  toolbar.className = "list-toolbar review-mode-toolbar";
  modeGroup.className = "segmented-control";
  cardsButton.type = "button";
  pairwiseButton.type = "button";
  cardsButton.dataset.mode = "cards";
  pairwiseButton.dataset.mode = "pairwise";
  cardsButton.className = myReviewsMode === "cards" ? "active" : "";
  pairwiseButton.className = myReviewsMode === "pairwise" ? "active" : "";
  cardsButton.textContent = "Cards";
  pairwiseButton.textContent = "Pairwise";
  status.className = "pairwise-status";
  status.textContent = "Default ranking is rating high to low. Pairwise only breaks ties between dramas with the same score; drag cards anytime to override the full order.";
  resetButton.type = "button";
  resetButton.className = "reset-sort-button";
  resetButton.dataset.action = "reset-sort";
  resetButton.classList.toggle("is-confirming", resetSortConfirming);
  resetButton.textContent = resetSortConfirming ? "Confirm reset" : "Reset sort";

  modeGroup.append(cardsButton, pairwiseButton);
  toolbar.append(modeGroup, status, resetButton);
  return toolbar;
}

function renderPairwisePanel(dramas) {
  const panel = document.createElement("section");
  panel.className = "pairwise-panel";

  if (dramas.length < 2) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "Add at least two reviewed dramas before using pairwise ranking.";
    panel.append(empty);
    return panel;
  }

  const pair = nextPairwiseDramas(dramas);
  if (!pair) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "Finished!";
    panel.append(empty);
    return panel;
  }
  const heading = document.createElement("div");
  const eyebrow = document.createElement("p");
  const title = document.createElement("h3");
  const matchup = document.createElement("div");
  const actions = document.createElement("div");
  const tieButton = document.createElement("button");
  const skipButton = document.createElement("button");

  heading.className = "pairwise-heading";
  eyebrow.className = "eyebrow";
  eyebrow.textContent = "Pairwise ranking";
  title.textContent = "Which did you like more?";
  heading.append(eyebrow, title);

  matchup.className = "pairwise-matchup";
  matchup.append(
    renderPairwiseChoice(pair.dramaA, pair.dramaB, "left"),
    renderPairwiseChoice(pair.dramaB, pair.dramaA, "right"),
  );

  actions.className = "pairwise-actions";
  tieButton.type = "button";
  skipButton.type = "button";
  tieButton.dataset.action = "pairwise-tie";
  skipButton.dataset.action = "pairwise-skip";
  tieButton.dataset.dramaAId = pair.dramaA.id;
  tieButton.dataset.dramaBId = pair.dramaB.id;
  skipButton.dataset.dramaAId = pair.dramaA.id;
  skipButton.dataset.dramaBId = pair.dramaB.id;
  tieButton.textContent = "Same tier";
  skipButton.textContent = "Skip";
  actions.append(tieButton, skipButton);

  panel.append(heading, matchup, actions);
  return panel;
}

function renderPairwiseChoice(drama, opponent, side) {
  const choice = document.createElement("article");
  const poster = document.createElement("div");
  const body = document.createElement("div");
  const meta = document.createElement("p");
  const title = document.createElement("h3");
  const review = latestReviewForUser(drama.id, state.activeUserId);
  const score = scoreMetric("Your score", review?.rating == null ? "No score" : Number(review.rating).toFixed(1));

  choice.className = "pairwise-choice";
  choice.dataset.side = side;
  choice.dataset.action = "pairwise-pick";
  choice.dataset.winnerId = drama.id;
  choice.dataset.loserId = opponent.id;
  choice.tabIndex = 0;
  choice.role = "button";
  choice.ariaLabel = `Choose ${drama.title} over ${opponent.title}`;
  poster.className = "poster";
  renderPoster(poster, drama);
  body.className = "pairwise-choice-body";
  meta.className = "genres";
  renderTagList(meta, [...(drama.meta ?? []), ...drama.genres], 4);
  title.textContent = drama.title;
  body.append(meta, title, score);
  choice.append(poster, body);
  return choice;
}

function renderDiscover() {
  setViewHeader("discover");
  const myReviewedIds = new Set(reviewsByCurrentUser().map((review) => review.dramaId));
  const likedTags = likedTagSet();
  const ranked = state.dramas
    .filter((drama) => !myReviewedIds.has(drama.id))
    .map((drama) => discoverRankFor(drama, likedTags))
    .filter((item) => item.ratedReviews.length > 0 || item.tagOverlap.length > 0 || item.reviews.length > 0 || item.goatCount > 0)
    .filter(discoverItemMatchesFilters)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.reviewerCount !== a.reviewerCount) return b.reviewerCount - a.reviewerCount;
      if (b.goatCount !== a.goatCount) return b.goatCount - a.goatCount;
      const consensusDelta = recommendationRankWeight(b.consensusValue) - recommendationRankWeight(a.consensusValue);
      if (consensusDelta) return consensusDelta;
      if (b.average !== a.average) return b.average - a.average;
      return b.tagOverlap.length - a.tagOverlap.length;
    });
  const dramas = dramasMatchingSearch(ranked.map((item) => item.drama));

  if (!dramas.length) {
    renderEmpty("No recommendations match those filters yet.");
    return;
  }

  els.viewContent.replaceChildren(
    ...dramas.map((drama, index) => {
      const item = ranked.find((rankedItem) => rankedItem.drama.id === drama.id);
      return renderDramaCard(drama, {
        linkToDetails: true,
        highlightCastPicks: true,
        rankLabel: `#${index + 1}`,
        moveGoatCalloutToTags: true,
        centerTitle: true,
        scoreLabel: item.ratedReviews.length ? item.average.toFixed(1) : "Taste",
        scoreSubLabel: consensusRecommendation(item.reviews),
        detailText: discoverSummary(item),
      });
    }),
  );
}

function renderMyReviews() {
  setViewHeader("my-reviews");
  const allDramas = pairwiseSortedDramasForUser(state.activeUserId);
  const rankByDramaId = new Map(allDramas.map((drama, index) => [drama.id, index + 1]));
  const dramas = dramasMatchingSearch(allDramas);

  if (!dramas.length) {
    renderEmpty(searchTerm.trim()
      ? "No reviewed drama titles match that search."
      : "You have not reviewed a matching drama yet. Use the review form above to build your list.");
    return;
  }

  const toolbar = renderMyReviewsToolbar(allDramas.length);
  if (myReviewsMode === "pairwise") {
    els.viewContent.replaceChildren(toolbar, renderPairwisePanel(pairwiseEligibleDramasForUser(state.activeUserId)));
    return;
  }

  els.viewContent.replaceChildren(
    toolbar,
    ...dramas.map((drama) => {
      const review = latestReviewForUser(drama.id, state.activeUserId);
      const ownScore = review.rating == null ? "No score" : Number(review.rating).toFixed(1);
      return renderDramaCard(drama, {
        action: "edit-review",
        draggable: true,
        compactCard: true,
        centerTitle: true,
        hideGoatCallout: true,
        scoreLabel: ownScore,
        scoreSubLabel: recommendationLabel(review.recommendation),
        featuredReview: {
          review,
          ownerName: "You",
          rank: rankByDramaId.get(drama.id),
        },
        hidePeerRatings: true,
        detailText: "",
      });
    }),
  );
}

function renderMatches() {
  setViewHeader("matches");
  const toolbar = renderCirclePicksToolbar();
  const dramas = dramasMatchingSearch(state.dramas.filter(circlePickModeFilter)).sort(compareCirclePickDramas);

  if (!dramas.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = searchTerm.trim()
      ? "No circle pick titles match that search."
      : circlePicksEmptyText();
    els.viewContent.replaceChildren(toolbar, empty);
    return;
  }

  els.viewContent.replaceChildren(
    toolbar,
    ...dramas.map((drama) => {
      const reviews = dramaReviews(drama.id);
      return renderDramaCard(drama, {
        linkToDetails: true,
        highlightCastPicks: true,
        showDetails: true,
        compactDetails: true,
        compactCard: true,
        moveGoatCalloutToTags: true,
        scoreLabel: reviews.some((review) => review.rating != null) ? averageRating(reviews).toFixed(1) : "N/A",
        scoreSubLabel: consensusRecommendation(reviews),
        detailText: "",
      });
    }),
  );
}

function renderCirclePicksToolbar() {
  const toolbar = document.createElement("div");
  const modeGroup = document.createElement("div");
  const modes = [
    ["shared", "Shared"],
    ["all", "All"],
    ["singles", "Singles"],
  ];

  toolbar.className = "list-toolbar circle-picks-toolbar";
  modeGroup.className = "segmented-control";
  modes.forEach(([mode, label]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.circleMode = mode;
    button.className = circlePicksMode === mode ? "active" : "";
    button.textContent = label;
    modeGroup.append(button);
  });
  toolbar.append(modeGroup);
  return toolbar;
}

function circlePickModeFilter(drama) {
  const reviewerCount = new Set(dramaReviews(drama.id).map((review) => review.userId)).size;
  if (circlePicksMode === "singles") return reviewerCount === 1;
  if (circlePicksMode === "all") return reviewerCount > 0;
  return reviewerCount > 1;
}

function circlePicksEmptyText() {
  if (circlePicksMode === "all") return "No friend reviews yet.";
  if (circlePicksMode === "singles") return "No single-review dramas yet.";
  return "No shared picks yet. Once two or more people review the same drama, it will show up here.";
}

function compareCirclePickDramas(a, b) {
  const aRated = dramaReviews(a.id).filter((review) => review.rating != null);
  const bRated = dramaReviews(b.id).filter((review) => review.rating != null);
  const aReviewerCount = new Set(dramaReviews(a.id).map((review) => review.userId)).size;
  const bReviewerCount = new Set(dramaReviews(b.id).map((review) => review.userId)).size;
  const aAverage = aRated.length ? averageRating(aRated) : -1;
  const bAverage = bRated.length ? averageRating(bRated) : -1;
  if (bReviewerCount !== aReviewerCount) return bReviewerCount - aReviewerCount;
  if (bAverage !== aAverage) return bAverage - aAverage;
  if (bRated.length !== aRated.length) return bRated.length - aRated.length;
  const reviewDelta = dramaReviews(b.id).length - dramaReviews(a.id).length;
  if (reviewDelta) return reviewDelta;
  return a.title.localeCompare(b.title);
}

function renderFriendList() {
  setViewHeader("friends");
  const reviewedProfiles = state.users.filter((user) => reviewsByUser(user.id).length > 0).sort(compareFriendProfiles);
  if (!reviewedProfiles.length) {
    renderEmpty("No reviewed profiles yet. Add a review, then profiles with drama lists will show up here.");
    return;
  }

  if (!selectedFriendId || !reviewedProfiles.some((profile) => profile.id === selectedFriendId)) {
    selectedFriendId = reviewedProfiles.find((profile) => profile.id === state.activeUserId)?.id ?? reviewedProfiles[0].id;
  }

  const toolbar = document.createElement("div");
  const label = document.createElement("label");
  const select = document.createElement("select");

  toolbar.className = "list-toolbar";
  label.textContent = "Browse a profile";
  label.className = "field-label";
  select.id = "friend-list-select";
  reviewedProfiles.forEach((friend) => {
    const option = document.createElement("option");
    option.value = friend.id;
    option.textContent = friend.name;
    select.append(option);
  });
  select.value = selectedFriendId;
  label.append(select);
  toolbar.append(label);

  select.addEventListener("change", () => {
    selectedFriendId = select.value;
    render();
  });

  const selectedFriend = state.users.find((user) => user.id === selectedFriendId);
  const friendReviews = reviewsByUser(selectedFriendId);
  const friendReviewIds = new Set(friendReviews.map((review) => review.dramaId));
  const rankedFriendDramas = state.dramas.filter((drama) => friendReviewIds.has(drama.id)).sort(compareReviewedDramasForUser(selectedFriendId));
  const rankByDramaId = new Map(rankedFriendDramas.map((drama, index) => [drama.id, index + 1]));
  const dramas = dramasMatchingSearch(rankedFriendDramas);
  const profile = renderFriendProfile(selectedFriend, friendReviews);
  const profileStats = renderFriendStats(friendReviews, selectedFriendId);

  if (!dramas.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = searchTerm.trim()
      ? `No drama titles in ${selectedFriend?.name ?? "this profile"}'s list match that search.`
      : `${selectedFriend?.name ?? "This friend"} has not reviewed a matching drama yet.`;
    els.viewContent.replaceChildren(toolbar, profile, profileStats, empty);
    return;
  }

  els.viewContent.replaceChildren(
    toolbar,
    profile,
    profileStats,
    ...dramas.map((drama) => {
      const review = latestReviewForUser(drama.id, selectedFriendId);
      return renderDramaCard(drama, {
        linkToDetails: true,
        highlightCastPicks: true,
        compactCard: true,
        centerTitle: true,
        scoreLabel: review.rating == null ? "No score" : Number(review.rating).toFixed(1),
        scoreSubLabel: recommendationLabel(review.recommendation),
        moveGoatCalloutToCorner: true,
        featuredReview: {
          review,
          ownerName: selectedFriend.name,
          rank: rankByDramaId.get(drama.id),
        },
        detailText: "",
      });
    }),
  );
}

function renderFriendProfile(friend, reviews) {
  const profile = document.createElement("section");
  const header = document.createElement("div");
  const eyebrow = document.createElement("p");
  const name = document.createElement("h3");
  const picks = renderFriendPicks(friend);

  profile.className = "friend-profile";
  header.className = "friend-profile-heading";
  eyebrow.className = "eyebrow";
  eyebrow.textContent = friend?.id === state.activeUserId ? "Your profile" : "Friend profile";
  name.textContent = friend?.name ?? "Friend";
  header.append(eyebrow, name);

  profile.append(header, picks);
  return profile;
}

function renderFriendStats(reviews, profileUserId) {
  const stats = document.createElement("section");
  const ratedReviews = reviews.filter((review) => review.rating != null);
  const reviewedDramaIds = new Set(reviews.map((review) => review.dramaId));
  const sharedCount = [...reviewedDramaIds].filter((dramaId) =>
    dramaReviews(dramaId).some((review) => review.userId !== profileUserId),
  ).length;

  stats.className = "friend-stats-strip";
  stats.append(
    profileMetric(reviewedDramaIds.size, "Dramas reviewed"),
    profileMetric(ratedReviews.length ? averageRating(ratedReviews).toFixed(1) : "N/A", "Average score"),
    profileMetric(sharedCount, "Shared with friends"),
  );
  return stats;
}

function profileMetric(value, label) {
  const metric = document.createElement("article");
  const strong = document.createElement("span");
  const text = document.createElement("p");
  strong.textContent = value;
  text.textContent = label;
  metric.append(strong, text);
  return metric;
}

function renderFriendPicks(friend) {
  const picks = document.createElement("div");
  const favorite = document.createElement("div");
  const hottest = document.createElement("div");
  const goat = document.createElement("div");
  picks.className = "friend-picks";
  favorite.className = "friend-pick";
  hottest.className = "friend-pick";
  goat.className = "friend-pick";
  favorite.append(pickLabel("Favorite"), pickValue(friend?.favoritePerson));
  hottest.append(pickLabel("Hottest"), pickValue(friend?.hottestPerson));
  goat.append(pickLabel("GOAT Drama"), pickValue(friend?.goatDrama));
  picks.append(favorite, hottest, goat);
  return picks;
}

function pickLabel(value) {
  const label = document.createElement("small");
  label.textContent = value;
  return label;
}

function pickValue(person) {
  const value = document.createElement("div");
  const avatar = document.createElement("span");
  const text = document.createElement("span");
  const name = document.createElement("strong");
  const knownFor = document.createElement("small");

  value.className = "friend-pick-person";
  if (!person) {
    value.classList.add("is-empty");
    name.textContent = "Not picked";
    text.append(name);
    value.append(text);
    return value;
  }

  avatar.className = "person-avatar";
  avatar.style.backgroundImage = person.image ? `url("${person.image}")` : "";
  name.textContent = person.name ?? person.title;
  knownFor.textContent = person.knownFor?.length
    ? person.knownFor.slice(0, 2).join(", ")
    : [...(person.meta ?? []), ...(person.genres ?? [])].slice(0, 3).join(" · ") || (person.source ?? "TMDb");
  text.append(name, knownFor);
  value.append(avatar, text);
  return value;
}

function renderSelectedDrama() {
  if (!selectedDrama) {
    els.selectedDrama.className = "selected-drama empty-state";
    els.selectedDrama.textContent = "Search for a drama and select the right result.";
    els.selectedDramaId.value = "";
    els.selectedDramaSource.textContent = "Choose a title";
    updateReviewSubmitButton();
    return;
  }

  const currentReview = latestReviewForUser(selectedDrama.id, state.activeUserId);
  const friendAverage = currentReview ? averageFriendRating(selectedDrama.id) : null;
  if (currentReview) {
    els.rating.value = currentReview.rating ?? 8;
    els.ratingOutput.value = currentReview.rating == null ? "No score" : Number(currentReview.rating).toFixed(1);
    els.recommendation.value = currentReview.recommendation;
    els.watchStatus.value = currentReview.status;
  }
  updateReviewInputsForStatus();

  const poster = document.createElement("div");
  const info = document.createElement("div");
  const title = document.createElement("h3");
  const tags = document.createElement("p");
  const summary = document.createElement("p");
  const compare = document.createElement("div");

  poster.className = "selected-poster poster";
  renderPoster(poster, selectedDrama);
  title.textContent = selectedDrama.title;
  tags.className = "genres";
  renderTagList(tags, [...(selectedDrama.meta ?? []), ...selectedDrama.genres], 8);
  summary.textContent = selectedDrama.summary;
  compare.className = "score-compare";
  compare.append(
    scoreMetric("Your score", currentReview?.rating == null ? "New" : Number(currentReview.rating).toFixed(1)),
  );
  if (currentReview) {
    compare.append(scoreMetric("Friend avg", friendAverage === null ? "None" : friendAverage.toFixed(1)));
  }
  info.append(tags, title, compare, summary);

  els.selectedDrama.className = "selected-drama";
  els.selectedDrama.replaceChildren(poster, info);
  els.selectedDramaId.value = selectedDrama.id;
  els.selectedDramaSource.textContent = selectedDrama.source;
  updateReviewSubmitButton(currentReview);
}

function updateReviewSubmitButton(currentReview = selectedDrama ? latestReviewForUser(selectedDrama.id, state.activeUserId) : null) {
  if (!els.reviewSubmitButton) return;
  els.reviewSubmitButton.classList.toggle("is-saved", Boolean(reviewSubmitFeedback));
  els.reviewSubmitButton.disabled = Boolean(reviewSubmitFeedback);
  if (reviewSubmitFeedback) {
    els.reviewSubmitButton.textContent = reviewSubmitFeedback;
    return;
  }
  els.reviewSubmitButton.textContent = currentReview ? "Update my review" : "Share my review";
}

function scoreMetric(label, value) {
  const metric = document.createElement("span");
  const metricValue = document.createElement("strong");
  const metricLabel = document.createElement("small");
  metric.className = "score-metric";
  metricValue.textContent = value;
  metricLabel.textContent = label;
  metric.append(metricValue, metricLabel);
  return metric;
}

function renderLookupResults(message = "") {
  if (message) {
    els.lookupResults.textContent = message;
    return;
  }

  els.lookupResults.replaceChildren(
    ...lookupResults.map((drama) => {
      const button = document.createElement("button");
      const poster = document.createElement("span");
      const text = document.createElement("span");
      const title = document.createElement("strong");
      const meta = document.createElement("small");

      button.type = "button";
      button.className = "lookup-result";
      button.dataset.dramaId = drama.id;
      poster.className = "lookup-poster";
      poster.style.backgroundImage = drama.image ? `url("${drama.image}")` : "";
      button.classList.toggle("is-selected", selectedDrama?.id === drama.id);
      button.setAttribute("aria-pressed", selectedDrama?.id === drama.id ? "true" : "false");
      title.textContent = drama.title;
      meta.textContent = [...(drama.meta ?? []), ...drama.genres].slice(0, 4).join(" / ") || drama.source;
      text.append(title, meta);
      button.append(poster, text);
      return button;
    }),
  );
}

function render() {
  renderAuthControls();
  renderProfilePicks();
  renderStats();
  renderSelectedDrama();
  els.discoverFilters?.classList.toggle("is-hidden", activeView !== "discover");
  els.topbar?.classList.toggle("has-discover-filters", activeView === "discover");
  els.topbar?.classList.toggle("has-view-search", titleSearchIsActive());
  els.viewSearch?.classList.toggle("is-hidden", !titleSearchIsActive());
  if (els.viewSearchInput) els.viewSearchInput.value = searchTerm;
  els.viewContent?.classList.toggle("is-filtering", titleSearchIsActive() && Boolean(searchTerm.trim()));
  document.querySelector(".review-panel")?.classList.toggle("is-hidden", activeView !== "my-reviews");

  document.querySelectorAll(".tab-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === activeView);
  });

  if (activeView === "my-reviews") renderMyReviews();
  else if (activeView === "matches") renderMatches();
  else if (activeView === "friends") renderFriendList();
  else renderDiscover();
}

function upsertDrama(drama) {
  const existing = state.dramas.find((item) => item.id === drama.id);
  if (existing) {
    Object.assign(existing, {
      title: drama.title,
      genres: drama.genres.length ? drama.genres : existing.genres,
      summary: drama.summary || existing.summary,
      image: drama.image || existing.image,
      source: drama.source || existing.source,
      meta: drama.meta ?? existing.meta ?? [],
      colors: existing.colors ?? drama.colors,
    });
    return existing;
  }

  const next = { ...drama, colors: drama.colors ?? paletteFor(state.dramas.length) };
  state.dramas.push(next);
  return next;
}

function normalizeTextList(values) {
  return [...new Set((values ?? []).filter(Boolean).map((value) => String(value).trim()).filter(Boolean))];
}

function titleFromMdlItem(item) {
  return item.title ?? item.name ?? item.title_name ?? item.original_title ?? item.english_title ?? "Untitled Drama";
}

function imageFromMdlItem(item) {
  return item.images?.poster ?? item.images?.medium ?? item.images?.thumb ?? item.poster ?? item.image ?? item.thumbnail ?? "";
}

function summaryFromMdlItem(item) {
  return stripHtml(item.synopsis ?? item.summary ?? item.description ?? item.overview ?? "");
}

function mapMdlTitle(item, index) {
  const title = item.title && typeof item.title === "object" ? item.title : item;
  const genres = normalizeTextList([
    ...(title.genres ?? []),
    ...(title.tags ?? []),
    title.type,
  ]).map((genre) => genre.toLowerCase());
  const meta = normalizeTextList([
    title.country,
    title.language,
    title.year,
    title.episodes ? `${title.episodes} episodes` : "",
    title.rating ? `MDL ${Number(title.rating).toFixed(1)}` : "",
  ]);

  return {
    id: `mdl-${title.id}`,
    title: titleFromMdlItem(title),
    genres: genres.length ? genres : ["drama"],
    summary: summaryFromMdlItem(title),
    image: imageFromMdlItem(title),
    source: "MyDramaList",
    meta,
    colors: paletteFor(index),
  };
}

function uniqueByDramaId(dramas) {
  const byId = new Map();
  dramas.forEach((drama) => {
    byId.set(drama.id, drama);
  });
  return [...byId.values()];
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json();
}

async function searchMdl(query) {
  if (!PROVIDER_CONFIG.mdlApiKey) return [];

  const results = await fetchJson(`${MDL_BASE_URL}/search/titles`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "mdl-api-key": PROVIDER_CONFIG.mdlApiKey,
    },
    body: JSON.stringify({ q: query, limit: 20 }),
    signal: lookupAbortController.signal,
  });
  const items = Array.isArray(results) ? results : results.results ?? results.titles ?? results.data ?? [];

  return Promise.all(
    items.slice(0, 20).map(async (item, index) => {
      const title = item.title && typeof item.title === "object" ? item.title : item;
      if (!title.id) return mapMdlTitle(title, index);
      try {
        const detail = await fetchJson(`${MDL_BASE_URL}/titles/${title.id}`, {
          headers: {
            "Content-Type": "application/json",
            "mdl-api-key": PROVIDER_CONFIG.mdlApiKey,
          },
          signal: lookupAbortController.signal,
        });
        return mapMdlTitle({ ...title, ...detail }, index);
      } catch {
        return mapMdlTitle(title, index);
      }
    }),
  );
}

async function searchTmdb(query, signal = lookupAbortController?.signal) {
  if (!PROVIDER_CONFIG.tmdbProxyUrl) return [];
  const url = new URL(PROVIDER_CONFIG.tmdbProxyUrl, window.location.origin);
  url.searchParams.set("q", query);
  const data = await fetchJson(url.toString(), { signal });
  return data.results ?? [];
}

async function searchPeople(query) {
  if (!PROVIDER_CONFIG.tmdbPersonProxyUrl) return [];
  const url = new URL(PROVIDER_CONFIG.tmdbPersonProxyUrl, window.location.origin);
  url.searchParams.set("q", query);
  const data = await fetchJson(url.toString());
  return data.results ?? [];
}

async function searchGoatDramas(query) {
  const localResults = state.dramas.filter((drama) => drama.title.toLowerCase().includes(query.toLowerCase()));
  let liveResults = [];
  try {
    liveResults = await searchTmdb(query);
  } catch {
    liveResults = [];
  }
  return uniqueByDramaId([...liveResults, ...localResults]).slice(0, 12);
}

function renderPersonResults(type, people, message = "") {
  const target = type === "favorite" ? els.favoritePersonResults : els.hottestPersonResults;
  target.replaceChildren();
  if (message) {
    target.textContent = message;
    return;
  }

  people.forEach((person) => {
    const button = document.createElement("button");
    const avatar = document.createElement("span");
    const text = document.createElement("span");
    const name = document.createElement("strong");
    const knownFor = document.createElement("small");
    button.type = "button";
    button.className = "person-result";
    button.dataset.pickType = type;
    button.dataset.person = JSON.stringify(person);
    avatar.className = "person-avatar";
    avatar.style.backgroundImage = person.image ? `url("${person.image}")` : "";
    name.textContent = person.name;
    knownFor.textContent = person.knownFor?.length ? person.knownFor.join(", ") : person.source ?? "TMDb";
    text.append(name, knownFor);
    button.append(avatar, text);
    target.append(button);
  });
}

function renderGoatDramaResults(dramas, message = "") {
  els.goatDramaResults.replaceChildren();
  if (message) {
    els.goatDramaResults.textContent = message;
    return;
  }

  dramas.forEach((drama) => {
    const button = document.createElement("button");
    const poster = document.createElement("span");
    const text = document.createElement("span");
    const title = document.createElement("strong");
    const meta = document.createElement("small");

    button.type = "button";
    button.className = "person-result";
    button.dataset.pickType = "goat";
    button.dataset.drama = JSON.stringify(drama);
    poster.className = "person-avatar";
    poster.style.backgroundImage = drama.image ? `url("${drama.image}")` : "";
    title.textContent = drama.title;
    meta.textContent = [...(drama.meta ?? []), ...(drama.genres ?? [])].slice(0, 4).join(" · ") || drama.source;
    text.append(title, meta);
    button.append(poster, text);
    els.goatDramaResults.append(button);
  });
}

async function savePersonPick(type, person) {
  if (!firebaseUser) {
    els.authDetail.textContent = "Sign in before saving profile picks.";
    return;
  }

  const field = type === "favorite" ? "favoritePerson" : "hottestPerson";
  const currentMember = memberFor(state.activeUserId);
  if (currentMember) currentMember[field] = person;
  renderProfilePicks();
  await setDoc(circleDoc("members", state.activeUserId), { [field]: person, updatedAt: serverTimestamp() }, { merge: true });
}

async function saveGoatDramaPick(drama) {
  if (!firebaseUser) {
    els.authDetail.textContent = "Sign in before saving profile picks.";
    return;
  }

  const savedDrama = upsertDrama(drama);
  const goatDrama = {
    id: savedDrama.id,
    title: savedDrama.title,
    genres: savedDrama.genres ?? [],
    meta: savedDrama.meta ?? [],
    image: savedDrama.image ?? "",
    source: savedDrama.source ?? "Drama Circle",
  };
  const currentMember = memberFor(state.activeUserId);
  if (currentMember) currentMember.goatDrama = goatDrama;
  saveState();
  renderProfilePicks();
  await Promise.all([
    setDoc(circleDoc("dramas", savedDrama.id), serializeDrama(savedDrama), { merge: true }),
    setDoc(circleDoc("members", state.activeUserId), { goatDrama, updatedAt: serverTimestamp() }, { merge: true }),
  ]);
}

async function lookupDramas(query) {
  const localResults = catalogFallback.filter((drama) => drama.title.toLowerCase().includes(query.toLowerCase()));

  if (lookupAbortController) lookupAbortController.abort();
  lookupAbortController = new AbortController();

  const providerNotes = [];
  const mergedResults = [];

  try {
    const mdlResults = await searchMdl(query);
    if (mdlResults.length) {
      mergedResults.push(...mdlResults);
      providerNotes.push(`MyDramaList: ${mdlResults.length}`);
    } else if (PROVIDER_CONFIG.mdlApiKey) {
      providerNotes.push("MyDramaList: no matches");
    }
  } catch (error) {
    if (error.name === "AbortError") return;
    providerNotes.push("MyDramaList unavailable");
  }

  if (!mergedResults.length) {
    try {
      const tmdbResults = await searchTmdb(query);
      if (tmdbResults.length) {
        mergedResults.push(...tmdbResults);
        providerNotes.push(`TMDb: ${tmdbResults.length}`);
      } else if (PROVIDER_CONFIG.tmdbProxyUrl) {
        providerNotes.push("TMDb: no matches");
      }
    } catch (error) {
      if (error.name === "AbortError") return;
      providerNotes.push("TMDb unavailable");
    }
  }

  lookupResults = uniqueByDramaId([...mergedResults, ...localResults]).slice(0, 24);
  els.sourceStatus.textContent =
    providerNotes.length > 0
      ? `${providerNotes.join(" · ")} · Local fallback ready`
      : "Live drama search is not configured yet. Showing local starter data.";
  renderLookupResults(lookupResults.length ? "" : "No results found. Try another title.");
}

els.signInButton.addEventListener("click", async () => {
  els.authDetail.textContent = "Opening Google sign-in...";
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (error) {
    els.authDetail.textContent = error.message;
  }
});

els.emailAuthForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = els.authEmail.value.trim();
  const password = els.authPassword.value;
  if (!email || !password) {
    els.authDetail.textContent = "Enter an email and password.";
    return;
  }

  els.authDetail.textContent = "Signing in...";
  try {
    await signInWithEmailAndPassword(auth, email, password);
    els.authPassword.value = "";
  } catch (error) {
    els.authDetail.textContent = error.message;
  }
});

els.emailSignUpButton.addEventListener("click", async () => {
  const displayName = els.authDisplayName.value.trim();
  const email = els.authEmail.value.trim();
  const password = els.authPassword.value;
  if (!displayName) {
    els.authDetail.textContent = "Enter the name friends should see.";
    return;
  }

  if (!email || !password) {
    els.authDetail.textContent = "Enter an email and password.";
    return;
  }

  els.authDetail.textContent = "Creating account...";
  try {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(credential.user, { displayName });
    await setDoc(
      circleDoc("members", credential.user.uid),
      {
        name: displayName,
        email,
        photoURL: credential.user.photoURL ?? "",
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
    els.authDisplayName.value = "";
    els.authPassword.value = "";
  } catch (error) {
    els.authDetail.textContent = error.message;
  }
});

els.signOutButton.addEventListener("click", async () => {
  await signOut(auth);
});

els.tabs.forEach((button) => {
  button.addEventListener("click", () => {
    activeView = button.dataset.view;
    render();
  });
});

els.discoverFilters?.addEventListener("change", () => {
  discoverFilters = {
    year: els.filterYear.value,
    episodes: els.filterEpisodes.value,
    cast: els.filterCast.value,
    rating: els.filterRating.value,
  };
  render();
});

els.viewSearchInput?.addEventListener("input", () => {
  searchTerm = els.viewSearchInput.value;
  render();
});

els.themeToggle?.addEventListener("click", () => {
  const nextTheme = els.nightModeStyles?.disabled ? "night" : "normal";
  localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  applyTheme(nextTheme);
});

els.lookupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const query = els.dramaQuery.value.trim();
  if (!query) return;
  renderLookupResults("Searching drama database...");
  await lookupDramas(query);
});

els.dramaQuery.addEventListener("input", () => {
  const query = els.dramaQuery.value.trim();
  window.clearTimeout(lookupTimer);
  if (query.length < 2) {
    lookupResults = [];
    renderLookupResults("");
    return;
  }

  lookupTimer = window.setTimeout(async () => {
    renderLookupResults("Searching drama database...");
    await lookupDramas(query);
  }, 350);
});

els.lookupResults.addEventListener("click", (event) => {
  const button = event.target.closest(".lookup-result");
  if (!button) return;
  selectedDrama = lookupResults.find((drama) => drama.id === button.dataset.dramaId);
  render();
});

els.viewContent.addEventListener("click", async (event) => {
  const modeButton = event.target.closest("[data-mode]");
  if (modeButton) {
    myReviewsMode = modeButton.dataset.mode;
    resetSortConfirming = false;
    render();
    return;
  }

  const circleModeButton = event.target.closest("[data-circle-mode]");
  if (circleModeButton) {
    circlePicksMode = circleModeButton.dataset.circleMode;
    render();
    return;
  }

  const resetButton = event.target.closest('[data-action="reset-sort"]');
  if (resetButton) {
    if (!resetSortConfirming) {
      resetSortConfirming = true;
      render();
      return;
    }
    await resetReviewSort();
    resetSortConfirming = false;
    render();
    return;
  }

  const pairwiseAction = event.target.closest("[data-action^='pairwise']");
  if (pairwiseAction) {
    const action = pairwiseAction.dataset.action;
    if (action === "pairwise-pick") {
      await savePairwiseComparison(
        "win",
        pairwiseAction.dataset.winnerId,
        pairwiseAction.dataset.loserId,
        pairwiseAction.dataset.winnerId,
        pairwiseAction.dataset.loserId,
      );
    } else if (action === "pairwise-tie") {
      await savePairwiseComparison("tie", pairwiseAction.dataset.dramaAId, pairwiseAction.dataset.dramaBId);
    } else if (action === "pairwise-skip") {
      await savePairwiseComparison("skip", pairwiseAction.dataset.dramaAId, pairwiseAction.dataset.dramaBId);
    }
    render();
    return;
  }

  resetSortConfirming = false;

  const externalCard = event.target.closest('[data-action="open-drama-link"]');
  if (externalCard) {
    window.open(externalCard.dataset.href, "_blank", "noopener");
    return;
  }

  if (suppressReviewClick) {
    suppressReviewClick = false;
    return;
  }
  const card = event.target.closest('[data-action="edit-review"]');
  if (!card) return;
  const drama = state.dramas.find((item) => item.id === card.dataset.dramaId);
  if (!drama) return;
  selectedDrama = drama;
  lookupResults = [];
  renderLookupResults("");
  render();
  document.querySelector(".review-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
});

els.viewContent.addEventListener("dragstart", (event) => {
  const card = event.target.closest(".drama-card.is-draggable");
  if (activeView !== "my-reviews" || !card) return;
  draggedReviewDramaId = card.dataset.dramaId;
  card.classList.add("is-dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", draggedReviewDramaId);
});

els.viewContent.addEventListener("dragover", (event) => {
  if (activeView !== "my-reviews" || !draggedReviewDramaId) return;
  event.preventDefault();
  const afterElement = dragAfterElement(els.viewContent, event.clientY);
  const dragging = els.viewContent.querySelector(".is-dragging");
  if (!dragging) return;
  if (afterElement) els.viewContent.insertBefore(dragging, afterElement);
  else els.viewContent.append(dragging);
});

els.viewContent.addEventListener("drop", async (event) => {
  if (activeView !== "my-reviews" || !draggedReviewDramaId) return;
  event.preventDefault();
  await saveReviewOrderFromDom();
});

els.viewContent.addEventListener("dragend", async () => {
  if (activeView !== "my-reviews" || !draggedReviewDramaId) return;
  els.viewContent.querySelector(".is-dragging")?.classList.remove("is-dragging");
  draggedReviewDramaId = "";
  suppressReviewClick = true;
  window.setTimeout(() => {
    suppressReviewClick = false;
  }, 0);
});

function dragAfterElement(container, y) {
  const cards = [...container.querySelectorAll(".drama-card.is-draggable:not(.is-dragging)")];
  return cards.reduce(
    (closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) return { offset, element: child };
      return closest;
    },
    { offset: Number.NEGATIVE_INFINITY, element: null },
  ).element;
}

async function saveReviewOrderFromDom() {
  const cards = [...els.viewContent.querySelectorAll(".drama-card.is-draggable[data-drama-id]")];
  const updates = cards.map((card, index) => {
    const review = latestReviewForUser(card.dataset.dramaId, state.activeUserId);
    if (!review) return null;
    review.sortOrder = index;
    return review;
  }).filter(Boolean);
  const currentMember = memberFor(state.activeUserId);
  if (currentMember) currentMember.reviewOrderMode = "manual";
  saveState();
  if (!firebaseUser) return;
  await Promise.all(
    [
      ...updates.map((review) => setDoc(circleDoc("reviews", review.id), { sortOrder: review.sortOrder, updatedAt: serverTimestamp() }, { merge: true })),
      setDoc(circleDoc("members", state.activeUserId), { reviewOrderMode: "manual", updatedAt: serverTimestamp() }, { merge: true }),
    ],
  );
}

async function savePairwiseComparison(result, dramaAId, dramaBId, winnerDramaId = null, loserDramaId = null) {
  const comparison = {
    id: crypto.randomUUID(),
    userId: state.activeUserId,
    dramaAId,
    dramaBId,
    winnerDramaId,
    loserDramaId,
    result,
    createdAt: new Date().toISOString(),
  };
  state.comparisons.push(comparison);
  const currentMember = memberFor(state.activeUserId);
  if (currentMember) currentMember.reviewOrderMode = "pairwise";
  await applyPairwiseSortOrder();
  saveState();

  if (!firebaseUser) return;
  await Promise.all([
    setDoc(circleDoc("comparisons", comparison.id), serializeComparison(comparison), { merge: true }),
    setDoc(circleDoc("members", state.activeUserId), { reviewOrderMode: "pairwise", updatedAt: serverTimestamp() }, { merge: true }),
  ]);
}

async function applyPairwiseSortOrder() {
  const sortedDramas = pairwiseSortedDramasForUser(state.activeUserId);
  const updates = sortedDramas.map((drama, index) => {
    const review = latestReviewForUser(drama.id, state.activeUserId);
    if (!review) return null;
    review.sortOrder = index;
    return review;
  }).filter(Boolean);

  if (!firebaseUser) return;
  await Promise.all(
    updates.map((review) => setDoc(circleDoc("reviews", review.id), { sortOrder: review.sortOrder, updatedAt: serverTimestamp() }, { merge: true })),
  );
}

async function resetReviewSort() {
  const currentMember = memberFor(state.activeUserId);
  if (currentMember) currentMember.reviewOrderMode = "rating";
  const userReviews = reviewsByCurrentUser();
  userReviews.forEach((review) => {
    review.sortOrder = null;
  });
  saveState();

  if (!firebaseUser) return;
  await Promise.all([
    setDoc(circleDoc("members", state.activeUserId), { reviewOrderMode: "rating", updatedAt: serverTimestamp() }, { merge: true }),
    ...userReviews.map((review) => setDoc(circleDoc("reviews", review.id), { sortOrder: null, updatedAt: serverTimestamp() }, { merge: true })),
  ]);
}

els.viewContent.addEventListener("keydown", (event) => {
  const pairwiseChoice = event.target.closest(".pairwise-choice");
  if (pairwiseChoice && (event.key === "Enter" || event.key === " ")) {
    event.preventDefault();
    pairwiseChoice.click();
    return;
  }

  if (event.key !== "Enter" && event.key !== " ") return;
  const externalCard = event.target.closest('[data-action="open-drama-link"]');
  if (externalCard) {
    event.preventDefault();
    externalCard.click();
    return;
  }
  const card = event.target.closest('[data-action="edit-review"]');
  if (!card) return;
  event.preventDefault();
  card.click();
});

els.rating.addEventListener("input", () => {
  els.ratingOutput.value = Number(els.rating.value).toFixed(1);
});

els.watchStatus.addEventListener("change", updateReviewInputsForStatus);

function updateReviewInputsForStatus() {
  const status = els.watchStatus.value;
  const scoreOptional = status === "watching" || status === "planned";
  els.rating.disabled = scoreOptional;
  els.ratingOutput.value = scoreOptional ? "No score" : Number(els.rating.value).toFixed(1);

  if (status === "planned") {
    els.recommendation.value = "";
    els.recommendation.disabled = true;
  } else {
    els.recommendation.disabled = false;
  }
}

els.personSearchForms.forEach((form) => {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const type = form.dataset.pickType;
    const input = type === "favorite" ? els.favoritePersonQuery : type === "hottest" ? els.hottestPersonQuery : els.goatDramaQuery;
    const query = input.value.trim();
    if (!query) return;

    if (type === "goat") {
      renderGoatDramaResults([], "Searching dramas...");
      try {
        const dramas = await searchGoatDramas(query);
        renderGoatDramaResults(dramas, dramas.length ? "" : "No dramas found.");
      } catch (error) {
        renderGoatDramaResults([], error.message);
      }
      return;
    }

    renderPersonResults(type, [], "Searching TMDb...");
    try {
      const people = await searchPeople(query);
      renderPersonResults(type, people, people.length ? "" : "No people found.");
    } catch (error) {
      renderPersonResults(type, [], error.message);
    }
  });
});

document.querySelectorAll(".person-results").forEach((container) => {
  container.addEventListener("click", async (event) => {
    const button = event.target.closest(".person-result");
    if (!button) return;
    if (button.dataset.pickType === "goat") {
      const drama = JSON.parse(button.dataset.drama);
      await saveGoatDramaPick(drama);
      container.replaceChildren();
      render();
      return;
    }
    const person = JSON.parse(button.dataset.person);
    await savePersonPick(button.dataset.pickType, person);
    container.replaceChildren();
  });
});

document.querySelector(".profile-picks")?.addEventListener("click", (event) => {
  const button = event.target.closest('[data-action="change-person-pick"]');
  if (!button) return;
  const form = button.closest(".person-search");
  form?.classList.add("is-editing");
  form?.querySelector('input[type="search"]')?.focus();
});

els.reviewForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (reviewSubmitFeedback) return;
  if (!firebaseUser) {
    els.authDetail.textContent = "Sign in before sharing a synced review.";
    return;
  }

  if (!selectedDrama) {
    renderLookupResults("Pick a drama result before sharing your review.");
    return;
  }

  const drama = upsertDrama(selectedDrama);
  const existing = latestReviewForUser(drama.id, state.activeUserId);
  const isUpdate = Boolean(existing);
  const status = els.watchStatus.value;
  const rating = status === "watching" || status === "planned" ? null : Number(els.rating.value);
  const recommendation = status === "planned" ? "" : els.recommendation.value;
  const review = {
    id: `${state.activeUserId}_${drama.id}`,
    dramaId: drama.id,
    userId: state.activeUserId,
    rating,
    recommendation,
    status,
    sortOrder: existing?.sortOrder ?? null,
    createdAt: new Date().toISOString(),
  };

  if (existing) {
    Object.assign(existing, review);
  } else {
    state.reviews.push(review);
  }

  await Promise.all([
    setDoc(circleDoc("dramas", drama.id), serializeDrama(drama), { merge: true }),
    setDoc(circleDoc("reviews", review.id), serializeReview(review), { merge: true }),
  ]);

  reviewSubmitFeedback = isUpdate ? "Updated!" : "Shared!";
  activeView = "my-reviews";
  saveState();
  render();
  window.setTimeout(() => {
    reviewSubmitFeedback = "";
    render();
  }, 1400);
});

selectedDrama = null;
applyTheme(localStorage.getItem(THEME_STORAGE_KEY) === "night" ? "night" : "normal");
render();

onAuthStateChanged(auth, async (user) => {
  firebaseUser = user;
  stopRealtimeSync();

  if (!user) {
    state = loadState();
    selectedFriendId = "";
    selectedDrama = null;
    render();
    return;
  }

  try {
    state.activeUserId = user.uid;
    await ensureCircleForUser(user);
    startRealtimeSync(user);
  } catch (error) {
    els.authDetail.textContent = error.message;
    render();
  }
});
