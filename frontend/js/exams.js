/* =========================================================
   EXAMGUARD - EXAM MANAGEMENT
   File: frontend/js/exams.js
   Backend: Flask
   API: http://127.0.0.1:5000/api
========================================================= */

"use strict";

const API_BASE = "http://127.0.0.1:5000/api";

let exams = [];
let halls = [];
let invigilators = [];

let rescheduleModalInstance = null;


/* =========================================================
   INITIALIZATION
========================================================= */

document.addEventListener("DOMContentLoaded", async function () {
    initializeRescheduleModal();
    initializeEventListeners();

    await loadHalls();
    await loadInvigilators();
    await loadExams();
});


/* =========================================================
   API HELPER
========================================================= */

async function apiRequest(endpoint, options = {}) {
    const requestOptions = {
        credentials: "include",
        ...options,
        headers: {
            ...(options.body ? {
                "Content-Type": "application/json"
            } : {}),
            ...(options.headers || {})
        }
    };

    let response;

    try {
        response = await fetch(`${API_BASE}${endpoint}`, requestOptions);
    } catch (error) {
        throw new Error(
            "Cannot connect to the server. Make sure Flask is running on port 5000."
        );
    }

    let result = {};

    try {
        result = await response.json();
    } catch (error) {
        // The server may return an empty response.
    }

    if (!response.ok) {
        throw new Error(
            result.message ||
            result.error ||
            `Request failed with status ${response.status}.`
        );
    }

    return result;
}


/* =========================================================
   EVENT LISTENERS
========================================================= */

function initializeEventListeners() {
    const examForm = document.getElementById("examForm");
    const refreshButton = document.getElementById("refreshExams");
    const rescheduleForm = document.getElementById("rescheduleForm");

    if (examForm) {
        examForm.addEventListener("submit", handleCreateExam);
    }

    if (refreshButton) {
        refreshButton.addEventListener("click", async function () {
            await loadExams();
            await loadHalls();
            await loadInvigilators();
        });
    }

    if (rescheduleForm) {
        rescheduleForm.addEventListener("submit", handleRescheduleExam);
    }

    // Event delegation for reschedule and delete buttons.
    const examTableBody = document.getElementById("examTableBody");

    if (examTableBody) {
        examTableBody.addEventListener("click", handleExamTableClick);
    }
}


/* =========================================================
   BOOTSTRAP MODAL
========================================================= */

function initializeRescheduleModal() {
    const modalElement = document.getElementById("rescheduleModal");

    if (modalElement && window.bootstrap) {
        rescheduleModalInstance =
            bootstrap.Modal.getOrCreateInstance(modalElement);
    }
}


/* =========================================================
   LOAD HALLS
   GET /api/halls
========================================================= */

async function loadHalls() {
    const hallSelect = document.getElementById("hall_id");
    const rescheduleHallSelect =
        document.getElementById("reschedule_hall_id");

    try {
        const result = await apiRequest("/halls");

        let hallList = [];

        if (Array.isArray(result)) {
            hallList = result;
        } else if (Array.isArray(result.halls)) {
            hallList = result.halls;
        } else if (Array.isArray(result.data)) {
            hallList = result.data;
        }

        halls = hallList;

        populateHallDropdown(hallSelect, "Select Hall");
        populateHallDropdown(rescheduleHallSelect, "Select Hall");

    } catch (error) {
        console.error("Error loading halls:", error);

        setSelectMessage(hallSelect, "Unable to load halls");
        setSelectMessage(rescheduleHallSelect, "Unable to load halls");
    }
}


function populateHallDropdown(selectElement, placeholder) {
    if (!selectElement) return;

    selectElement.innerHTML = "";

    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = placeholder;

    selectElement.appendChild(defaultOption);

    halls.forEach(function (hall) {
        const option = document.createElement("option");

        option.value = hall.id;

        const hallName =
            hall.hall_name ||
            hall.name ||
            hall.hall_code ||
            `Hall ${hall.id}`;

        const hallCode = hall.hall_code
            ? ` (${hall.hall_code})`
            : "";

        option.textContent = `${hallName}${hallCode}`;

        selectElement.appendChild(option);
    });
}


