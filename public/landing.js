// Old links like devkit-ng.vercel.app/#jwt pointed at the app before it moved
// to /app/. Send them on before anything renders.
(() => {
  const SECTIONS = ["", "tools", "privacy", "extension", "faq"];
  const id = location.hash.slice(1).split("&")[0];
  if (!SECTIONS.includes(id)) location.replace("/app/" + location.hash);
})();

const TOOLS = [
  ["Data & formats", [
    ["json", "{}", "JSON", "Format, minify and validate, with the exact line of any error."],
    ["json-ts", "TS", "JSON to TypeScript", "Paste an API response, get typed interfaces."],
    ["csv", "csv", "JSON ↔ CSV", "Spreadsheet-ready CSV and back, nested fields included."],
    ["diff", "±", "Text diff", "See exactly which lines changed between two versions."],
    ["case", "Aa", "Case converter", "camelCase, snake_case, kebab-case and friends."],
  ]],
  ["Encode & decode", [
    ["jwt", "JWT", "JWT decoder", "Header, claims and when the token expires."],
    ["base64", "64", "Base64", "Encode and decode, emoji and URL-safe included."],
    ["url", "%", "URL", "Encode, decode and split a URL into its params."],
    ["base", "0x", "Number base", "Decimal, hex, binary, octal and byte sizes."],
  ]],
  ["Security", [
    ["hmac", "sig", "Webhook signature", "Check Paystack, Stripe or GitHub signatures."],
    ["hash", "#", "Hash", "SHA-1, SHA-256, SHA-384 and SHA-512."],
    ["password", "***", "Password", "Strong passwords from the secure generator."],
    ["uuid", "ID", "UUID", "Random v4 UUIDs, one or hundreds."],
  ]],
  ["APIs & backend", [
    ["curl", "curl", "cURL to fetch", "Turn any cURL into fetch or axios code."],
    ["http", "200", "HTTP status codes", "What each code means and when to use it."],
    ["time", "ts", "Timestamp", "Unix time to dates in Lagos time and UTC."],
    ["cron", "cron", "Cron explainer", "Cron in plain English, with the next runs."],
    ["regex", ".*", "Regex tester", "Live highlighting and capture groups."],
    ["fake", "NG", "Fake data", "Nigerian test users as JSON, CSV or SQL."],
  ]],
  ["Frontend & JavaScript", [
    ["array", "[ ]", "Array methods", "Say what you want to do, get the right method.", true],
    ["type-scale", "px", "Font sizes", "A type scale in px and rem, with line heights.", true],
    ["fonts", "Ff", "Font picker", "Fonts and pairings that fit what you're building.", true],
    ["color", "#f0", "Color", "HEX, RGB, HSL and WCAG contrast checks."],
  ]],
];

// Hero demo frames: input is typed, then status and output appear.
const DEMOS = [
  {
    tab: "JWT", inLabel: "Token", outLabel: "Payload",
    input: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyXzQyIiwibmFtZSI6IkFkYSBPYmkiLCJyb2xlIjoiYWRtaW4iLCJleHAiOjE3OTg3NjE2MDB9.c2lnbmF0dXJl",
    status: "Decoded · HS256 · expires 1 Jan 2027",
    output: `{\n  <span class="k">"sub"</span>: <span class="s">"user_42"</span>,\n  <span class="k">"name"</span>: <span class="s">"Ada Obi"</span>,\n  <span class="k">"role"</span>: <span class="s">"admin"</span>,\n  <span class="k">"exp"</span>: <span class="n">1798761600</span>\n}`,
  },
  {
    tab: "cURL → fetch", inLabel: "cURL", outLabel: "JavaScript",
    input: "curl https://api.paystack.co/transaction/initialize -H 'Authorization: Bearer sk_test_xxx' -H 'Content-Type: application/json' -d '{\"email\":\"ada@example.com\",\"amount\":450000}'",
    status: "Converted · POST api.paystack.co",
    output: `<span class="v">const</span> res = <span class="v">await</span> fetch(<span class="s">"https://api.paystack.co/transaction/initialize"</span>, {\n  method: <span class="s">"POST"</span>,\n  headers: { <span class="s">"Authorization"</span>: <span class="s">"Bearer sk_test_xxx"</span>, … },\n  body: JSON.stringify({ email: <span class="s">"ada@example.com"</span>, amount: <span class="n">450000</span> }),\n});`,
  },
  {
    tab: "JSON", inLabel: "JSON", outLabel: "Where it broke",
    input: '{"name": "Ada", "city": "Lagos", "orders": [12, 45,]}',
    status: "Line 1, column 52: Unexpected token ']'", err: true,
    output: `{"name": "Ada", "city": "Lagos", "orders": [12, 45,]}\n<span class="r">                                                   ^</span>\n<span class="m">A trailing comma before ] isn't allowed in JSON.</span>`,
  },
  {
    tab: "Webhook", inLabel: "Payload + x-paystack-signature", outLabel: "HMAC SHA-512",
    input: '{"event":"charge.success","data":{"amount":450000,"reference":"T93k2"}}',
    status: "✓ Match. This payload was signed with this secret.",
    output: `<span class="k">Hex</span>     <span class="s">3f9a1c0e7b…d41e</span>\n<span class="k">Base64</span>  <span class="s">P5ocDns…1B4=</span>`,
  },
];

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

