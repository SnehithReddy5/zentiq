# Git Commit Summary & Instructions

## Recommended Commit Command

### Standard Commit (Fast & Free — No Cloud Build Quotas Burned)
```bash 
git add .
git commit -m "feat: 1-tap checkout, remove kot blocking popup, expand cart panel and add printer test buttons"
git push origin main
```

### Optional Push-to-Build Commands
If you want GitHub Actions to automatically build on push:
- **Build Android APK Only:**
  ```bash
  git commit -m "feat: checkout improvements and printer test console [build-android]"
  ```
- **Package Windows Desktop .exe Only:**
  ```bash
  git commit -m "feat: checkout improvements and printer test console [build-win]"
  ```
- **Build All Client POS Apps (Android, iOS, Windows):**
  ```bash
  git commit -m "feat: checkout improvements and printer test console [build-all]"
  ```

---

## Detailed Commit Message (Copy-Paste Ready)

```text
feat: 1-tap checkout, remove kot blocking popup, expand cart panel and add printer test buttons

- Checkout Optimization (CartScreen):
  * Eliminated multi-step friction: added 1-tap Quick Settle buttons for Cash, UPI, and Card.
  * Auto-applies selected payment method when settling single-tender orders without requiring '+ Record Mode'.
  * Removed blocking 'Order settled' modal alert popup for seamless, rapid turnover.

- KOT Dispatch & Clarification (MenuScreen):
  * Removed blocking 'KOT Dispatched' modal alert popup; replaced with elegant non-blocking toast banner.
  * Clarified button label to 'Send KOT (X items)' to make it obvious that 1 single consolidated receipt is printed.
  * Widened persistent right cart panel from 320px to 360px-410px to prevent layout squeezing when bills are active.

- Thermal Printer Settings & Diagnostics (PrinterSettingsScreen):
  * Added dedicated test printer buttons for both Billing Counter Printer and Kitchen KOT Printer.
  * Added live post-save Thermal Printer Diagnostics console showing saved IPs, ports, and real-time connection status.
```

---

## Files Changed

| File | Status | Description |
|---|---|---|
| `src/screens/cart/CartScreen.tsx` | Modified | 1-Tap Quick Settle, auto single-tender payment, removed blocking alert |
| `src/screens/menu/MenuScreen.tsx` | Modified | Removed blocking KOT popup, clarified 'Send KOT (X items)' label, widened right panel |
| `src/screens/settings/PrinterSettingsScreen.tsx` | Modified | Added Kitchen KOT test button and live post-save printer diagnostics console |
| `src/screens/home/HomeScreen.tsx` | Modified | Mobile-first zero-scroll layout with Dine In, Pick Up & Aggregators |
| `src/screens/menu/MenuManagementScreen.tsx` | Modified | Fixed menu item add/update undefined variants & category handling |
| `src/services/firebase/db.ts` | Modified | Added `cleanFirestoreData` to prevent Firestore undefined serialization |
| `src/components/common/Header.tsx` | Modified | Added `shrink-0` and margin to prevent button overflow on mobile |
| `src/screens/tables/TablesScreen.tsx` | Modified | Shortened subtitle and added `shrink-0` to Add Table button |
| `admin-web/src/pages/Tenants.tsx` | Modified | Added cascade deletion, confirmation modal, and annual renewal cycle |
| `App.tsx` | Modified | Fixed NativeWind stylesheet configuration for web/desktop |
| `.github/workflows/eas-build.yml` | Deleted | Removed monolithic pipeline |
| `.github/workflows/admin-web.yml` | Added | Scoped pipeline for admin-web build and artifact upload |
| `.github/workflows/build-apps.yml` | Added | Selective on-demand / tagged pipeline for Android, iOS & Windows |
| `COMMIT.md` | Modified | Updated commit commands and documentation |

### 7. Live Inventory Tracking, Sub-Item Portion Deduction & Stock Guards (zentiq)
- **Inventory Flag & Units**: Added `trackInventory`, `stockQuantity`, `stockUnit` (`kg`, `g`, `pcs`, `portions`, `ltr`, `ml`), and `lowStockThreshold` to `MenuItem`.
- **Sub-Item / Variant Portion Deductions**:
  - Example: Master stock `Chicken - 10 kg`.
  - Sub-item variant `500 gm` configured with `0.5 kg` portion deduction.
  - Selling 1 portion of `500 gm` decrements `0.5 kg` from the 10 kg master pool.