/* =========================================================
   LOAD INVIGILATORS
   GET /api/exams/invigilators
========================================================= */

async function loadInvigilators() {
    const select = document.getElementById("invigilator_id");

    if (!select) {
        console.error(
            'Invigilator dropdown not found. Check for id="invigilator_id" in exams.html.'
        );
        return;
    }

    select.innerHTML = `
        <option value="">Loading Invigilators...</option>
    `;

    try {
        const result = await apiRequest("/exams/invigilators");

        let list = [];

        if (Array.isArray(result)) {
            list = result;
        } else if (Array.isArray(result.invigilators)) {
            list = result.invigilators;
        } else if (Array.isArray(result.data)) {
            list = result.data;
        }

        invigilators = list;

        select.innerHTML = `
            <option value="">Select Invigilator</option>
        `;

        if (invigilators.length === 0) {
            select.innerHTML = `
                <option value="">No active invigilators found</option>
            `;

            showMessage(
                "formMessage",
                "No active Invigilators found. Check the backend and database.",
                "error"
            );

            return;
        }

        invigilators.forEach(function (invigilator) {
            const option = document.createElement("option");

            option.value = invigilator.id;

            const name =
                invigilator.full_name ||
                invigilator.name ||
                `Invigilator ${invigilator.id}`;

            const email = invigilator.email
                ? ` - ${invigilator.email}`
                : "";

            option.textContent = `${name}${email}`;

            select.appendChild(option);
        });

    } catch (error) {
        console.error("Error loading invigilators:", error);

        select.innerHTML = `
            <option value="">Unable to load Invigilators</option>
        `;

        showMessage(
            "formMessage",
            error.message,
            "error"
        );
    }
}


/* =========================================================
   LOAD EXAMS
   GET /api/exams
========================================================= */

async function loadExams() {
    const tableBody = document.getElementById("examTableBody");

    if (!tableBody) return;

    tableBody.innerHTML = `
        <tr>
            <td colspan="9" class="text-center py-4">
                <span class="spinner-border spinner-border-sm me-2"></span>
                Loading examinations...
            </td>
        </tr>
    `;

    try {
        const result = await apiRequest("/exams");

        let examList = [];

        if (Array.isArray(result)) {
            examList = result;
        } else if (Array.isArray(result.exams)) {
            examList = result.exams;
        } else if (Array.isArray(result.data)) {
            examList = result.data;
        }

        exams = examList;

        renderExamTable();

    } catch (error) {
        console.error("Error loading exams:", error);

        tableBody.innerHTML = `
            <tr>
                <td colspan="9" class="text-center text-danger py-4">
                    <i class="bi bi-exclamation-triangle me-2"></i>
                    ${escapeHTML(error.message)}
                </td>
            </tr>
        `;
    }
}


/* =========================================================
   RENDER EXAM TABLE
========================================================= */

