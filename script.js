"use strict";

/*
    Random Access Memories
    Dependency-free memory simulation.

    Features:
    - Real-time reminders while the page is open.
    - Browser notifications with in-app fallback.
    - Reminder states: Upcoming, Due now, Triggered, Completed, Overdue.
    - Notes gradually lose detail.
    - Higher-priority notes fade more slowly.
    - Opening a note strengthens it.
    - Lists/tasks forget approximately half their items.
    - Three simulated days without visiting clears everything.
    - Demo time is independent from real time.
*/

const STORAGE_KEY = "random-access-memories-v5";

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

const REGRET_DELAY = 2 * HOUR;
const NOTE_FORGET_INTERVAL = DAY;
const TASK_FORGET_INTERVAL = DAY;
const INACTIVITY_LIMIT = 3 * DAY;

let state = {
    demoMode: true,
    demoTime: Date.now(),
    lastVisit: Date.now(),

    reminders: [],
    notes: [],
    lists: [],
    eventLog: []
};

const elements = {
    memoryStatus: document.getElementById("memory-status"),
    simulatedDate: document.getElementById("simulated-date"),

    advanceDay: document.getElementById("advance-day"),
    advanceWeek: document.getElementById("advance-week"),
    forceForgetting: document.getElementById("force-forgetting"),
    resetApp: document.getElementById("reset-app"),

    reminderForm: document.getElementById("reminder-form"),
    reminderText: document.getElementById("reminder-text"),
    reminderTime: document.getElementById("reminder-time"),
    remindersContainer: document.getElementById("reminders-container"),

    noteForm: document.getElementById("note-form"),
    noteTitle: document.getElementById("note-title"),
    noteTopic: document.getElementById("note-topic"),
    noteContent: document.getElementById("note-content"),
    notePriority: document.getElementById("note-priority"),
    notesContainer: document.getElementById("notes-container"),

    listForm: document.getElementById("list-form"),
    listTitle: document.getElementById("list-title"),
    listPriority: document.getElementById("list-priority"),
    listsContainer: document.getElementById("lists-container"),

    eventLog: document.getElementById("event-log")
};

/* --------------------------------------------------
   Utility functions
-------------------------------------------------- */

function now() {
    return state.demoMode ? state.demoTime : Date.now();
}

