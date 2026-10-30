# Bear Buddy Planner

A cosy planner for planning your day and week, with a bear, panda or cat buddy whose mood follows your progress.

- **Plans your week for you**: after choosing a buddy, it asks about grade, school times, extra lessons, hobbies, study and hobby time (with suggestions), dinner and bedtime, then builds a repeating weekly plan. Run it again any time from the Buddy tab.
- **Choose a buddy**: Biscuit the bear, Mochi the panda or Mallow the cat, in 5 colours each.
- **Today**: tick off tasks. The buddy waits, gets happy, dances with a mic when everything is done (with confetti), and gets sad in the evening if nothing is done yet.
- **Week**: see each day, add tasks to any day, and track study, hobby, routine and self-care totals.
- **Buddy**: streak, last 7 days chart, colour, and a closet of outfits that unlock with streaks: pink bow (free), party dress (3 days), green dino suit (5 days), pink dino suit (7 days).
- **Ask**: a planning helper. It works offline with built-in plans, or with free Google Gemini AI once the AI worker is set up.
- **Focus timer**: a full-screen Pomodoro timer (25 min focus, 5 and 15 min breaks) with the buddy reading on a cosy couch, and rain, lo-fi or YouTube lo-fi sounds.
- **Tutorial**: the chosen buddy shows you around the first time (and again from the Buddy tab).
- Reminders 15 minutes before a task, cosy click sounds, and optional lo-fi background music (both can be turned off).
- **Settings** (gear icon): light, dark or same-as-phone theme, sounds, reminders, install button, account, and **Tell us about the app** (Idea, Uncomfortable, Error).
- **Accounts**: sign in with a nickname and password to use the same plan on a phone and an iPad.
- Works offline, on iPhone, iPad and Android, and can be added to the home screen.

Without an account, data is saved on each device in the browser, so every sister has her own plan.

## Put it online with GitHub Pages (free)

1. Create an empty repository on GitHub, for example `bear-buddy`.
2. Upload every file in this folder to it (or let Claude push them).
3. In the repository go to **Settings → Pages**, set **Source** to "Deploy from a branch", pick `main` and `/ (root)`, and save.
4. After a minute the app is live at `https://<your-username>.github.io/bear-buddy/`.
5. On iPhone: open the link in Safari, tap Share → **Add to Home Screen**. On Android: Chrome menu → **Add to Home screen**.

## Turn on sign-in and the AI helper (free, optional)

One small free Cloudflare Worker does both: it keeps everyone's plans for syncing between devices, and it holds the AI key (the key must never go in the website, because anyone could copy it).

1. Make a free account at https://dash.cloudflare.com.
2. **Storage for accounts:** go to **Storage & Databases → KV → Create**, and name it `bear-buddy`.
3. **The Worker:** go to **Workers & Pages → Create → Worker**, and replace its code with `ai-worker/worker.js`. Deploy.
4. In the Worker's **Settings → Bindings → Add → KV namespace**, set the variable name to `BUDDY_KV` and pick `bear-buddy`.
5. In the Worker's **Settings → Variables and Secrets** add:
   - `ALLOWED_ORIGIN`: `https://<your-username>.github.io` so only your app can use it.
   - `GEMINI_API_KEY` (type **Secret**, optional, for the AI helper): a free key from https://aistudio.google.com/apikey.
   - `MODEL` (optional): defaults to `gemini-2.5-flash`.
   - `GITHUB_REPO`: `<your-username>/assistant-buddy`, and `GITHUB_TOKEN` (type **Secret**): a fine-grained GitHub token for only this repository with **Issues: Read and write** (GitHub → Settings → Developer settings → Fine-grained tokens). Feedback from the app then arrives as issues labelled `idea`, `uncomfortable` or `error`. Without these, feedback is kept in the KV storage instead.
6. Copy the Worker's address (like `https://bear-buddy.<name>.workers.dev`) into `config.js` as `server`, and upload the change.

Then a **Use me on all your devices** card appears on the Buddy tab, and "I already have an account" on the first screen. Make an account on one device and sign in with the same nickname and password on the others. Changes sync within a few seconds while online, and the newest change wins. Passwords are stored hashed (never in plain text).

Without `GEMINI_API_KEY`, or if the AI is unreachable, the buddy uses its built-in plans automatically.

## Notes

- **Samsung and other Android phones:** open the link in Chrome or Samsung Internet. Settings shows an **Install app** button (or use the browser menu → Add to Home screen). Reminders work without installing.
- **iPhone and iPad:** open the link in Safari and use Share → Add to Home Screen. That makes it a full-screen app, and iOS only allows notifications from Home Screen apps. The YouTube lo-fi player needs one tap on its play button on iPhone.

- Reminders show while the app is open or in a recent tab. Reminders for a fully closed app would need a push server, which can be added later.
- The buddy characters are fan-art in the style of Bubu and Dudu for family use. Keep the link among family.
