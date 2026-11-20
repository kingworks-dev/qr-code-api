// QR code generation core. Encoder: qrcode-generator 2.0.4 (MIT, Kazuhiko Arase), vendored as qrcode_lib.js. Output rendering is ours.
import qrcode from "./qrcode_lib.js";
import { stringToBytes } from "./qrcode_lib.js";
export const MAX_BYTES = 1000;
const ECC = new Set(["L", "M", "Q", "H"]);
const HEX = /^#?([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/;
const normHex = h => { let s = String(h).replace(/^#/, ""); if (s.length === 3) s = s.split("").map(c => c + c).join(""); return "#" + s.toLowerCase(); };
const lum = h => { const [r, g, b] = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const int = (v, d) => (v == null || v === "" ? d : Number(v));

export function checkParams(q) {
  const data = q.data == null ? "" : String(q.data);
  if (!data) return { error: "data is required" };
  const n = stringToBytes(data).length;
  if (n > MAX_BYTES) return { error: `data is ${n} bytes; max ${MAX_BYTES}` };
  const format = String(q.format || "svg").toLowerCase();
  if (!["svg", "png", "json"].includes(format)) return { error: "format must be svg, png or json" };
  const ecc = String(q.ecc || "M").toUpperCase();
  if (!ECC.has(ecc)) return { error: "ecc must be L, M, Q or H" };
  const size = int(q.size, 300), margin = int(q.margin, 4);
  if (!Number.isInteger(size) || size < 64 || size > 2048) return { error: "size must be an integer 64-2048 (pixels)" };
  if (!Number.isInteger(margin) || margin < 0 || margin > 20) return { error: "margin must be an integer 0-20 (modules)" };
  const fg = q.fg == null || q.fg === "" ? "#000000" : q.fg, bg = q.bg == null || q.bg === "" ? "#ffffff" : q.bg;
  if (!HEX.test(fg) || !HEX.test(bg)) return { error: "fg and bg must be hex colors like 000000 or #fff" };
  return { ok: { data, format, ecc, size, margin, fg: normHex(fg), bg: normHex(bg) } };
}

export function makeMatrix(data, ecc) {
  const qr = qrcode(0, ecc);
  qr.addData(data, "Byte");
  qr.make();
  const n = qr.getModuleCount(), rows = [];
  for (let r = 0; r < n; r++) { let s = ""; for (let c = 0; c < n; c++) s += qr.isDark(r, c) ? "1" : "0"; rows.push(s); }
  return rows;
}

export function toSvg(rows, { size, margin, fg, bg }) {
  const n = rows.length, t = n + margin * 2;
  let d = "";
  rows.forEach((row, y) => { let x = 0; while (x < n) { if (row[x] === "1") { let e = x; while (e < n && row[e] === "1") e++; d += `M${x + margin} ${y + margin}h${e - x}v1h-${e - x}z`; x = e; } else x++; } });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${t} ${t}" shape-rendering="crispEdges"><rect width="${t}" height="${t}" fill="${bg}"/><path d="${d}" fill="${fg}"/></svg>`;
}

const crcT = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = b => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = crcT[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const u32 = v => new Uint8Array([v >>> 24, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]);
const cat = arrs => { const o = new Uint8Array(arrs.reduce((s, a) => s + a.length, 0)); let p = 0; for (const a of arrs) { o.set(a, p); p += a.length; } return o; };
const chunk = (type, data) => { const t = new TextEncoder().encode(type); return cat([u32(data.length), t, data, u32(crc32(cat([t, data])))]); };
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));

// PNG: 1-bit-per-module scaled to an integer cell size, then centered in an exact size x size canvas (palette, 8-bit index).
export async function toPng(rows, { size, margin, fg, bg }) {
  const n = rows.length, t = n + margin * 2, cell = Math.max(1, Math.floor(size / t)), qrPx = t * cell, off = Math.floor((size - qrPx) / 2);
  const raw = new Uint8Array(size * (size + 1));
  for (let y = 0; y < size; y++) {
    const base = y * (size + 1); raw[base] = 0;
    const my = Math.floor((y - off) / cell) - margin;
    for (let x = 0; x < size; x++) {
      const mx = Math.floor((x - off) / cell) - margin;
      raw[base + 1 + x] = (y >= off && x >= off && y < off + qrPx && x < off + qrPx && my >= 0 && mx >= 0 && my < n && mx < n && rows[my][mx] === "1") ? 1 : 0;
    }
  }
  const z = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream("deflate"))).arrayBuffer());
  const ihdr = cat([u32(size), u32(size), new Uint8Array([8, 3, 0, 0, 0])]);
  const plte = new Uint8Array([...rgb(bg), ...rgb(fg)]);
  return cat([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("PLTE", plte), chunk("IDAT", z), chunk("IEND", new Uint8Array(0))]);
}

