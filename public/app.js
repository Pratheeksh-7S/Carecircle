const ring = document.getElementById("ring");
const log = document.getElementById("log");
const input = document.getElementById("text");

const history = []; // the chat so far, so Alexa remembers context
let listening = false; // conversation mode is on

function setRing(state) { ring.className = "ring " + (state || (listening ? "listening" : "")); }

function addBubble(cls, text, tools = []) {
  const div = document.createElement("div");
  div.className = cls;
  div.textContent = text;
  for (const t of tools) {
    const tool = document.createElement("div");
    tool.className = "tool";
    tool.textContent = `MCP tool: ${t.name}(${JSON.stringify(t.input)})`;
    div.appendChild(tool);
  }
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

// MCP App screen (like an Echo Show): shows the tool's ui:// view in a sandboxed frame
function showScreen(html) {
  const frame = document.createElement("iframe");
  frame.className = "screen";
  frame.sandbox = "";
  frame.srcdoc = html;
  log.appendChild(frame);
  log.scrollTop = log.scrollHeight;
}

// What Alexa is saying, so the mic doesn't mistake Alexa's own voice for yours
let lastSpoken = "";
let echoUntil = 0;
let current = null; // the sentence Alexa is speaking now

function stopSpeaking() {
  if (current) echoUntil = Date.now() + 2000;
  current = null;
  if ("speechSynthesis" in window) speechSynthesis.cancel();
}

function speak(text) {
  if (!("speechSynthesis" in window)) return setRing();
  stopSpeaking();
  // Long answers: read the first few sentences, the full answer stays on screen
  const sentences = text.split(/(?<=[.!?])\s+/);
  if (sentences.length > 3) text = sentences.slice(0, 3).join(" ") + " The full answer is on the screen.";
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  lastSpoken = text.toLowerCase();
  echoUntil = Infinity;
  current = u;
  u.onend = u.onerror = () => {
    if (current !== u) return; // stopped on purpose
    current = null;
    echoUntil = Date.now() + 2000;
    setRing();
  };
  setRing("speaking");
  speechSynthesis.speak(u);
}

let controller = null; // the question being answered right now
let pendingText = ""; // everything said that is still waiting for an answer

async function ask(text) {
  if (!text.trim()) return;
  addBubble("you", text);
  stopSpeaking();
  // Still answering? Stop, and answer everything said so far together
  if (controller) controller.abort();
  pendingText = pendingText ? `${pendingText} ${text}` : text;
  const fullText = pendingText;
  const mine = (controller = new AbortController());
  setRing("thinking");
  try {
    const res = await fetch("/api/alexa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: fullText, history }),
      signal: mine.signal,
    });
    const data = await res.json();
    if (mine !== controller) return; // a newer question took over
    controller = null;
    pendingText = "";
    addBubble("alexa", data.reply, data.toolsUsed);
    if (res.ok && data.reply) {
      history.push({ role: "user", text: fullText }, { role: "assistant", text: data.reply });
      history.splice(0, history.length - 12); // keep the last 6 questions and answers
    }
    if (data.screen) showScreen(data.screen);
    speak(data.reply);
  } catch (err) {
    if (err.name === "AbortError") return;
    controller = null;
    pendingText = "";
    addBubble("alexa", "Sorry, I can't reach CareCircle right now.");
    setRing();
  }
  loadDashboard();
}

// Typed input and example buttons
document.getElementById("form").addEventListener("submit", (e) => {
  e.preventDefault();
  ask(input.value);
  input.value = "";
});
// Enter sends, like a chat box
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    document.getElementById("form").requestSubmit();
  }
});
document.querySelectorAll(".examples button").forEach((b) => b.addEventListener("click", () => ask(b.textContent)));

// Voice conversation (Chrome and Edge): keeps listening, and you can interrupt Alexa any time
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const mic = document.getElementById("mic");

// Is this just Alexa's own voice coming back through the mic?
function isEcho(said) {
  if (Date.now() > echoUntil) return false;
  const words = said.toLowerCase().split(/\W+/).filter(Boolean);
  const heard = words.filter((w) => lastSpoken.includes(w)).length;
  return words.length > 0 && heard / words.length >= 0.6;
}

if (!SpeechRecognition) {
  mic.textContent = "Voice needs Chrome or Edge";
  mic.disabled = true;
} else {
  const rec = new SpeechRecognition();
  rec.lang = "en-IN";
  rec.continuous = true;
  rec.interimResults = true;
  let ignored = new Set(); // results that were Alexa's own voice
  let silenceTimer;

  rec.onstart = () => { ignored = new Set(); };
  rec.onresult = (e) => {
    const parts = [];
    for (let i = 0; i < e.results.length; i++) {
      if (ignored.has(i)) continue;
      const t = e.results[i][0].transcript;
      if (isEcho(t)) {
        if (e.results[i].isFinal) ignored.add(i);
        continue;
      }
      parts.push(t);
    }
    const said = parts.join(" ").replace(/\s+/g, " ").trim();
    if (!said) return;

    // You're talking: Alexa stops (barge in) and waits until you pause
    if (current) stopSpeaking();
    setRing("listening");
    input.value = said;
    clearTimeout(silenceTimer);
    silenceTimer = setTimeout(() => {
      rec.abort(); // start a fresh listening session for the next sentence
      input.value = "";
      ask(said.replace(/^alexa[, ]*/i, ""));
    }, 1500);
  };
  // The browser stops listening now and then: start again while conversation mode is on
  rec.onend = () => {
    if (listening) try { rec.start(); } catch {}
  };
  rec.onerror = (e) => {
    if (e.error === "not-allowed") stopListening();
  };

  function stopListening() {
    listening = false;
    clearTimeout(silenceTimer);
    rec.abort();
    mic.textContent = "🎤 Start talking";
    setRing();
  }
  mic.addEventListener("click", () => {
    if (listening) return stopListening();
    listening = true;
    mic.textContent = "⏹ Stop listening";
    setRing();
    rec.start();
  });
  mic.textContent = "🎤 Start talking";
}

// Family dashboard (what an Echo Show would display)
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

async function loadDashboard() {
  const d = await (await fetch("/api/dashboard")).json();
  document.getElementById("title").textContent = `${d.person}'s medications today`;
  document.getElementById("meds").innerHTML = d.medications.map((m) =>
    `<li><span>${esc(m.name)} <small style="color:var(--muted)">(${m.time})</small></span>
     <span class="badge ${m.taken ? "ok" : "wait"}">${m.taken ? "✓ Taken" : "Not yet"}</span></li>`).join("");
  const list = (items, cls, empty) => items.length
    ? items.slice().reverse().map((i) => `<div class="item ${cls}">${esc(i.text || i.message)}
        <small style="color:var(--muted)"> · ${new Date(i.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small></div>`).join("")
    : `<div class="empty">${empty}</div>`;
  document.getElementById("alerts").innerHTML = list(d.alerts, "alert", "No alerts today.");
  document.getElementById("notes").innerHTML = list(d.notes, "", "No notes yet.");
}
loadDashboard();
setInterval(loadDashboard, 5000);