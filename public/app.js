const statusText = document.getElementById("statusText");
const statusDot = document.getElementById("statusDot");
const pairBtn = document.getElementById("pairBtn");
const phoneInput = document.getElementById("phone");
const pairResult = document.getElementById("pairResult");
const qrBox = document.getElementById("qrBox");

async function api(url, options = {}) {
const response = await fetch(url, {
...options,
headers: {
"Content-Type": "application/json",
...(options.headers || {})
}
});

const data = await response.json().catch(() => ({}));

if (!response.ok) {
throw new Error(data.error || "Une erreur est survenue.");
}

return data;
}

async function refreshStatus() {
try {
const data = await api("/api/status");

const labels = {
  connected: "Bot connecté",
  waiting_for_scan: "En attente du scan QR",
  disconnected: "Bot déconnecté"
};

statusText.textContent = labels[data.status] || "État inconnu";
statusDot.style.background =
  data.status === "connected" ? "#21e68b" :
  data.status === "disconnected" ? "#ff5263" : "#f4b942";

} catch {
statusText.textContent = "Serveur indisponible";
statusDot.style.background = "#ff5263";
}
}

document.querySelectorAll(".tab").forEach((button) => {
button.addEventListener("click", () => {
document.querySelectorAll(".tab").forEach((tab) =>
tab.classList.remove("active")
);

document.querySelectorAll(".tab-content").forEach((panel) =>
  panel.classList.add("hidden")
);

button.classList.add("active");
document.getElementById(button.dataset.tab).classList.remove("hidden");

if (button.dataset.tab === "qr") {
  refreshQr();
}

});
});

pairBtn.addEventListener("click", async () => {
const phone = phoneInput.value.trim();

pairResult.textContent = "";

if (!/^\d{8,15}$/.test(phone)) {
pairResult.textContent =
"Entre un numéro valide avec l'indicatif du pays, sans le signe +.";
return;
}

pairBtn.disabled = true;
pairBtn.textContent = "Génération en cours...";

try {
const data = await api("/api/pair", {
method: "POST",
body: JSON.stringify({ phone })
});

pairResult.innerHTML = "";
const code = document.createElement("div");
code.className = "code";
code.textContent = data.code || "Code indisponible";
pairResult.appendChild(code);

const note = document.createElement("p");
note.textContent =
  "Ouvre WhatsApp → Appareils connectés → Connecter un appareil → Connecter avec un numéro.";
pairResult.appendChild(note);

} catch (error) {
pairResult.textContent = error.message;
} finally {
pairBtn.disabled = false;
pairBtn.textContent = "Générer le code";
}
});

async function refreshQr() {
qrBox.textContent = "Chargement du QR Code...";

try {
const data = await api("/api/qr");

if (!data.qr) {
  qrBox.textContent =
    "QR Code indisponible pour le moment. Actualise dans quelques secondes.";
  return;
}

const img = document.createElement("img");
img.src = data.qr;
img.alt = "QR Code WhatsApp";
qrBox.replaceChildren(img);

} catch {
qrBox.textContent = "Impossible de charger le QR Code.";
}
}

document.getElementById("refreshQr").addEventListener("click", refreshQr);

refreshStatus();
refreshQr();
setInterval(refreshStatus, 5000);
setInterval(() => {
const qrTab = document.getElementById("qr");
if (!qrTab.classList.contains("hidden")) refreshQr();
}, 15000);