const b64 = u8 => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };

// Returns {status, json} or {status, body, type}
export async function render(q) {
  const c = checkParams(q);
  if (c.error) return { status: 400, json: { error: c.error } };
  const p = c.ok;
  let rows;
  try { rows = makeMatrix(p.data, p.ecc); } catch (e) { return { status: 400, json: { error: "data does not fit a QR code at ecc " + p.ecc + "; lower ecc or shorten data" } }; }
  const warn = contrast(p.fg, p.bg) < 3 ? "fg/bg contrast ratio below 3:1; many scanners will fail to read this code" : undefined;
  const hdr = { "x-qr-modules": String(rows.length), "x-qr-version": String((rows.length - 17) / 4) };
  if (warn) hdr["x-qr-warning"] = warn;
  if (p.format === "svg") return { status: 200, body: toSvg(rows, p), type: "image/svg+xml; charset=utf-8", hdr };
  if (p.format === "png") return { status: 200, body: await toPng(rows, p), type: "image/png", hdr };
  return { status: 200, json: { data: p.data, ecc: p.ecc, version: (rows.length - 17) / 4, modules: rows.length, margin: p.margin, fg: p.fg, bg: p.bg, matrix: rows, svg: toSvg(rows, p), png_base64: b64(await toPng(rows, p)), ...(warn ? { warning: warn } : {}) } };
}

const esc = s => String(s).replace(/([\;,:"])/g, "\\$1");
export function buildPayload(kind, q) {
  const s = k => (q[k] == null ? "" : String(q[k]).trim());
  if (kind === "wifi") {
    if (!s("ssid")) return { error: "ssid is required" };
    const sec = (s("security") || (s("password") ? "WPA" : "nopass")).toUpperCase();
    if (!["WPA", "WEP", "NOPASS"].includes(sec)) return { error: "security must be WPA, WEP or nopass" };
    if (sec !== "NOPASS" && !s("password")) return { error: "password is required unless security is nopass" };
    const hidden = ["1", "true", "yes"].includes(s("hidden").toLowerCase());
    return { data: `WIFI:T:${sec === "NOPASS" ? "nopass" : sec};S:${esc(s("ssid"))};${sec === "NOPASS" ? "" : `P:${esc(s("password"))};`}${hidden ? "H:true;" : ""};` };
  }
  if (kind === "url") {
    let u; try { u = new URL(s("url")); } catch (e) { return { error: "url must be an absolute http(s) URL" }; }
    if (!/^https?:$/.test(u.protocol)) return { error: "url must be http or https" };
    return { data: u.href };
  }
  if (kind === "email") { if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s("to"))) return { error: "to must be an email address" }; const p = new URLSearchParams(); if (s("subject")) p.set("subject", s("subject")); if (s("body")) p.set("body", s("body")); const qs = p.toString().replace(/\+/g, "%20"); return { data: `mailto:${s("to")}${qs ? "?" + qs : ""}` }; }
  if (kind === "tel") { if (!/^\+?[0-9 ()-]{5,20}$/.test(s("number"))) return { error: "number must be 5-20 digits, optional leading +" }; return { data: "tel:" + s("number").replace(/[ ()-]/g, "") }; }
  if (kind === "geo") { const la = Number(s("lat")), lo = Number(s("lon")); if (s("lat") === "" || s("lon") === "" || !(la >= -90 && la <= 90) || !(lo >= -180 && lo <= 180)) return { error: "lat (-90..90) and lon (-180..180) are required" }; return { data: `geo:${la},${lo}` }; }
  if (kind === "vcard") {
    if (!s("name")) return { error: "name is required" };
    const L = ["BEGIN:VCARD", "VERSION:3.0", "FN:" + s("name").replace(/[\r\n]/g, " ")];
    if (s("org")) L.push("ORG:" + s("org").replace(/[\r\n]/g, " "));
    if (s("title")) L.push("TITLE:" + s("title").replace(/[\r\n]/g, " "));
    if (s("phone")) L.push("TEL:" + s("phone").replace(/[\r\n]/g, " "));
    if (s("email")) L.push("EMAIL:" + s("email").replace(/[\r\n]/g, " "));
    if (s("url")) L.push("URL:" + s("url").replace(/[\r\n]/g, " "));
    L.push("END:VCARD");
    return { data: L.join("\n") };
  }
  return { error: "unknown type" };
}
export const KINDS = ["wifi", "url", "email", "tel", "geo", "vcard"];
