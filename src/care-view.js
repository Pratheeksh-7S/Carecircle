// The MCP App view: a small HTML card that Alexa+ can show on an Echo Show screen.
import { loadData, isToday } from "./care-data.js";

export const VIEW_URI = "ui://carecircle/today.html";
export const VIEW_MIME = "text/html;profile=mcp-app";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

export function buildCareView() {
  const data = loadData();
  const taken = data.doses.filter((d) => isToday(d.takenAt)).map((d) => d.medication.toLowerCase());
  const alerts = data.alerts.filter((a) => isToday(a.createdAt));
  const notes = data.notes.filter((n) => isToday(n.createdAt));

  const meds = data.medications.map((m) => {
    const ok = taken.includes(m.name.toLowerCase());
    return `<div style="display:flex;justify-content:space-between;padding:10px 12px;margin:6px 0;border-radius:10px;background:#1b2536">
      <span>${esc(m.name)} <small style="color:#8a97ad">(${esc(m.time)})</small></span>
      <b style="color:${ok ? "#3ddc97" : "#ffb547"}">${ok ? "✓ Taken" : "Not yet"}</b></div>`;
  }).join("");

  const lines = (items, color) => items.slice(-3).reverse()
    .map((i) => `<div style="padding:8px 12px;margin:6px 0;border-left:3px solid ${color};background:#1b2536;border-radius:6px">${esc(i.text || i.message)}</div>`)
    .join("");

  return `<!doctype html>
<html><body style="margin:0;padding:16px;font-family:system-ui,sans-serif;background:#0f1724;color:#e8eef7">
  <div style="font-size:18px;font-weight:700;margin-bottom:8px">${esc(data.person)}'s care today</div>
  ${meds}
  ${alerts.length ? `<div style="margin-top:12px;color:#8a97ad">Alerts</div>${lines(alerts, "#ff5d5d")}` : ""}
  ${notes.length ? `<div style="margin-top:12px;color:#8a97ad">Care notes</div>${lines(notes, "#00caff")}` : ""}
</body></html>`;
}