function renderExamTable() {
    const tableBody = document.getElementById("examTableBody");

    if (!tableBody) return;

    if (exams.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="9" class="text-center text-muted py-4">
                    <i class="bi bi-calendar-x me-2"></i>
                    No examinations found.
                </td>
            </tr>
        `;

        return;
    }

    tableBody.innerHTML = exams.map(function (exam) {
        const examId = Number(exam.id);

        const title = exam.title || "Untitled Examination";
        const subject = exam.subject || "—";

        const examDate = formatDate(exam.exam_date);

        const startTime = formatTime(
            exam.start_at || exam.start_time
        );

        const endTime = formatTime(
            exam.end_at || exam.end_time
        );

        const hallName = getHallName(exam);

        const status = exam.status || "SCHEDULED";

        const statusClass = getStatusClass(status);

        return `
            <tr>
                <td>${examId}</td>

                <td>
                    <div class="fw-semibold">
                        ${escapeHTML(title)}
                    </div>
                </td>

                <td>${escapeHTML(subject)}</td>

                <td>${escapeHTML(examDate)}</td>

                <td>${escapeHTML(startTime)}</td>

                <td>${escapeHTML(endTime)}</td>

                <td>${escapeHTML(hallName)}</td>

                <td>
                    <span class="badge ${statusClass} exam-status-badge">
                        ${escapeHTML(status)}
                    </span>
                </td>

                <td>
                    <div class="d-flex gap-2">
                        <button
                            type="button"
                            class="btn btn-sm btn-outline-primary"
                            data-action="reschedule"
                            data-id="${examId}"
                            title="Reschedule examination"
                        >
                            <i class="bi bi-calendar-event"></i>
                        </button>

                        <button
                            type="button"
                            class="btn btn-sm btn-outline-danger"
                            data-action="delete"
                            data-id="${examId}"
                            title="Delete examination"
                        >
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join("");
}


/* =========================================================
   CREATE EXAM
   POST /api/exams

   HTML uses:
   exam_date  -> date input
   start_at   -> time input
   end_at     -> time input

   Backend receives ISO datetime strings.
========================================================= */

async function handleCreateExam(event) {
    event.preventDefault();

    const form = document.getElementById("examForm");
    const submitButton = document.getElementById("submitExam");

    if (!form) return;

    const title = getValue("title");
    const subject = getValue("subject");
    const examDate = getValue("exam_date");
    const startTime = getValue("start_at");
    const endTime = getValue("end_at");
    const hallId = getValue("hall_id");
    const invigilatorId = getValue("invigilator_id");

    if (
        !title ||
        !subject ||
        !examDate ||
        !startTime ||
        !endTime ||
        !hallId ||
        !invigilatorId
    ) {
        showMessage(
            "formMessage",
            "Please fill in all fields, including the Invigilator.",
            "error"
        );

        return;
    }

    const startDateTime = combineDateAndTime(examDate, startTime);
    const endDateTime = combineDateAndTime(examDate, endTime);

    if (new Date(endDateTime) <= new Date(startDateTime)) {
        showMessage(
            "formMessage",
            "The end time must be later than the start time.",
            "error"
        );

        return;
    }

    const payload = {
        title: title,
        subject: subject,
        exam_date: examDate,
        start_at: startDateTime,
        end_at: endDateTime,
        hall_id: Number(hallId),
        invigilator_id: Number(invigilatorId)
    };

    setButtonLoading(submitButton, true, "Creating...");

    try {
        const result = await apiRequest("/exams", {
            method: "POST",
            body: JSON.stringify(payload)
        });

        showMessage(
            "formMessage",
            result.message || "Examination created and Invigilator assigned successfully.",
            "success"
        );

        form.reset();

        await loadExams();

    } catch (error) {
        console.error("Error creating exam:", error);

        showMessage(
            "formMessage",
            error.message,
            "error"
        );
    } finally {
        setButtonLoading(submitButton, false);
    }
}


/* =========================================================
   TABLE ACTIONS
========================================================= */

async function handleExamTableClick(event) {
    const button = event.target.closest("button[data-action]");

    if (!button) return;

    const action = button.dataset.action;
    const examId = Number(button.dataset.id);

    if (!examId) return;

    if (action === "reschedule") {
        openRescheduleModal(examId);
    }

    if (action === "delete") {
        await deleteExam(examId, button);
    }
}


/* =========================================================
   OPEN RESCHEDULE MODAL
========================================================= */

function openRescheduleModal(examId) {
    const exam = exams.find(function (item) {
        return Number(item.id) === examId;
    });

    if (!exam) {
        showMessage(
            "formMessage",
            "Examination not found.",
            "error"
        );

        return;
    }

    setValue("reschedule_exam_id", exam.id);

    const titleElement = document.getElementById("rescheduleExamTitle");
    const idElement = document.getElementById("rescheduleExamId");

    if (titleElement) {
        titleElement.textContent = exam.title || "Examination";
    }

    if (idElement) {
        idElement.textContent = exam.id;
    }

    setValue(
        "reschedule_exam_date",
        normalizeDate(exam.exam_date)
    );

    setValue(
        "reschedule_start_at",
        normalizeTimeInput(exam.start_at || exam.start_time)
    );

    setValue(
        "reschedule_end_at",
        normalizeTimeInput(exam.end_at || exam.end_time)
    );

    setValue(
        "reschedule_hall_id",
        exam.hall_id || ""
    );

    showMessage("rescheduleMessage", "", "success");

    if (rescheduleModalInstance) {
        rescheduleModalInstance.show();
    } else {
        const modalElement = document.getElementById("rescheduleModal");

        if (modalElement && window.bootstrap) {
            rescheduleModalInstance =
                new bootstrap.Modal(modalElement);

            rescheduleModalInstance.show();
        } else {
            console.error("Bootstrap modal is unavailable.");
        }
    }
}


/* =========================================================
   RESCHEDULE EXAM
   PUT /api/exams/<id>
========================================================= */

async function handleRescheduleExam(event) {
    event.preventDefault();

    const examId = Number(getValue("reschedule_exam_id"));

    const examDate = getValue("reschedule_exam_date");
    const startTime = getValue("reschedule_start_at");
    const endTime = getValue("reschedule_end_at");
    const hallId = getValue("reschedule_hall_id");

    const saveButton = document.getElementById("saveReschedule");

    if (
        !examId ||
        !examDate ||
        !startTime ||
        !endTime ||
        !hallId
    ) {
        showMessage(
            "rescheduleMessage",
            "Please fill in all rescheduling fields.",
            "error"
        );

        return;
    }

    const startDateTime = combineDateAndTime(examDate, startTime);
    const endDateTime = combineDateAndTime(examDate, endTime);

    if (new Date(endDateTime) <= new Date(startDateTime)) {
        showMessage(
            "rescheduleMessage",
            "The end time must be later than the start time.",
            "error"
        );

        return;
    }

    const payload = {
        exam_date: examDate,
        start_at: startDateTime,
        end_at: endDateTime,
        hall_id: Number(hallId)
    };

    setButtonLoading(saveButton, true, "Saving...");

    try {
        const result = await apiRequest(`/exams/${examId}`, {
            method: "PUT",
            body: JSON.stringify(payload)
        });

        showMessage(
            "rescheduleMessage",
            result.message || "Examination rescheduled successfully.",
            "success"
        );

        await loadExams();

        setTimeout(function () {
            if (rescheduleModalInstance) {
                rescheduleModalInstance.hide();
            }
        }, 700);

    } catch (error) {
        console.error("Error rescheduling exam:", error);

        showMessage(
            "rescheduleMessage",
            error.message,
            "error"
        );
    } finally {
        setButtonLoading(saveButton, false);
    }
}


/* =========================================================
   DELETE EXAM
   DELETE /api/exams/<id>
========================================================= */

async function deleteExam(examId, button) {
    const exam = exams.find(function (item) {
        return Number(item.id) === examId;
    });

    const examTitle = exam
        ? exam.title
        : `Examination #${examId}`;

    const confirmed = window.confirm(
        `Are you sure you want to delete "${examTitle}"?\n\nThis action cannot be undone.`
    );

    if (!confirmed) return;

    setButtonLoading(button, true, "...");

    try {
        const result = await apiRequest(`/exams/${examId}`, {
            method: "DELETE"
        });

        await loadExams();

        showMessage(
            "formMessage",
            result.message || "Examination deleted successfully.",
            "success"
        );

    } catch (error) {
        console.error("Error deleting exam:", error);

        showMessage(
            "formMessage",
            error.message,
            "error"
        );

        setButtonLoading(button, false);
    }
}


/* =========================================================
   HELPER: FIND HALL NAME
========================================================= */

function getHallName(exam) {
    if (exam.hall_name) {
        return exam.hall_name;
    }

    if (exam.hall && typeof exam.hall === "object") {
        return (
            exam.hall.hall_name ||
            exam.hall.name ||
            exam.hall.hall_code ||
            "—"
        );
    }

    const hall = halls.find(function (item) {
        return Number(item.id) === Number(exam.hall_id);
    });

    if (hall) {
        return (
            hall.hall_name ||
            hall.name ||
            hall.hall_code ||
            `Hall ${hall.id}`
        );
    }

    return exam.hall_id
        ? `Hall ${exam.hall_id}`
        : "—";
}


/* =========================================================
   HELPER: STATUS BADGE
========================================================= */

function getStatusClass(status) {
    const normalizedStatus = String(status).toUpperCase();

    switch (normalizedStatus) {
        case "SCHEDULED":
            return "bg-primary";

        case "ONGOING":
        case "IN_PROGRESS":
            return "bg-success";

        case "COMPLETED":
            return "bg-secondary";

        case "CANCELLED":
            return "bg-danger";

        default:
            return "bg-warning text-dark";
    }
}


/* =========================================================
   HELPER: DATE AND TIME
========================================================= */

function combineDateAndTime(date, time) {
    // Send a local date/time string without a timezone suffix.
    // This avoids unintentionally shifting the exam time.
    const normalizedTime = normalizeTimeInput(time);

    return `${date}T${normalizedTime}:00`;
}


function normalizeDate(value) {
    if (!value) return "";

    if (typeof value === "string") {
        return value.substring(0, 10);
    }

    return "";
}


function formatDate(value) {
    const normalized = normalizeDate(value);

    if (!normalized) return "—";

    const parts = normalized.split("-");

    if (parts.length !== 3) return normalized;

    return `${parts[2]}/${parts[1]}/${parts[0]}`;
}


function normalizeTimeInput(value) {
    if (!value) return "";

    // Handles "10:30", "10:30:00", and ISO datetime strings.
    const match = String(value).match(/T?(\d{2}):(\d{2})/);

    if (match) {
        return `${match[1]}:${match[2]}`;
    }

    return "";
}


function formatTime(value) {
    const time = normalizeTimeInput(value);

    if (!time) return "—";

    const parts = time.split(":");
    const hours = Number(parts[0]);
    const minutes = parts[1];

    const period = hours >= 12 ? "PM" : "AM";
    const displayHours = hours % 12 || 12;

    return `${displayHours}:${minutes} ${period}`;
}


/* =========================================================
   HELPER: FORM VALUES
========================================================= */

function getValue(elementId) {
    const element = document.getElementById(elementId);

    return element
        ? element.value.trim()
        : "";
}


function setValue(elementId, value) {
    const element = document.getElementById(elementId);

    if (element) {
        element.value = value == null ? "" : value;
    }
}


function setSelectMessage(selectElement, message) {
    if (!selectElement) return;

    selectElement.innerHTML = "";

    const option = document.createElement("option");
    option.value = "";
    option.textContent = message;

    selectElement.appendChild(option);
}


/* =========================================================
   HELPER: SUCCESS / ERROR MESSAGES
========================================================= */

function showMessage(elementId, message, type = "success") {
    const element = document.getElementById(elementId);

    if (!element) {
        if (message) {
            console.log(message);
        }

        return;
    }

    element.textContent = message;
    element.classList.remove(
        "d-none",
        "alert-success",
        "alert-danger",
        "alert-warning"
    );

    if (!message) {
        element.classList.add("d-none");
        return;
    }

    if (type === "error") {
        element.classList.add("alert-danger");
    } else if (type === "warning") {
        element.classList.add("alert-warning");
    } else {
        element.classList.add("alert-success");
    }

    // Hide the message automatically after a few seconds.
    if (element._messageTimer) {
        clearTimeout(element._messageTimer);
    }

    element._messageTimer = setTimeout(function () {
        element.classList.add("d-none");
    }, 6000);
}


/* =========================================================
   HELPER: BUTTON LOADING STATE
========================================================= */

function setButtonLoading(button, loading, loadingText = "Loading...") {
    if (!button) return;

    if (loading) {
        if (!button.dataset.originalHtml) {
            button.dataset.originalHtml = button.innerHTML;
        }

        button.disabled = true;

        button.innerHTML = `
            <span class="spinner-border spinner-border-sm me-1"
                  role="status"
                  aria-hidden="true"></span>
            ${escapeHTML(loadingText)}
        `;
    } else {
        button.disabled = false;

        if (button.dataset.originalHtml) {
            button.innerHTML = button.dataset.originalHtml;
            delete button.dataset.originalHtml;
        }
    }
}


/* =========================================================
   HELPER: HTML ESCAPING
========================================================= */

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, function (character) {
        const replacements = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        };

        return replacements[character];
    });
}