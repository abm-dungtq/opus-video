#!/usr/bin/env node
// case-features.mjs — ONE-TIME TypeSafe (Jev) pass that labels every case in data/cases.jsonl
// with language-agnostic static features, cached in data/case-features.jsonl:
//   aspect  (Choice) vertical | horizontal | square | multiple | not_stated
//   genre   (Choice) kind of video, see GENRES
//   subject (Choice) topic / industry, see SUBJECTS
//   richness (Score 0–4) how much the prompt gives you to copy as a production reference
//   ui, data, footage, voiceover, characters (Noul 0–1)
// The labels double as an English summary for the ~43% of cases written in Chinese/Japanese/
// Spanish, so per-brief scoring can compare English labels instead of raw foreign text.
// Jev cannot generate free text, so there is no free-form summary: labels only.
//   node case-features.mjs [--force] [--concurrency 8] [--stats]
// Resumable: cases already in the cache (same id + prompt hash) are skipped.
import { readFileSync, writeFileSync, existsSync, appendFileSync, realpathSync } from "node:fs";
import { maybeHelp } from "./cli-help.mjs";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { MODEL, loadKey, post, runPool, addUsage, costOf } from "./jev-client.mjs";

export const CASES = fileURLToPath(new URL("../data/cases.jsonl", import.meta.url));
export const FEATURES = fileURLToPath(new URL("../data/case-features.jsonl", import.meta.url));
const SNIPPET = 1200;

export const ASPECTS = {
  vertical: "The video is vertical / portrait (9:16, 1080x1920, TikTok, Reels, Shorts, 竖屏, 縦型).",
  horizontal: "The video is horizontal / landscape (16:9, 1920x1080, widescreen, YouTube).",
  square: "The video is square (1:1).",
  multiple: "The video is delivered in more than one aspect ratio (e.g. both 16:9 and 9:16, or 1:1 + 16:9 + 9:16).",
  not_stated: "The text does not say the aspect ratio or orientation of the video.",
};

export const GENRES = {
  brand_motion_intro: "Motion-graphics intro, logo sting, brand bumper or designer showreel / résumé reel; abstract visuals cut to music, little or no narration.",
  product_promo_ad: "Promo or advert for a physical product, brand or service; sells something to customers.",
  software_launch_demo: "Launch, teaser or demo video for software, a website, an AI tool or SaaS, usually showing its UI.",
  app_tutorial_walkthrough: "How-to, tutorial or onboarding walk-through that shows step by step how to use an app or tool.",
  educational_explainer: "Explainer or educational video teaching a concept, science, maths, history or how something works.",
  data_infographic: "Data visualisation or infographic video built around charts, numbers, statistics or maps.",
  story_animation: "Narrative short or animated story with characters or a plot.",
  music_video: "Music video, lyric video or audio-reactive visuals driven by a song.",
  kinetic_typography: "Kinetic typography: animated text / spoken words are the main visual.",
  footage_edit_recap: "Edit of real camera footage or clips: event recap, vlog, montage, auto-edited social clip.",
  talking_head_podcast: "Talking head, interview, podcast clip or presenter speaking to camera.",
  news_recap: "News, weekly roundup or list of updates / headlines.",
  scene_3d: "3D scene, architecture, product render or spatial fly-through as the main content.",
  game_interactive: "Game, playable demo, interactive toy, simulation or game trailer.",
  generative_art: "Generative art, shader or creative-coding experiment with no commercial purpose.",
  other: "None of the above.",
};

export const SUBJECTS = {
  software_ai: "Software, SaaS, developer tools, AI products, websites.",
  consumer_app: "Consumer mobile app (fintech wallet, social, productivity app for end users).",
  finance_business: "Finance, banking, investing, economics, business, startups.",
  education_science: "Education, science, maths, technology concepts.",
  history_culture: "History, culture, tradition, heritage, art history.",
  beauty_fashion: "Cosmetics, skincare, fashion, apparel, jewellery, retail goods.",
  food_drink: "Food, drink, coffee, tea, restaurants, cafés.",
  real_estate_architecture: "Real estate, architecture, interior design, buildings, cities.",
  travel_place: "Travel, tourism, a city or place, festivals.",
  events_conference: "Events, conferences, meetups, launches with an audience.",
  music_entertainment: "Music, film, entertainment, celebrities, anime.",
  games: "Video games, game worlds, toys.",
  design_portfolio: "A designer's or studio's own portfolio, personal brand or résumé.",
  health_sports: "Health, fitness, sports, wellness.",
  automotive_hardware: "Cars, EVs, hardware, gadgets, devices.",
  abstract: "No real-world subject: abstract visuals, pure technique demo.",
  other: "Some other subject.",
};

export const RICHNESS = [
  "No usable prompt: only a description of the post, or the prompt is not public.",
  "One-line request (e.g. 'make a 15-second promo for X, go all out') with no direction.",
  "Short prompt with some direction: a few concrete choices (length, style, colours or scenes).",
  "Detailed brief: scenes or beats, timing, visual style and rules a producer could follow.",
  "Full production spec: inputs, art direction, beat/timing structure, build/render rules and checks; reusable as a template.",
];

