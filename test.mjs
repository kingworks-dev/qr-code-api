// node test.mjs  (set JSQR=/path/to/node_modules/jsqr/dist/jsQR.js to also decode the output back with jsQR)
import { render, checkParams, buildPayload, contrast } from "./core.js";
import worker, { marketplace } from "./worker.js";
import assert from "node:assert";
import zlib from "node:zlib";
let decode = null;
if (process.env.JSQR) decode = (await import(process.env.JSQR)).default;
function pngPixels(buf) {
  assert.equal(buf.subarray(1, 4).toString(), "PNG");
  let p = 8, idat = [], w, h, plte;
  while (p < buf.length) { const len = buf.readUInt32BE(p), t = buf.subarray(p + 4, p + 8).toString(), d = buf.subarray(p + 8, p + 8 + len); if (t === "IHDR") { w = d.readUInt32BE(0); h = d.readUInt32BE(4); } if (t === "PLTE") plte = d; if (t === "IDAT") idat.push(d); p += 12 + len; }
  const raw = zlib.inflateSync(Buffer.concat(idat)); const rgba = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = raw[y * (w + 1) + 1 + x]; rgba.set([plte[i * 3], plte[i * 3 + 1], plte[i * 3 + 2], 255], (y * w + x) * 4); }
  return { w, h, rgba };
}
// params
assert.ok(checkParams({}).error);
assert.ok(checkParams({ data: "x", format: "gif" }).error);
assert.ok(checkParams({ data: "x", ecc: "Z" }).error);
assert.ok(checkParams({ data: "x", size: 10 }).error);
assert.ok(checkParams({ data: "x", fg: "red" }).error);
assert.ok(checkParams({ data: "x".repeat(1001) }).error.includes("max"));
assert.equal(checkParams({ data: "x", fg: "#FFF" }).ok.fg, "#ffffff");
assert.ok(contrast("#000000", "#ffffff") > 20);
// svg
let r = await render({ data: "https://example.com", format: "svg" });
assert.equal(r.status, 200); assert.ok(r.body.startsWith("<svg")); assert.equal(r.type.split(";")[0], "image/svg+xml"); assert.equal(r.hdr["x-qr-version"], "2");
// png + decode
const url = "https://example.com/path?a=1&b=héllo";
r = await render({ data: url, format: "png", size: 400 });
assert.equal(r.status, 200); const px = pngPixels(Buffer.from(r.body)); assert.equal(px.w, 400); assert.equal(px.h, 400);
if (decode) { const d = decode(px.rgba, px.w, px.h); assert.equal(d.data, url); console.log("png decodes back to input (jsQR)"); }
r = await render({ data: "colored", format: "png", size: 300, fg: "#1a237e", bg: "#fffde7", ecc: "H" }); const px2 = pngPixels(Buffer.from(r.body));
if (decode) assert.equal(decode(px2.rgba, 300, 300).data, "colored");
// json
r = await render({ data: "hello", format: "json", ecc: "L" });
assert.equal(r.json.modules, 21); assert.equal(r.json.matrix.length, 21); assert.ok(r.json.svg.startsWith("<svg")); assert.ok(r.json.png_base64.startsWith("iVBOR"));
// capacity / contrast warn
r = await render({ data: "x".repeat(1000), ecc: "H", format: "json" }); assert.equal(r.status, 200); assert.equal(r.json.version, 36);
r = await render({ data: "x", fg: "#cccccc", bg: "#ffffff", format: "json" }); assert.ok(r.json.warning);
// payload builders
assert.equal(buildPayload("wifi", { ssid: "My;Net", password: "p:w", security: "WPA" }).data, "WIFI:T:WPA;S:My\\;Net;P:p\\:w;;");
assert.equal(buildPayload("wifi", { ssid: "Open" }).data, "WIFI:T:nopass;S:Open;;");
assert.ok(buildPayload("wifi", { password: "x" }).error);
assert.ok(buildPayload("url", { url: "javascript:alert(1)" }).error);
assert.equal(buildPayload("url", { url: "https://a.com" }).data, "https://a.com/");
assert.equal(buildPayload("email", { to: "a@b.co", subject: "Hi there" }).data, "mailto:a@b.co?subject=Hi%20there");
assert.equal(buildPayload("tel", { number: "+1 (555) 123-4567" }).data, "tel:+15551234567");
assert.equal(buildPayload("geo", { lat: 30.2672, lon: -97.7431 }).data, "geo:30.2672,-97.7431");
assert.ok(buildPayload("geo", { lat: 99, lon: 0 }).error);
assert.ok(buildPayload("vcard", { name: "A B", phone: "1" }).data.startsWith("BEGIN:VCARD"));
// worker
const env = { PROXY_SECRET: "s1", PROXY_SECRET_APIMARKET: "s2", PROXY_SECRET_ZYLA: "s3" };
const call = (path, init = {}, sec = "s1") => worker.fetch(new Request("https://x" + path, { ...init, headers: { ...(sec ? { "X-RapidAPI-Proxy-Secret": sec } : {}), ...(init.headers || {}) } }), env);
assert.equal((await worker.fetch(new Request("https://x/health"), env)).status, 200);
assert.equal((await call("/qr?data=a", {}, null)).status, 403);
assert.equal((await call("/qr?data=a", {}, "bad")).status, 403);
assert.equal((await call("/qr?data=a", {}, "s2")).status, 200);
assert.equal((await call("/qr?data=a", {}, "s3")).status, 200);
let w = await call("/qr?data=a&format=png"); assert.equal(w.headers.get("content-type"), "image/png");
w = await call("/qr", { method: "POST", body: JSON.stringify({ data: "post", format: "json" }) }); assert.equal((await w.json()).modules, 21);
w = await call("/qr", { method: "POST", body: "{" }); assert.equal(w.status, 400);
w = await call("/qr/wifi?ssid=Home&password=pw"); assert.equal(w.status, 200);
w = await call("/qr/wifi?format=json&ssid=Home&password=pw"); assert.equal((await w.json()).data, "WIFI:T:WPA;S:Home;P:pw;;");
w = await call("/qr/batch", { method: "POST", body: JSON.stringify({ items: [{ data: "a" }, { data: "" }] }) }); const bj = await w.json(); assert.equal(bj.count, 2); assert.ok(bj.results[0].svg); assert.ok(bj.results[1].error);
w = await call("/qr/batch", { method: "POST", body: JSON.stringify({ items: Array(11).fill({ data: "a" }) }) }); assert.equal(w.status, 400);
assert.equal((await call("/nope")).status, 404);
assert.equal((await call("/qr?data=a", { method: "DELETE" })).status, 405);
console.log("all tests pass");
