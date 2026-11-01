// DevKit extension: the toolbar button opens the tools in a tab, and the
// right-click menu sends selected text straight into the right tool. The text
// travels in the page's #hash, and DevKit never makes network requests.
const TOOLS = [
  ["auto", "Pick the tool for me"],
  ["json", "Format JSON"],
  ["jwt", "Decode JWT"],
  ["base64", "Decode Base64"],
  ["time", "Convert timestamp"],
  ["url", "Decode / parse URL"],
  ["curl", "cURL to fetch"],
  ["json-ts", "JSON to TypeScript"],
  ["case", "Change case"],
  ["hash", "Hash it"],
];

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: "devkit", title: "Open in DevKit", contexts: ["selection"] });
    for (const [id, title] of TOOLS) chrome.contextMenus.create({ id: "devkit:" + id, parentId: "devkit", title, contexts: ["selection"] });
  });
});

function detect(text) {
  const s = text.trim();
  if (/^curl\s/i.test(s)) return "curl";
  if (/^(Bearer\s+)?eyJ[\w-]+\.[\w-]+\.[\w-]*$/.test(s)) return "jwt";
  if (/^[[{]/.test(s)) return "json";
  if (/^\d{9,16}$/.test(s) || /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(s)) return "time";
  if (/^https?:\/\//i.test(s) || /%[0-9a-f]{2}/i.test(s)) return "url";
  if (/^#[0-9a-f]{3,8}$|^(rgb|hsl)a?\(/i.test(s)) return "color";
  if (/^0[xbo][0-9a-f_]+$/i.test(s)) return "base";
  if (s.length >= 12 && s.length % 4 !== 1 && /^[A-Za-z0-9+/_-]+={0,2}$/.test(s) && /[A-Z]/.test(s) && /[a-z]/.test(s)) return "base64";
  return "case";
}

const open = (tool, text = "") => chrome.tabs.create({
  url: chrome.runtime.getURL("index.html") + "#" + tool + (text ? "&q=" + encodeURIComponent(text) : ""),
});

chrome.action.onClicked.addListener(() => open(""));
chrome.contextMenus.onClicked.addListener((info) => {
  const id = String(info.menuItemId).replace(/^devkit:?/, "") || "auto";
  const text = info.selectionText || "";
  open(id === "auto" ? detect(text) : id, text);
});
