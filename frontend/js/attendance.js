const API = "http://127.0.0.1:5000/api";

// ==========================================
// DOM ELEMENTS
// ==========================================

const examSelect = document.getElementById("examSelect");
const examDetails = document.getElementById("examDetails");

const totalStudentsEl = document.getElementById("totalStudents");
const presentStudentsEl = document.getElementById("presentStudents");
const absentStudentsEl = document.getElementById("absentStudents");

const attendancePercentageEl =
    document.getElementById("attendancePercentage");

const attendanceProgress =
    document.getElementById("attendanceProgress");

const attendanceTableBody =
    document.getElementById("attendanceTableBody");

const attendanceMessage =
    document.getElementById("attendanceMessage");

const recordCount =
    document.getElementById("recordCount");

const refreshAttendance =
    document.getElementById("refreshAttendance");

let examsCache = [];
let currentExam = null;


// ==========================================
// SECURITY: ESCAPE HTML
// ==========================================

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[character]);
}


// ==========================================
// API REQUEST
// ADMIN AUTHENTICATION USES FLASK SESSION
// ==========================================

async function apiRequest(endpoint) {
    const response = await fetch(`${API}${endpoint}`, {
        method: "GET",
        credentials: "include",
        headers: {
            "Accept": "application/json"
        }
    });

    const data = await response.json().catch(() => ({}));

    if (response.status === 401) {
        attendanceMessage.textContent =
            "Your Admin session has expired. Please log in again.";

        attendanceMessage.className =
            "small text-danger mt-2";

        window.location.href = "login.html";

        throw new Error("Admin login required.");
    }

    if (!response.ok) {
        throw new Error(
            data.message ||
            data.error ||
            `Request failed (${response.status})`
        );
    }

    return data;
}


// ==========================================
// DATE AND TIME FORMATTING
// ==========================================

function formatDate(value) {
    if (!value) {
        return "—";
    }

    // Date-only values should not shift to the previous day.
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(String(value));

    const date = dateOnly
        ? new Date(`${value}T00:00:00`)
        : new Date(value);

    if (Number.isNaN(date.getTime())) {
        return escapeHTML(value);
    }

    return date.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    });
}


function formatTime(value) {
    if (!value) {
        return "—";
    }

    // SQL TIME values may arrive as HH:MM:SS.
    const timeMatch = String(value).match(
        /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/
    );

    if (timeMatch) {
        let hours = Number(timeMatch[1]);
        const minutes = timeMatch[2];
        const seconds = timeMatch[3] || "00";

        const period = hours >= 12 ? "PM" : "AM";

        hours = hours % 12 || 12;

        return `${String(hours).padStart(2, "0")}:${minutes}:${seconds} ${period}`;
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return escapeHTML(value);
    }

    return date.toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true
    });
}


// ==========================================
// STATUS AND MESSAGE HELPERS
// ==========================================

function showMessage(message, type = "muted") {
    attendanceMessage.textContent = message;

    attendanceMessage.className =
        type === "danger"
            ? "small text-danger mt-2"
            : "small text-muted mt-2";
}


function showEmptyTable(message) {
    attendanceTableBody.innerHTML = `
        <tr>
            <td colspan="7" class="attendance-message">
                ${escapeHTML(message)}
            </td>
        </tr>
    `;
}


function resetSummary() {
    totalStudentsEl.textContent = "—";
    presentStudentsEl.textContent = "—";
    absentStudentsEl.textContent = "—";

    attendancePercentageEl.textContent = "—%";

    attendanceProgress.style.width = "0%";
    attendanceProgress.setAttribute("aria-valuenow", "0");

    recordCount.textContent = "0 records";
}


// ==========================================
// EXAM INFORMATION HELPERS
// ==========================================

function getExamName(exam) {
    return (
        exam.title ||
        exam.exam_name ||
        exam.name ||
        "Examination"
    );
}


function getExamDate(exam) {
    return exam.exam_date || exam.date || "";
}


