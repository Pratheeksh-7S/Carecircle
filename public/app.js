const ring = document.getElementById("ring");
const log = document.getElementById("log");

function setRing(state) { ring.className = "ring " + (state || ""); }

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

function speak(text) {
  if (!("speechSynthesis" in window)) return setRing();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  u.onend = () => setRing();
  setRing("speaking");
  speechSynthesis.speak(u);
}

async function ask(text) {
  if (!text.trim()) return;
  addBubble("you", text);
  setRing("thinking");
  try {
    const res = await fetch("/api/alexa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const data = await res.json();
    addBubble("alexa", data.reply, data.toolsUsed);
    speak(data.reply);
  } catch (err) {
    addBubble("alexa", "Sorry, I can't reach CareCircle right now.");
    setRing();
  }
  loadDashboard();
}

// Typed input and example buttons
document.getElementById("form").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = document.getElementById("text");
  ask(input.value);
  input.value = "";
});
// Enter sends, like a chat box
document.getElementById("text").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    document.getElementById("form").requestSubmit();
  }
});
document.querySelectorAll(".examples button").forEach((b) => b.addEventListener("click", () => ask(b.textContent)));

// Voice input (Chrome and Edge)
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const mic = document.getElementById("mic");
if (!SpeechRecognition) {
  mic.textContent = "Voice needs Chrome or Edge";
  mic.disabled = true;
} else {
  const rec = new SpeechRecognition();
  rec.lang = "en-US";
  rec.onstart = () => setRing("listening");
  rec.onerror = () => setRing();
  rec.onresult = (e) => ask(e.results[0][0].transcript.replace(/^alexa[, ]*/i, ""));
  mic.addEventListener("click", () => rec.start());
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