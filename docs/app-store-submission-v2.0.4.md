# App Store Submission — PureType v2.0.4

Bundle ID: `app.puretype` · Marketing version: `2.0.4`

Copy each field into App Store Connect. Items marked **TODO** need a decision or a live URL before submitting.

---

## 1. App Name

```
PureType
```

## 2. Category

- Primary: **Productivity**
- Secondary: **Utilities**

## 3. Age Rating

**4+** — no objectionable content.

## 4. Subtitle (≤30)

```
Minimal tasks. Just type.
```

## 5. Promotional Text (≤170)

```
New: add tasks by voice and let AI pull out dates and projects as you type. A calmer way to plan your day — type a line, press enter, done.
```

## 6. Description (≤4000)

```
PureType is a calm, fast place for what's next. Type a task, press enter, and it's saved — no menus, no setup, no clutter.

Tasks sort themselves into Today, This Week, and Later, and roll forward when a day passes so nothing quietly slips through. Cross something off and it stays put for the satisfaction, then archives on its own once the day turns over.

— WHAT'S INSIDE —

• Type-first capture. One line, press enter. That's the whole flow.
• Today / This Week / Later buckets with automatic roll-over to Overdue.
• Projects. Group tasks, filter to one project, drag to reorder.
• @-mentions for projects, times, durations, places, and links — rendered as clean inline chips.
• Voice capture (iPhone). Hold the mic and speak; PureType adds and updates tasks for you.
• AI parsing (iPhone). Type naturally — "call mom tomorrow, work project" — and dates and projects are detected and applied.
• Archive that organizes finished work by day.
• Light and dark themes.
• Offline-first. Everything works without a connection and syncs when you're back.
• Optional sign-in (Apple or Google) to keep tasks safe across devices.

— PURETYPE PRO —

Voice capture and AI parsing are part of PureType Pro: a monthly or yearly auto-renewable subscription with a 7-day free trial. Everything else is free, forever. Manage or cancel anytime in your App Store account settings.

— WHO IT'S FOR —

People who want a to-do app that gets out of the way. If you've bounced off heavier planners and just want to type what's next and move on, PureType is built for you.

Your tasks are yours. PureType doesn't show ads and doesn't sell your data.
```

## 7. Keywords (≤100, comma-separated, no spaces)

```
todo,task,to-do,list,planner,productivity,reminders,voice,ai,minimal,focus,today,checklist,gtd
```

## 8. Support URL

```
https://puretype.app/support
```

## 9. Marketing URL

```
https://puretype.app
```

## 10. Privacy Policy URL

```
https://puretype.app/privacy
```

## 11. Copyright

```
© 2026 PureType
```

## 12. App Review — sign-in info + reviewer notes

**Sign-in:** Not required. The app opens straight into a usable, anonymous task list. Sign in with Apple or Google is **optional** and only enables cross-device sync — reviewers are not blocked by it.

**Reviewer notes:**

```
PureType opens with no login. To test core functionality:
1. Launch the app — you'll see an empty list with a quick intro overlay; tap "Get started".
2. Type "Buy milk tomorrow" in the bottom field and press return — a task is created.
3. Type a second task; tap a task to edit it; swipe/long-press for the context menu.
4. Tap "+ New project" in the top bar to create a project; tasks can be grouped under it.
5. Open Settings (top-right gear) to see theme, default-bucket, account, and account deletion.

Sign-in (Apple/Google) is optional and only syncs tasks across devices.

Microphone: used ONLY when the user presses and holds the mic button in the
composer to dictate a task. No background or automatic recording.
```

**Auto-renewable subscription (PureType Pro) — TODO before submitting IAP:**

> This v2.0.4 build ships the features but does **not** yet expose the paywall (the native StoreKit plugin is added in a follow-up build — see `apps/frontend/ios/IAP_SETUP.md`). **Do not submit the subscription for review with this build** — the reviewer can't reach a purchase screen, which causes rejection.
>
> When submitting the build that wires StoreKit, add these notes:
> ```
> PureType Pro unlocks voice capture and AI task parsing.
> To reach the purchase: Settings (top-right) → "Upgrade to Pro" → choose Monthly or Yearly (7-day free trial).
> A Sandbox tester account is required to complete a purchase in review.
> ```
> Provide the Sandbox account under App Store Connect → App Review (not in this doc).

## 13. Privacy Nutrition Labels

| Data Type | Purpose | Linked to user | Used for tracking |
|---|---|---|---|
| Email address | App Functionality (account, sync) | Yes | No |
| User ID | App Functionality (sync, auth) | Yes | No |
| User Content (tasks, projects) | App Functionality | Yes | No |
| Product Interaction | Analytics | Yes | No |
| Audio Data (voice) | App Functionality | Not stored* | No |

\* Voice audio is sent to the transcription/AI provider to turn speech into a task, then discarded — not retained or linked. Disclose in the listing that voice and typed-task text are processed by a third-party AI provider (Google Gemini via Vercel AI Gateway) to power voice and AI parsing.

## 14. Pre-submission checklist

- [ ] Listing URLs resolve: `puretype.app`, `/support`, `/privacy`, `/terms` (**verify live**)
- [x] Sign in with Apple present alongside Google sign-in
- [x] Account deletion path in-app (Settings → Delete account, signed-in users)
- [x] Anonymous first-run flow works on a clean device
- [x] Export compliance set: `ITSAppUsesNonExemptEncryption = false`
- [x] Microphone usage string present and accurate (`NSMicrophoneUsageDescription`)
- [x] Portrait-only orientation (no broken landscape)
- [ ] Screenshots captured (6.7" + 6.5" + iPad if offered) — use `/appstore-prep`
- [ ] IAP: only submit the subscription with a build where the paywall is reachable (see §12)
- [ ] Disclose third-party AI processing (Gemini) in the privacy section / review notes

---

### Character counts

| Field | Length | Limit | Status |
|---|---|---|---|
| Name | 8 | 30 | ✅ |
| Subtitle | 25 | 30 | ✅ |
| Promotional Text | 138 | 170 | ✅ |
| Description | ~1750 | 4000 | ✅ |
| Keywords | 94 | 100 | ✅ |