function getExamTime(exam, key) {
    return exam[key] || "—";
}


function findExamById(examId) {
    return examsCache.find(
        exam => String(exam.id) === String(examId)
    );
}


// ==========================================
// LOAD EXAMINATIONS
// GET /api/exams
// ==========================================

async function loadExams() {
    examSelect.disabled = true;

    examSelect.innerHTML = `
        <option value="">Loading examinations...</option>
    `;

    resetSummary();

    showEmptyTable("Loading examinations...");

    showMessage("Loading examination list...");

    try {
        const data = await apiRequest("/exams");

        const exams = Array.isArray(data)
            ? data
            : (
                Array.isArray(data.exams)
                    ? data.exams
                    : (
                        Array.isArray(data.data)
                            ? data.data
                            : []
                    )
            );

        examsCache = exams;

        examSelect.innerHTML = `
            <option value="">-- Select an examination --</option>
        `;

        if (exams.length === 0) {
            examSelect.innerHTML = `
                <option value="">No examinations found</option>
            `;

            examDetails.textContent =
                "Create an examination before viewing attendance.";

            showEmptyTable("No examinations are available.");

            showMessage("No examinations found.");

            return;
        }

        exams.forEach(exam => {
            const option = document.createElement("option");

            option.value = exam.id;

            const title = getExamName(exam);

            const subject = exam.subject
                ? ` — ${exam.subject}`
                : "";

            option.textContent = `${title}${subject}`;

            examSelect.appendChild(option);
        });

        // Select the first examination automatically.
        examSelect.value = String(exams[0].id);

        await loadSelectedExam();

    } catch (error) {
        console.error("Error loading examinations:", error);

        examSelect.innerHTML = `
            <option value="">Unable to load examinations</option>
        `;

        examDetails.textContent =
            "Could not load examination details.";

        showEmptyTable("Unable to load examinations.");

        showMessage(error.message, "danger");

    } finally {
        examSelect.disabled = false;
    }
}


// ==========================================
// DISPLAY SELECTED EXAM DETAILS
// ==========================================

function displayExamDetails(exam) {
    if (!exam) {
        examDetails.textContent =
            "Select an examination to view its attendance.";

        return;
    }

    const title = getExamName(exam);
    const subject = exam.subject || "—";
    const date = formatDate(getExamDate(exam));

    const start = getExamTime(exam, "start_at");
    const end = getExamTime(exam, "end_at");

    const hall =
        exam.hall_name ||
        exam.hall ||
        exam.hall_id ||
        "—";

    examDetails.innerHTML = `
        <div class="row g-2 mt-2">

            <div class="col-12 col-md-6">
                <strong>Examination:</strong>
                ${escapeHTML(title)}
            </div>

            <div class="col-12 col-md-6">
                <strong>Subject:</strong>
                ${escapeHTML(subject)}
            </div>

            <div class="col-12 col-md-6">
                <strong>Date:</strong>
                ${escapeHTML(date)}
            </div>

            <div class="col-12 col-md-6">
                <strong>Time:</strong>
                ${escapeHTML(start)}
                – ${escapeHTML(end)}
            </div>

            <div class="col-12">
                <strong>Hall:</strong>
                ${escapeHTML(hall)}
            </div>

        </div>
    `;
}


// ==========================================
// LOAD ATTENDANCE FOR SELECTED EXAM
//
// ADMIN ENDPOINT:
// GET /api/attendance/admin/<exam_id>
//
// Uses Flask login session.
// ==========================================

