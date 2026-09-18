# 🎱 Magic Eight Ball

A playful, kid-friendly Magic Eight Ball web app that also teaches basic programming logic.

Built for iPad Safari and designed to be added to the Home Screen as a PWA.

## What it teaches

The expandable **Magic Lab** introduces:

- **Lists / arrays** with real zero-based indexes like `Answer[0]`
- **Random numbers** with an automatically matched range
- One editable **IF → THEN → ELSE** rule
- Comparisons: **less than**, **greater than**, and **equal to**
- How changing a number changes program behavior
- Animation timing in seconds

No JavaScript code is shown to the child. The concepts are presented as simple pseudo-code using buttons, dropdowns, and numbers.

## Features

- 🎱 Animated Magic Eight Ball with liquid-style motion
- 🔷 Floating 3D-looking answer polyhedron
- 📱 iPad shake-to-answer using Device Motion
- 🎲 Temporary **ASK (testing)** button for desktop/testing
- 🔊 Sound effects with mute toggle
- ✏️ Editable custom answer list
- ✅ YES / 🤔 MAYBE / ❌ NO answer groups
- 💾 Settings automatically saved on the device
- ↺ Reset to defaults
- 💡 Kid-friendly hint bubbles
- 📲 Installable to the iPad Home Screen
- 📴 Offline caching after the first successful load

## Use it on iPad

Once GitHub Pages finishes deploying:

1. Open the GitHub Pages URL in **Safari** on the iPad.
2. Tap **Enable Shake** once.
3. Allow motion access if Safari asks.
4. Tap Safari's **Share** button.
5. Choose **Add to Home Screen**.
6. Open **Magic Eight Ball** from the Home Screen.

> Shake access requires HTTPS. GitHub Pages supplies HTTPS automatically, so no local certificates are needed.

## Local testing on Windows

The app is plain HTML/CSS/JavaScript, so no build step is required.

If Python is installed:

```powershell
cd path\to\magic-eight-ball
py -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

The **ASK (testing)** button works locally. iPad shake support should be tested on the HTTPS GitHub Pages version.

## Answer logic

The app generates one random number from `0` through `answers.length - 1`.

Example rule:

```text
IF random number is less than 4
THEN choose from YES answers
ELSE choose from all remaining answers
```

The Magic Lab shows the exact random number, rule result, and selected `Answer[index]` after each turn.

## Project structure

```text
index.html                  Main app interface
styles.css                  Visual design + animations
app.js                      Magic 8 Ball logic + learning controls
manifest.webmanifest        Home Screen / PWA settings
service-worker.js           Offline caching
assets/                     App icons
.github/workflows/pages.yml GitHub Pages deployment
```

## Turning off the temporary ASK button later

When shake testing is complete, the temporary button can be removed from `index.html` without changing the shake logic.
