# Phase 2 manual verification checklist

Run this against the real Phase 1 backend (`cd backend && docker compose up -d
&& npm run dev`, or whatever's running) with `EXPO_PUBLIC_API_URL` pointed at
it, on both a native build (`npx expo run:android`) and the web build
(`npx expo start --web`).

1. Register a new account. Confirm the generic "check your inbox" message
   appears (not a specific success/failure signal).
2. Find the verification email (or the token in the backend's logs/dev email
   provider) and open the `verify-email` link. Confirm it shows success.
3. Log in with the new account. Confirm you land on the task list.
4. Create a task with a due date and a recurrence. Confirm it appears in the
   right filter tab (Today/Upcoming).
5. Toggle it complete, then undo the toggle (tap again same day). Confirm the
   recurrence rollover matches the mobile app's existing behavior.
6. Edit the task: clear its due date (pick "None") and turn off "Repeat".
   Save, then reopen the editor — confirm both are actually cleared, not
   silently unchanged.
7. Delete a task. Confirm it disappears from the list.
8. Log out. Confirm you're redirected to `/login` and the task list is gone
   if you log back in as a **different** account (no leaked data from the
   first account).
9. On Android: confirm the home-screen widget shows today's tasks, and
   tapping a task in the widget toggles it (check it reflects in the app
   after reopening).
10. Log in with an unverified account. Confirm the login screen offers
    "Resend verification email" and it actually sends one.
11. Use "Forgot password", get the reset email, open the `reset-password`
    link, set a new password. Confirm the old password no longer works and
    the new one does, and that you were logged out of any other open
    session (per the backend's session-revocation-on-reset behavior).
12. Open `verify-email` or `reset-password` with no token / a garbage token
    in the URL. Confirm a clear error message, not a crash or infinite
    spinner.