async function loadSelectedExam() {
    const examId = examSelect.value;

    resetSummary();

    showMessage("");

    if (!examId) {
        currentExam = null;

        examDetails.textContent =
            "Select an examination to view its attendance.";

        showEmptyTable("Select an examination first.");

        return;
    }

    const exam = findExamById(examId);

    currentExam = exam || {
        id: examId,
        title: "Examination"
    };

    displayExamDetails(currentExam);

    showEmptyTable("Loading attendance records...");

    showMessage("Loading attendance records...");

    try {
        // Important: this is the Admin endpoint.
        // Do not replace it with /attendance/<exam_id>.
        const data = await apiRequest(
            `/attendance/admin/${encodeURIComponent(examId)}`
        );

        const records = Array.isArray(data.attendance)
            ? data.attendance
            : [];

        renderAttendance(records, data);

        showMessage("Attendance data loaded successfully.");

    } catch (error) {
        console.error(
            "Error loading Admin attendance:",
            error
        );

        showEmptyTable(
            "Attendance records could not be loaded."
        );

        showMessage(error.message, "danger");
    }
}


// ==========================================
// RENDER ATTENDANCE RECORDS
// ==========================================

function renderAttendance(records, responseData = {}) {
    const presentRecords = records.filter(record =>
        String(record.status || "").toUpperCase() === "PRESENT"
    );

    const absentRecords = records.filter(record =>
        String(record.status || "").toUpperCase() === "ABSENT"
    );

    const totalStudents = Number(
        responseData.total_students ?? records.length
    );

    const presentCount = Number(
        responseData.present ?? presentRecords.length
    );

    const absentCount = Number(
        responseData.absent ??
        Math.max(0, totalStudents - presentCount)
    );

    // Percentage is based on the active student count.
    const percentage = totalStudents > 0
        ? Math.round((presentCount / totalStudents) * 100)
        : 0;

    totalStudentsEl.textContent = totalStudents;
    presentStudentsEl.textContent = presentCount;
    absentStudentsEl.textContent = absentCount;

    attendancePercentageEl.textContent = `${percentage}%`;

    attendanceProgress.style.width =
        `${Math.min(100, Math.max(0, percentage))}%`;

    attendanceProgress.setAttribute(
        "aria-valuenow",
        String(percentage)
    );

    recordCount.textContent =
        `${records.length} recorded attendance entries`;

    if (records.length === 0) {
        showEmptyTable(
            "No attendance has been recorded for this examination yet."
        );

        return;
    }

    attendanceTableBody.innerHTML = records.map(
        (record, index) => {
            const status = String(
                record.status || "PENDING"
            ).toUpperCase();

            let statusClass = "status-pending";

            if (status === "PRESENT") {
                statusClass = "status-present";
            } else if (status === "ABSENT") {
                statusClass = "status-absent";
            }

            const attendanceTime =
                record.attendance_time || null;

            const date = attendanceTime
                ? formatDate(attendanceTime)
                : "—";

            const time = attendanceTime
                ? formatTime(attendanceTime)
                : "—";

            const invigilatorName =
                record.invigilator_name ||
                record.invigilator ||
                "—";

            return `
                <tr>
                    <td>${index + 1}</td>

                    <td>
                        ${escapeHTML(
                            record.enrollment_number || "—"
                        )}
                    </td>

                    <td>
                        ${escapeHTML(
                            record.student_name || "—"
                        )}
                    </td>

                    <td>
                        <span class="${statusClass}">
                            ${escapeHTML(status)}
                        </span>
                    </td>

                    <td>${escapeHTML(date)}</td>

                    <td>${escapeHTML(time)}</td>

                    <td>
                        ${escapeHTML(invigilatorName)}
                    </td>
                </tr>
            `;
        }
    ).join("");
}


// ==========================================
// EVENT LISTENERS
// ==========================================

examSelect.addEventListener(
    "change",
    loadSelectedExam
);


refreshAttendance.addEventListener(
    "click",
    async function () {
        refreshAttendance.disabled = true;

        try {
            if (examSelect.value) {
                await loadSelectedExam();
            } else {
                await loadExams();
            }
        } finally {
            refreshAttendance.disabled = false;
        }
    }
);


// ==========================================
// INITIALIZE PAGE
// ==========================================

document.addEventListener(
    "DOMContentLoaded",
    loadExams
);