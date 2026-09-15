# Zentiq Multi-Tenant Platform — Application Running & Testing Guide

This guide provides step-by-step instructions for running, testing, and building both the **Client POS Mobile App** and the **Platform Admin Web**.

---

## Project Directory Overview

```
C:\Vasudha\zentiq├── admin-web/       # Platform Admin Web (React 19 + Vite + Tailwind CSS)
├── src/             # Client POS Mobile App (React Native 0.81.5 + Expo 54)
├── package.json     # Mobile dependencies
└── app.json         # Expo mobile configuration
```

---

## Part 1: Running the Client POS Mobile App (Android / Tablet / Touch POS)

The Client POS app is an Expo bare-workflow application optimized for Android touch devices, tablets, and phones.

### 1.1 Prerequisites
- **Node.js**: v18 or later
- **Android Studio** (for local emulator or physical device USB debugging) OR physical Android tablet/phone.

### 1.2 Running in Development (Expo / Web Preview)
From the root directory `C:\Vasudha\zentiq`:

```bash
cd C:\Vasudha\zentiq

# Start Expo development server
npm start
```

Options in the terminal:
- Press `a` to launch on a connected Android device or emulator.
- Press `w` to open in a web browser for rapid UI testing.

### 1.3 Testing Responsive Breakpoints (Phone vs. Tablet vs. POS)
When running on Web or in an emulator, resize the viewport to test layout adaptation:

1. **Phone Viewport** (`width < 600px`):
   - Single-column card layout on Home screen.
   - Stacked menu item rows with bottom KOT dispatch bar.
   - Separate Menu and Cart screens.
2. **Small Tablet Viewport** (`600px <= width < 840px`):
   - 2-column menu item grid.
   - 4-column dining table cards.
3. **Large Tablet / Touch POS Viewport** (`width >= 840px`):
   - **Split-Screen Ordering**: Left 65% category/menu grid + Right 35% persistent live cart panel with instant KOT and Checkout triggers.
   - 6-column dining table grid with real-time occupancy indicators.
   - Large touch targets (minimum 48x48dp).

### 1.4 Compiling Standalone Android APK (Production Build)

Because raw TCP socket printing (`react-native-tcp-socket`) requires native C++/Java networking:

```bash
cd C:\Vasudha\zentiq

# Generate native android project files (if needed)
npx expo prebuild --platform android

# Compile release APK locally
cd android
./gradlew assembleRelease

# The installable APK is generated at:
# android/app/build/outputs/apk/release/app-release.apk
```

Alternatively, build using Expo Application Services (EAS):
```bash
eas build -p android --profile production
```

### 1.5 Default Demo Credentials for Mobile App

| Credential | Value |
| :--- | :--- |
| **User ID / Mobile** | `admin` |
| **Password** | `admin` |
| **Role** | `TENANT_SUPER_ADMIN` |
| **Tenant** | *Vasudha Family Restaurant* |

---

## Part 2: Running the Platform Admin Web Portal

The Platform Admin Web is used exclusively by our company to manage restaurant clients, approve billable branch locations, and manage APK builds.

### 2.1 Start Development Server

```bash
cd C:\Vasudha\zentiqadmin-web

# Run Vite dev server
npm run dev
```

The portal will start instantly at:
`http://localhost:5173` (or specified port).

### 2.2 Key Flows to Test in Admin Web
1. **Dashboard**: View active tenant counts, billable licensed locations, and pending requests.
2. **Clients & Tenants**: Click **+ Onboard New Tenant**, fill in the form, and provision a new restaurant instance with credentials.
3. **Location Requests**: Review requests submitted by client Super Admins from the mobile app. Click **Approve & Provision** to make the branch active.
4. **APK Releases**: Register new APK version metadata and download links.

### 2.3 Compiling Platform Admin Web for Production

```bash
cd C:\Vasudha\zentiqadmin-web

# Build optimized static distribution
npm run build

# Preview production build locally
npm run preview
```

Output files are bundled into `C:\Vasudha\zentiqadmin-webdist/`, ready for deployment to Firebase Hosting, Vercel, or AWS S3.

---

## Part 3: Verifying Code Quality & TypeScript Compilation

Both projects have been verified and compile with **0 errors**:

```bash
# 1. Verify Client POS Mobile TypeScript
cd C:\Vasudha\zentiq
npx tsc --noEmit

# 2. Verify Platform Admin Web TypeScript & Vite Build
cd C:\Vasudha\zentiqadmin-web
npm run build
```

---

## 4. Troubleshooting & Best Practices

### 4.1 Metro Bundler Cache Clearing
If you encounter bundler caching issues or Babel transform errors, always start Expo with a cleared cache:
```bash
cd C:\Vasudha\zentiq
npx expo start -c
```

### 4.2 "Failed to download remote update in Expo"
This happens when:
1. **Metro Bundler Failed to Transform Assets**:
   - **Fix Applied**: Pinned `tailwindcss: "3.3.2"` strictly so NativeWind v2's synchronous PostCSS parser compiles without async conflicts.
   - **Fix Applied**: Configured `expo.updates: { "enabled": false, "checkAutomatically": "NEVER" }` in `app.json` so Expo Go does not search for EAS remote servers.
2. **Network Connection to Dev Machine**:
   - If your phone is on a different Wi-Fi network or cellular data, Expo Go cannot reach your computer's local IP (port 8081).
   - **Solution**: Start Expo with tunnel mode:
     ```bash
     npx expo start --tunnel -c
     ```

### 4.3 Why "Failed to download remote update" happens when "both devices are on the same Wi-Fi"
Even when your phone and laptop are on the exact same Wi-Fi router, connection fails because of **Windows Network Profile Security**:
1. **Windows Wi-Fi is set to "Public"**: Windows Defender automatically blocks incoming device connections from other phones/tablets on the network.
2. **Wi-Fi Router AP Isolation**: Many home routers or hotspots isolate connected devices from communicating directly with each other.

#### Recommended Solutions:
- **Solution 1 (Instant & Guaranteed): Run with Tunnel Mode**
  ```bash
  cd C:\Vasudha\zentiq
  npx expo start --tunnel
  ```
  *(We have already installed `@expo/ngrok` for you, so this connects through a secure proxy and bypasses all Windows Firewall and router blocks).*

- **Solution 2: Change Windows Wi-Fi to "Private"**
  1. Open Windows **Settings** -> **Network & internet** -> **Wi-Fi**.
  2. Click on your connected Wi-Fi network (**Snehith**).
  3. Under "Network profile type", select **Private network**.
  4. Restart Expo:
     ```bash
     cd C:\Vasudha\zentiq
     npx expo start -c
     ```
