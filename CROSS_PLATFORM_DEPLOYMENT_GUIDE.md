# Cross-Platform Installation & Build Guide (Android, Windows, iOS)

This guide provides step-by-step instructions for building and installing the **Zentiq POS** app across **Android tablets/phones/terminals**, **Windows desktop cash registers**, and **iOS iPads/iPhones**.

---

## 1. 🤖 Android Installation (Tablets, Phones & POS Terminals)

### Option A: Direct APK Build via EAS (Recommended for Testing & Sideloading)
The project includes an `eas.json` profile preconfigured with `"buildType": "apk"`. This produces a downloadable `.apk` file that can be transferred directly to any Android tablet, handheld terminal (e.g. Sunmi, iMin, Pax), or mobile phone.

1. **Install EAS CLI** (if not installed):
   ```bash
   npm install -g eas-cli
   ```
2. **Login to your Expo account**:
   ```bash
   eas login
   ```
3. **Trigger Android APK Build**:
   ```bash
   npm run build:apk
   # Or directly:
   eas build --platform android --profile preview
   ```
4. Once completed, EAS CLI will output a direct **QR Code and Download URL** for the `.apk`. Open the URL on the Android device or scan the QR code to download and install.

### Option B: Automated GitHub Actions CI/CD
The repository includes `.github/workflows/eas-build.yml`.
- Add your `EXPO_TOKEN` in GitHub Repository Settings -> Secrets -> Actions.
- Every push to `main` or manual trigger via **Run Workflow** builds the Android APK automatically in GitHub Actions and generates a download link.

### Option C: Production Google Play Store AAB
To build an Android App Bundle for Google Play Store:
```bash
eas build --platform android --profile production
```

---

## 2. 🪟 Windows Installation (Desktop, Laptops & Billing Counters)

For billing counters running Windows 10 or Windows 11, you have two primary options:

### Option A: Progressive Web App (PWA) / Desktop Web (Fastest & 1-Click Native Install)
The POS is built with responsive layout support (`useResponsiveLayout`) and `react-native-web`. You can install it on Windows as a standalone desktop app via Microsoft Edge or Google Chrome:

1. **Start the POS in web mode**:
   ```bash
   npm run web
   ```
2. Open `http://localhost:8081` (or your hosted domain) in **Microsoft Edge** or **Google Chrome**.
3. Look at the right side of the address bar:
   - In **Edge**: Click the **"App Available - Install Zentiq POS"** button (or Menu -> Apps -> Install this site as an app).
   - In **Chrome**: Click the **Install** icon in the URL bar.
4. **Result**:
   - The app installs as a native Windows desktop window without browser URL bars or tabs.
   - A **Desktop Shortcut** and **Start Menu entry** are automatically created.
   - You can **pin it to the Windows Taskbar**.
   - Press **F11** anytime for a distraction-free Full-Screen Kiosk Mode.

### Option B: Export Static Web App for Local Windows Web Server / Hosting
```bash
npm run build:web
```
This outputs the production web bundle into the `dist/` directory, ready to be hosted on Firebase Hosting, IIS, or packaged with Electron.

---

## 3. 🍏 iOS Installation (iPads & iPhones)

### Option A: Ad-Hoc / Internal Testing via EAS
1. Run the EAS build command:
   ```bash
   npm run build:ios
   # Or directly:
   eas build --platform ios --profile preview
   ```
2. EAS will prompt to sign in with your Apple Developer Account and register test device UDIDs automatically.
3. Once completed, install the build directly via the EAS download link on registered devices.

### Option B: Apple TestFlight & App Store
1. Configure your Apple Developer credentials in EAS.
2. Build for production:
   ```bash
   eas build --platform ios --profile production
   ```
3. Submit to TestFlight:
   ```bash
   eas submit -p ios
   ```
4. Staff can install and receive automatic updates through the Apple TestFlight app.

---

## 4. Summary of Available Build Scripts

| Command | Platform | Description |
| :--- | :--- | :--- |
| `npm run build:apk` | Android | Compiles installable standalone `.apk` |
| `npm run build:ios` | iOS | Builds internal distribution build |
| `npm run build:web` | Windows / Web | Exports production web bundle |
| `npm run web` | Windows / Web | Runs live desktop web app |
