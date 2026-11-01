const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem("devkit:" + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("devkit:" + k, JSON.stringify(v)); } catch {} },
};

let toastTimer;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 1400);
}
async function copy(text) {
  try { await navigator.clipboard.writeText(text); }
  catch {
    const ta = Object.assign(document.createElement("textarea"), { value: text });
    document.body.append(ta); ta.select(); document.execCommand("copy"); ta.remove();
  }
  toast("Copied");
}
// Any element with data-copy="#selector" or data-copy-text copies on click.
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-copy], [data-copy-text]");
  if (!b) return;
  const text = b.dataset.copyText ?? ($(b.dataset.copy).value ?? $(b.dataset.copy).textContent);
  if (text) copy(text);
});
const copyBtn = (text) => `<button class="copy" data-copy-text="${esc(text)}">Copy</button>`;
const kvRows = (rows) => rows.map(([k, v]) => `<span class="k">${esc(k)}</span><span class="v">${v === "" ? "<span class=pill>empty</span>" : esc(v)}</span>${copyBtn(v)}`).join("");

// UTF-8 safe base64 helpers.
const b64encode = (str, urlSafe) => {
  const bytes = new TextEncoder().encode(str);
  let bin = ""; for (const b of bytes) bin += String.fromCharCode(b);
  const out = btoa(bin);
  return urlSafe ? out.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") : out;
};
const b64decode = (str) => {
  let s = str.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(s)) throw new Error("That isn't valid Base64: it has characters outside A–Z, a–z, 0–9, + / - _ =.");
  s += "===".slice((s.length + 3) % 4);
  const bin = atob(s);
  return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};

const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
// Unbiased random integer in [0, n) from the secure generator.
const randInt = (n) => { if (!(n >= 1 && n <= 2 ** 32)) throw new RangeError("randInt: n must be 1..2^32"); const max = Math.floor(2 ** 32 / n) * n, a = new Uint32Array(1); do crypto.getRandomValues(a); while (a[0] >= max); return a[0] % n; };
const pick = (arr) => arr[randInt(arr.length)];
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const bytesB64 = (buf) => { let bin = ""; for (const b of new Uint8Array(buf)) bin += String.fromCharCode(b); return btoa(bin); };

