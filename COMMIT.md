# Git Commit Summary & Instructions

## Recommended Commit Command

### Standard Commit (No Cloud Build Triggered - Free & Fast)
```bash
git add .
git commit -m "feat: mobile pos layout redesign, fix menu item creation, admin cascade delete & decoupled ci/cd"
git push origin main
```

### Optional Push-to-Build Commands
If you want GitHub Actions to automatically build a specific package on this push, append one of the triggers to your commit message:

- **Build Android APK Only:**
  ```bash
  git commit -m "feat: mobile layout redesign and menu item fixes [build-android]"
  ```
- **Package Windows Desktop .exe Only:**
  ```bash
  git commit -m "feat: mobile layout redesign and menu item fixes [build-win]"
  ```
- **Build All Client POS Apps (Android, iOS, Windows):**
  ```bash
  git commit -m "feat: mobile layout redesign and menu item fixes [build-all]"
  ```

---

## Detailed Commit Message (Copy-Paste Ready)

```
feat: mobile pos landing redesign, menu item fix, admin cascade delete & decoupled ci/cd

- Mobile Home Screen:
  * Redesigned mobile landing layout with Dine In and Pick Up hero buttons at the very top (zero vertical scrolling needed).
  * Positioned Zomato and Swiggy online delivery hub directly under the main order actions.
  * Replaced large 4-card sales tiles on mobile with a compact horizontal operations ribbon.
  * Removed crowded floor table matrix and printer diagnostics on mobile landing.
  * Fixed button overflowing in header and TablesScreen with shrink-0 safeguards.

- Menu Item Management:
  * Fixed Firestore runtime error when saving menu items without variants (removed undefined variants).
  * Added defensive payload sanitization in DBServices (addMenuItem & updateMenuItem).
  * Added auto-selection of first category and inline '+ Add Category First' prompt when no categories exist.

- Admin Web Console (admin-web):
  * Implemented permanent cascading tenant deletion (purges subcollections, locations, tables, menu, orders, staff, and root tenant docs).
  * Added strict delete confirmation modal requiring tenant business name input.
  * Added automatic 1-year annual calendar renewal provisioning (+1 year calculation).
  * Added Annual Renewal status badges (Active 1-Yr, X days left, Overdue) and renewal extension in edit modal.

- CI/CD & Build Decoupling:
  * Removed monolithic .github/workflows/eas-build.yml to prevent credit burn.
  * Created .github/workflows/admin-web.yml scoped only to admin-web/** changes.
  * Created .github/workflows/build-apps.yml with selective manual platform choices (Android, iOS, Windows) and commit tags.
```

---

## Files Changed

| File | Status | Description |
|---|---|---|
| `src/screens/home/HomeScreen.tsx` | Modified | Mobile-first zero-scroll layout with Dine In, Pick Up & Aggregators |
| `src/screens/menu/MenuManagementScreen.tsx` | Modified | Fixed menu item add/update undefined variants and category handling |
| `src/services/firebase/db.ts` | Modified | Added `cleanFirestoreData` to prevent Firestore undefined serialization |
| `src/components/common/Header.tsx` | Modified | Added `shrink-0` and margin to prevent button overflow on mobile |
| `src/screens/tables/TablesScreen.tsx` | Modified | Shortened subtitle and added `shrink-0` to Add Table button |
| `admin-web/src/pages/Tenants.tsx` | Modified | Added full cascade deletion, confirmation modal, and annual renewal cycle |
| `App.tsx` | Modified | Fixed NativeWind stylesheet configuration for web/desktop |
| `.github/workflows/eas-build.yml` | Deleted | Removed monolithic pipeline that was building all platforms on every push |
| `.github/workflows/admin-web.yml` | Added | Scoped pipeline for admin-web build and artifact upload |
| `.github/workflows/build-apps.yml` | Added | Selective on-demand / tagged pipeline for Android, iOS & Windows |