export const NOULS = {
  ui: "The video shows software UI, app screens, a website or a cursor/finger interacting with an interface.",
  data: "The video shows charts, graphs, statistics, numbers or maps as a main element.",
  footage: "The video uses real camera footage, photos or recorded video clips (not only generated graphics).",
  voiceover: "The video has narration, voice-over or spoken words.",
  characters: "The video features characters, people or mascots acting out a story.",
};

const hash = (r) => createHash("sha1").update(`${r.title}\n${r.prompt}`).digest("hex").slice(0, 12);

export function caseState(r) {
  return {
    title: r.title || "(untitled)",
    corpus_category: r.category,
    tech_tags: r.tags.join(", ") || "-",
    prompt_is_public_and_complete: r.has_full_prompt,
    prompt: r.prompt.length > SNIPPET ? r.prompt.slice(0, SNIPPET) + "…" : r.prompt,
  };
}

const VIDEO = "The state is a short video someone made with an AI model, described by its title and the prompt (or a description of the post).";
export function featureQuestions() {
  const q = {
    aspect: { type: "choice", instructions: `${VIDEO} What aspect ratio / orientation is the video, according to the text?`, criteria: ASPECTS },
    genre: { type: "choice", instructions: `${VIDEO} What kind of video is it?`, criteria: GENRES },
    subject: { type: "choice", instructions: `${VIDEO} What real-world subject or industry is the video about?`, criteria: SUBJECTS },
    richness: { type: "score", instructions: `${VIDEO} How much does the prompt give a video producer to copy as a reusable reference (structure, timing, style, rules)?`, criteria: RICHNESS },
  };
  for (const [k, v] of Object.entries(NOULS)) q[k] = { type: "noul", instructions: `${VIDEO} ${v}` };
  return q;
}

export function parseFeatureAnswers(id, h, a) {
  const ok = a?.aspect?.choice && a?.genre?.choice && a?.subject?.choice && typeof a?.richness?.score === "number" && Object.keys(NOULS).every((k) => typeof a?.[k]?.noul === "number");
  if (!ok) throw new Error("malformed answers");
  const round = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, +v.toFixed(3)]).filter(([, v]) => v >= 0.01));
  return {
    id, hash: h,
    aspect: a.aspect.choice, aspect_p: round(a.aspect.probabilities),
    genre: a.genre.choice, genre_p: round(a.genre.probabilities),
    subject: a.subject.choice, subject_p: round(a.subject.probabilities),
    richness: +a.richness.score.toFixed(2),
    ...Object.fromEntries(Object.keys(NOULS).map((k) => [k, +a[k].noul.toFixed(2)])),
  };
}

export function loadFeatures(file = FEATURES) {
  const m = new Map();
  if (!existsSync(file)) return m;
  for (const l of readFileSync(file, "utf8").split("\n")) if (l.trim()) { const f = JSON.parse(l); m.set(f.id, f); }
  return m;
}

async function main() {
  const argv = process.argv.slice(2);
  maybeHelp(argv, import.meta.url);
  const force = argv.includes("--force");
  const ci = argv.indexOf("--concurrency");
  const concurrency = ci >= 0 ? Number(argv[ci + 1]) : 8;
  const apiKey = loadKey();
  if (!apiKey) { console.error("case-features: no TYPESAFE_API_KEY; nothing to do (rerank works without the cache)."); process.exit(2); }
  const rows = readFileSync(CASES, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const cache = force ? new Map() : loadFeatures();
  if (force) writeFileSync(FEATURES, "");
  const todo = rows.filter((r) => cache.get(r.id)?.hash !== hash(r));
  const questions = featureQuestions();
  let usage = { input_tokens: 0, output_tokens: 0 }, done = 0, failed = 0;
  const t0 = Date.now();
  await runPool(todo.map((r) => async () => {
    try {
      const data = await post({ state: caseState(r), model: MODEL, questions }, { apiKey });
      const f = parseFeatureAnswers(r.id, hash(r), data.answers);
      appendFileSync(FEATURES, JSON.stringify(f) + "\n");
      usage = addUsage(usage, data.usage); done++;
    } catch (e) { failed++; console.error(`case-features: ${r.id}: ${e.message}`); }
  }), concurrency);
  // de-duplicate (a re-labelled case keeps its newest line)
  const final = loadFeatures();
  const order = rows.map((r) => final.get(r.id)).filter(Boolean);
  writeFileSync(FEATURES, order.map((f) => JSON.stringify(f)).join("\n") + "\n");
  console.error(JSON.stringify({ cases: rows.length, labelled_now: done, failed, cached: order.length, requests: todo.length, ms: Date.now() - t0, usage, usd: +costOf(usage).toFixed(4) }));
  if (failed) process.exit(1);
}

// realpath: SKILL.md calls scripts through the ~/.claude/skills symlink, while import.meta.url is the real path.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) main();
