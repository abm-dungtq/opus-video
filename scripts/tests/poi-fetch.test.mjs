import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { overpassQuery, parseOverpass, walkEstimate, parseOsrmTable, topPerKind, sourcesBlock, main } from "../poi-fetch.mjs";

const fx = (name) => JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/poi/${name}`, import.meta.url)), "utf8"));
const CENTER = { lat: 10.7725, lon: 106.698 };
const quiet = () => {};

// Stub fetch that answers by host and counts calls.
function stubFetch({ nominatim = fx("nominatim.json"), overpass = fx("overpass.json"), osrm = fx("osrm-table.json"), status = 200 } = {}) {
  const calls = [];
  const fn = async (url) => {
    calls.push(url);
    const body = url.includes("nominatim") ? nominatim : url.includes("overpass") ? overpass : osrm;
    return { ok: status < 400, status, json: async () => body };
  };
  return { fn, calls };
}
const deps = (f) => ({ fetch: f.fn, sleep: async () => {}, now: () => new Date("2026-10-14T03:00:00Z") });

test("parseOverpass: drops unnamed places, merges duplicates < 150 m, sorts by distance, reads way centres", () => {
  const list = parseOverpass(fx("overpass.json"), CENTER);
  assert.equal(list.length, 6);
  assert.ok(!list.some((p) => p.osm === "node/103"));
  assert.equal(list.filter((p) => p.name === "Bến xe buýt Sài Gòn").length, 1);
  assert.equal(list[0].osm, "node/105");
  assert.deepEqual(list.map((p) => p.distance_m), [...list.map((p) => p.distance_m)].sort((a, b) => a - b));
  assert.deepEqual(list.find((p) => p.kind === "park"), { kind: "park", label: "Công viên", name: "Công viên 23 Tháng 9", lat: 10.776, lon: 106.695, osm: "way/201", distance_m: list.at(-1).distance_m });
  assert.equal(list.find((p) => p.osm === "node/105").label, "Trạm xe buýt");
  assert.equal(list.find((p) => p.osm === "node/107").label, "Ga/bến xe");
  assert.deepEqual([list.find((p) => p.osm === "node/106").kind, list.find((p) => p.osm === "node/106").label], ["hospital", "Phòng khám"]);
  assert.equal(list.at(-1).kind, "park");
});

test("walkEstimate, parseOsrmTable, topPerKind, overpassQuery", () => {
  assert.deepEqual(walkEstimate(800), { route_m: 1040, minutes: 13, method: "uoc-tinh" });
  assert.deepEqual(parseOsrmTable(fx("osrm-table.json"))[0], { route_m: 170, minutes: 3, method: "osrm-foot" });
  assert.equal(parseOsrmTable(fx("osrm-table.json")).length, 6);
  const many = Array.from({ length: 5 }, (_, i) => ({ kind: "school", name: `s${i}` }));
  assert.equal(topPerKind([...many, { kind: "park", name: "p" }]).length, 4);
  const buses = Array.from({ length: 3 }, (_, i) => ({ kind: "transit", label: "Trạm xe buýt", name: `b${i}` }));
  assert.ok(topPerKind([...buses, { kind: "transit", label: "Ga/bến xe", name: "Ga" }]).some((p) => p.name === "Ga"));
  const q = overpassQuery(10.7725, 106.698, 1500, ["school", "transit"]);
  assert.match(q, /around:1500,10\.7725,106\.698/);
  assert.match(q, /\["highway"~"\^\(bus_stop\)\$"\]/);
  assert.match(q, /out center tags;$/);
  const md = sourcesBlock({ center: CENTER, address: "", radius: 1500, fetched_at: "t" }, [{ kind: "market", name: "Chợ", distance_m: 10, minutes: 1, route_m: 13, method: "uoc-tinh", osm: "node/1" }]);
  assert.match(md, /\| Chợ \| Chợ \| 10 m \| 1 phút \(13 m\) \| ước tính đường chim bay ×1,3, 80 m\/phút \| node\/1 \|/);
});

test("main: writes poi.json, SOURCES.md, assets/CREDITS.md; second run uses the cache; one POI section", async () => {
  const d = mkdtempSync(join(tmpdir(), "poi-"));
  try {
    writeFileSync(join(d, "SOURCES.md"), "# SOURCES\n\n## Bài báo\n\n- URL: x\n");
    const f = stubFetch();
    assert.equal(await main(["--project", d, "--lat", "10.7725", "--lon", "106.698", "--route"], quiet, quiet, deps(f)), 0);
    assert.equal(f.calls.length, 2);
    const data = JSON.parse(readFileSync(join(d, "sources", "poi.json"), "utf8"));
    assert.equal(data.items.length, 6);
    assert.equal(data.items[0].method, "osrm-foot");
    assert.ok(existsSync(join(d, "assets", "CREDITS.md")));
    const out = [], json = [];
    assert.equal(await main(["--project", d, "--lat", "10.77251", "--lon", "106.698", "--route", "--json"], (m) => json.push(m), (m) => out.push(m), deps(f)), 0);
    assert.equal(f.calls.length, 2);
    assert.match(out.join("\n"), /cache/);
    assert.doesNotThrow(() => JSON.parse(json.join("")));
    assert.equal(await main(["--project", d, "--lat", "10.7725", "--lon", "106.698"], quiet, quiet, deps(f)), 0);
    assert.equal(f.calls.length, 3, "dropping --route is a new query, not the --route cache");
    assert.equal(JSON.parse(readFileSync(join(d, "sources", "poi.json"), "utf8")).items[0].method, "uoc-tinh");
    assert.equal(await main(["--project", d, "--lat", "10.7725", "--lon", "106.698", "--route"], quiet, quiet, deps(f)), 0);
    assert.equal(JSON.parse(readFileSync(join(d, "sources", "poi.json"), "utf8")).items[0].method, "osrm-foot");
    const s = readFileSync(join(d, "SOURCES.md"), "utf8");
    assert.equal(s.match(/## POI \(OpenStreetMap\)/g).length, 1);
    assert.match(s, /## Bài báo/);
    assert.equal(readFileSync(join(d, "assets", "CREDITS.md"), "utf8").match(/OpenStreetMap contributors/g).length, 1);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("main: empty geocode exits 4; HTTP error exits 1; OSRM failure falls back to the estimate", async () => {
  const d = mkdtempSync(join(tmpdir(), "poi-"));
  try {
    assert.equal(await main(["--project", d, "--address", "không có"], quiet, quiet, deps(stubFetch({ nominatim: [] }))), 4);
    const geo = [];
    assert.equal(await main(["--project", d, "--address", "Chợ Bến Thành"], quiet, (m) => geo.push(m), deps(stubFetch())), 0);
    assert.match(geo.join("\n"), /geocode "Chợ Bến Thành" → Chợ Bến Thành, Quận 1/);
    assert.match(readFileSync(join(d, "SOURCES.md"), "utf8"), /^- Geocode: Chợ Bến Thành, Quận 1/m);
    assert.equal(await main(["--project", d, "--lat", "10", "--lon", "106"], quiet, quiet, deps(stubFetch({ status: 500 }))), 1);
    const f = stubFetch();
    const flaky = { fn: async (url) => (url.includes("routed-foot") ? { ok: false, status: 503, json: async () => ({}) } : f.fn(url)) };
    assert.equal(await main(["--project", d, "--lat", "10.7725", "--lon", "106.698", "--route"], quiet, quiet, deps(flaky)), 0);
    assert.equal(JSON.parse(readFileSync(join(d, "sources", "poi.json"), "utf8")).items[0].method, "uoc-tinh");
    assert.equal(await main(["--project", d, "--lat", "1"], quiet, quiet), 2);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("parseOverpass: convenience stores get their own label, so real supermarkets stay in the table", () => {
  const node = (id, lat, shop, name) => ({ type: "node", id, lat, lon: CENTER.lon, tags: { shop, name } });
  const json = { elements: [node(1, 10.773, "convenience", "Circle K"), node(2, 10.7733, "convenience", "FamilyMart"), node(3, 10.7735, "convenience", "GS25"), node(4, 10.7765, "supermarket", "Co.opmart")] };
  const top = topPerKind(parseOverpass(json, CENTER));
  assert.equal(top.find((p) => p.name === "Circle K").label, "Cửa hàng tiện lợi");
  assert.deepEqual(top.filter((p) => p.label === "Siêu thị").map((p) => p.name), ["Co.opmart"]);
  assert.match(overpassQuery(10, 106, 500, ["supermarket"]), /\["shop"~"\^\(convenience\)\$"\]/);
});

test("main: Overpass HTTP 200 with an error remark exits 1, prints the remark and writes nothing", async () => {
  const d = mkdtempSync(join(tmpdir(), "poi-"));
  try {
    const remark = "runtime error: Query timed out in \"query\" at line 3 after 26 seconds.";
    const errs = [];
    assert.equal(await main(["--project", d, "--lat", "10.7725", "--lon", "106.698"], quiet, (m) => errs.push(m), deps(stubFetch({ overpass: { elements: [], remark } }))), 1);
    assert.match(errs.join("\n"), /Query timed out/);
    for (const f of [join("sources", "poi.json"), "SOURCES.md", join("assets", "CREDITS.md")]) assert.ok(!existsSync(join(d, f)), `${f} must not be written`);
    assert.equal(await main(["--project", d, "--lat", "10.7725", "--lon", "106.698"], quiet, quiet, deps(stubFetch({ overpass: { ...fx("overpass.json"), remark: "runtime remark: Timed out" } }))), 1);
    assert.equal(await main(["--project", d, "--lat", "10.7725", "--lon", "106.698"], quiet, quiet, deps(stubFetch({ overpass: { ...fx("overpass.json"), remark: "note: data may be stale" } }))), 0);
  } finally { rmSync(d, { recursive: true, force: true }); }
});
