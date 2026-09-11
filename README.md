# Random Access Memories

Random Access Memories is an intentionally unreliable, browser-only memory assistant made for TinkerHub Useless Projects. It keeps notes, reminders, and task lists—then applies deterministic entropy so none of them become too comfortable.

## Features

- Create reminders whose notification-success probability begins at 0%. Repeating a reminder raises its probability toward, but never above, 100%.
- Create unlimited priority notes. Lower-priority notes have a greater daily chance of fading away.
- Forgotten notes are regenerated as partial new recollections, not simply removed.
- Opening a note lowers its future forgetting probability.
- Two or more notes with the same topic create a permanent related-memory archive.
- Create lists and tasks. On each simulated day, lists or their tasks have an approximately 50% chance of being forgotten.
- After three simulated days without a visit, the application forgets everything.
- Data persists only in browser `localStorage`; there is no account, backend, or dependency.

## Run locally

Open `index.html` in a modern browser, or serve this folder with a static server:

```sh
python3 -m http.server 8000
```

Visit `http://localhost:8000`.

## Simulated time

Use the `+1 day`, `+3 days`, and `+7 days` controls in the header. They move the saved simulated clock forward and immediately apply forgetting checks. Probability outcomes are deterministic: the same item on the same simulated day gets the same result, making the behaviour repeatable for testing while retaining its probabilistic presentation.

The app records a visit during normal interaction. Advancing at least three days without one triggers the inactivity reset, which is intentional and testable.

## Known limitations

- Reminder delivery is an in-app simulation; no browser or system notification permission is requested.
- Location-based forgetting is not in this first version because it requires geolocation permission and adds unnecessary complexity.
- Storage is per-browser and can be cleared with site data.
- There is no synchronization, authentication, backend, or export function.

Made with questionable recall at TinkerHub Useless Projects.