- **In-Stock / Low-Stock / Out-of-Stock Badges**:
  - 🟢 `In Stock: X [unit]` badge when stock is healthy.
  - 🟡 `Low Stock: X [unit]` badge when stock falls below warning threshold.
  - 🔴 `Out of Stock` pill when inventory reaches 0.
- **Strict Overselling Prevention**:
  - Real-time stock reservation checks against active cart.
  - Addition and increment actions blocked if requested quantity exceeds available stock.
  - Sub-item variants with insufficient remaining stock are disabled with an "Out of Stock" indicator.
- **Atomic Settlement Deduction & Quick Restock**:
  - Integrated `deductInventory` into Firestore settlement transactions.
  - Quick `Restock` button and modal on item cards in Menu Management.

### 8. Orders History Analytics, Details Modal with Reprint, Printer Cleanup & Payment UX
- **Orders History Analytics**:
  - Added real-time stats ribbon: Total Revenue, Highest Order, Average Order Value (AOV), Orders Count, and Payment Breakdown (UPI vs Cash vs Card).
  - Search and filter chips for Dine In vs Pick Up vs All.
- **Interactive Order Details & Thermal Reprint**:
  - Tapping any order card expands a detailed modal showing Table #, Bill #, timestamp, cashier name, branch, full itemized breakdown (items, variants, notes, prices, totals), taxes, and split payment modes.
  - Added **Reprint Bill Receipt** button to instantly resend formatted receipt to the LAN thermal printer.
  - Added **Reprint KOT** button for duplicate kitchen tickets.
- **Thermal Printer Settings Cleanup & Sample Print**:
  - Removed overflowing saved IP pill badges from card headers.
  - Enhanced Test Billing Printer to print a fast, realistic ESC/POS formatted receipt sample with store branding, items, GST, and totals.
- **Menu Screen Floating Cart Bar Layout**:
  - Fixed mobile bottom bar with a balanced 2-tier layout: Top strip displays table badge, item count, and total amount; bottom row features 50/50 side-by-side `Send KOT` and `View Cart & Pay` buttons (or full-width when all items are sent).
- **Intuitive Single vs Split Payment UX**:
  - Replaced confusing "+ Record Mode" button with a clear segmented tab: **Single Payment (1-Tap)** vs **Split Payment**.
  - Single Payment allows instant 1-click settlement via Cash (with cash tender change calculator), UPI, or Card.
  - Split Payment provides a dedicated multi-tender ledger showing Total, Recorded, and Remaining balance with simple part allocation.

### 9. Client Admin Payment Methods, Split Payments Switch & Pure KOT Mode
- **Store & Payment Settings Access**:
  - Accessible to both Store Managers and Client Admins from the navigation drawer.
- **Payment Methods & Split Payments Configuration**:
  - Master toggle to enable/disable payment collection at checkout.
  - Individual toggles for standard tenders: Cash, UPI, and Card.
  - Ability to add and remove custom payment methods (e.g. Swiggy Dineout, Zomato Pay, Cheque).
  - Gated Split Payments switch: strictly requires at least 2 active payment methods to be toggled on.
- **Dynamic POS Checkout**:
  - When payment collection is disabled, checkout switches to **Pure KOT Mode**: all payment/split controls are hidden, replaced by a single "Print KOT & Dispatch" button that creates an unpaid running order and prints to the kitchen printer.
  - When payment methods are enabled, only active payment methods appear as selection chips.
  - Split Payment tab appears only when split payments are enabled and >= 2 methods exist.
- **Adaptive Menu Buttons**:
  - When payments are disabled, CTA buttons dynamically change from "View Cart & Pay" to "View & Send KOT".

### 10. Thermal ESC/POS 80mm Formatting Fix (GST & Bill Number Alignment)
- **Safe 38-Column Width**: Fixed overflow issue where 80mm printers with margins were wrapping 40-character lines, pushing Bill # and GST/tax values onto new lines.
- **Bill & Table Layout**: Replaced cramped header with a clean 2-column key-value format:
  - Line 1: `Bill No: #1090` (left) and `Table: 5` (right)
  - Line 2: `Date: 16/09/26 17:15` (left) and `Staff: Ramesh` (right)
- **GST & Subtotal Alignment**: Replaced wide manual padding with strict 2-column formatting (`formatTwoCol`) for Subtotal, CGST (2.5%), SGST (2.5%), Round Off, and Grand Total. Zero text wrapping, zero clipped characters.

