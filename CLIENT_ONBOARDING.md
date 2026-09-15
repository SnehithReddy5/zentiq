# Zentiq POS — End-to-End Client Onboarding Guide

This document outlines the complete operational lifecycle for onboarding and configuring new restaurant clients on the **Zentiq Multi-Tenant SaaS Platform**.

---

## Architecture Topology & Flow

```
   OUR COMPANY
        ↓
[ PLATFORM ADMIN WEB ]
  - Create Tenant & Business Profile
  - Provision Primary Billable Location
  - Create Tenant Super Admin Credentials
  - Enable/Disable Features (Tables, KOT, etc.)
        ↓
   CLIENT / RESTAURANT
        ↓
[ CLIENT ANDROID POS APP ]
  - First-Time Setup Wizard (Profile, Header, Footer)
  - Menu Excel Template Download & Bulk Import
  - Thermal LAN Printer Setup (Port 9100)
  - Staff Creation & Multi-Branch Assignment
  - Request New Branch Locations (Per-Location Billing)
```

---

## Phase 1: Platform Admin Provisioning (Our Company)

All client onboarding begins inside the **Platform Admin Web** (`admin-web/`). Clients cannot independently self-register or activate billable locations.

### Step 1.1: Log into Platform Admin Web
1. Navigate to the Platform Admin portal.
2. Sign in with company credentials.
3. Access the **Clients & Tenants** section from the sidebar.

### Step 1.2: Onboard New Tenant
Click **+ Onboard New Tenant** and fill in the required fields:

| Field | Description | Example |
| :--- | :--- | :--- |
| **Business Name** | Official legal / trading name | *Vasudha Family Restaurant* |
| **Business Type** | Business model selector | *Dine-in Restaurant*, *Curry Point*, *Tiffin Center*, *Cafe* |
| **Initial Location** | Name of their primary licensed branch | *Kompally Main Branch* |
| **Admin Mobile / ID** | Login username for client Super Admin | *9876543210* (or *admin*) |
| **Admin Password** | Initial secure password | *SecretPass123* |
| **Feature Toggles** | Enable Dining Tables, Kitchen KOT, Split Payments | *Tables: ON*, *KOT: ON* |

Click **Provision Tenant**. The system automatically creates:
1. `tenants/{tenantId}` document with status `ACTIVE`.
2. Initial location `tenants/{tenantId}/locations/loc-primary` with status `ACTIVE`.
3. Tenant Super Admin account in `tenants/{tenantId}/users/{adminMobile}` with role `TENANT_SUPER_ADMIN` and location access `['*']`.
4. Default branding and feature configuration records.

---

## Phase 2: Client First-Time Setup (Android App)

The restaurant Super Admin downloads the Zentiq POS APK onto their Android tablet, phone, or touch terminal.

### Step 2.1: First Login
1. Open **Zentiq POS**.
2. Enter the **User ID / Mobile** and **Password** provided by our company.
3. Tap **SIGN IN**. The app dynamically loads their tenant branding and active locations.

### Step 2.2: Setup Wizard (3 Simple Steps)
On first login, tap **Setup Wizard** from the menu (or prompt):

- **Step 1: Business Profile**:
  - Enter Restaurant Display Name.
  - Enter Official Phone Number and Email.
  - Enter Physical Street Address.
  - Enter GSTIN number (if registered).
- **Step 2: Business Model & Preferences**:
  - **Dining Tables**: Toggle **ON** for Restaurants; toggle **OFF** for Curry Points / Tiffin Centers.
  - **Kitchen KOT Printing**: Toggle **ON** to stream order slips to the prep area.
  - **Split Payments**: Toggle **ON** to accept mixed Cash, UPI, and Card.
- **Step 3: Receipt Header & Footer**:
  - Set Header: (e.g. `VASUDHA FAMILY RESTAURANT`).
  - Set Footer: (e.g. `Thank You & Visit Again!!`).
- Tap **Save & Launch POS**.

---

## Phase 3: Menu Setup & Excel Bulk Import

Managing large menus with dozens of categories and variants is fastest using the built-in Excel engine.

### Step 3.1: Download the Standard Menu Template
1. Open the sidebar menu and tap **Menu & Excel Import**.
2. Tap the **Excel Sheet Icon** in the top-right header.
3. Tap **Download Template**.

The template contains the following standard columns:

| Column | Description | Example 1 | Example 2 |
| :--- | :--- | :--- | :--- |
| **Category** | Menu category grouping | *Biryani Specials* | *Tiffins* |
| **Menu Item** | Name of the dish | *Chicken Dum Biryani* | *Idli* |
| **Variant** | Size, portion, or option | *Single* / *Full* | *2 Pieces* / *4 Pieces* |
| **Price** | Selling price in ₹ | *180* / *320* | *40* / *70* |
| **Active** | Availability flag (`TRUE` or `FALSE`) | *TRUE* | *TRUE* |
| **SKU** | Unique item code (optional) | *BIR-01* | *TIF-01* |

### Step 3.2: Edit Menu in Excel
- Fill in all items and variants.
- Items sharing the same **Menu Item** name will automatically be grouped as variants of that item.
- Save the workbook as `.xlsx`.

### Step 3.3: Upload & Review Validation Preview
1. In the mobile app, tap **Load / Test Excel**.
2. The validation engine immediately analyzes the rows and displays the **Validation & Diff Preview**:
   - **Total Rows**: Total count of rows parsed.
   - **New Items**: Count of new dishes to be inserted.
   - **Updated Items**: Count of existing items to be updated with new prices.
   - **Errors**: Row-level validation errors (e.g., negative prices, blank categories).
3. Review the preview list.
4. Tap **Import Valid Rows**. The system performs an atomic Firestore batch commit.

---

## Phase 4: Local Network Thermal Printer Setup

The Android app communicates directly with thermal receipt printers over the restaurant's local Wi-Fi / LAN via raw **TCP Port 9100**.

### Step 4.1: Connect Hardware
1. Connect thermal printers (Epson, TVS, Rongta, NGX) to the local Wi-Fi router via standard Ethernet cable (RJ-45).
2. Assign static IP addresses (e.g., via router DHCP reservation or printer config utility):
   - **Billing Printer (Counter)**: `192.168.1.100`
   - **Kitchen Printer (KOT)**: `192.168.1.101`

### Step 4.2: Configure in Zentiq POS
1. Open sidebar menu ➔ **Thermal Printers**.
2. Enter Billing Printer IP (`192.168.1.100`) and Port (`9100`).
3. Enter Kitchen Printer IP (`192.168.1.101`) and Port (`9100`).
4. Tap **Test Billing Printer** to print a test slip.
5. Tap **Save Printer Settings**.

---

## Phase 5: Staff Accounts & Multi-Branch Access

### Step 5.1: Create Staff Users
1. Open sidebar menu ➔ **Staff & Permissions**.
2. Tap **+ Add Staff**.
3. Enter Name (e.g. *Ramesh*), Mobile/User ID (e.g. *9876543211*), and Password/PIN (e.g. *1234*).
4. Select Role:
   - `WAITER`: Order taking and KOT dispatch.
   - `CASHIER`: Billing, settlement, split payments.
   - `MANAGER`: Menu adjustments, running orders, printer settings.
   - `KITCHEN`: KOT prep view.
5. Tap **Save Staff**.

---

## Phase 6: Branch Expansion (Per-Location Billing)

We charge clients per active location. Clients cannot directly provision billable locations.

### Step 6.1: Client Submits Request
1. In the Android app, go to sidebar ➔ **Locations & Requests**.
2. Tap **Request Location**.
3. Fill in:
   - Branch Name: *Madhapur Branch*
   - Branch Address: *Hitech City Road, Hyderabad*
   - Branch Phone: *9876543210*
4. Tap **Submit Request**. The status becomes `REQUESTED`.

### Step 6.2: Platform Admin Approves
1. Company admin opens **Platform Admin Web** ➔ **Location Requests**.
2. Review the pending request from the client.
3. Click **Approve & Provision**.
4. The location is instantly created as `ACTIVE`.
5. The restaurant Super Admin can now switch into the new branch using the **Switch Branch** button.

---

## Business Scenarios Supported Out of the Box

### Scenario A: Full-Service Restaurant (With Tables)
- Waiter selects Table (Green = Available) ➔ status changes to Amber (Occupied).
- Adds Biryani ➔ taps **Send KOT** ➔ ticket prints in kitchen.
- Customer orders drinks later ➔ taps **Send KOT** ➔ only the drinks print (incremental differential KOT).
- Cashier generates bill ➔ table remains occupied until paid.
- Customer pays via UPI + Cash ➔ Cashier records split payment ➔ Table turns Green (Available).

### Scenario B: Curry Point / Tiffin Center (No Tables)
- Tables toggle disabled in settings ➔ Home screen completely hides the Tables section.
- Cashier taps **Dine In** or **Takeaway** ➔ selects items ➔ collects payment ➔ prints receipt. No table required.
