import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }), {
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
  }, { waitUntil() {}, passThroughOnException() {} });
}

test("server-renders the Skewed application shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>Skewed — Atmospheric Intelligence<\/title>/i);
  assert.match(html, /SKEWED/);
  assert.match(html, /SKEW-T · LOG-P/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/);
});

test("keeps live data and meteorology behind explicit modules", async () => {
  const [provider, meteorology, page] = await Promise.all([
    readFile(new URL("../lib/providers/open-meteo.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/meteorology.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(provider, /ncep_hrrr_conus/);
  assert.match(provider, /surface_pressure/);
  assert.match(provider, /level\.heightM > payload\.elevation/);
  assert.doesNotMatch(provider, /name: "Wichita, KS"/);
  assert.match(meteorology, /surfaceParcelProfile/);
  assert.match(meteorology, /stormRelativeHelicity/);
  assert.match(page, /MapPicker/);
  assert.match(page, /DATA PROVENANCE/);
});