### 11. GST Inclusive vs Exclusive Modes, KOT Slip Cleanup & Item Inventory Modal Dialog
- **GST Configuration in Store Settings**:
  - Added GST master toggle to enable/disable tax on customer bills.
  - Added **Inclusive vs Exclusive** pricing model selector:
    - *Inclusive*: Tax is included in menu prices, derived backwards on the bill.
    - *Exclusive*: Tax is added on top of menu prices at checkout.
  - Added percentage inputs for **CGST Rate (%)** and **SGST Rate (%)** with quick preset chips (2.5%, 6.0%, 9.0%).
  - Total combined GST indicator preview (e.g. 5.0% = 2.5% CGST + 2.5% SGST).
- **POS Cart & Thermal Bill Calculations**:
  - Cart item breakdown and thermal printing dynamically compute subtotal, CGST, SGST, round off, and grand total according to store GST mode.
  - Removed external counter notice from KOT and parcel tokens.
- **Dedicated Inventory Setup Modal Dialog**:
  - Toggling "Track Live Stock Inventory" in Menu Management now opens a dedicated popup dialog rather than cluttering the form inline.
  - Configure initial stock quantity, unit (kg, g, pcs, portions, ltr, ml), low stock warning threshold, and per-variant portion deductions in a single clean modal.
  - Item form shows an active stock status badge with "Configure" and "Turn Off" controls.

### 12. Complete UI/UX Overhaul of Store & Payment Settings
- **Eliminated Overflowing Header Badges**: Removed cramped pill badges from all card headers (Payment Methods, GST Configuration, Operating Modes) that caused text wrapping and cut off off-screen on mobile devices.
- **Redesigned GST Pricing Model Selector**:
  - Replaced bulky 2-line wrapped buttons with clean single-line tabs: `Inclusive (In Menu Price)` vs `Exclusive (+ Added on Top)`.
  - Added clean explanatory callouts detailing exactly how customer bills are calculated.
- **GST Standard Presets**:
  - Added quick 1-tap presets: `[0% (Exempt)]`, `[5% (Food)]`, `[12% (AC/Bar)]`, and `[18%]`, which automatically populate CGST and SGST rates in equal halves.
  - Replaced cluttered mini-pills under input fields with spacious, dedicated CGST and SGST input cards.
- **Clean Total Applied GST Indicator**: Single unified status bar showing total active tax rate and model.
- **Enhanced Mobile Scroll Margins**: Increased bottom padding to 110px to guarantee the Save button and switches are never obstructed by Android gesture navigation or floating assistive elements.

### 13. KOTApp Order Details Expansion & Reprint, Inventory Dialog Fix, 3 Printer Workflow Modes, and Direct Menu Landing
- **Bill Details & Thermal Reprint (Referencing KOTApp)**:
  - Upgraded `RunningOrdersScreen.tsx` with dual expansion capability:
    - **In-List Accordion Expansion**: Tapping an order card smoothly expands inline, showing all items, quantities, variant names, item unit prices and line totals, special cooking instructions, subtotal, taxes, and full payment method breakdown (Cash, UPI, Card).
    - **Direct Quick Actions on Card**: Reprint Bill Receipt, Reprint Kitchen KOT, and View Full Details buttons right inside the expanded card.
    - **Full KOTApp-Style Details Modal**: Complete slide-up order invoice modal replicating `KOTApp/src/screens/orders/RunningOrdersScreen.tsx` with clean itemized card, breakdown invoice, and prominent 1-tap Reprint buttons.
    - Admin/Manager order deletion supported with confirmation dialog.
- **Item Inventory Setup Modal Dialog Fix**:
  - Resolved missing dialog/modal in `MenuManagementScreen.tsx` by implementing an in-modal overlay dialog with dedicated inputs for available stock quantity, measurement unit selection (`kg`, `g`, `pcs`, `portions`, `ltr`, `ml`), and low stock warning threshold.
  - Added inline editable stock parameter controls directly in the menu item card for rapid adjustments.