const ago = (ms) => {
  const s = Math.round((ms - Date.now()) / 1000), a = Math.abs(s);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, sec] of [["year", 31536000], ["month", 2592000], ["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60]])
    if (a >= sec) return rtf.format(Math.round(s / sec), unit);
  return rtf.format(s, "second");
};
const fmtDate = (d, tz) => d.toLocaleString("en-GB", { timeZone: tz, weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

// Finds where JSON.parse would fail, because newer browsers no longer say.
function jsonErrorAt(src) {
  let i = 0;
  const ws = () => { while (/\s/.test(src[i] || "")) i++; };
  const fail = () => { throw i; };
  const lit = (w) => { if (src.startsWith(w, i)) i += w.length; else fail(); };
  const str = () => {
    i++;
    while (i < src.length && src[i] !== '"') {
      if (src[i] === "\\") { i++; if (src[i] === "u") { if (!/^[0-9a-fA-F]{4}$/.test(src.slice(i + 1, i + 5))) fail(); i += 4; } else if (!'"\\/bfnrt'.includes(src[i])) fail(); }
      else if (src.charCodeAt(i) < 32) fail();
      i++;
    }
    if (src[i] !== '"') fail(); i++;
  };
  const val = () => {
    ws(); const c = src[i];
    if (c === "{") { i++; ws(); if (src[i] === "}") { i++; return; } for (;;) { ws(); if (src[i] !== '"') fail(); str(); ws(); if (src[i] !== ":") fail(); i++; val(); ws(); if (src[i] === ",") { i++; continue; } if (src[i] === "}") { i++; return; } fail(); } }
    if (c === "[") { i++; ws(); if (src[i] === "]") { i++; return; } for (;;) { val(); ws(); if (src[i] === ",") { i++; continue; } if (src[i] === "]") { i++; return; } fail(); } }
    if (c === '"') return str();
    if (c === "t") return lit("true"); if (c === "f") return lit("false"); if (c === "n") return lit("null");
    const m = src.slice(i).match(/^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/);
    if (!m) fail(); i += m[0].length;
  };
  try { val(); ws(); if (i < src.length) fail(); return -1; } catch (pos) { return typeof pos === "number" ? Math.min(pos, src.length) : -1; }
}

// Tools ------------------------------------------------------------------------
const TOOLS = [
  {
    id: "json", tag: "{}", name: "JSON", desc: "Format, minify and validate JSON. Errors point to the exact line.",
    html: () => `
      <div class="row"><button class="btn primary" data-act="fmt">Format</button><button class="btn" data-act="min">Minify</button><button class="btn" data-act="sort">Sort keys</button>
        <label>Indent <select class="btn" id="indent"><option value="2">2 spaces</option><option value="4">4 spaces</option><option value="tab">Tab</option></select></label></div>
      <div class="grid2">
        <div class="box"><div class="box-head">Input<div class="acts"><button class="btn" data-act="sample">Sample</button><button class="btn" data-act="clear">Clear</button></div></div><textarea id="in" spellcheck="false" placeholder='Paste JSON here, e.g. {"name":"Ada"}'></textarea></div>
        <div class="box"><div class="box-head">Output<div class="acts"><button class="btn" data-copy="#out">Copy</button></div></div><pre class="out" id="out"></pre></div>
      </div>
      <div class="status" id="status"></div>`,
    init(el) {
      const inp = $("#in", el), out = $("#out", el), st = $("#status", el);
      inp.value = store.get("json", "");
      const sortKeys = (v) => Array.isArray(v) ? v.map(sortKeys) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v;
      const run = (mode = "fmt") => {
        store.set("json", inp.value);
        const src = inp.value;
        if (!src.trim()) { out.textContent = ""; st.textContent = ""; return; }
        try {
          let v = JSON.parse(src);
          if (mode === "sort") v = sortKeys(v);
          const ind = $("#indent", el).value;
          out.textContent = mode === "min" ? JSON.stringify(v) : JSON.stringify(v, null, ind === "tab" ? "\t" : +ind);
          const size = new Blob([out.textContent]).size;
          st.className = "status"; st.textContent = `Valid JSON · ${Array.isArray(v) ? `array of ${v.length}` : typeof v === "object" && v ? `object with ${Object.keys(v).length} keys` : typeof v} · ${size.toLocaleString()} bytes`;
        } catch (e) {
          out.textContent = "";
          const pos = jsonErrorAt(src);
          let msg = e.message.replace(/, .*is not valid JSON$/s, "").replace(/ in JSON at position \d+.*$/s, "");
          if (pos >= 0) {
            const before = src.slice(0, pos), line = before.split("\n").length, col = pos - before.lastIndexOf("\n");
            msg = `Line ${line}, column ${col}: ${msg}\n${src.split("\n")[line - 1]}\n${" ".repeat(Math.max(0, col - 1))}^`;
          }
          st.className = "status err"; st.innerHTML = `<pre style="margin:0;font:13px var(--mono);white-space:pre-wrap">${esc(msg)}</pre>`;
        }
      };
      let mode = "fmt";
      inp.addEventListener("input", () => run(mode));
      $("#indent", el).addEventListener("change", () => run(mode));
      el.addEventListener("click", (e) => {
        const a = e.target.closest("[data-act]")?.dataset.act;
        if (!a) return;
        if (a === "clear") { inp.value = ""; inp.focus(); }
        else if (a === "sample") inp.value = '{"user":{"id":42,"name":"Ada Obi","roles":["admin","dev"],"active":true},"city":"Lagos","balance":125000.5}';
        else mode = a;
        $$("[data-act=fmt],[data-act=min],[data-act=sort]", el).forEach((b) => b.classList.toggle("primary", b.dataset.act === mode));
        run(mode);
      });
      run();
    },
  },
  {
    id: "jwt", tag: "JWT", name: "JWT decoder", desc: "Read a token's header and claims, and see when it expires.",
    html: () => `
      <div class="box"><div class="box-head">Token<div class="acts"><button class="btn" data-act="sample">Sample</button></div></div><textarea class="small" id="in" spellcheck="false" placeholder="eyJhbGciOi..."></textarea></div>
      <div class="status" id="status"></div>
      <div class="grid2" style="margin-top:16px">
        <div class="box"><div class="box-head">Header<button class="btn" data-copy="#h">Copy</button></div><pre class="out small" id="h"></pre></div>
        <div class="box"><div class="box-head">Payload<button class="btn" data-copy="#p">Copy</button></div><pre class="out small" id="p"></pre></div>
      </div>
      <div class="box" style="margin-top:16px" id="claims-box" hidden><div class="box-head">Times</div><div class="kv" id="claims"></div></div>
      <p style="color:var(--muted);font-size:13px">The signature is not checked. Decoding shows what's inside a token, not whether it can be trusted.</p>`,
    init(el) {
      const inp = $("#in", el), st = $("#status", el);
      const run = () => {
        const t = inp.value.trim();
        $("#h", el).textContent = ""; $("#p", el).textContent = ""; $("#claims-box", el).hidden = true;
        if (!t) { st.textContent = ""; return; }
        try {
          const parts = t.replace(/^Bearer\s+/i, "").split(".");
          if (parts.length < 2) throw new Error("A JWT has three parts separated by dots: header.payload.signature");
          const h = JSON.parse(b64decode(parts[0])), p = JSON.parse(b64decode(parts[1]));
          $("#h", el).textContent = JSON.stringify(h, null, 2);
          $("#p", el).textContent = JSON.stringify(p, null, 2);
          const times = ["iat", "nbf", "exp", "auth_time"].filter((k) => typeof p[k] === "number");
          if (times.length) {
            $("#claims-box", el).hidden = false;
            const names = { iat: "Issued", nbf: "Not before", exp: "Expires", auth_time: "Signed in" };
            $("#claims", el).innerHTML = kvRows(times.map((k) => [`${names[k]} (${k})`, `${new Date(p[k] * 1000).toISOString()} · ${ago(p[k] * 1000)}`]));
          }
          const now = Date.now() / 1000;
          if (typeof p.exp === "number" && p.exp < now) { st.className = "status err"; st.textContent = `Expired ${ago(p.exp * 1000)}.`; }
          else if (typeof p.nbf === "number" && p.nbf > now) { st.className = "status warn"; st.textContent = `Not valid yet. It starts ${ago(p.nbf * 1000)}.`; }
          else { st.className = "status"; st.textContent = `Decoded · ${h.alg || "no alg"}${typeof p.exp === "number" ? ` · expires ${ago(p.exp * 1000)}` : " · no expiry"}`; }
        } catch (e) { st.className = "status err"; st.textContent = e.message.startsWith("A JWT") ? e.message : "This doesn't decode as a JWT. Check you copied the whole token."; }
      };
      inp.addEventListener("input", run);
      $("[data-act=sample]", el).addEventListener("click", () => {
        const enc = (o) => b64encode(JSON.stringify(o), true), now = Math.floor(Date.now() / 1000);
        inp.value = `${enc({ alg: "HS256", typ: "JWT" })}.${enc({ sub: "user_42", name: "Ada Obi", role: "admin", iat: now - 600, exp: now + 3000 })}.c2lnbmF0dXJl`;
        run();
      });
    },
  },
  {
    id: "base64", tag: "64", name: "Base64", desc: "Encode and decode text, including emoji and URL-safe Base64.", input: "#b",
    html: () => `
      <div class="row"><button class="btn primary" data-act="enc">Encode →</button><button class="btn" data-act="dec">← Decode</button><label><input type="checkbox" id="url"> URL-safe</label></div>
      <div class="grid2">
        <div class="box"><div class="box-head">Text<button class="btn" data-copy="#a">Copy</button></div><textarea id="a" spellcheck="false" placeholder="Plain text"></textarea></div>
        <div class="box"><div class="box-head">Base64<button class="btn" data-copy="#b">Copy</button></div><textarea id="b" spellcheck="false" placeholder="Base64"></textarea></div>
      </div><div class="status" id="status"></div>`,
    init(el) {
      const a = $("#a", el), b = $("#b", el), st = $("#status", el);
      const enc = () => { st.textContent = ""; b.value = a.value ? b64encode(a.value, $("#url", el).checked) : ""; };
      const dec = () => {
        if (!b.value.trim()) { a.value = ""; st.textContent = ""; return; }
        try { a.value = b64decode(b.value); st.textContent = ""; }
        catch (e) { st.className = "status err"; st.textContent = e.message.startsWith("That") ? e.message : "This decodes to binary data, not readable text."; }
      };
      a.addEventListener("input", enc); b.addEventListener("input", dec); $("#url", el).addEventListener("change", enc);
      $("[data-act=enc]", el).addEventListener("click", enc); $("[data-act=dec]", el).addEventListener("click", dec);
    },
  },
  {
    id: "url", tag: "%", name: "URL", desc: "Encode, decode and break a URL into its parts and query params.",
    html: () => `
      <div class="row"><button class="btn primary" data-act="enc">Encode</button><button class="btn" data-act="dec">Decode</button></div>
      <div class="box"><div class="box-head">URL or text<button class="btn" data-copy="#in">Copy</button></div><textarea class="small" id="in" spellcheck="false" placeholder="https://example.com/search?q=jollof rice&city=Lagos"></textarea></div>
      <div class="status" id="status"></div>
      <div class="box" style="margin-top:16px" id="parts-box" hidden><div class="box-head">Parts</div><div class="kv" id="parts"></div></div>
      <div class="box" style="margin-top:16px" id="q-box" hidden><div class="box-head">Query params</div><div class="kv" id="q"></div></div>`,
    init(el) {
      const inp = $("#in", el), st = $("#status", el);
      const parse = () => {
        $("#parts-box", el).hidden = $("#q-box", el).hidden = true;
        let u; try { u = new URL(inp.value.trim()); } catch { return; }
        $("#parts-box", el).hidden = false;
        $("#parts", el).innerHTML = kvRows([["Protocol", u.protocol], ["Host", u.hostname], ["Port", u.port], ["Path", decodeURIComponent(u.pathname)], ["Query", u.search], ["Hash", u.hash]].filter(([, v]) => v));
        const qs = [...u.searchParams];
        if (qs.length) { $("#q-box", el).hidden = false; $("#q", el).innerHTML = kvRows(qs); }
      };
      inp.addEventListener("input", () => { st.textContent = ""; parse(); });
      el.addEventListener("click", (e) => {
        const a = e.target.closest("[data-act]")?.dataset.act;
        if (!a) return;
        try { inp.value = a === "enc" ? encodeURIComponent(inp.value) : decodeURIComponent(inp.value.replace(/\+/g, " ")); st.textContent = ""; }
        catch { st.className = "status err"; st.textContent = "This has a broken % sequence, so it can't be decoded."; }
        parse();
      });
    },
  },
  {
    id: "time", tag: "ts", name: "Timestamp", desc: "Convert Unix timestamps and dates, with Lagos (WAT) and UTC.",
    html: () => `
      <div class="box"><div class="box-head">Now<span class="pill" id="live-ago">live</span></div><div class="kv" id="now"></div></div>
      <div class="box" style="margin-top:16px"><div class="box-head">Convert</div>
        <div style="padding:14px"><input class="input" id="in" placeholder="1730300000, 1730300000000 or 2026-10-30 14:00" autocomplete="off" spellcheck="false"></div>
        <div class="kv" id="res"></div></div>
      <div class="status" id="status"></div>`,
    init(el) {
      const tick = () => {
        if (!el.isConnected) return clearInterval(timer);
        const n = Date.now();
        $("#now", el).innerHTML = kvRows([["Unix seconds", String(Math.floor(n / 1000))], ["Unix ms", String(n)], ["ISO 8601", new Date(n).toISOString()]]);
      };
      const timer = setInterval(tick, 1000); tick();
      const inp = $("#in", el), st = $("#status", el);
      const run = () => {
        const v = inp.value.trim(); st.textContent = ""; $("#res", el).innerHTML = "";
        if (!v) return;
        let d, guess = "";
        if (/^-?\d+(\.\d+)?$/.test(v)) {
          const n = +v;
          if (Math.abs(n) >= 1e14) { d = new Date(n / 1000); guess = "Read as microseconds"; }
          else if (Math.abs(n) >= 1e11) { d = new Date(n); guess = "Read as milliseconds"; }
          else { d = new Date(n * 1000); guess = "Read as seconds"; }
        } else d = new Date(v);
        if (isNaN(d)) { st.className = "status err"; st.textContent = "Couldn't read that as a date or timestamp."; return; }
        $("#res", el).innerHTML = kvRows([
          ["Lagos (WAT)", fmtDate(d, "Africa/Lagos")],
          ["UTC", fmtDate(d, "UTC")],
          ["Your time", fmtDate(d)],
          ["ISO 8601", d.toISOString()],
          ["Unix seconds", String(Math.floor(d.getTime() / 1000))],
          ["Unix ms", String(d.getTime())],
          ["Relative", ago(d.getTime())],
        ]);
        if (guess) { st.className = "status"; st.textContent = guess + "."; }
      };
      inp.addEventListener("input", run);
    },
  },
  {
    id: "uuid", tag: "ID", name: "UUID", desc: "Generate random v4 UUIDs, one or a few hundred at a time.",
    html: () => `
      <div class="row"><button class="btn primary" data-act="gen">Generate</button>
        <label>How many <input class="input" id="n" type="number" min="1" max="500" value="5" style="width:80px;height:30px"></label>
        <label><input type="checkbox" id="upper"> Uppercase</label><label><input type="checkbox" id="nohy"> No hyphens</label></div>
      <div class="box"><div class="box-head">UUIDs<button class="btn" data-copy="#out">Copy all</button></div><ul class="list" id="list"></ul><pre id="out" hidden></pre></div>`,
    init(el) {
      const gen = () => {
        const n = Math.min(500, Math.max(1, +$("#n", el).value || 1));
        const ids = Array.from({ length: n }, () => {
          let u = crypto.randomUUID();
          if ($("#nohy", el).checked) u = u.replace(/-/g, "");
          return $("#upper", el).checked ? u.toUpperCase() : u;
        });
        $("#out", el).textContent = ids.join("\n");
        $("#list", el).innerHTML = ids.map((u) => `<li><span>${u}</span>${copyBtn(u)}</li>`).join("");
      };
      $("[data-act=gen]", el).addEventListener("click", gen);
      $$("input", el).forEach((i) => i.addEventListener("change", gen));
      gen();
    },
  },
  {
    id: "hash", tag: "#", name: "Hash", desc: "SHA-1, SHA-256, SHA-384 and SHA-512 of any text, as you type.",
    html: () => `
      <div class="box"><div class="box-head">Text</div><textarea class="small" id="in" spellcheck="false" placeholder="Type or paste text"></textarea></div>
      <div class="box" style="margin-top:16px"><div class="box-head">Hashes (hex)</div><div class="kv" id="out"></div></div>`,
    init(el) {
      const inp = $("#in", el);
      let seq = 0;
      const run = async () => {
        const my = ++seq, data = new TextEncoder().encode(inp.value);
        const rows = [];
        for (const alg of ["SHA-1", "SHA-256", "SHA-384", "SHA-512"]) {
          const buf = await crypto.subtle.digest(alg, data);
          rows.push([alg, hex(buf)]);
        }
        if (my === seq) $("#out", el).innerHTML = kvRows(rows);
      };
      inp.addEventListener("input", run); run();
    },
  },
  {
    id: "regex", tag: ".*", name: "Regex tester", desc: "Test a JavaScript regular expression with live highlighting.",
    html: () => `
      <div class="row" style="flex-wrap:nowrap"><input class="input" id="pat" placeholder="Pattern, e.g. \\b0[789][01]\\d{8}\\b" spellcheck="false" autocomplete="off"><input class="input" id="flags" value="g" style="width:80px" aria-label="Flags" spellcheck="false"></div>
      <div class="status" id="status" style="margin:-4px 0 14px"></div>
      <div class="grid2">
        <div class="box"><div class="box-head">Test text</div><textarea id="txt" spellcheck="false">Call Ada on 08031234567 or Tunde on 09087654321.
Office: 01-2345678</textarea></div>
        <div class="box"><div class="box-head">Matches <span class="pill" id="count">0</span></div><pre class="out" id="hl"></pre></div>
      </div>
      <div class="box" style="margin-top:16px" id="groups-box" hidden><div class="box-head">Match details</div><ul class="list" id="groups"></ul></div>`,
    init(el) {
      const pat = $("#pat", el), flags = $("#flags", el), txt = $("#txt", el), st = $("#status", el);
      pat.value = store.get("regex", "\\b0[789][01]\\d{8}\\b");
      const run = () => {
        store.set("regex", pat.value);
        st.textContent = ""; $("#groups-box", el).hidden = true;
        const text = txt.value;
        if (!pat.value) { $("#hl", el).textContent = text; $("#count", el).textContent = "0"; return; }
        let re;
        try { re = new RegExp(pat.value, flags.value.includes("g") ? flags.value : flags.value + "g"); }
        catch (e) { st.className = "status err"; st.textContent = e.message; $("#hl", el).textContent = text; return; }
        const ms = [...text.matchAll(re)].filter((m, i) => i < 1000);
        let html = "", last = 0;
        for (const m of ms) { if (!m[0]) continue; html += esc(text.slice(last, m.index)) + `<mark>${esc(m[0])}</mark>`; last = m.index + m[0].length; }
        $("#hl", el).innerHTML = html + esc(text.slice(last));
        $("#count", el).textContent = ms.length;
        $("#count", el).className = ms.length ? "pill ok" : "pill";
        if (ms.length) {
          $("#groups-box", el).hidden = false;
          $("#groups", el).innerHTML = ms.slice(0, 50).map((m, i) => `<li><span>${i + 1}. ${esc(m[0]) || "<small>(empty)</small>"}${m.length > 1 ? ` <small>groups: ${m.slice(1).map((g) => g === undefined ? "–" : esc(g)).join(", ")}</small>` : ""}</span><small>index ${m.index}</small></li>`).join("");
        }
      };
      [pat, flags, txt].forEach((i) => i.addEventListener("input", run)); run();
    },
  },
  {
    id: "cron", tag: "cron", name: "Cron explainer", desc: "Turn a cron expression into plain English and see the next runs.",
    html: () => `
      <input class="input" id="in" value="30 9 * * 1-5" spellcheck="false" autocomplete="off" style="font-size:20px;height:52px">
      <div class="row" style="margin-top:10px" id="presets"></div>
      <div class="status" id="status"></div>
      <div class="box" style="margin-top:16px"><div class="box-head">Next 5 runs (your time)</div><ul class="list" id="next"></ul></div>
      <p style="color:var(--muted);font-size:13px">Format: minute hour day-of-month month day-of-week. Supports *, lists (1,15), ranges (1-5), steps (*/10) and names (MON, JAN).</p>`,
    init(el) {
      const presets = [["Every 5 minutes", "*/5 * * * *"], ["Hourly", "0 * * * *"], ["Daily at midnight", "0 0 * * *"], ["Weekdays 9:30", "30 9 * * 1-5"], ["1st of month", "0 8 1 * *"], ["Sundays 6pm", "0 18 * * 0"]];
      $("#presets", el).innerHTML = presets.map(([n, c]) => `<button class="btn" data-cron="${c}">${n}</button>`).join("");
      const inp = $("#in", el), st = $("#status", el);
      inp.value = store.get("cron", inp.value);
      const MON = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], DOW = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
      const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
      const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const SPEC = [["minute", 0, 59], ["hour", 0, 23], ["day of month", 1, 31], ["month", 1, 12, MON], ["day of week", 0, 7, DOW]];
      const MACROS = { "@yearly": "0 0 1 1 *", "@annually": "0 0 1 1 *", "@monthly": "0 0 1 * *", "@weekly": "0 0 * * 0", "@daily": "0 0 * * *", "@midnight": "0 0 * * *", "@hourly": "0 * * * *" };
      function field(src, [name, lo, hi, names]) {
        const set = new Set();
        for (const part of src.toLowerCase().split(",")) {
          const m = part.match(/^(\*|[a-z0-9]+(?:-[a-z0-9]+)?)(?:\/(\d+))?$/);
          if (!m) throw new Error(`"${part}" isn't valid in the ${name} field.`);
          const num = (s) => { const i = names ? names.indexOf(s) : -1; const n = i >= 0 ? i + (name === "month" ? 1 : 0) : /^\d+$/.test(s) ? +s : NaN; if (isNaN(n) || n < lo || n > hi) throw new Error(`${s} is out of range for ${name} (${lo}–${hi}).`); return n; };
          let a = lo, b = hi;
          if (m[1] !== "*") { const [x, y] = m[1].split("-"); a = num(x); b = y !== undefined ? num(y) : m[2] ? hi : a; }
          if (a > b) throw new Error(`The range ${m[1]} in ${name} runs backwards.`);
          const step = m[2] ? +m[2] : 1;
          if (!step) throw new Error(`Step can't be 0 in ${name}.`);
          for (let v = a; v <= b; v += step) set.add(name === "day of week" && v === 7 ? 0 : v);
        }
        return set;
      }
      const words = (src, i) => {
        const [name] = SPEC[i];
        const label = (v) => i === 3 ? MONTHS[v - 1] : i === 4 ? DAYS[v % 7] : String(v);
        const lbl = (s) => /^\d+$/.test(s) ? label(+s) : i === 3 ? MONTHS[MON.indexOf(s.toLowerCase())] : i === 4 ? DAYS[DOW.indexOf(s.toLowerCase())] : s;
        return src.split(",").map((p) => {
          const [r, step] = p.split("/");
          if (r === "*") return step ? `every ${step} ${name}s` : `every ${name}`;
          const [a, b] = r.split("-");
          const base = b ? `${lbl(a)} through ${lbl(b)}` : lbl(a);
          return step ? `every ${step} ${name}s from ${base}` : base;
        }).join(", ");
      };
      const pad = (n) => String(n).padStart(2, "0");
      function describe(f) {
        const [mi, h, dom, mon, dow] = f;
        let s;
        if (/^\d+$/.test(mi) && /^\d+$/.test(h)) s = `At ${pad(h)}:${pad(mi)}`;
        else if (/^\d+$/.test(mi) && h === "*") s = mi === "0" ? "At the start of every hour" : `At ${mi} minutes past every hour`;
        else if (/^\d+$/.test(mi)) s = `At minute ${mi} past hour ${words(h, 1)}`;
        else if (mi === "*" && h === "*") s = "Every minute";
        else { const w = words(mi, 0); s = (/^every/.test(w) ? w[0].toUpperCase() + w.slice(1) : `At minute ${w}`) + (h !== "*" ? `, during hour${/^\d+$/.test(h) ? "" : "s"} ${words(h, 1)}` : ""); }
        if (dom !== "*" && dow !== "*") s += `, on day ${words(dom, 2)} of the month or on ${words(dow, 4)}`;
        else if (dom !== "*") s += `, on day ${words(dom, 2)} of the month`;
        else if (dow !== "*") s += `, on ${words(dow, 4)}`;
        if (mon !== "*") s += `, in ${words(mon, 3)}`;
        return s + ".";
      }
      function nextRuns(sets, raw, count) {
        const [mi, h, dom, mon, dow] = sets, domStar = raw[2] === "*", dowStar = raw[4] === "*";
        const dayOk = (d) => domStar && dowStar ? true : domStar ? dow.has(d.getDay()) : dowStar ? dom.has(d.getDate()) : dom.has(d.getDate()) || dow.has(d.getDay());
        const d = new Date(); d.setSeconds(0, 0); d.setMinutes(d.getMinutes() + 1);
        const out = [], limit = Date.now() + 5 * 366 * 864e5;
        while (out.length < count && d.getTime() < limit) {
          if (!mon.has(d.getMonth() + 1)) { d.setMonth(d.getMonth() + 1, 1); d.setHours(0, 0); continue; }
          if (!dayOk(d)) { d.setDate(d.getDate() + 1); d.setHours(0, 0); continue; }
          if (!h.has(d.getHours())) { d.setHours(d.getHours() + 1, 0); continue; }
          if (!mi.has(d.getMinutes())) { d.setMinutes(d.getMinutes() + 1); continue; }
          out.push(new Date(d)); d.setMinutes(d.getMinutes() + 1);
        }
        return out;
      }
      const run = () => {
        store.set("cron", inp.value);
        $("#next", el).innerHTML = "";
        let src = inp.value.trim();
        if (!src) { st.textContent = ""; return; }
        src = MACROS[src.toLowerCase()] || src;
        const raw = src.split(/\s+/);
        try {
          if (raw.length !== 5) throw new Error(`Cron needs 5 fields (minute hour day month weekday). This has ${raw.length}.`);
          const sets = raw.map((r, i) => field(r, SPEC[i]));
          st.className = "status"; st.textContent = describe(raw);
          const runs = nextRuns(sets, raw, 5);
          $("#next", el).innerHTML = runs.length ? runs.map((d) => `<li><span>${fmtDate(d)}</span><small>${ago(d.getTime())}</small></li>`).join("") : `<li><small>Never runs in the next 5 years (check the day and month).</small></li>`;
        } catch (e) { st.className = "status err"; st.textContent = e.message; }
      };
      inp.addEventListener("input", run);
      $("#presets", el).addEventListener("click", (e) => { const b = e.target.closest("[data-cron]"); if (b) { inp.value = b.dataset.cron; run(); } });
      run();
    },
  },
  {
    id: "password", tag: "***", name: "Password", desc: "Strong random passwords from your device's secure generator.",
    html: () => `
      <div class="box"><div class="box-head">Password<div class="acts"><button class="btn" data-act="gen">New</button><button class="btn primary" data-copy="#pw">Copy</button></div></div>
        <div class="big" id="pw"></div><div class="meter"><i id="meter"></i></div></div>
      <div class="status" id="status"></div>
      <div class="row" style="margin-top:16px"><label>Length <input type="range" id="len" min="8" max="64" value="20"> <b id="len-v" style="color:var(--text);font-family:var(--mono)">20</b></label></div>
      <div class="row"><label><input type="checkbox" id="lower" checked> a–z</label><label><input type="checkbox" id="upper" checked> A–Z</label><label><input type="checkbox" id="digits" checked> 0–9</label><label><input type="checkbox" id="symbols" checked> !@#$</label><label><input type="checkbox" id="similar"> Skip look-alikes (l, 1, O, 0)</label></div>`,
    init(el) {
      const SETS = { lower: "abcdefghijklmnopqrstuvwxyz", upper: "ABCDEFGHIJKLMNOPQRSTUVWXYZ", digits: "0123456789", symbols: "!@#$%^&*()-_=+[]{};:,.?/" };
      const rand = randInt;
      const gen = () => {
        const len = +$("#len", el).value; $("#len-v", el).textContent = len;
        let sets = Object.keys(SETS).filter((k) => $("#" + k, el).checked).map((k) => SETS[k]);
        if ($("#similar", el).checked) sets = sets.map((s) => s.replace(/[lI1O0o]/g, ""));
        if (!sets.length) { $("#status", el).className = "status err"; $("#status", el).textContent = "Pick at least one character type."; return; }
        $("#status", el).textContent = "";
        const all = sets.join("");
        // One from each chosen set, the rest from all, then shuffle.
        const chars = sets.map((s) => s[rand(s.length)]);
        while (chars.length < len) chars.push(all[rand(all.length)]);
        for (let i = chars.length - 1; i > 0; i--) { const j = rand(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
        $("#pw", el).textContent = chars.join("");
        const bits = Math.round(len * Math.log2(all.length));
        $("#meter", el).style.width = Math.min(100, bits / 1.28) + "%";
        $("#meter", el).style.background = bits < 60 ? "var(--err)" : bits < 80 ? "var(--warn)" : "var(--accent)";
        $("#status", el).className = "status" + (bits < 60 ? " warn" : "");
        $("#status", el).textContent = `${bits} bits of entropy · ${bits < 60 ? "weak; make it longer" : bits < 80 ? "good" : "very strong"}`;
      };
      $("[data-act=gen]", el).addEventListener("click", gen);
      $$("input", el).forEach((i) => i.addEventListener("input", gen));
      gen();
    },
  },
  {
    id: "diff", tag: "±", name: "Text diff", desc: "Compare two texts line by line and see exactly what was added or removed.",
    html: () => `
      <div class="row"><label><input type="checkbox" id="ws"> Ignore whitespace</label><label><input type="checkbox" id="nocase"> Ignore case</label><button class="btn" data-act="sample">Sample</button></div>
      <div class="grid2">
        <div class="box"><div class="box-head">Original</div><textarea class="small" id="a" spellcheck="false" placeholder="Paste the old version"></textarea></div>
        <div class="box"><div class="box-head">Changed</div><textarea class="small" id="b" spellcheck="false" placeholder="Paste the new version"></textarea></div>
      </div>
      <div class="status" id="status"></div>
      <div class="box" style="margin-top:16px"><div class="box-head">Differences</div><pre class="out small diff" id="out"></pre></div>`,
    init(el) {
      const a = $("#a", el), b = $("#b", el), st = $("#status", el), out = $("#out", el);
      a.value = store.get("diff-a", ""); b.value = store.get("diff-b", "");
      const run = () => {
        store.set("diff-a", a.value); store.set("diff-b", b.value);
        out.innerHTML = ""; st.textContent = "";
        if (!a.value && !b.value) return;
        const A = a.value.split("\n"), B = b.value.split("\n"), n = A.length, m = B.length, w = m + 1;
        if (n * m > 4e6) { st.className = "status err"; st.textContent = "That's too big to compare here (keep each side under about 2,000 lines)."; return; }
        const norm = (s) => { if ($("#ws", el).checked) s = s.replace(/\s+/g, " ").trim(); return $("#nocase", el).checked ? s.toLowerCase() : s; };
        const NA = A.map(norm), NB = B.map(norm);
        // Longest common subsequence table, filled from the end.
        const L = new Uint32Array((n + 1) * w);
        for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
          L[i * w + j] = NA[i] === NB[j] ? L[(i + 1) * w + j + 1] + 1 : Math.max(L[(i + 1) * w + j], L[i * w + j + 1]);
        const rows = []; let i = 0, j = 0, add = 0, del = 0;
        while (i < n || j < m) {
          if (i < n && j < m && NA[i] === NB[j]) { rows.push(["same", B[j]]); i++; j++; }
          else if (i < n && (j >= m || L[(i + 1) * w + j] >= L[i * w + j + 1])) { rows.push(["del", A[i]]); i++; del++; }
          else { rows.push(["add", B[j]]); j++; add++; }
        }
        out.innerHTML = rows.map(([k, t]) => `<span class="d-${k}">${k === "add" ? "+" : k === "del" ? "−" : " "} ${esc(t)}</span>`).join("");
        st.className = add || del ? "status warn" : "status";
        st.textContent = add || del ? `${add} line${add === 1 ? "" : "s"} added · ${del} line${del === 1 ? "" : "s"} removed` : "No differences.";
      };
      [a, b].forEach((x) => x.addEventListener("input", run));
      $$("input[type=checkbox]", el).forEach((x) => x.addEventListener("change", run));
      $("[data-act=sample]", el).addEventListener("click", () => {
        a.value = "PORT=3000\nDATABASE_URL=postgres://localhost/app\nLOG_LEVEL=info\nFEATURE_X=false";
        b.value = "PORT=4000\nDATABASE_URL=postgres://localhost/app\nLOG_LEVEL=info\nFEATURE_X=true\nREDIS_URL=redis://localhost";
        run();
      });
      run();
    },
  },
  {
    id: "json-ts", tag: "TS", name: "JSON to TypeScript", desc: "Paste an API response and get TypeScript interfaces for it.",
    html: () => `
      <div class="row"><label>Root name <input class="input" id="root" value="Root" style="width:160px;height:30px" spellcheck="false"></label><label><input type="checkbox" id="ro"> readonly</label><button class="btn" data-act="sample">Sample</button></div>
      <div class="grid2">
        <div class="box"><div class="box-head">JSON</div><textarea id="in" spellcheck="false" placeholder='{"id": 1, "name": "Ada"}'></textarea></div>
        <div class="box"><div class="box-head">TypeScript<button class="btn" data-copy="#out">Copy</button></div><pre class="out" id="out"></pre></div>
      </div><div class="status" id="status"></div>`,
    init(el) {
      const inp = $("#in", el), out = $("#out", el), st = $("#status", el);
      inp.value = store.get("json-ts", "");
      const pascal = (s) => {
        const p = String(s).replace(/[^A-Za-z0-9]+(.)?/g, (_, c) => (c ? c.toUpperCase() : "")).replace(/^./, (c) => c.toUpperCase());
        return /^\d/.test(p) ? "T" + p : p || "Item";
      };
      const singular = (s) => { const x = String(s).replace(/ies$/, "y").replace(/([^s])s$/, "$1"); return x === s ? s + "Item" : x; };
      const run = () => {
        store.set("json-ts", inp.value);
        out.textContent = ""; st.textContent = "";
        if (!inp.value.trim()) return;
        let v;
        try { v = JSON.parse(inp.value); } catch { st.className = "status err"; st.textContent = "That isn't valid JSON. Check it in the JSON tool for the exact line."; return; }
        const decls = [], used = new Set(), ro = $("#ro", el).checked ? "readonly " : "";
        const uniq = (n) => { let x = n, k = 2; while (used.has(x)) x = n + k++; used.add(x); return x; };
        // Each call takes every sample value seen at one spot, so arrays of
        // objects merge into one interface and missing keys become optional.
        const typeOf = (vals, hint) => {
          const parts = [], objs = vals.filter(isObj), arrs = vals.filter(Array.isArray);
          if (objs.length) parts.push(iface(objs, hint));
          if (arrs.length) {
            const items = arrs.flat(), t = items.length ? typeOf(items, singular(hint)) : "unknown";
            parts.push(t.includes("|") ? `(${t})[]` : `${t}[]`);
          }
          for (const x of vals) if (!isObj(x) && !Array.isArray(x)) { const t = x === null ? "null" : typeof x; if (!parts.includes(t)) parts.push(t); }
          return parts.join(" | ") || "unknown";
        };
        const iface = (objs, hint) => {
          const name = uniq(pascal(hint));
          const keys = [...new Set(objs.flatMap(Object.keys))];
          const body = keys.map((k) => {
            const vals = objs.filter((o) => Object.hasOwn(o, k)).map((o) => o[k]);
            const key = /^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k);
            return `  ${ro}${key}${vals.length < objs.length ? "?" : ""}: ${typeOf(vals, k)};`;
          });
          decls.push(`export interface ${name} {\n${body.join("\n")}\n}`);
          return name;
        };
        const rootName = pascal($("#root", el).value || "Root");
        if (isObj(v)) iface([v], rootName);
        else { const t = typeOf([v], rootName + "Item"); decls.push(`export type ${uniq(rootName)} = ${t};`); }
        out.textContent = decls.reverse().join("\n\n");
        st.className = "status"; st.textContent = `${decls.length} type${decls.length === 1 ? "" : "s"} generated.`;
      };
      inp.addEventListener("input", run);
      $$("#root, #ro", el).forEach((x) => x.addEventListener("input", run));
      $("[data-act=sample]", el).addEventListener("click", () => {
        inp.value = JSON.stringify({ id: "txn_42", amount: 45000, currency: "NGN", status: "success", customer: { name: "Chioma Eze", email: null }, items: [{ sku: "wig-01", qty: 2 }, { sku: "gel-07", qty: 1, discount: 500 }], paid_at: "2026-10-30T14:02:00Z" }, null, 2);
        run();
      });
      run();
    },
  },
  {
    id: "csv", tag: "csv", name: "JSON ↔ CSV", desc: "Turn a JSON array into a spreadsheet-ready CSV, or a CSV back into JSON.",
    html: () => `
      <div class="row"><button class="btn primary" data-act="tocsv">JSON → CSV</button><button class="btn" data-act="tojson">CSV → JSON</button>
        <label>Separator <select class="btn" id="sep"><option value="auto">Auto</option><option value=",">Comma</option><option value=";">Semicolon</option><option value="\t">Tab</option></select></label>
        <label><input type="checkbox" id="types" checked> Read numbers and true/false</label><button class="btn" data-act="sample">Sample</button></div>
      <div class="grid2">
        <div class="box"><div class="box-head">JSON<button class="btn" data-copy="#j">Copy</button></div><textarea id="j" spellcheck="false" placeholder='[{"name":"Ada","city":"Lagos"}]'></textarea></div>
        <div class="box"><div class="box-head">CSV<button class="btn" data-copy="#c">Copy</button></div><textarea id="c" spellcheck="false" placeholder="name,city&#10;Ada,Lagos"></textarea></div>
      </div><div class="status" id="status"></div>`,
    init(el) {
      const j = $("#j", el), c = $("#c", el), st = $("#status", el);
      const say = (msg, cls = "") => { st.className = "status " + cls; st.textContent = msg; };
      const flat = (o, p = "", out = {}) => {
        for (const [k, v] of Object.entries(o)) { const key = p ? `${p}.${k}` : k; if (isObj(v) && Object.keys(v).length) flat(v, key, out); else out[key] = v; }
        return out;
      };
      const toCsv = () => {
        if (!j.value.trim()) return;
        let v;
        try { v = JSON.parse(j.value); } catch { return say("That isn't valid JSON.", "err"); }
        if (isObj(v)) v = [v];
        if (!Array.isArray(v) || !v.length) return say("Give an array of objects, like [{\"name\":\"Ada\"}].", "err");
        const sep = $("#sep", el).value === "auto" ? "," : $("#sep", el).value;
        const rows = v.map((r) => (isObj(r) ? flat(r) : { value: r }));
        const cols = [...new Set(rows.flatMap(Object.keys))];
        const cell = (x) => {
          const s = x === null || x === undefined ? "" : typeof x === "object" ? JSON.stringify(x) : String(x);
          return s.includes(sep) || /["\r\n]|^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        };
        c.value = [cols.map(cell).join(sep), ...rows.map((r) => cols.map((k) => cell(r[k])).join(sep))].join("\n");
        say(`${rows.length} row${rows.length === 1 ? "" : "s"} · ${cols.length} column${cols.length === 1 ? "" : "s"}. Nested fields became dotted columns, like customer.name.`);
      };
      const parseCsv = (src, d) => {
        const rows = [[]]; let f = "", q = false, quoted = false;
        for (let i = 0; i < src.length; i++) {
          const ch = src[i];
          if (q) { if (ch === '"') { if (src[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch; }
          else if (ch === '"' && !f) { q = quoted = true; }
          else if (ch === d) { rows.at(-1).push(f); f = ""; quoted = false; }
          else if (ch === "\n" || ch === "\r") { if (ch === "\r" && src[i + 1] === "\n") i++; rows.at(-1).push(f); f = ""; quoted = false; rows.push([]); }
          else f += ch;
        }
        if (q) throw new Error("A quoted field is never closed.");
        if (f || quoted || rows.at(-1).length) rows.at(-1).push(f);
        return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ""));
      };
      const toJson = () => {
        if (!c.value.trim()) return;
        const first = c.value.split(/\r?\n/)[0];
        let sep = $("#sep", el).value;
        if (sep === "auto") sep = [",", ";", "\t"].sort((x, y) => first.split(y).length - first.split(x).length)[0];
        let rows;
        try { rows = parseCsv(c.value, sep); } catch (e) { return say(e.message, "err"); }
        if (rows.length < 2) return say("Add a header row and at least one row of data.", "err");
        const [head, ...body] = rows;
        const conv = (s) => {
          if (!$("#types", el).checked) return s;
          if (/^-?(0|[1-9]\d{0,14})(\.\d+)?$/.test(s)) return +s;
          return s === "true" ? true : s === "false" ? false : s === "" ? null : s;
        };
        j.value = JSON.stringify(body.map((r) => Object.fromEntries(head.map((h, i) => [h || `column${i + 1}`, conv(r[i] ?? "")]))), null, 2);
        say(`${body.length} row${body.length === 1 ? "" : "s"} read · separator: ${sep === "\t" ? "tab" : sep}. Numbers with a leading zero (like phone numbers) stay as text.`);
      };
      el.addEventListener("click", (e) => {
        const a = e.target.closest("[data-act]")?.dataset.act;
        if (a === "tocsv") toCsv();
        if (a === "tojson") toJson();
        if (a === "sample") { j.value = JSON.stringify([{ name: "Ada Obi", phone: "08031234567", city: "Lagos", order: { total: 45000, paid: true } }, { name: "Tunde Bello", phone: "09087654321", city: "Ibadan, Oyo", order: { total: 12500, paid: false } }], null, 2); toCsv(); }
      });
    },
  },
  {
    id: "case", tag: "Aa", name: "Case converter", desc: "camelCase, snake_case, kebab-case, CONSTANT_CASE and more, line by line.",
    html: () => `
      <div class="box"><div class="box-head">Text</div><textarea class="small" id="in" spellcheck="false" placeholder="user account id&#10;getUserByID">user account id</textarea></div>
      <div class="box" style="margin-top:16px"><div class="box-head">Converted</div><div class="kv pre" id="out"></div></div>`,
    init(el) {
      const inp = $("#in", el);
      const words = (s) => s.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2").split(/[^\p{L}\p{N}]+/u).filter(Boolean);
      const cap = (w) => w[0].toUpperCase() + w.slice(1).toLowerCase();
      const CASES = [
        ["camelCase", (w) => w.map((x, i) => (i ? cap(x) : x.toLowerCase())).join("")],
        ["PascalCase", (w) => w.map(cap).join("")],
        ["snake_case", (w) => w.join("_").toLowerCase()],
        ["CONSTANT_CASE", (w) => w.join("_").toUpperCase()],
        ["kebab-case", (w) => w.join("-").toLowerCase()],
        ["dot.case", (w) => w.join(".").toLowerCase()],
        ["Title Case", (w) => w.map(cap).join(" ")],
        ["Sentence case", (w) => w.map((x, i) => (i ? x.toLowerCase() : cap(x))).join(" ")],
        ["lower case", (w) => w.join(" ").toLowerCase()],
        ["UPPER CASE", (w) => w.join(" ").toUpperCase()],
      ];
      const run = () => {
        const lines = inp.value.split("\n").map(words);
        $("#out", el).innerHTML = kvRows(CASES.map(([n, f]) => [n, lines.map((w) => (w.length ? f(w) : "")).join("\n")]));
      };
      inp.addEventListener("input", run); run();
    },
  },
  {
    id: "color", tag: "#f0", name: "Color", desc: "Convert HEX, RGB and HSL, and check text contrast against WCAG.",
    html: () => `
      <div class="row" style="flex-wrap:nowrap"><input type="color" id="pick" value="#4ade80" aria-label="Pick a color" style="width:52px;height:40px;border:0;background:none;padding:0"><input class="input" id="in" value="#4ade80" spellcheck="false" autocomplete="off" placeholder="#16a34a, rgb(22 163 74), hsl(142 76% 36%), teal"></div>
      <div class="status" id="status"></div>
      <div class="grid2" style="margin-top:16px">
        <div class="box"><div class="box-head">Values</div><div class="kv" id="out"></div></div>
        <div class="box"><div class="box-head">Contrast</div><div id="swatches" style="display:grid;gap:10px;padding:14px"></div></div>
      </div>`,
    init(el) {
      const inp = $("#in", el), st = $("#status", el), probe = document.createElement("i");
      probe.hidden = true; el.append(probe);
      const toHsl = (r, g, b) => {
        r /= 255; g /= 255; b /= 255;
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
        let h = 0, s = 0;
        if (d) {
          s = d / (1 - Math.abs(2 * l - 1));
          h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
          h = Math.round(h * 60 + 360) % 360;
        }
        return [h, Math.round(s * 100), Math.round(l * 100)];
      };
      const lum = (rgb) => { const [r, g, b] = rgb.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
      const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
      const run = () => {
        st.textContent = ""; $("#out", el).innerHTML = ""; $("#swatches", el).innerHTML = "";
        const v = inp.value.trim();
        if (!v) return;
        probe.style.color = ""; probe.style.color = v;
        const m = probe.style.color && getComputedStyle(probe).color.match(/^rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)$/);
        if (!m) { st.className = "status err"; st.textContent = "Use a HEX, rgb(), hsl() or CSS color name."; return; }
        const rgb = [+m[1], +m[2], +m[3]], alpha = m[4] === undefined ? 1 : +m[4];
        const hx = "#" + rgb.map((n) => n.toString(16).padStart(2, "0")).join("") + (alpha < 1 ? Math.round(alpha * 255).toString(16).padStart(2, "0") : "");
        const [h, s, l] = toHsl(...rgb);
        $("#pick", el).value = hx.slice(0, 7);
        $("#out", el).innerHTML = kvRows([
          ["HEX", hx], ["RGB", alpha < 1 ? `rgb(${rgb.join(" ")} / ${alpha})` : `rgb(${rgb.join(", ")})`],
          ["HSL", alpha < 1 ? `hsl(${h} ${s}% ${l}% / ${alpha})` : `hsl(${h}, ${s}%, ${l}%)`],
          ["Tailwind arbitrary", `bg-[${hx}]`], ["CSS variable", `--color: ${hx};`],
        ]);
        $("#swatches", el).innerHTML = [[255, 255, 255], [0, 0, 0]].map((other) => {
          const r = ratio(rgb, other), grade = r >= 7 ? "AAA" : r >= 4.5 ? "AA" : r >= 3 ? "AA large only" : "Fails";
          return `<div data-bg style="border-radius:10px;padding:14px;display:flex;justify-content:space-between;align-items:center;gap:8px;border:1px solid var(--line)"><b data-fg>${other[0] ? "White" : "Black"} text · Aa</b><span class="pill ${r >= 4.5 ? "ok" : "bad"}" style="background:var(--panel)">${r.toFixed(2)}:1 ${grade}</span></div>`;
        }).join("");
        $$("[data-bg]", el).forEach((d, i) => { d.style.background = hx; $("[data-fg]", d).style.color = i ? "#000" : "#fff"; });
      };
      inp.addEventListener("input", run);
      $("#pick", el).addEventListener("input", (e) => { inp.value = e.target.value; run(); });
      run();
    },
  },
  {
    id: "base", tag: "0x", name: "Number base", desc: "Decimal, hex, binary and octal, any size, plus bytes in KB/MB/GB.",
    html: () => `
      <div class="row" style="flex-wrap:nowrap"><input class="input" id="in" value="255" spellcheck="false" autocomplete="off" placeholder="255, 0xff, 0b1111_1111"><select class="btn" id="from" style="height:40px"><option value="auto">Auto (0x, 0b, 0o)</option><option value="10">Decimal</option><option value="16">Hex</option><option value="2">Binary</option><option value="8">Octal</option></select></div>
      <div class="status" id="status"></div>
      <div class="box" style="margin-top:16px"><div class="box-head">Result</div><div class="kv" id="out"></div></div>`,
    init(el) {
      const inp = $("#in", el), st = $("#status", el);
      const DIG = "0123456789abcdef", PRE = { 16: "0x", 2: "0b", 8: "0o" };
      const parse = (raw, from) => {
        let s = raw.trim().replace(/[_\s,]/g, "").toLowerCase(), neg = false, b = from === "auto" ? 10 : +from;
        if (s.startsWith("-")) { neg = true; s = s.slice(1); }
        for (const [base, p] of Object.entries(PRE)) if (s.startsWith(p) && (from === "auto" || +from === +base)) { b = +base; s = s.slice(2); }
        if (!s || [...s].some((ch) => { const i = DIG.indexOf(ch); return i < 0 || i >= b; })) throw new Error(`That isn't a valid base-${b} number.`);
        let n = 0n; for (const ch of s) n = n * BigInt(b) + BigInt(DIG.indexOf(ch));
        return [neg ? -n : n, b];
      };
      const group = (s, size) => s.replace(new RegExp(`\\B(?=(.{${size}})+$)`, "g"), " ");
      const bytes = (n) => {
        if (n < 0n || n > 2n ** 70n) return "";
        const x = Number(n), si = ["B", "KB", "MB", "GB", "TB", "PB", "EB"], iec = ["B", "KiB", "MiB", "GiB", "TiB", "PiB", "EiB"];
        const fmt = (base, u) => { let i = 0, v = x; while (v >= base && i < u.length - 1) { v /= base; i++; } return `${+v.toFixed(2)} ${u[i]}`; };
        return `${fmt(1000, si)} · ${fmt(1024, iec)}`;
      };
      const run = () => {
        st.textContent = ""; $("#out", el).innerHTML = "";
        if (!inp.value.trim()) return;
        try {
          const [n, b] = parse(inp.value, $("#from", el).value), neg = n < 0n, a = neg ? -n : n, sign = neg ? "-" : "";
          const rows = [["Decimal", sign + a.toLocaleString("en-US")], ["Hex", sign + "0x" + a.toString(16).toUpperCase()], ["Binary", sign + group(a.toString(2), 4)], ["Octal", sign + "0o" + a.toString(8)], ["Bits needed", String(a.toString(2).length)]];
          if (bytes(n)) rows.push(["As bytes", bytes(n)]);
          $("#out", el).innerHTML = kvRows(rows);
          st.className = "status"; st.textContent = `Read as base ${b}.`;
        } catch (e) { st.className = "status err"; st.textContent = e.message; }
      };
      inp.addEventListener("input", run); $("#from", el).addEventListener("change", run); run();
    },
  },
  {
    id: "http", tag: "200", name: "HTTP status codes", desc: "What each status code means and when your API should return it.",
    html: () => `
      <input class="input" id="q" placeholder="Search: 404, conflict, rate limit…" autocomplete="off" spellcheck="false">
      <div class="box" style="margin-top:16px"><ul class="list" id="list"></ul></div>`,
    init(el) {
      const CODES = [
        [100, "Continue", "The server got the headers; send the body."], [101, "Switching Protocols", "Upgrading the connection, e.g. to WebSocket."],
        [200, "OK", "It worked. The response has the result."], [201, "Created", "A new resource was made. Return it, and a Location header."],
        [202, "Accepted", "Queued for later, e.g. a background job. Not done yet."], [204, "No Content", "It worked and there's nothing to return, e.g. after DELETE."],
        [206, "Partial Content", "Part of a file, for a Range request (video, resumable downloads)."],
        [301, "Moved Permanently", "The URL changed for good. Browsers and search engines update."], [302, "Found", "Temporary redirect. Clients may switch POST to GET."],
        [304, "Not Modified", "The cached copy is still fresh (ETag / If-None-Match)."], [307, "Temporary Redirect", "Like 302, but the method and body are kept."],
        [308, "Permanent Redirect", "Like 301, but the method and body are kept."],
        [400, "Bad Request", "The input is malformed or fails validation. Say which field."], [401, "Unauthorized", "Not signed in, or the token is missing, invalid or expired."],
        [402, "Payment Required", "Used by some APIs when a plan or balance runs out."], [403, "Forbidden", "Signed in, but not allowed to do this."],
        [404, "Not Found", "Nothing here, or it's hidden from you on purpose (safer than 403 for other tenants' data)."],
        [405, "Method Not Allowed", "The route exists but not for this method. Send an Allow header."], [406, "Not Acceptable", "Can't produce the format the Accept header asks for."],
        [408, "Request Timeout", "The client took too long to send the request."], [409, "Conflict", "Clashes with the current state: a duplicate, or an edit on stale data."],
        [410, "Gone", "It existed and was removed for good."], [412, "Precondition Failed", "An If-Match / If-Unmodified-Since check failed."],
        [413, "Content Too Large", "The body is over the size limit."], [415, "Unsupported Media Type", "Wrong Content-Type, e.g. form data sent to a JSON API."],
        [418, "I'm a teapot", "An old April Fools' joke. Don't use it in a real API."], [422, "Unprocessable Content", "Well-formed but semantically wrong. Some APIs prefer this to 400 for validation."],
        [425, "Too Early", "The server won't risk processing a request that might be replayed."], [428, "Precondition Required", "This request must be conditional (send If-Match)."],
        [429, "Too Many Requests", "Rate limited. Send Retry-After."], [431, "Request Header Fields Too Large", "Headers or cookies are too big."],
        [451, "Unavailable For Legal Reasons", "Blocked for legal reasons."],
        [500, "Internal Server Error", "A bug or unhandled error on the server. Log it; don't leak details."], [501, "Not Implemented", "The server doesn't support this yet."],
        [502, "Bad Gateway", "A proxy got a bad answer from the server behind it (e.g. the app crashed)."], [503, "Service Unavailable", "Down or overloaded for now. Send Retry-After."],
        [504, "Gateway Timeout", "A proxy gave up waiting for the server behind it."],
      ];
      const kind = (c) => (c < 200 ? "Info" : c < 300 ? "Success" : c < 400 ? "Redirect" : c < 500 ? "Client error" : "Server error");
      const run = () => {
        const q = $("#q", el).value.trim().toLowerCase();
        const hits = CODES.filter(([c, n, d]) => !q || `${c} ${n} ${d} ${kind(c)}`.toLowerCase().includes(q));
        $("#list", el).innerHTML = hits.map(([c, n, d]) => `<li style="display:grid;grid-template-columns:52px 1fr;gap:12px;align-items:start"><span class="pill ${c < 400 ? "ok" : "bad"}" style="text-align:center">${c}</span><span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"><b>${n}</b> <small>${kind(c)}</small><br><small style="font-size:13.5px">${esc(d)}</small></span></li>`).join("") || `<li><small>No code matches.</small></li>`;
      };
      $("#q", el).addEventListener("input", run); run();
    },
  },
  {
    id: "fake", tag: "NG", name: "Fake data", desc: "Realistic Nigerian test users: names, phones, cities, banks. As JSON, CSV or SQL.",
    html: () => `
      <div class="row"><button class="btn primary" data-act="gen">Generate</button>
        <label>Rows <input class="input" id="n" type="number" min="1" max="500" value="10" style="width:80px;height:30px"></label>
        <label>As <select class="btn" id="fmt"><option value="json">JSON</option><option value="csv">CSV</option><option value="sql">SQL insert</option></select></label>
        <label>Table <input class="input" id="table" value="users" style="width:120px;height:30px" spellcheck="false"></label></div>
      <div class="box"><div class="box-head">Data<button class="btn" data-copy="#out">Copy</button></div><pre class="out" id="out"></pre></div>
      <p style="color:var(--muted);font-size:13px">For testing only. Emails use example.com and account numbers are random, but a random phone or account number can belong to a real person, so never send messages or money to them.</p>`,
    init(el) {
      const FIRST = ["Ada", "Chioma", "Tunde", "Emeka", "Fatima", "Aisha", "Ngozi", "Bola", "Ifeoma", "Segun", "Yusuf", "Kemi", "Obinna", "Zainab", "Damilola", "Chinedu", "Halima", "Tobi", "Uche", "Amaka", "Ibrahim", "Funke", "Kelechi", "Musa", "Temitope", "Nneka", "Sani", "Yetunde", "Ikenna", "Hauwa"];
      const LAST = ["Okafor", "Adeyemi", "Bello", "Eze", "Ibrahim", "Okonkwo", "Balogun", "Nwosu", "Abubakar", "Adebayo", "Obi", "Lawal", "Danjuma", "Olawale", "Mohammed", "Chukwu", "Ogunleye", "Uzor", "Garba", "Akinola", "Nnamdi", "Afolabi", "Usman", "Onyeka"];
      const CITY = [["Lagos", "Lagos"], ["Ikeja", "Lagos"], ["Lekki", "Lagos"], ["Abuja", "FCT"], ["Ibadan", "Oyo"], ["Port Harcourt", "Rivers"], ["Kano", "Kano"], ["Enugu", "Enugu"], ["Benin City", "Edo"], ["Kaduna", "Kaduna"], ["Abeokuta", "Ogun"], ["Jos", "Plateau"], ["Owerri", "Imo"], ["Ilorin", "Kwara"]];
      const STREET = ["Allen Avenue", "Admiralty Way", "Awolowo Road", "Herbert Macaulay Way", "Adeola Odeku Street", "Ring Road", "Aminu Kano Crescent", "Ogui Road", "Bode Thomas Street", "Ahmadu Bello Way", "Isaac John Street", "Akin Adesola Street"];
      const BANK = ["GTBank", "Access Bank", "Zenith Bank", "First Bank", "UBA", "Kuda", "OPay", "Moniepoint", "PalmPay", "Wema Bank", "Fidelity Bank", "Stanbic IBTC"];
      const PREFIX = ["803", "806", "813", "816", "703", "706", "810", "814", "903", "906", "805", "807", "815", "705", "905", "802", "808", "812", "701", "708", "902", "809", "817", "818", "909"];
      const digits = (k) => Array.from({ length: k }, () => randInt(10)).join("");
      const row = () => {
        const first = pick(FIRST), last = pick(LAST), [city, state] = pick(CITY);
        return {
          id: crypto.randomUUID(), name: `${first} ${last}`,
          email: `${first}.${last}${randInt(100)}@example.com`.toLowerCase(), phone: `+234${pick(PREFIX)}${digits(7)}`,
          address: `${1 + randInt(120)} ${pick(STREET)}`, city, state, bank: pick(BANK), account_number: digits(10),
          balance: randInt(50000000) / 100, created_at: new Date(Date.now() - randInt(365 * 24 * 60) * 60000).toISOString(),
        };
      };
      const gen = () => {
        const n = Math.min(500, Math.max(1, +$("#n", el).value || 1)), rows = Array.from({ length: n }, row), fmt = $("#fmt", el).value;
        const cols = Object.keys(rows[0]);
        if (fmt === "json") $("#out", el).textContent = JSON.stringify(rows, null, 2);
        else if (fmt === "csv") $("#out", el).textContent = [cols.join(","), ...rows.map((r) => cols.map((k) => (String(r[k]).includes(",") ? `"${r[k]}"` : r[k])).join(","))].join("\n");
        else {
          const t = ($("#table", el).value.trim() || "users").replace(/[^\w.]/g, "");
          const lit = (v) => (typeof v === "number" ? v : `'${String(v).replace(/'/g, "''")}'`);
          $("#out", el).textContent = `INSERT INTO ${t} (${cols.join(", ")}) VALUES\n${rows.map((r) => `  (${cols.map((k) => lit(r[k])).join(", ")})`).join(",\n")};`;
        }
      };
      $("[data-act=gen]", el).addEventListener("click", gen);
      $$("#n, #fmt, #table", el).forEach((x) => x.addEventListener("change", gen));
      gen();
    },
  },
  {
    id: "hmac", tag: "sig", name: "HMAC / webhook signature", desc: "Sign a payload with a secret, or check a Paystack, Stripe or GitHub webhook signature.",
    html: () => `
      <div class="row"><label>Algorithm <select class="btn" id="alg"><option>SHA-256</option><option>SHA-512</option><option>SHA-384</option><option>SHA-1</option></select></label>
        <span style="color:var(--muted);font-size:13px">Paystack uses SHA-512 · Stripe, GitHub, Flutterwave v3 hash: SHA-256</span></div>
      <div class="grid2">
        <div class="box"><div class="box-head">Payload (raw request body)</div><textarea class="small" id="msg" spellcheck="false" placeholder='{"event":"charge.success"}'></textarea></div>
        <div class="box"><div class="box-head">Secret key</div><textarea class="small" id="key" spellcheck="false" placeholder="sk_test_…"></textarea></div>
      </div>
      <div class="box" style="margin-top:16px"><div class="box-head">Signature</div><div class="kv" id="out"></div></div>
      <div style="margin-top:16px"><input class="input" id="expect" placeholder="Paste the signature header to check it (hex or Base64; a sha256= prefix is fine)" spellcheck="false" autocomplete="off"></div>
      <div class="status" id="status"></div>
      <p style="color:var(--muted);font-size:13px">Use the exact raw body the provider sent. Re-formatting the JSON, even one space, changes the signature. Your secret stays on this page.</p>`,
    init(el) {
      const msg = $("#msg", el), key = $("#key", el), st = $("#status", el);
      let seq = 0;
      const run = async () => {
        const my = ++seq; st.textContent = "";
        if (!key.value) { $("#out", el).innerHTML = kvRows([["Hex", ""], ["Base64", ""]]); return; }
        const enc = new TextEncoder();
        const k = await crypto.subtle.importKey("raw", enc.encode(key.value), { name: "HMAC", hash: $("#alg", el).value }, false, ["sign"]);
        const sig = await crypto.subtle.sign("HMAC", k, enc.encode(msg.value));
        if (my !== seq) return;
        const h = hex(sig), b = bytesB64(sig);
        $("#out", el).innerHTML = kvRows([["Hex", h], ["Base64", b]]);
        const want = $("#expect", el).value.trim().replace(/^(sha\d+|v1)=/i, "");
        if (want) {
          const ok = want.toLowerCase() === h || want === b;
          st.className = ok ? "status" : "status err";
          st.textContent = ok ? "✓ Match. This payload was signed with this secret." : "✗ No match. Check the secret, the algorithm, and that the body is byte-for-byte what was sent.";
        }
      };
      [msg, key, $("#expect", el)].forEach((x) => x.addEventListener("input", run));
      $("#alg", el).addEventListener("change", run); run();
    },
  },
  {
    id: "curl", tag: "curl", name: "cURL to fetch", desc: "Paste a cURL command (or Chrome's Copy as cURL) and get JavaScript fetch code.",
    html: () => `
      <div class="row"><label><input type="checkbox" id="axios"> axios instead</label><button class="btn" data-act="sample">Sample</button></div>
      <div class="box"><div class="box-head">cURL</div><textarea class="small" id="in" spellcheck="false" placeholder="curl -X POST https://api.example.com/users -H 'Content-Type: application/json' -d '{&quot;name&quot;:&quot;Ada&quot;}'"></textarea></div>
      <div class="status" id="status"></div>
      <div class="box" style="margin-top:16px"><div class="box-head">JavaScript<button class="btn" data-copy="#out">Copy</button></div><pre class="out small" id="out"></pre></div>`,
    init(el) {
      const inp = $("#in", el), st = $("#status", el), out = $("#out", el);
      inp.value = store.get("curl", "");
      // Shell-style word splitting: '…', "…", $'…' and backslash escapes.
      const split = (s) => {
        s = s.replace(/\\\r?\n/g, " ").replace(/\^\r?\n/g, " ");
        const words = []; let cur = "", q = null, has = false;
        const ESC = { n: "\n", t: "\t", r: "\r", "\\": "\\", "'": "'", '"': '"' };
        for (let i = 0; i < s.length; i++) {
          const ch = s[i];
          if (q === "'") { if (ch === "'") q = null; else cur += ch; }
          else if (q === "$") { if (ch === "'") q = null; else if (ch === "\\") { const nx = s[++i]; cur += ESC[nx] ?? (nx === "u" ? String.fromCharCode(parseInt(s.slice(i + 1, (i += 4) + 1), 16)) : "\\" + nx); } else cur += ch; }
          else if (q === '"') { if (ch === '"') q = null; else if (ch === "\\" && /["\\$`]/.test(s[i + 1] || "")) cur += s[++i]; else cur += ch; }
          else if (ch === "$" && s[i + 1] === "'") { q = "$"; has = true; i++; }
          else if (ch === "'" || ch === '"') { q = ch; has = true; }
          else if (ch === "\\") { cur += s[++i] ?? ""; has = true; }
          else if (/\s/.test(ch)) { if (cur || has) words.push(cur); cur = ""; has = false; }
          else cur += ch;
        }
        if (q) throw new Error("A quote in the command is never closed.");
        if (cur || has) words.push(cur);
        return words;
      };
      const VALUE = { "-X": "method", "--request": "method", "-H": "header", "--header": "header", "-d": "data", "--data": "data", "--data-raw": "data", "--data-binary": "data", "--data-ascii": "data", "--data-urlencode": "urlencode", "--json": "json", "-F": "form", "--form": "form", "-u": "user", "--user": "user", "-b": "cookie", "--cookie": "cookie", "-A": "agent", "--user-agent": "agent", "-e": "referer", "--referer": "referer", "--url": "url", "-o": "skip", "--output": "skip", "-m": "skip", "--max-time": "skip", "--connect-timeout": "skip", "-x": "skip", "--proxy": "skip" };
      const FLAG = new Set(["--compressed", "-L", "--location", "-k", "--insecure", "-s", "--silent", "-S", "--show-error", "-i", "--include", "-v", "--verbose", "-f", "--fail", "-g", "--globoff", "-G", "--get", "-I", "--head", "-sS", "-sL", "-Ls", "-sSL", "-fsSL"]);
      const run = () => {
        store.set("curl", inp.value);
        out.textContent = ""; st.textContent = "";
        const src = inp.value.trim();
        if (!src) return;
        let w;
        try { w = split(src); } catch (e) { st.className = "status err"; st.textContent = e.message; return; }
        if (w[0] !== "curl") { st.className = "status err"; st.textContent = "Start with the word curl."; return; }
        let url = "", method = "", get = false, head = false;
        const headers = [], data = [], form = [], ignored = [];
        for (let i = 1; i < w.length; i++) {
          let a = w[i], v;
          const eq = a.match(/^(--[\w-]+)=(.*)$/s);
          if (eq) { a = eq[1]; v = eq[2]; }
          const kind = VALUE[a];
          if (kind) {
            if (v === undefined) v = w[++i] ?? "";
            if (kind === "method") method = v.toUpperCase();
            else if (kind === "header") { const c = v.indexOf(":"); if (c > 0) headers.push([v.slice(0, c).trim(), v.slice(c + 1).trim()]); }
            else if (kind === "data") data.push(v);
            else if (kind === "urlencode") { const e = v.indexOf("="); data.push(e >= 0 ? v.slice(0, e + 1) + encodeURIComponent(v.slice(e + 1)) : encodeURIComponent(v)); }
            else if (kind === "json") { data.push(v); headers.push(["Content-Type", "application/json"], ["Accept", "application/json"]); }
            else if (kind === "form") form.push(v);
            else if (kind === "user") headers.push(["Authorization", "Basic " + b64encode(v)]);
            else if (kind === "cookie") headers.push(["Cookie", v]);
            else if (kind === "agent") headers.push(["User-Agent", v]);
            else if (kind === "referer") headers.push(["Referer", v]);
            else if (kind === "url") url = v;
          } else if (a === "-G" || a === "--get") get = true;
          else if (a === "-I" || a === "--head") head = true;
          else if (FLAG.has(a)) {}
          else if (a.startsWith("-")) ignored.push(a);
          else if (!url) url = a;
        }
        if (!url) { st.className = "status err"; st.textContent = "Couldn't find a URL in the command."; return; }
        if (get && data.length) { url += (url.includes("?") ? "&" : "?") + data.join("&"); data.length = 0; }
        method = method || (head ? "HEAD" : data.length || form.length ? "POST" : "GET");
        // Fold duplicate headers; the last one wins, like most servers treat them.
        const H = new Map(); for (const [k, v] of headers) H.set(H.has(k) ? k : [...H.keys()].find((x) => x.toLowerCase() === k.toLowerCase()) ?? k, v);
        if (data.length && ![...H.keys()].some((k) => k.toLowerCase() === "content-type")) H.set("Content-Type", "application/x-www-form-urlencoded");
        const ctype = [...H].find(([k]) => k.toLowerCase() === "content-type")?.[1] || "";
        const ind = (s, n) => s.replace(/\n/g, "\n" + " ".repeat(n));
        let pre = "", body = "", axiosData = "";
        if (form.length) {
          H.forEach((_, k) => { if (k.toLowerCase() === "content-type") H.delete(k); });
          pre = "const form = new FormData();\n" + form.map((f) => { const e = f.indexOf("="), k = f.slice(0, e), v = f.slice(e + 1); return v.startsWith("@") ? `form.append(${JSON.stringify(k)}, fileInput.files[0]); // was ${v}` : `form.append(${JSON.stringify(k)}, ${JSON.stringify(v)});`; }).join("\n") + "\n\n";
          body = "form"; axiosData = "form";
        } else if (data.length) {
          const raw = data.join("&");
          let parsed;
          if (/json/i.test(ctype)) try { parsed = JSON.parse(raw); } catch {}
          body = parsed !== undefined ? `JSON.stringify(${ind(JSON.stringify(parsed, null, 2), 2)})` : JSON.stringify(raw);
          axiosData = parsed !== undefined ? ind(JSON.stringify(parsed, null, 2), 2) : JSON.stringify(raw);
          if (raw.startsWith("@")) ignored.push(`${raw} (curl reads that body from a file)`);
        }
        const hdrs = [...H].map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)},`).join("\n");
        if ($("#axios", el).checked) {
          out.textContent = `${pre}const { data } = await axios({\n  method: ${JSON.stringify(method.toLowerCase())},\n  url: ${JSON.stringify(url)},${hdrs ? `\n  headers: {\n${hdrs}\n  },` : ""}${axiosData ? `\n  data: ${axiosData},` : ""}\n});`;
        } else {
          const opts = [method !== "GET" && `  method: ${JSON.stringify(method)},`, hdrs && `  headers: {\n${hdrs}\n  },`, body && `  body: ${body},`].filter(Boolean);
          out.textContent = `${pre}const res = await fetch(${JSON.stringify(url)}${opts.length ? `, {\n${opts.join("\n")}\n}` : ""});\nif (!res.ok) throw new Error(\`HTTP \${res.status}\`);\nconst data = await res.${/json/i.test(([...H].find(([k]) => k.toLowerCase() === "accept")?.[1] || "") + ctype) ? "json" : "text"}();`;
        }
        st.className = ignored.length ? "status warn" : "status";
        st.textContent = ignored.length ? `Converted. Not carried over: ${ignored.join(", ")}` : `Converted · ${method} ${new URL(url, "https://x").host || url}`;
        if ([...H.keys()].some((k) => /^(authorization|cookie)$/i.test(k))) { st.className = "status warn"; st.textContent += " · Contains credentials; don't commit this code as is."; }
      };
      inp.addEventListener("input", run); $("#axios", el).addEventListener("change", run);
      $("[data-act=sample]", el).addEventListener("click", () => {
        inp.value = `curl 'https://api.paystack.co/transaction/initialize' \\\n  -H 'Authorization: Bearer sk_test_xxx' \\\n  -H 'Content-Type: application/json' \\\n  --data-raw '{"email":"ada@example.com","amount":450000}'`;
        run();
      });
      run();
    },
  },
];
const byId = Object.fromEntries(TOOLS.map((t) => [t.id, t]));

// Router -----------------------------------------------------------------------
function renderNav(filter = "") {
  const q = filter.trim().toLowerCase();
  const cur = location.hash.slice(1);
  $("#nav").innerHTML = TOOLS.filter((t) => !q || (t.name + " " + t.desc + " " + t.id).toLowerCase().includes(q))
    .map((t) => `<a href="#${t.id}"${t.id === cur ? ' aria-current="page"' : ""}><span>${t.tag}</span>${t.name}</a>`).join("") || `<span style="color:var(--muted);padding:8px 10px;font-size:14px">No tool matches</span>`;
}
// Text can be handed over as #tool&q=…, e.g. from the extension's right-click
// menu. It lives in the hash, so it never reaches the server.
function route() {
  const [id, q] = location.hash.slice(1).split("&q=");
  if (q !== undefined) history.replaceState(null, "", "#" + id);
  const t = byId[id];
  const main = $("#main");
  if (!t) {
    main.innerHTML = `<div class="hero"><h1>Developer tools that never leave your browser</h1><p>Format JSON, decode a JWT, read a timestamp or test a regex without pasting tokens and customer data into random websites. Works offline, too.</p></div>
      <div class="home-grid">${TOOLS.map((x) => `<a href="#${x.id}"><b><span>${x.tag}</span>${x.name}</b><small>${x.desc}</small></a>`).join("")}</div>`;
    document.title = "DevKit – Developer Tools";
  } else {
    main.innerHTML = `<div class="head"><h1>${t.name}</h1><p>${t.desc}</p></div><div id="tool">${t.html()}</div>`;
    t.init($("#tool"));
    const tool = $("#tool"), field = q !== undefined && ($(t.input || "textarea", tool) || $("input.input", tool));
    if (field) { try { field.value = decodeURIComponent(q); } catch { field.value = q; } field.dispatchEvent(new Event("input", { bubbles: true })); }
    document.title = `${t.name} – DevKit`;
  }
  renderNav($("#find").value);
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", route);
$("#find").addEventListener("input", (e) => renderNav(e.target.value));
$("#find").addEventListener("keydown", (e) => {
  if (e.key === "Enter") { const first = $("#nav a"); if (first) { location.hash = first.getAttribute("href"); e.target.value = ""; e.target.blur(); } }
  if (e.key === "Escape") { e.target.value = ""; renderNav(); e.target.blur(); }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); $("#find").focus(); }
});

// Theme: auto → light → dark
const THEMES = ["auto", "light", "dark"];
let theme = store.get("theme", "auto");
const applyTheme = () => {
  if (theme === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.dataset.theme = theme;
  $("#theme").textContent = "Theme: " + theme;
};
$("#theme").addEventListener("click", () => { theme = THEMES[(THEMES.indexOf(theme) + 1) % 3]; store.set("theme", theme); applyTheme(); });
applyTheme();
route();

if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