function renderTools() {
  $("#cats").innerHTML = TOOLS.map(([cat, list]) => `
    <div class="cat reveal"><h3>${cat}</h3><div class="tools">${list.map(([id, tag, name, desc, isNew]) => `
      <a class="tool" href="/app/#${id}"><span class="tag">${esc(tag)}</span><span><b>${esc(name)}${isNew ? '<span class="new">NEW</span>' : ""}</b><span>${esc(desc)}</span></span></a>`).join("")}
    </div></div>`).join("");
}

function startDemo() {
  const tabs = $("#demo-tabs");
  tabs.innerHTML = DEMOS.map((d, i) => `<button role="tab" data-i="${i}">${esc(d.tab)}</button>`).join("");
  let cur = 0, timer = null, run = 0, paused = false;
  const show = (i) => {
    cur = i; const d = DEMOS[i], my = ++run;
    clearTimeout(timer);
    [...tabs.children].forEach((b, j) => b.setAttribute("aria-selected", String(j === i)));
    $("#d-in-label").textContent = d.inLabel; $("#d-out-label").textContent = d.outLabel;
    $("#d-status").className = "status out" + (d.err ? " err" : ""); $("#d-out-pane").classList.remove("show");
    $("#d-status").textContent = d.status; $("#d-out").innerHTML = d.output;
    const inp = $("#d-in");
    const reveal = () => {
      inp.textContent = d.input;
      $("#d-status").classList.add("show");
      setTimeout(() => { if (my === run) $("#d-out-pane").classList.add("show"); }, 180);
      if (!paused) timer = setTimeout(() => show((cur + 1) % DEMOS.length), 4200);
    };
    if (reduced) return reveal();
    let n = 0;
    const step = Math.max(1, Math.ceil(d.input.length / 45));
    const type = () => {
      if (my !== run) return;
      n = Math.min(d.input.length, n + step);
      inp.innerHTML = esc(d.input.slice(0, n)) + '<span class="c"></span>';
      if (n < d.input.length) timer = setTimeout(type, 22); else timer = setTimeout(reveal, 250);
    };
    type();
  };
  tabs.addEventListener("click", (e) => { const b = e.target.closest("[data-i]"); if (b) { paused = true; show(+b.dataset.i); } });
  show(0);
}

function reveals() {
  const els = document.querySelectorAll(".reveal");
  if (reduced || !("IntersectionObserver" in window)) return els.forEach((e) => e.classList.add("in"));
  const io = new IntersectionObserver((entries) => entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } }), { rootMargin: "0px 0px -8% 0px" });
  els.forEach((e) => io.observe(e));
}

document.addEventListener("DOMContentLoaded", () => {
  renderTools();
  startDemo();
  reveals();
  $("#year").textContent = new Date().getFullYear();
  const nav = $("#nav");
  const onScroll = () => nav.classList.toggle("scrolled", scrollY > 8);
  addEventListener("scroll", onScroll, { passive: true }); onScroll();
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("/sw.js").catch(() => {});
});