- **Three Printer Workflow Modes**:
  - Added `printerWorkflowMode` configuration to `PrinterSettings` (`printer.store.ts`, `printer.types.ts`, `PrinterSettingsScreen.tsx`):
    1. 🍽️ **Restaurant Mode**: Dual printers (Main Billing printer prints Customer Bill; Kitchen printer prints KOT tickets).
    2. 🍛 **Curry Point Mode**: Single main counter printer (Customer Bill only; no kitchen copy).
    3. ☕ **Tiffin Center Mode**: 1 Single printer, 2 Prints (Customer Bill, followed by an ESC/POS paper cut, followed by a compact Kitchen Copy with Bill # and items for preparation counter).
  - `PrinterSettingsScreen.tsx` dynamically hides the Kitchen IP/Port fields when Curry Point or Tiffin Center modes are selected to keep the setup clean and prevent user confusion.
  - Implemented `buildKitchenToken` and `buildCombinedTiffinPrints` in `ESCPOSService`, which sends both bill and kitchen token with paper cuts in a single optimized payload.
  - Updated `CartScreen.tsx` to route checkout printing automatically according to the active workflow mode.
- **Direct Menu Landing When Dine-In and Pick-Up Are Disabled**:
  - In `HomeScreen.tsx`, when both `features.dineInEnabled` and `features.pickupEnabled` are disabled, the Home landing screen automatically presents the Menu ordering interface directly (`isDirectHome={true}`).
  - Cashiers at fast counters, curry points, or tiffin centers can instantly select categories, add items to cart, and checkout without navigating through table selection.

### 14. Cross-Platform Thermal Printing, Windows Operations & Real-Time Sync, and Variant Management
- **Thermal ESC/POS Printing on Android (Hermes Buffer Fix)**:
  - Fixed "Property Buffer doesn't exist" crash in `printer.service.ts` when running on Android with Hermes engine.
  - Raw byte buffers are now passed directly as `Uint8Array` to `react-native-tcp-socket` without calling `Buffer.from(data)`.
  - Added a 400ms buffer drain safety delay in `disconnect()` before sending TCP FIN/RST packet, ensuring printers don't truncate the end of customer receipts and KOTs.
- **Thermal Printing on Windows (Native Electron TCP Bridge)**:
  - Created `electron/preload.js` exposing `window.electronPrinter.printRaw(ip, port, data)`.
  - Implemented native Node.js `net.Socket` raw thermal printing in `electron/main.js` with socket timeout and error handling.
  - Added local `POST /api/print` proxy on `127.0.0.1` so both Electron desktop client and browser sessions can print directly to thermal LAN printers on port 9100.
  - `printer.service.ts` dynamically routes print jobs to the Windows native print bridge when running on Windows.
- **Real-Time Cross-Platform Firebase Data Synchronization**:
  - Moved `subscribeToActiveTenant` from `LoginScreen.tsx` to top-level `RootNavigator.tsx`.
  - Already-authenticated sessions on Android, iOS, and Windows now immediately mount real-time Firebase `onSnapshot` listeners on app launch.
  - Changes made on Windows (e.g. disabling tables, editing GST, toggling operating modes) immediately sync across Android and iOS in real-time without requiring logout/login.
- **Windows Menu & Category Deletion Fix**:
  - Replaced unsupported `react-native-web` multi-button `Alert.alert` dialogs with a universal cross-platform confirmation modal in `MenuManagementScreen.tsx`.
  - Deleting menu items and categories now works 100% reliably on Windows, Android, and iOS.
- **Variant Quantity Controls & Clear Stock Deduction Explanation**:
  - In `cart.store.ts`, `updateQuantity` now automatically removes an item when quantity reaches <= 0, fixing the bug where items were stuck at quantity 1.
  - In `MenuScreen.tsx`, enhanced the `+ Options` modal with interactive `[-]` `[qty]` `[+]` controls so variants can be added, decremented, or removed directly within the options modal.
  - In `MenuManagementScreen.tsx`, added explicit column headers (`Size Name` | `Price (₹)` | `Deducts (kg/unit)`) and an explanatory banner detailing how raw inventory (e.g. 10 kg chicken) gets deducted per portion.
- **Floor Tables Hidden on Home When Disabled**:
  - Wrapped "Floor Tables Quick Access" in `HomeScreen.tsx` with `features.tablesEnabled !== false && features.dineInEnabled !== false`.
  - Table matrices and floor plans are completely hidden on Windows and mobile when tables or dine-in are disabled.
- **Running Orders Direct Modal Flow**:
  - Removed downward inline accordion expansion in `RunningOrdersScreen.tsx`.
  - Tapping an order card directly opens the full-fidelity Order Details screen/modal with complete itemized breakdown, invoice details, and prominent thermal reprint buttons.
