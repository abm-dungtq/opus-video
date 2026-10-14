#!/usr/bin/env node
// poi-fetch.mjs — real nearby amenities for property / location videos (direction A8, Thẻ 9 in
// pattern-library.md): schools, markets, supermarkets, transit, hospitals, parks, malls around an
// address or a point, from OpenStreetMap, with distance and walking time.
//   node poi-fetch.mjs --project <dir> (--address "<địa chỉ>" | --lat <số> --lon <số>)
//                      [--radius 1500] [--kinds school,market,supermarket,transit,hospital,park,mall]
//                      [--route] [--refresh] [--json]
//   node poi-fetch.mjs --help | -h
// Writes <project>/sources/poi.json (cache), the "## POI (OpenStreetMap)" section of SOURCES.md
//   (centre, radius, query time, table) and the ODbL credit line in assets/CREDITS.md. Nothing goes on
//   screen as a source label; the builder takes distances and minutes from SOURCES.md.
// Services: Nominatim (geocode) and Overpass (POI) are free public services, ~1 request/second,
//   a User-Agent is required; this script waits 1.1 s between requests. --route asks the FOSSGIS
//   walking router (routing.openstreetmap.de/routed-foot), which has no service guarantee; on error
//   it falls back to the estimate. Default walking time is an estimate: straight line × 1.3 at
//   80 m/minute.
// With --address the geocoded place name is printed and kept in SOURCES.md: check it is the project.
// Cache: without --refresh, sources/poi.json with the same centre (< 10 m, or the same --address),
//   radius, --kinds and --route is reused with no network call (the cache line goes to stderr).
// Exit: 0 ok · 1 network / service error (HTTP code, or the Overpass error remark, printed; nothing written) · 2 bad usage · 4 geocode found nothing.

