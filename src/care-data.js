// Stores CareCircle data in a simple JSON file (data.json).
import fs from "node:fs";

const DATA_FILE = "data.json";

const starterData = {
  person: "Mom",
  medications: [
    { name: "blood pressure pill", time: "morning" },
    { name: "diabetes pill", time: "morning" },
    { name: "vitamin D", time: "evening" },
  ],
  doses: [], // { medication, takenAt }
  notes: [], // { text, createdAt }
  alerts: [], // { message, createdAt }
};

export function loadData() {
  if (!fs.existsSync(DATA_FILE)) saveData(starterData);
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}

export function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

export function isToday(isoDate) {
  return new Date(isoDate).toDateString() === new Date().toDateString();
}

// Match what was said ("my pressure tablet") to a known medication name
export function matchMedication(data, spoken) {
  const words = spoken.toLowerCase().split(/\W+/);
  const ignore = ["pill", "tablet", "medicine", "medication", "my", "the"];
  const found = data.medications.find((m) =>
    m.name.toLowerCase().split(" ").some((w) => !ignore.includes(w) && words.includes(w))
  );
  return found ? found.name : spoken;
}