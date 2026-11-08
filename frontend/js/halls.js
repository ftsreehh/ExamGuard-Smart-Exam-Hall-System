const API_BASE = "http://127.0.0.1:5000/api";

async function loadHalls() {
    const body = document.getElementById("hallTableBody");
    const message = document.getElementById("hallMessage");

    try {
        const response = await fetch(`${API_BASE}/halls`);

        if (!response.ok) {
            throw new Error(`Server returned ${response.status}`);
        }

        const halls = await response.json();

        document.getElementById("totalHalls").textContent = halls.length;

        document.getElementById("activeHalls").textContent =
            halls.filter(hall => hall.is_active).length;

        document.getElementById("totalCapacity").textContent =
            halls.filter(hall => hall.is_active)
                .reduce((sum, hall) => sum + Number(hall.capacity || 0), 0);

        if (halls.length === 0) {
            body.innerHTML = `
                <tr><td colspan="7" class="text-center">No halls found.</td></tr>
            `;
            return;
        }

        body.innerHTML = halls.map(hall => `
            <tr>
                <td><strong>${escapeHTML(hall.code)}</strong></td>
                <td>${escapeHTML(hall.name)}</td>
                <td>${escapeHTML(hall.floor || "—")}</td>
                <td>${Number(hall.capacity)}</td>
                <td>${Number(hall.noise_threshold)}</td>
                <td>${Number(hall.rf_threshold)}</td>
                <td>
                    <span class="exam-status-pill"
                          style="${hall.is_active
                              ? 'background:#e9faf0;color:#168b50'
                              : 'background:#fff0ee;color:#c0392b'}">
                        ${hall.is_active ? "ACTIVE" : "INACTIVE"}
                    </span>
                </td>
            </tr>
        `).join("");

        message.innerHTML = "";

    } catch (error) {
        body.innerHTML = `
            <tr><td colspan="7" class="text-center">
                Could not load halls. Check Flask and the browser console.
            </td></tr>
        `;
        message.textContent = error.message;
        console.error(error);
    }
}

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);
}

document.getElementById("liveClock").textContent = "--:--:--";

function updateClock() {
    document.getElementById("liveClock").textContent =
        new Date().toLocaleTimeString("en-IN");
}

setInterval(updateClock, 1000);
updateClock();

document.getElementById("refreshHalls").addEventListener("click", loadHalls);
loadHalls();