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
    return `<div style="display:flex;justify-content:space-between;padding:10px 12px;margin:6px 0;border-radius:14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08)">
      <span>${esc(m.name)} <small style="color:#9a93ad">(${esc(m.time)})</small></span>
      <b style="color:${ok ? "#86efac" : "#fcd34d"}">${ok ? "✓ Taken" : "Not yet"}</b></div>`;
  }).join("");

  const lines = (items, color) => items.slice(-3).reverse()
    .map((i) => `<div style="padding:8px 12px;margin:6px 0;border-left:3px solid ${color};background:rgba(255,255,255,.04);border-radius:10px">${esc(i.text || i.message)}</div>`)
    .join("");

  return `<!doctype html>
<html><body style="margin:0;padding:16px;font-family:Outfit,system-ui,sans-serif;background:#0d0b14;color:#f2eefb">
  <div style="font-size:14px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#c4b5fd;margin-bottom:10px">${esc(data.person)}'s care today</div>
  ${meds}
  ${alerts.length ? `<div style="margin-top:12px;color:#9a93ad">Alerts</div>${lines(alerts, "#fb7185")}` : ""}
  ${notes.length ? `<div style="margin-top:12px;color:#9a93ad">Care notes</div>${lines(notes, "#c4b5fd")}` : ""}
</body></html>`;
}