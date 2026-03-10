# 🕌 Salat — Prayer Times & Qibla Web App

A production-ready **React PWA** for prayer times, monthly calendar, and Qibla finder. Designed as a mobile-first web app that works perfectly in the browser — deploy it to GitHub Pages in minutes.

---

## ✨ Features

- 🕐 **Live prayer times** fetched from the AlAdhan API
- ⏱ **Countdown timer** (hh:mm:ss) to the next prayer
- 📅 **Monthly calendar** with full prayer times per day
- 🧭 **Qibla finder** using AlAdhan Qibla API + device compass (DeviceOrientationEvent)
- 🌙 **Dark / Light / System** theme toggle
- 📍 **Auto location detection** via browser Geolocation API
- 🔔 Multiple calculation methods (Egyptian, ISNA, MWL, etc.)
- 📱 **Mobile-first** — works as a full-screen PWA on iOS/Android

---

## 🚀 Deploy to GitHub Pages

### Option A — Automatic (recommended)

1. **Fork or push** this repo to your GitHub account

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Update `package.json`** — set `homepage` to your GitHub Pages URL:
   ```json
   "homepage": "https://YOUR_USERNAME.github.io/salat-webapp"
   ```

4. **Deploy:**
   ```bash
   npm run deploy
   ```
   This runs `npm run build` then pushes the `build/` folder to the `gh-pages` branch.

5. **Enable GitHub Pages** in your repo:
   - Go to **Settings → Pages**
   - Set source to **`gh-pages` branch**, root folder
   - Your app will be live at `https://YOUR_USERNAME.github.io/salat-webapp`

### Option B — GitHub Actions (CI/CD)

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 18
      - run: npm ci
      - run: npm run build
      - uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./build
```

---

## 💻 Local Development

```bash
npm install
npm start
```

Opens at `http://localhost:3000`

---

## 📁 Project Structure

```
salat-webapp/
├── public/
│   └── index.html
├── src/
│   ├── App.js                    # Root shell, tab navigation
│   ├── index.js
│   ├── index.css                 # Global styles + keyframes
│   ├── context/
│   │   ├── AppContext.js         # Global state (location, prayer times, settings)
│   │   └── ThemeContext.js       # Dark/light/system theme
│   ├── theme/
│   │   └── colors.js             # Dark & light color tokens
│   ├── services/
│   │   └── prayerApi.js          # AlAdhan API + Nominatim geocoding
│   ├── hooks/
│   │   ├── useCountdown.js       # Live 1-second countdown timer
│   │   └── useQibla.js           # AlAdhan Qibla API + DeviceOrientation compass
│   ├── utils/
│   │   └── prayerUtils.js        # Time formatting, prayer helpers, constants
│   └── components/
│       ├── CompassSVG.js         # SVG compass with animated needle
│       ├── LocationModal.js      # Location confirm + city search modal
│       ├── HomeScreen.js         # Prayer times + live countdown
│       ├── MonthlyScreen.js      # Monthly prayer calendar
│       ├── QiblaScreen.js        # Qibla compass screen
│       └── SettingsScreen.js     # Settings: city, method, theme, notifications
├── package.json
└── README.md
```

---

## 🌐 APIs Used

| API | Purpose |
|-----|---------|
| `api.aladhan.com/v1/timings` | Daily prayer times |
| `api.aladhan.com/v1/calendar` | Monthly prayer times |
| `api.aladhan.com/v1/qibla` | Qibla direction in degrees |
| `nominatim.openstreetmap.org/reverse` | Reverse geocoding (coords → city name) |
| `nominatim.openstreetmap.org/search` | City search |

---

## 🧭 Compass on Mobile

The Qibla compass uses the browser's **DeviceOrientationEvent API**:

- **iOS 13+**: Requires explicit user permission (`DeviceOrientationEvent.requestPermission()`). A button appears on the Qibla screen to enable it.
- **Android/Chrome**: Works automatically on mobile without extra permission.
- **Desktop**: No compass sensor — shows calculated Qibla direction without live rotation.

---

## 🎨 Customization

- **Default city**: The app auto-detects on first visit. Users can change it in Settings.
- **Default calculation method**: Change `calculationMethod: 3` in `AppContext.js`.
- **Colors**: Edit `src/theme/colors.js`.
- **Add PWA manifest**: Add a `public/manifest.json` and service worker for full installable PWA support.

---

## 📱 PWA Installation (Optional Enhancement)

Add to `public/manifest.json`:
```json
{
  "name": "Salat — Prayer Times",
  "short_name": "Salat",
  "start_url": ".",
  "display": "standalone",
  "background_color": "#07091A",
  "theme_color": "#07091A",
  "icons": [...]
}
```

Then link it in `public/index.html`:
```html
<link rel="manifest" href="%PUBLIC_URL%/manifest.json" />
```

---

## 📄 License

MIT — Free to use, modify, and deploy.