import { existsSync, readFileSync, writeFileSync, mkdirSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { wantsHelp, helpText } from "./cli-help.mjs";

const UA = "opus-video-poi/1.0 (+https://github.com/abm-dungtq/opus-video)";
const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const OVERPASS = "https://overpass-api.de/api/interpreter";
const OSRM = "https://routing.openstreetmap.de/routed-foot/table/v1/foot";
const SECTION = "## POI (OpenStreetMap)";
const CREDIT = "- Dữ liệu tiện ích: © OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright)";

// A third tuple element is a narrower label ("Trạm xe buýt", "Phòng khám", "Cửa hàng tiện lợi"), so a bus
// stop named after a market, an optician tagged clinic or a Circle K is never shown as a station, a hospital
// or a supermarket, and (top-3 is per label) never pushes the real ones out of the table.
export const KINDS = {
  school: { vi: "Trường học", tags: [["amenity", ["school", "university", "kindergarten"]]] },
  market: { vi: "Chợ", tags: [["amenity", ["marketplace"]]] },
  supermarket: { vi: "Siêu thị", tags: [["shop", ["supermarket"]], ["shop", ["convenience"], "Cửa hàng tiện lợi"]] },
  transit: { vi: "Ga/bến xe", tags: [["railway", ["station", "subway_entrance"]], ["public_transport", ["station"]], ["highway", ["bus_stop"], "Trạm xe buýt"]] },
  hospital: { vi: "Bệnh viện", tags: [["amenity", ["hospital"]], ["amenity", ["clinic"], "Phòng khám"]] },
  park: { vi: "Công viên", tags: [["leisure", ["park"]]] },
  mall: { vi: "Trung tâm thương mại", tags: [["shop", ["mall"]]] },
};

export function overpassQuery(lat, lon, radius, kinds = Object.keys(KINDS)) {
  const blocks = kinds.flatMap((k) => KINDS[k].tags.map(([key, vals]) => `  nwr(around:${radius},${lat},${lon})["${key}"~"^(${vals.join("|")})$"];`));
  return `[out:json][timeout:25];\n(\n${blocks.join("\n")}\n);\nout center tags;`;
}

export function haversine(a, b) {
  const R = 6371000, rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function kindOf(tags = {}) {
  for (const [kind, def] of Object.entries(KINDS)) {
    const t = def.tags.find(([key, vals]) => vals.includes(tags[key]));
    if (t) return { kind, label: t[2] || def.vi };
  }
  return null;
}

export function parseOverpass(json, center) {
  const out = [];
  for (const e of (json && json.elements) || []) {
    const tags = e.tags || {};
    const name = tags["name:vi"] || tags.name;
    const lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon;
    const k = kindOf(tags);
    if (!name || !k || lat === undefined || lon === undefined) continue;
    out.push({ kind: k.kind, label: k.label, name, lat, lon, osm: `${e.type}/${e.id}`, distance_m: Math.round(haversine(center, { lat, lon })) });
  }
  out.sort((a, b) => a.distance_m - b.distance_m);
  // The same place mapped twice (a node and its building, two bus stop poles) keeps the nearer one.
  return out.filter((p, i) => !out.slice(0, i).some((q) => q.label === p.label && q.name === p.name && haversine(p, q) < 150));
}

export function walkEstimate(distance_m) {
  const route_m = Math.round(distance_m * 1.3);
  return { route_m, minutes: Math.ceil(route_m / 80), method: "uoc-tinh" };
}

// OSRM table with sources=0 → one entry per destination (index 0 is the centre itself).
export function parseOsrmTable(json) {
  const dur = json?.durations?.[0] || [], dist = json?.distances?.[0] || [];
  return dur.slice(1).map((s, i) => (s === null || s === undefined ? null : { route_m: Math.round(dist[i + 1] ?? 0), minutes: Math.ceil(s / 60), method: "osrm-foot" }));
}

// Counted per label, so three close bus stops do not push the metro station out of the table.
export function topPerKind(list, n = 3) {
  const count = {};
  return list.filter((p) => { const k = p.label || p.kind; return (count[k] = (count[k] || 0) + 1) <= n; });
}

const METHOD_VI = { "uoc-tinh": "ước tính đường chim bay ×1,3, 80 m/phút", "osrm-foot": "OSRM đi bộ" };

export function sourcesBlock(meta, list) {
  return [SECTION, "",
    `- Tâm: ${meta.center.lat}, ${meta.center.lon}${meta.address ? ` (${meta.address})` : ""}`,
    ...(meta.geocoded ? [`- Geocode: ${meta.geocoded} (kiểm lại đúng địa chỉ dự án; sai thì chạy bằng --lat/--lon)`] : []),
    `- Bán kính: ${meta.radius} m`,
    `- Truy vấn lúc: ${meta.fetched_at}`,
    `- Dữ liệu: © OpenStreetMap contributors, ODbL (ghi công ở assets/CREDITS.md, không ghi lên hình)`, "",
    "| Loại | Tên | Khoảng cách | Đi bộ | Cách tính | OSM |", "|---|---|---|---|---|---|",
    ...list.map((p) => `| ${p.label || KINDS[p.kind].vi} | ${p.name} | ${p.distance_m} m | ${p.minutes} phút (${p.route_m} m) | ${METHOD_VI[p.method]} | ${p.osm} |`),
    ""].join("\n");
}

function setSourcesSection(text, block) {
  const i = text.indexOf(SECTION);
  if (i < 0) return `${text.trimEnd()}${text.trim() ? "\n\n" : ""}${block}`;
  const rest = text.slice(i + SECTION.length);
  const next = rest.search(/^## /m);
  return `${text.slice(0, i)}${block}${next < 0 ? "" : `\n${rest.slice(next)}`}`;
}

function parseArgs(argv) {
  const o = { radius: 1500, kinds: Object.keys(KINDS) };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (["--route", "--refresh", "--json"].includes(a)) o[a.slice(2)] = true;
    else if (["--project", "--address", "--lat", "--lon", "--radius", "--kinds"].includes(a)) {
      if (argv[i + 1] === undefined) return { bad: `${a} needs a value` };
      o[a.slice(2)] = argv[++i];
    } else return { bad: `unknown argument ${a}` };
  }
  if (!o.project) return { bad: "need --project" };
  if (typeof o.kinds === "string") o.kinds = o.kinds.split(",").map((s) => s.trim()).filter(Boolean);
  const unknown = o.kinds.filter((k) => !KINDS[k]);
  if (unknown.length || !o.kinds.length) return { bad: `--kinds must be from ${Object.keys(KINDS).join(",")}` };
  o.radius = Number(o.radius);
  if (!(o.radius > 0 && o.radius <= 5000)) return { bad: "--radius must be 1–5000 (m)" };
  const hasPoint = o.lat !== undefined || o.lon !== undefined;
  if (hasPoint === !!o.address) return { bad: "need --address or --lat with --lon (not both)" };
  if (hasPoint) {
    o.lat = Number(o.lat); o.lon = Number(o.lon);
    if (!(Math.abs(o.lat) <= 90 && Math.abs(o.lon) <= 180)) return { bad: "--lat/--lon must be numbers" };
  }
  return o;
}

class HttpError extends Error {}

export async function main(argv = process.argv.slice(2), log = console.log, err = console.error, deps = {}) {
  if (wantsHelp(argv)) { process.stdout.write(helpText(import.meta.url)); return 0; }
  const o = parseArgs(argv);
  if (o.bad) { err(`poi-fetch: ${o.bad}`); return 2; }
  const fetchFn = deps.fetch || globalThis.fetch;
  const sleep = deps.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const now = deps.now || (() => new Date());
  const project = resolve(o.project);
  const cachePath = join(project, "sources", "poi.json");

  let last = 0;
  const call = async (url, init = {}, retry = false) => {
    const wait = 1100 - (Date.now() - last);
    if (last && wait > 0) await sleep(wait);
    last = Date.now();
    const res = await fetchFn(url, { ...init, headers: { "User-Agent": UA, ...(init.headers || {}) }, signal: AbortSignal.timeout(30000) });
    if ((res.status === 429 || res.status === 504) && retry) { await sleep(5000); return call(url, init, false); }
    if (!res.ok) throw new HttpError(`HTTP ${res.status} from ${url.split("?")[0]}`);
    return res.json();
  };

  let cached = null;
  try { cached = JSON.parse(readFileSync(cachePath, "utf8")); } catch { /* no cache yet */ }
  const sameCentre = cached && cached.radius === o.radius && String(cached.kinds) === String(o.kinds) && !!cached.route === !!o.route
    && (o.address ? cached.address === o.address : haversine(cached.center, { lat: o.lat, lon: o.lon }) < 10);

  let data;
  try {
    if (sameCentre && !o.refresh) {
      data = cached;
      err(`poi-fetch: dùng cache sources/poi.json (truy vấn lúc ${cached.fetched_at}); --refresh để lấy lại`);
    } else {
      let center = { lat: o.lat, lon: o.lon }, geocoded = "";
      if (o.address) {
        const g = await call(`${NOMINATIM}?format=jsonv2&limit=1&countrycodes=vn&q=${encodeURIComponent(o.address)}`);
        if (!Array.isArray(g) || !g.length) { err(`poi-fetch: không tìm thấy địa chỉ "${o.address}"`); return 4; }
        center = { lat: Number(g[0].lat), lon: Number(g[0].lon) };
        geocoded = g[0].display_name || "";
        err(`poi-fetch: geocode "${o.address}" → ${geocoded} (${center.lat}, ${center.lon})`);
      }
      const json = await call(OVERPASS, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: `data=${encodeURIComponent(overpassQuery(center.lat, center.lon, o.radius, o.kinds))}` }, true);
      // Overpass answers a timeout or memory abort with HTTP 200, a "remark" and empty or partial
      // elements; caching that would serve a wrong table on every later run.
      if (typeof json?.remark === "string" && /error|timed out|out of memory/i.test(json.remark))
        throw new HttpError(`Overpass: ${json.remark.slice(0, 200)} (thu nhỏ --radius hoặc --kinds rồi chạy lại)`);
      let items = topPerKind(parseOverpass(json, center)).map((p) => ({ ...p, ...walkEstimate(p.distance_m) }));
      if (o.route && items.length) {
        try {
          const t = parseOsrmTable(await call(`${OSRM}/${[center, ...items].map((p) => `${p.lon},${p.lat}`).join(";")}?sources=0&annotations=duration,distance`));
          items = items.map((p, i) => (t[i] ? { ...p, ...t[i] } : p));
        } catch (e) { err(`WARN  OSRM đi bộ lỗi (${e.message}); dùng ước tính đường chim bay`); }
      }
      data = { center, address: o.address || "", ...(geocoded ? { geocoded } : {}), radius: o.radius, kinds: o.kinds, route: !!o.route, fetched_at: now().toISOString(), items };
      mkdirSync(join(project, "sources"), { recursive: true });
      writeFileSync(cachePath, JSON.stringify(data, null, 2) + "\n");
    }
  } catch (e) {
    err(`poi-fetch: ${e instanceof HttpError ? e.message : `network error: ${e.message}${e.cause?.code ? ` (${e.cause.code})` : ""}`}`);
    return 1;
  }

  const sourcesPath = join(project, "SOURCES.md");
  writeFileSync(sourcesPath, setSourcesSection(existsSync(sourcesPath) ? readFileSync(sourcesPath, "utf8") : "# SOURCES\n", sourcesBlock(data, data.items)));
  mkdirSync(join(project, "assets"), { recursive: true });
  const creditsPath = join(project, "assets", "CREDITS.md");
  const credits = existsSync(creditsPath) ? readFileSync(creditsPath, "utf8") : "# CREDITS\n";
  if (!credits.includes("OpenStreetMap contributors")) writeFileSync(creditsPath, `${credits.trimEnd()}\n\n${CREDIT}\n`);

  if (o.json) log(JSON.stringify(data, null, 2));
  else log(`${data.items.length ? data.items.map((p) => `${(p.label || KINDS[p.kind].vi).padEnd(20)} ${String(p.distance_m).padStart(5)} m  ${String(p.minutes).padStart(3)} phút  ${p.name}`).join("\n") : "(không có tiện ích có tên trong bán kính này)"}\npoi-fetch: ${data.items.length} tiện ích → sources/poi.json · SOURCES.md · assets/CREDITS.md`);
  return 0;
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) main().then((c) => process.exit(c));