function createId() {
    if (
        window.crypto &&
        typeof window.crypto.randomUUID === "function"
    ) {
        return window.crypto.randomUUID();
    }

    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function formatDate(timestamp) {
    return new Date(timestamp).toLocaleString();
}

function formatRelativeTime(timestamp) {
    const difference = timestamp - now();

    if (difference <= 0) {
        return "now";
    }

    const minutes = Math.ceil(difference / MINUTE);

    if (minutes < 60) {
        return `in ${minutes} minute${minutes === 1 ? "" : "s"}`;
    }

    const hours = Math.ceil(minutes / 60);

    if (hours < 24) {
        return `in ${hours} hour${hours === 1 ? "" : "s"}`;
    }

    const days = Math.ceil(hours / 24);

    return `in ${days} day${days === 1 ? "" : "s"}`;
}

function formatDuration(milliseconds) {
    const days = Math.floor(milliseconds / DAY);
    const hours = Math.floor((milliseconds % DAY) / HOUR);
    const minutes = Math.floor((milliseconds % HOUR) / MINUTE);

    const parts = [];

    if (days > 0) {
        parts.push(`${days} day${days === 1 ? "" : "s"}`);
    }

    if (hours > 0) {
        parts.push(`${hours} hour${hours === 1 ? "" : "s"}`);
    }

    if (minutes > 0) {
        parts.push(`${minutes} minute${minutes === 1 ? "" : "s"}`);
    }

    return parts.length > 0
        ? parts.join(", ")
        : "less than a minute";
}

function logEvent(message) {
    state.eventLog.unshift({
        id: createId(),
        timestamp: now(),
        message
    });

    state.eventLog = state.eventLog.slice(0, 100);
}

function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadState() {
    const savedState = localStorage.getItem(STORAGE_KEY);

    if (!savedState) {
        return;
    }

    try {
        const parsedState = JSON.parse(savedState);

        state = {
            ...state,
            ...parsedState,

            reminders: Array.isArray(parsedState.reminders)
                ? parsedState.reminders
                : [],

            notes: Array.isArray(parsedState.notes)
                ? parsedState.notes
                : [],

            lists: Array.isArray(parsedState.lists)
                ? parsedState.lists
                : [],

            eventLog: Array.isArray(parsedState.eventLog)
                ? parsedState.eventLog
                : []
        };

        normalizeState();
    } catch (error) {
        console.error("Could not load saved state:", error);
        localStorage.removeItem(STORAGE_KEY);
    }
}

function normalizeState() {
    state.reminders = state.reminders.map(reminder => ({
        id: reminder.id || createId(),
        text: reminder.text || "Untitled reminder",
        timestamp: Number(reminder.timestamp) || Date.now(),
        attempts: Number(reminder.attempts) || 0,
        completed: Boolean(reminder.completed),
        triggered: Boolean(reminder.triggered),
        failed: Boolean(reminder.failed),
        regretShown: Boolean(reminder.regretShown),
        createdAt: Number(reminder.createdAt) || Date.now(),
        triggeredAt: reminder.triggeredAt || null,
        completedAt: reminder.completedAt || null,
        regretAt: reminder.regretAt || null
    }));

    state.notes = state.notes.map(note => ({
        id: note.id || createId(),
        title: note.title || "Untitled note",
        topic: note.topic || "",
        originalContent: note.originalContent || "",
        currentContent: note.currentContent || note.originalContent || "",
        priority: priorityToNumber(note.priority),
        memoryStrength: Number(note.memoryStrength) || 1,
        forgettingStage: Number(note.forgettingStage) || 0,
        openCount: Number(note.openCount) || 0,
        createdAt: Number(note.createdAt) || Date.now(),
        nextForgetAt: Number(note.nextForgetAt) || Date.now() + DAY
    }));

    state.lists = state.lists.map(list => ({
        id: list.id || createId(),
        title: list.title || "Untitled list",
        priority: priorityToNumber(list.priority),
        createdAt: Number(list.createdAt) || Date.now(),
        items: Array.isArray(list.items)
            ? list.items.map(task => ({
                id: task.id || createId(),
                text: task.text || "",
                completed: Boolean(task.completed),
                createdAt: Number(task.createdAt) || Date.now(),
                lastChecked: Number(task.lastChecked) || Date.now()
            }))
            : []
    }));
}

function priorityToNumber(priority) {
    if (typeof priority === "number") {
        return Math.min(3, Math.max(1, priority));
    }

    switch (String(priority).toLowerCase()) {
        case "high":
            return 3;

        case "medium":
            return 2;

        case "low":
            return 1;

        default:
            return 2;
    }
}

function priorityName(priority) {
    switch (priorityToNumber(priority)) {
        case 3:
            return "High";

        case 2:
            return "Medium";

        default:
            return "Low";
    }
}

/* --------------------------------------------------
   In-app notifications
-------------------------------------------------- */

function showInAppNotification(title, message) {
    let container = document.getElementById("in-app-notifications");

    if (!container) {
        container = document.createElement("div");
        container.id = "in-app-notifications";

        Object.assign(container.style, {
            position: "fixed",
            top: "1rem",
            right: "1rem",
            zIndex: "9999",
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
            maxWidth: "min(24rem, calc(100vw - 2rem))"
        });

        document.body.appendChild(container);
    }

    const notification = document.createElement("div");

    Object.assign(notification.style, {
        padding: "1rem",
        background: "var(--surface, white)",
        color: "var(--text, black)",
        border: "1px solid var(--border, #ddd)",
        borderRadius: "0.75rem",
        boxShadow: "var(--shadow, 0 8px 24px rgba(0,0,0,.15))"
    });

    notification.innerHTML = `
        <strong>${escapeHtml(title)}</strong>
        <p>${escapeHtml(message)}</p>
    `;

    container.appendChild(notification);

    setTimeout(() => {
        notification.remove();
    }, 8000);
}

async function requestNotificationPermission() {
    if (!("Notification" in window)) {
        return "unsupported";
    }

    if (Notification.permission === "granted") {
        return "granted";
    }

    if (Notification.permission === "denied") {
        return "denied";
    }

    try {
        return await Notification.requestPermission();
    } catch (error) {
        console.error("Notification permission failed:", error);
        return "denied";
    }
}

function notifyReminder(reminder) {
    const title = "Reminder";
    const message = reminder.text;

    if (
        "Notification" in window &&
        Notification.permission === "granted"
    ) {
        try {
            new Notification(title, {
                body: message,
                tag: `reminder-${reminder.id}`
            });

            return;
        } catch (error) {
            console.error("Browser notification failed:", error);
        }
    }

    showInAppNotification(title, message);
}

/* --------------------------------------------------
   Reminder system
-------------------------------------------------- */

function getReminderStatus(reminder) {
    if (reminder.completed) {
        return "Completed";
    }

    if (reminder.triggered) {
        return "Triggered";
    }

    if (now() >= reminder.timestamp) {
        return "Due now";
    }

    return "Upcoming";
}

function createReminder(text, timestamp) {
    const reminder = {
        id: createId(),
        text,
        timestamp,
        attempts: 0,
        completed: false,
        triggered: false,
        failed: false,
        regretShown: false,
        createdAt: now(),
        triggeredAt: null,
        completedAt: null,
        regretAt: null
    };

    state.reminders.push(reminder);

    logEvent(`Created reminder: "${text}"`);

    saveState();
    renderAll();
}

function processReminders() {
    let changed = false;

    for (const reminder of state.reminders) {
        if (
            !reminder.completed &&
            !reminder.triggered &&
            now() >= reminder.timestamp
        ) {
            reminder.triggered = true;
            reminder.triggeredAt = now();
            reminder.attempts += 1;

            notifyReminder(reminder);

            logEvent(`Reminder triggered: "${reminder.text}"`);

            changed = true;
        }
    }

    if (changed) {
        saveState();
        renderAll();
    }
}

function completeReminder(id) {
    const reminder = state.reminders.find(
        item => item.id === id
    );

    if (!reminder) {
        return;
    }

    reminder.completed = true;
    reminder.completedAt = now();

    logEvent(`Completed reminder: "${reminder.text}"`);

    saveState();
    renderAll();
}

function deleteReminder(id) {
    state.reminders = state.reminders.filter(
        reminder => reminder.id !== id
    );

    logEvent("Deleted a reminder.");

    saveState();
    renderAll();
}

/* --------------------------------------------------
   Note system
-------------------------------------------------- */

function getNoteForgetDelay(note) {
    const priority = priorityToNumber(note.priority);

    if (priority === 3) {
        return NOTE_FORGET_INTERVAL * 2;
    }

    if (priority === 2) {
        return NOTE_FORGET_INTERVAL * 1.5;
    }

    return NOTE_FORGET_INTERVAL;
}

function getNoteForgettingChance(note) {
    const priority = priorityToNumber(note.priority);
    const opens = Number(note.openCount) || 0;

    let chance = 0.45;

    if (priority === 3) {
        chance = 0.2;
    } else if (priority === 2) {
        chance = 0.35;
    }

    chance -= opens * 0.05;

    return Math.max(0.05, Math.min(1, chance));
}

function createWeakerMemory(note) {
    const content = note.currentContent || note.originalContent;

    const words = content
        .split(/\s+/)
        .map(word => word.trim())
        .filter(Boolean);

    if (words.length <= 4) {
        return "Something has been forgotten.";
    }

    if (note.forgettingStage === 1) {
        return `${words
            .slice(0, Math.ceil(words.length * 0.6))
            .join(" ")}...`;
    }

    if (note.forgettingStage === 2) {
        return `${words
            .slice(0, Math.ceil(words.length * 0.35))
            .join(" ")}...`;
    }

    if (note.forgettingStage === 3) {
        return "There is something hidden.";
    }

    if (note.forgettingStage >= 4) {
        return "Something has been forgotten.";
    }

    return content;
}

function createNote(title, topic, content, priority) {
    const numericPriority = priorityToNumber(priority);

    const note = {
        id: createId(),
        title,
        topic,
        originalContent: content,
        currentContent: content,
        priority: numericPriority,
        memoryStrength: 1,
        forgettingStage: 0,
        openCount: 0,
        createdAt: now(),
        nextForgetAt: now() + getNoteForgetDelay({
            priority: numericPriority
        })
    };

    state.notes.push(note);

    logEvent(`Created note: "${title}"`);

    saveState();
    renderAll();
}

function openNote(id) {
    const note = state.notes.find(item => item.id === id);

    if (!note) {
        return;
    }

    note.openCount += 1;
    note.memoryStrength = Math.min(
        1,
        note.memoryStrength + 0.15
    );

    if (note.forgettingStage > 0) {
        note.forgettingStage -= 1;
        note.currentContent = createWeakerMemory(note);
    }

    note.nextForgetAt = now() + getNoteForgetDelay(note);

    logEvent(`Opened note: "${note.title}"`);

    saveState();
    renderAll();
}

function forgetNote(note) {
    const chance = getNoteForgettingChance(note);

    if (Math.random() > chance) {
        note.nextForgetAt = now() + getNoteForgetDelay(note);
        return;
    }

    note.forgettingStage += 1;

    note.memoryStrength = Math.max(
        0,
        note.memoryStrength - 0.2
    );

    if (note.forgettingStage >= 5) {
        const message =
            `I completely forgot the note: "${note.title}"`;

        logEvent(message);
        showInAppNotification("Memory lost", message);

        state.notes = state.notes.filter(
            item => item.id !== note.id
        );

        return;
    }

    note.currentContent = createWeakerMemory(note);
    note.nextForgetAt = now() + getNoteForgetDelay(note);

    const message =
        `I forgot some details from the note: "${note.title}"`;

    logEvent(message);
    showInAppNotification("Memory fading", message);
}

function processNotes() {
    for (const note of [...state.notes]) {
        if (now() >= note.nextForgetAt) {
            forgetNote(note);
        }
    }
}

/* --------------------------------------------------
   Lists and tasks
-------------------------------------------------- */

function createList(title, priority) {
    const list = {
        id: createId(),
        title,
        priority: priorityToNumber(priority),
        createdAt: now(),
        items: []
    };

    state.lists.push(list);

    logEvent(`Created list: "${title}"`);

    saveState();
    renderAll();
}

function addTask(listId, text) {
    const list = state.lists.find(
        item => item.id === listId
    );

    if (!list || !text.trim()) {
        return;
    }

    list.items.push({
        id: createId(),
        text: text.trim(),
        completed: false,
        createdAt: now(),
        lastChecked: now()
    });

    logEvent(`Added task to "${list.title}": "${text}"`);

    saveState();
    renderAll();
}

function toggleTask(listId, taskId) {
    const list = state.lists.find(
        item => item.id === listId
    );

    if (!list) {
        return;
    }

    const task = list.items.find(
        item => item.id === taskId
    );

    if (!task) {
        return;
    }

    task.completed = !task.completed;
    task.lastChecked = now();

    logEvent(
        `${task.completed ? "Completed" : "Reopened"} task: "${task.text}"`
    );

    saveState();
    renderAll();
}

function deleteList(id) {
    state.lists = state.lists.filter(
        list => list.id !== id
    );

    logEvent("Deleted a list.");

    saveState();
    renderAll();
}

function processTasks() {
    for (const list of state.lists) {
        const remainingItems = [];

        for (const task of list.items) {
            if (
                now() - task.lastChecked <
                TASK_FORGET_INTERVAL
            ) {
                remainingItems.push(task);
                continue;
            }

            task.lastChecked = now();

            if (Math.random() < 0.5) {
                const message =
                    `I forgot the task: "${task.text}"`;

                logEvent(message);
                showInAppNotification("Task forgotten", message);
            } else {
                remainingItems.push(task);
            }
        }

        list.items = remainingItems;
    }
}

/* --------------------------------------------------
   Time simulation
-------------------------------------------------- */

function processInactivity() {
    if (now() - state.lastVisit >= INACTIVITY_LIMIT) {
        state.reminders = [];
        state.notes = [];
        state.lists = [];

        logEvent(
            "Three days passed without a visit. Everything was forgotten."
        );

        state.lastVisit = now();
    }
}

function processTime() {
    processInactivity();
    processReminders();
    processNotes();
    processTasks();

    state.lastVisit = now();

    saveState();
    renderAll();
}

function advanceTime(amount) {
    state.demoTime += amount;

    logEvent(
        `Time advanced by ${formatDuration(amount)}.`
    );

    processTime();
}

function forceForgetting() {
    for (const note of [...state.notes]) {
        forgetNote(note);
    }

    for (const list of state.lists) {
        const remainingTasks = [];

        for (const task of list.items) {
            if (Math.random() >= 0.5) {
                remainingTasks.push(task);
            } else {
                logEvent(`I forgot the task: "${task.text}"`);
            }
        }

        list.items = remainingTasks;
    }

    logEvent("Forced a forgetting cycle.");

    saveState();
    renderAll();
}

function resetApplication() {
    const confirmed = confirm(
        "Reset all memories, reminders, lists, and simulated time?"
    );

    if (!confirmed) {
        return;
    }

    localStorage.removeItem(STORAGE_KEY);

    state = {
        demoMode: true,
        demoTime: Date.now(),
        lastVisit: Date.now(),
        reminders: [],
        notes: [],
        lists: [],
        eventLog: []
    };

    logEvent("Application reset.");

    saveState();
    renderAll();
}

/* --------------------------------------------------
   Rendering
-------------------------------------------------- */

function renderStatus() {
    if (!elements.memoryStatus) {
        return;
    }

    const totalMemories =
        state.reminders.length +
        state.notes.length +
        state.lists.length;

    elements.memoryStatus.textContent =
        `${totalMemories} memory item${
            totalMemories === 1 ? "" : "s"
        } stored`;
}

function renderClock() {
    if (!elements.simulatedDate) {
        return;
    }

    elements.simulatedDate.textContent = formatDate(now());
}

function renderReminders() {
    if (!elements.remindersContainer) {
        return;
    }

    if (state.reminders.length === 0) {
        elements.remindersContainer.innerHTML =
            `<p class="empty-state">No reminders yet.</p>`;

        return;
    }

    elements.remindersContainer.innerHTML = state.reminders
        .map(reminder => {
            const status = getReminderStatus(reminder);

            return `
                <article class="memory-card reminder-card">
                    <div class="card-header">
                        <h3>${escapeHtml(reminder.text)}</h3>
                        <span class="badge">
                            ${escapeHtml(status)}
                        </span>
                    </div>

                    <p>
                        Scheduled:
                        ${escapeHtml(formatDate(reminder.timestamp))}
                    </p>

                    <p>
                        ${escapeHtml(
                            reminder.completed
                                ? "Completed"
                                : reminder.triggered
                                    ? "Notification triggered"
                                    : formatRelativeTime(
                                        reminder.timestamp
                                    )
                        )}
                    </p>

                    <div class="card-actions">
                        ${
                            !reminder.completed
                                ? `
                                    <button
                                        type="button"
                                        class="complete-reminder"
                                        data-id="${reminder.id}"
                                    >
                                        Complete
                                    </button>
                                `
                                : ""
                        }

                        <button
                            type="button"
                            class="danger delete-reminder"
                            data-id="${reminder.id}"
                        >
                            Delete
                        </button>
                    </div>
                </article>
            `;
        })
        .join("");
}

function renderNotes() {
    if (!elements.notesContainer) {
        return;
    }

    if (state.notes.length === 0) {
        elements.notesContainer.innerHTML =
            `<p class="empty-state">No notes yet.</p>`;

        return;
    }

    elements.notesContainer.innerHTML = state.notes
        .map(note => {
            return `
                <article class="memory-card note-card">
                    <div class="card-header">
                        <h3>${escapeHtml(note.title)}</h3>

                        <span class="badge">
                            ${escapeHtml(
                                priorityName(note.priority)
                            )}
                        </span>
                    </div>

                    ${
                        note.topic
                            ? `
                                <p class="topic">
                                    ${escapeHtml(note.topic)}
                                </p>
                            `
                            : ""
                    }

                    <p>
                        ${escapeHtml(note.currentContent)}
                    </p>

                    <p class="muted">
                        Memory strength:
                        ${Math.round(note.memoryStrength * 100)}%
                    </p>

                    <p class="muted">
                        Forgetting stage:
                        ${note.forgettingStage}
                    </p>

                    <button
                        type="button"
                        class="open-note"
                        data-id="${note.id}"
                    >
                        Open note
                    </button>
                </article>
            `;
        })
        .join("");
}

function renderLists() {
    if (!elements.listsContainer) {
        return;
    }

    if (state.lists.length === 0) {
        elements.listsContainer.innerHTML =
            `<p class="empty-state">No lists yet.</p>`;

        return;
    }

    elements.listsContainer.innerHTML = state.lists
        .map(list => {
            const priority = priorityName(list.priority);
            const priorityClass = priority.toLowerCase();

            const tasks = list.items.length === 0
                ? `
                    <li class="empty-task-state">
                        No tasks yet
                    </li>
                `
                : list.items
                    .map(task => {
                        return `
                            <li class="task-item">
                                <label class="task-row">
                                    <input
                                        type="checkbox"
                                        data-list-id="${list.id}"
                                        data-task-id="${task.id}"
                                        ${
                                            task.completed
                                                ? "checked"
                                                : ""
                                        }
                                    >

                                    <span class="${
                                        task.completed
                                            ? "completed"
                                            : ""
                                    }">
                                        ${escapeHtml(task.text)}
                                    </span>
                                </label>
                            </li>
                        `;
                    })
                    .join("");

            return `
                <article class="memory-card list-card task-card">
                    <div class="task-card-top">
                        <span class="priority-badge ${priorityClass}">
                            ${escapeHtml(priority)}
                        </span>

                        <div class="card-menu-wrapper">
                            <button
                                type="button"
                                class="card-menu"
                                aria-label="List options"
                                aria-expanded="false"
                            >
                                ⋮
                            </button>

                            <div
                                class="card-menu-options"
                                hidden
                            >
                                <button
                                    type="button"
                                    class="delete-list"
                                    data-id="${list.id}"
                                >
                                    Delete list
                                </button>
                            </div>
                        </div>
                    </div>

                    <h3>${escapeHtml(list.title)}</h3>

                    <ul class="task-list">
                        ${tasks}
                    </ul>

                    <form
                        class="task-form"
                        data-list-id="${list.id}"
                    >
                        <input
                            type="text"
                            name="task"
                            placeholder="Add a task"
                            autocomplete="off"
                            required
                        >

                        <button
                            type="submit"
                            aria-label="Add task"
                        >
                            +
                        </button>
                    </form>

                    <div class="task-card-footer">
                        <span class="list-icon">☷</span>
                        <span>List</span>
                    </div>
                </article>
            `;
        })
        .join("");
}

function renderEventLog() {
    if (!elements.eventLog) {
        return;
    }

    if (state.eventLog.length === 0) {
        elements.eventLog.textContent = "No events yet.";
        return;
    }

    elements.eventLog.innerHTML = state.eventLog
        .slice(0, 20)
        .map(event => {
            return `
                <div class="event-entry">
                    <time>
                        ${escapeHtml(
                            formatDate(event.timestamp)
                        )}
                    </time>

                    <span>
                        ${escapeHtml(event.message)}
                    </span>
                </div>
            `;
        })
        .join("");
}

function renderAll() {
    renderStatus();
    renderClock();
    renderReminders();
    renderNotes();
    renderLists();
    renderEventLog();
}

/* --------------------------------------------------
   Event listeners
-------------------------------------------------- */

function setupEventListeners() {
    if (elements.advanceDay) {
        elements.advanceDay.addEventListener("click", () => {
            advanceTime(DAY);
        });
    }

    if (elements.advanceWeek) {
        elements.advanceWeek.addEventListener("click", () => {
            advanceTime(WEEK);
        });
    }

    if (elements.forceForgetting) {
        elements.forceForgetting.addEventListener("click", () => {
            forceForgetting();
        });
    }

    if (elements.resetApp) {
        elements.resetApp.addEventListener("click", () => {
            resetApplication();
        });
    }

    if (elements.reminderForm) {
        elements.reminderForm.addEventListener("submit", async event => {
            event.preventDefault();

            const text = elements.reminderText.value.trim();
            const dateTime = elements.reminderTime.value;

            if (!text || !dateTime) {
                return;
            }

            const timestamp = new Date(dateTime).getTime();

            if (Number.isNaN(timestamp)) {
                alert("Please enter a valid reminder time.");
                return;
            }

            if (timestamp <= Date.now()) {
                alert("Please choose a future date and time.");
                return;
            }

            await requestNotificationPermission();

            createReminder(text, timestamp);

            elements.reminderForm.reset();
        });
    }

    if (elements.noteForm) {
        elements.noteForm.addEventListener("submit", event => {
            event.preventDefault();

            const title = elements.noteTitle.value.trim();
            const topic = elements.noteTopic.value.trim();
            const content = elements.noteContent.value.trim();
            const priority = elements.notePriority.value;

            if (!title || !content) {
                return;
            }

            createNote(
                title,
                topic,
                content,
                priority
            );

            elements.noteForm.reset();
        });
    }

    if (elements.listForm) {
        elements.listForm.addEventListener("submit", event => {
            event.preventDefault();

            const title = elements.listTitle.value.trim();
            const priority = elements.listPriority
                ? elements.listPriority.value
                : "medium";

            if (!title) {
                return;
            }

            createList(title, priority);

            elements.listForm.reset();
        });
    }

    if (elements.remindersContainer) {
        elements.remindersContainer.addEventListener(
            "click",
            event => {
                const completeButton =
                    event.target.closest(".complete-reminder");

                if (completeButton) {
                    completeReminder(completeButton.dataset.id);
                    return;
                }

                const deleteButton =
                    event.target.closest(".delete-reminder");

                if (deleteButton) {
                    deleteReminder(deleteButton.dataset.id);
                }
            }
        );
    }

    if (elements.notesContainer) {
        elements.notesContainer.addEventListener(
            "click",
            event => {
                const button =
                    event.target.closest(".open-note");

                if (!button) {
                    return;
                }

                openNote(button.dataset.id);
            }
        );
    }

    if (elements.listsContainer) {
        elements.listsContainer.addEventListener(
            "submit",
            event => {
                const form =
                    event.target.closest(".task-form");

                if (!form) {
                    return;
                }

                event.preventDefault();

                const input = form.elements.task;
                const text = input.value.trim();
                const listId = form.dataset.listId;

                if (!text) {
                    return;
                }

                addTask(listId, text);
            }
        );

        elements.listsContainer.addEventListener(
            "change",
            event => {
                const checkbox = event.target.closest(
                    'input[type="checkbox"][data-task-id]'
                );

                if (!checkbox) {
                    return;
                }

                toggleTask(
                    checkbox.dataset.listId,
                    checkbox.dataset.taskId
                );
            }
        );

        elements.listsContainer.addEventListener(
            "click",
            event => {
                const menuButton =
                    event.target.closest(".card-menu");

                if (menuButton) {
                    const wrapper =
                        menuButton.closest(".card-menu-wrapper");

                    const menu =
                        wrapper.querySelector(".card-menu-options");

                    const isOpen = !menu.hidden;

                    elements.listsContainer
                        .querySelectorAll(".card-menu-options")
                        .forEach(item => {
                            item.hidden = true;
                        });

                    elements.listsContainer
                        .querySelectorAll(".card-menu")
                        .forEach(button => {
                            button.setAttribute(
                                "aria-expanded",
                                "false"
                            );
                        });

                    menu.hidden = isOpen;

                    menuButton.setAttribute(
                        "aria-expanded",
                        String(!isOpen)
                    );

                    return;
                }

                const deleteButton =
                    event.target.closest(".delete-list");

                if (deleteButton) {
                    deleteList(deleteButton.dataset.id);
                }
            }
        );
    }

    document.addEventListener("click", event => {
        if (event.target.closest(".card-menu-wrapper")) {
            return;
        }

        document
            .querySelectorAll(".card-menu-options")
            .forEach(menu => {
                menu.hidden = true;
            });

        document
            .querySelectorAll(".card-menu")
            .forEach(button => {
                button.setAttribute(
                    "aria-expanded",
                    "false"
                );
            });
    });
}

/* --------------------------------------------------
   Startup
-------------------------------------------------- */

function initialize() {
    loadState();

    processInactivity();
    processReminders();
    processNotes();
    processTasks();

    state.lastVisit = now();

    setupEventListeners();
    renderAll();
    saveState();

    /*
        Real-time processing while the page is open.
        This checks reminders every second.
    */
    setInterval(() => {
        processReminders();
        renderReminders();
        renderClock();
    }, SECOND);

    /*
        Other memory systems are processed once per minute.
    */
    setInterval(() => {
        processTime();
    }, MINUTE);
}

if (document.readyState === "loading") {
    document.addEventListener(
        "DOMContentLoaded",
        initialize
    );
} else {
    initialize();
}