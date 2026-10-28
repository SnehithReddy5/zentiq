import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import {
  collection,
  onSnapshot,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  serverTimestamp,
  query,
  where,
  orderBy
} from 'firebase/firestore';
import {
  UtensilsCrossed,
  Search,
  Plus,
  Minus,
  ShoppingBag,
  Receipt,
  CheckCircle2,
  Clock,
  ChevronRight,
  X,
  Sparkles,
  AlertCircle,
  HelpCircle,
  ChefHat,
  ArrowLeft,
  Check
} from 'lucide-react';

interface MenuItem {
  id: string;
  name: string;
  price: number;
  description?: string;
  categoryId?: string;
  categoryName?: string;
  isVeg?: boolean;
  image?: string;
  available?: boolean;
  isAvailable?: boolean;
  variants?: Array<{ id: string; name: string; price: number }>;
}

interface MenuCategory {
  id: string;
  name: string;
}

interface CartItem {
  id: string; // unique cart entry key
  itemId: string;
  name: string;
  price: number;
  qty: number;
  variantId?: string;
  variantName?: string;
  note?: string;
}

function cleanFirestoreData<T>(data: T): T {
  if (data === null || data === undefined) return data;
  if (Array.isArray(data)) return data.map(cleanFirestoreData) as unknown as T;
  if (typeof data === 'object' && !(data instanceof Date)) {
    if ((data as any)._methodName || (data as any).constructor?.name === 'FieldValue') return data;
    const clean: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        clean[key] = cleanFirestoreData(value);
      }
    }
    return clean as T;
  }
  return data;
}

export const CustomerOrderPortal: React.FC = () => {
  // 1. URL Query Parameters
  const params = new URLSearchParams(window.location.search);
  const tenantId = params.get('t') || params.get('tenantId') || '';
  const locationId = params.get('loc') || params.get('locationId') || 'loc-primary';
  const tableNo = Number(params.get('table') || params.get('tableNo') || 1);

  // 2. Restaurant Branding & Data
  const [restaurantName, setRestaurantName] = useState<string>('Restaurant');
  const [restaurantPhone, setRestaurantPhone] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  // 3. Menu State
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [vegOnlyFilter, setVegOnlyFilter] = useState(false);

  // 4. Cart & Ordering State
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [orderNote, setOrderNote] = useState('');
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);

  // 5. Active Live Order Tracking (Single or Multiple Rounds)
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [activeOrder, setActiveOrder] = useState<any | null>(null);
  const [isRequestingBill, setIsRequestingBill] = useState(false);
  const [billRequestedLocal, setBillRequestedLocal] = useState(false);
  const [isBillSettled, setIsBillSettled] = useState(false);

  // Load Restaurant Branding
  useEffect(() => {
    if (!tenantId) return;

    // A. Load branding
    const loadBranding = async () => {
      try {
        const brandSnap = await getDoc(doc(db, 'tenants', tenantId, 'branding', 'config'));
        if (brandSnap.exists()) {
          const d = brandSnap.data();
          setRestaurantName(d.displayName || d.businessName || tenantId);
          setRestaurantPhone(d.phone || '');
        } else {
          const tenantSnap = await getDoc(doc(db, 'tenants', tenantId));
          if (tenantSnap.exists()) {
            setRestaurantName(tenantSnap.data().businessName || tenantId);
          }
        }
      } catch (e) {
        console.warn('Branding load error:', e);
      }
    };
    loadBranding();

    // B. Check if this table already has a running order
    const ordersCol = collection(db, 'tenants', tenantId, 'locations', locationId, 'orders');
    const runningQuery = query(
      ordersCol,
      where('tableNo', 'in', [tableNo, String(tableNo)]),
      where('status', 'in', ['RUNNING', 'running'])
    );

    const unsubRunning = onSnapshot(runningQuery, (snap) => {
      if (!snap.empty) {
        const docSnap = snap.docs[0];
        setActiveOrderId(docSnap.id);
        setActiveOrder({ id: docSnap.id, ...docSnap.data() });
      } else {
        // If order was completed by manager/cashier, trigger celebration & clear active state
        if (activeOrderId) {
          setActiveOrderId(null);
          setActiveOrder(null);
          setBillRequestedLocal(false);
          setIsBillSettled(true);
        }
      }
    });

    return () => unsubRunning();
  }, [tenantId, locationId, tableNo]);

  // Load Menu Categories and Items
  useEffect(() => {
    if (!tenantId) return;
    setIsLoading(true);

    const loadMenu = async () => {
      try {
        // Fetch categories (check branch subcollection first, then fallback to tenant level)
        let catSnap = await getDocs(
          collection(db, 'tenants', tenantId, 'locations', locationId, 'menuCategories')
        );
        if (catSnap.empty) {
          catSnap = await getDocs(collection(db, 'tenants', tenantId, 'menuCategories'));
        }

        const catList: MenuCategory[] = [];
        catSnap.forEach((d) => catList.push({ id: d.id, name: d.data().name }));
        setCategories(catList);

        // Fetch menu items
        let itemSnap = await getDocs(
          collection(db, 'tenants', tenantId, 'locations', locationId, 'menuItems')
        );
        if (itemSnap.empty) {
          itemSnap = await getDocs(collection(db, 'tenants', tenantId, 'menuItems'));
        }

        const itemList: MenuItem[] = [];
        itemSnap.forEach((d) => {
          const data = d.data();
          if (data.active !== false && data.isAvailable !== false) {
            itemList.push({ id: d.id, ...data } as MenuItem);
          }
        });

        setItems(itemList);
      } catch (err) {
        console.error('Menu load error:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadMenu();
  }, [tenantId, locationId]);

  // Cart operations
  const addToCart = (item: MenuItem, variant?: { id: string; name: string; price: number }) => {
    const entryId = variant ? `${item.id}_${variant.id}` : item.id;
    const price = variant ? variant.price : item.price;
    const itemName = variant ? `${item.name} (${variant.name})` : item.name;

    setCart((prev) => {
      const existing = prev.find((c) => c.id === entryId);
      if (existing) {
        return prev.map((c) => (c.id === entryId ? { ...c, qty: c.qty + 1 } : c));
      }
      return [
        ...prev,
        {
          id: entryId,
          itemId: item.id,
          name: itemName,
          price,
          qty: 1,
          variantId: variant?.id,
          variantName: variant?.name
        }
      ];
    });
  };

  const removeFromCart = (entryId: string) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.id === entryId);
      if (!existing) return prev;
      if (existing.qty <= 1) {
        return prev.filter((c) => c.id !== entryId);
      }
      return prev.map((c) => (c.id === entryId ? { ...c, qty: c.qty - 1 } : c));
    });
  };

  const cartTotalQty = cart.reduce((acc, c) => acc + c.qty, 0);
  const cartSubtotal = cart.reduce((acc, c) => acc + c.price * c.qty, 0);

  // 1. Submit Dine-In Order (Dispatches directly to Kitchen & Table)
  const handlePlaceOrder = async () => {
    if (cart.length === 0 || !tenantId) return;

    setIsSubmittingOrder(true);
    try {
      const ordersCol = collection(db, 'tenants', tenantId, 'locations', locationId, 'orders');

      if (activeOrderId && activeOrder) {
        // Appending additional round to existing Table Order
        const existingItems = activeOrder.items || [];
        const formattedNewItems = cart.map((c) => ({
          itemId: c.itemId,
          itemName: c.name,
          qty: c.qty,
          price: c.price,
          variantId: c.variantId || null,
          note: c.note || '',
          sentToKitchen: false // Kitchen printer detects unsent items
        }));

        const mergedItems = [...existingItems, ...formattedNewItems];
        const newTotal = mergedItems.reduce((acc, it) => acc + it.price * it.qty, 0);

        await updateDoc(doc(ordersCol, activeOrderId), cleanFirestoreData({
          items: mergedItems,
          totalAmount: newTotal,
          subtotal: newTotal,
          specialNote: orderNote
            ? `${activeOrder.specialNote || ''} | Round 2: ${orderNote}`
            : (activeOrder.specialNote || ''),
          updatedAt: serverTimestamp()
        }));
      } else {
        // Creating fresh new order for Table
        const newOrderRef = doc(ordersCol);
        const orderPayload = cleanFirestoreData({
          id: newOrderRef.id,
          tenantId: tenantId || null,
          locationId: locationId || 'loc-primary',
          tableNo,
          orderType: 'DINE_IN',
          orderSource: 'QR_SELF_ORDER',
          status: 'RUNNING',
          paymentStatus: 'UNPAID',
          captainId: 'qr-self',
          captainName: `Table ${tableNo} Self-Order`,
          items: cart.map((c) => ({
            itemId: c.itemId,
            itemName: c.name,
            qty: c.qty,
            price: c.price,
            variantId: c.variantId || null,
            note: c.note || ''
          })),
          subtotal: cartSubtotal,
          totalAmount: cartSubtotal,
          specialNote: (orderNote || '').trim(),
          billRequested: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });

        await setDoc(newOrderRef, orderPayload);

        // Update table status to occupied (Query all tables in location to match number or string)
        try {
          const tablesCol = collection(db, 'tenants', tenantId, 'locations', locationId, 'tables');
          const tableSnap = await getDocs(tablesCol);
          for (const d of tableSnap.docs) {
            const data = d.data();
            if (Number(data.tableNo) === Number(tableNo) || String(data.tableNo) === String(tableNo)) {
              await updateDoc(d.ref, {
                status: 'running',
                currentOrderId: newOrderRef.id,
                cartItems: cart.map((c) => ({
                  itemId: c.itemId,
                  itemName: c.name,
                  qty: c.qty,
                  price: c.price,
                  variantId: c.variantId || null,
                  note: c.note || '',
                  sentQty: c.qty,
                })),
                activeWaiterName: '📱 QR Self-Order',
                billRequested: false,
                updatedAt: serverTimestamp()
              });
            }
          }
        } catch (tableErr) {
          console.warn('Table status update error:', tableErr);
        }
      }

      setCart([]);
      setIsCartOpen(false);
      setOrderNote('');
    } catch (err: any) {
      alert('Failed to place order: ' + err.message);
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  // 2. Request Final Bill (Notifies Manager / POS cashier)
  const handleRequestBill = async () => {
    if (!activeOrderId || !tenantId) return;

    const confirmBill = window.confirm(
      `Ready to settle your bill for Table ${tableNo}?\n\nStaff will print your bill and bring it to your table. You can pay by Cash, UPI QR on the bill, or Card.`
    );
    if (!confirmBill) return;

    setIsRequestingBill(true);
    try {
      const orderRef = doc(
        db,
        'tenants',
        tenantId,
        'locations',
        locationId,
        'orders',
        activeOrderId
      );
      await updateDoc(orderRef, {
        billRequested: true,
        billRequestedAt: serverTimestamp()
      });

      // Also flag table doc with billRequested (matching number or string)
      try {
        const tablesCol = collection(db, 'tenants', tenantId, 'locations', locationId, 'tables');
        const tableSnap = await getDocs(tablesCol);
        for (const d of tableSnap.docs) {
          const data = d.data();
          if (Number(data.tableNo) === Number(tableNo) || String(data.tableNo) === String(tableNo)) {
            await updateDoc(d.ref, {
              billRequested: true,
              billRequestedAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            });
          }
        }
      } catch (tableErr) {
        console.warn('Table billRequested update error:', tableErr);
      }

      setBillRequestedLocal(true);
    } catch (err: any) {
      alert('Error requesting bill: ' + err.message);
    } finally {
      setIsRequestingBill(false);
    }
  };

  // Filter items
  const filteredItems = items.filter((item) => {
    const matchesCategory =
      selectedCategoryId === 'ALL' || item.categoryId === selectedCategoryId;
    const matchesSearch =
      searchQuery === '' ||
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.description && item.description.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesVeg = !vegOnlyFilter || item.isVeg === true;

    return matchesCategory && matchesSearch && matchesVeg;
  });

  if (!tenantId) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 text-center">
        <UtensilsCrossed size={48} className="text-amber-500 mb-4" />
        <h1 className="text-xl font-bold">Invalid Table QR Code</h1>
        <p className="text-sm text-slate-400 mt-2 max-w-sm">
          Please scan the official QR code located on your dining table.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 flex flex-col antialiased selection:bg-amber-500 selection:text-white pb-28">
      {/* Top Sticky Header */}
      <header className="sticky top-0 z-30 bg-[#070b14]/90 backdrop-blur-xl border-b border-slate-800/80 px-4 py-3 shadow-lg">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold tracking-widest text-amber-400 uppercase block">
              Dine-In Menu
            </span>
            <h1 className="text-lg font-black text-white tracking-tight">{restaurantName}</h1>
          </div>

          {/* Table Badge */}
          <div className="flex items-center gap-2 bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/40 px-3 py-1.5 rounded-2xl shadow-inner">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-black text-amber-300">TABLE {tableNo}</span>
          </div>
        </div>

        {/* Bill Requested Alert Banner if customer requested bill */}
        {(activeOrder?.billRequested || billRequestedLocal) && (
          <div className="max-w-2xl mx-auto mt-2.5 bg-gradient-to-r from-amber-500/20 via-orange-500/20 to-amber-500/20 border border-amber-500/40 p-2.5 rounded-xl flex items-center justify-between text-xs animate-pulse">
            <div className="flex items-center gap-2">
              <Receipt size={16} className="text-amber-400 shrink-0" />
              <span className="text-amber-200 font-semibold">
                Bill Requested! Staff is bringing your bill to Table {tableNo}.
              </span>
            </div>
            <span className="text-[10px] font-mono bg-amber-500/30 text-amber-300 px-2 py-0.5 rounded font-bold">
              Pay at Table
            </span>
          </div>
        )}
      </header>

      {/* Main Content Area */}
      <main className="max-w-2xl mx-auto w-full px-4 pt-4 flex-1 space-y-4">
        {/* Bill Settled Celebration Screen */}
        {isBillSettled && (
          <div className="bg-gradient-to-br from-emerald-950 via-slate-900 to-slate-950 border-2 border-emerald-500/50 p-6 rounded-3xl text-center space-y-3 shadow-2xl animate-fade-in">
            <div className="w-14 h-14 bg-emerald-500/20 border border-emerald-500/40 rounded-2xl flex items-center justify-center mx-auto text-2xl shadow-inner">
              🎉
            </div>
            <h3 className="text-lg font-black text-white">Bill Settled & Table Cleared!</h3>
            <p className="text-xs text-slate-300 leading-relaxed max-w-md mx-auto">
              Thank you for dining with us at <span className="text-amber-300 font-bold">{restaurantName}</span>! Your payment has been received and bill settled.
            </p>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setIsBillSettled(false)}
                className="py-2.5 px-6 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-black rounded-xl shadow-lg shadow-emerald-600/30 cursor-pointer"
              >
                Browse Menu / Order Again
              </button>
            </div>
          </div>
        )}
        {/* Active Dining Status Banner (if diner has items currently running) */}
        {activeOrder && (
          <div className="bg-slate-900/90 border border-emerald-500/40 p-4 rounded-3xl shadow-xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
                  <ChefHat size={16} className="text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-white">Your Order is Cooking</h3>
                  <p className="text-[10px] text-slate-400">
                    Table {tableNo} • {activeOrder.items?.length || 0} items ordered
                  </p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-xs font-black text-emerald-400 font-mono">
                  ₹{activeOrder.totalAmount?.toFixed(2) || '0.00'}
                </span>
                <span className="text-[9px] text-slate-500 block">Running Bill</span>
              </div>
            </div>

            {/* Quick Actions: Order More Items or Get My Bill */}
            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800">
              <button
                type="button"
                onClick={() => {
                  window.scrollTo({ top: 300, behavior: 'smooth' });
                }}
                className="py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              >
                <Plus size={14} className="text-amber-400" />
                Add More Food
              </button>

              <button
                type="button"
                disabled={activeOrder.billRequested || billRequestedLocal || isRequestingBill}
                onClick={handleRequestBill}
                className={`py-2 px-3 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer ${
                  activeOrder.billRequested || billRequestedLocal
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black shadow-amber-500/20'
                }`}
              >
                <Receipt size={14} />
                {activeOrder.billRequested || billRequestedLocal ? 'Bill Requested ✓' : '🧾 Get My Bill'}
              </button>
            </div>
          </div>
        )}

        {/* Search & Veg Filter Bar */}
        <div className="flex gap-2.5">
          <div className="flex-1 bg-slate-900/90 border border-slate-800/80 rounded-2xl flex items-center px-3.5 py-2.5 shadow-sm">
            <Search size={15} className="text-slate-400 mr-2 shrink-0" />
            <input
              type="text"
              placeholder="Search starters, biryanis, drinks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent text-xs text-white placeholder-slate-500 w-full focus:outline-none"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="text-slate-400 hover:text-white">
                <X size={14} />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setVegOnlyFilter(!vegOnlyFilter)}
            className={`px-3.5 py-2.5 rounded-2xl text-xs font-bold border flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${
              vegOnlyFilter
                ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-400'
                : 'bg-slate-900/90 border-slate-800/80 text-slate-400'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            Veg Only
          </button>
        </div>

        {/* Horizontal Category Chips */}
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar select-none">
          <button
            type="button"
            onClick={() => setSelectedCategoryId('ALL')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
              selectedCategoryId === 'ALL'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            All Menu
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategoryId(cat.id)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                selectedCategoryId === cat.id
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Menu Items List */}
        {isLoading ? (
          <div className="py-20 text-center space-y-3">
            <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs text-slate-400">Loading Table {tableNo} menu...</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="bg-slate-900/50 border border-slate-800 p-8 rounded-3xl text-center space-y-2">
            <UtensilsCrossed size={32} className="text-slate-600 mx-auto" />
            <p className="text-xs text-slate-300 font-semibold">No items found</p>
            <p className="text-[11px] text-slate-500">Try adjusting your search or category filter</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredItems.map((item, idx) => {
              const inCart = cart.find((c) => c.itemId === item.id);
              const qtyInCart = inCart ? inCart.qty : 0;

              return (
                <div
                  key={`${item.id}-${idx}`}
                  className="bg-slate-900/70 border border-slate-800/80 hover:border-slate-700/80 p-3.5 rounded-3xl transition-all flex items-start justify-between gap-3 shadow-sm"
                >
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`w-2.5 h-2.5 rounded-sm border flex items-center justify-center shrink-0 ${
                          item.isVeg
                            ? 'border-emerald-500 text-emerald-400'
                            : 'border-red-500 text-red-400'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            item.isVeg ? 'bg-emerald-500' : 'bg-red-500'
                          }`}
                        />
                      </span>
                      <h4 className="text-xs font-bold text-white tracking-tight leading-tight">
                        {item.name}
                      </h4>
                    </div>

                    {item.description && (
                      <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                        {item.description}
                      </p>
                    )}

                    <div className="pt-1">
                      <span className="text-xs font-black text-amber-400 font-mono">
                        ₹{item.price.toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {/* Add to Cart / Quantity Selector */}
                  <div className="shrink-0 self-center">
                    {qtyInCart > 0 ? (
                      <div className="bg-amber-500 text-slate-950 font-black text-xs rounded-2xl flex items-center gap-2 px-2 py-1 shadow-md shadow-amber-500/20">
                        <button
                          type="button"
                          onClick={() => removeFromCart(inCart!.id)}
                          className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-black/15 cursor-pointer"
                        >
                          <Minus size={13} />
                        </button>
                        <span className="font-mono text-xs w-4 text-center">{qtyInCart}</span>
                        <button
                          type="button"
                          onClick={() => addToCart(item)}
                          className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-black/15 cursor-pointer"
                        >
                          <Plus size={13} />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => addToCart(item)}
                        className="bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-amber-400 border border-slate-700 hover:border-amber-500 px-4 py-2 rounded-2xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer shadow-sm"
                      >
                        <Plus size={13} />
                        Add
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Floating Bottom Cart Bar */}
      {cartTotalQty > 0 && (
        <div className="fixed bottom-4 inset-x-4 max-w-2xl mx-auto z-40">
          <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 p-3.5 rounded-3xl shadow-2xl flex items-center justify-between shadow-amber-500/20">
            <div className="flex items-center gap-3 pl-1">
              <div className="w-9 h-9 rounded-2xl bg-black/20 flex items-center justify-center">
                <ShoppingBag size={18} className="text-slate-950" />
              </div>
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider block opacity-80">
                  {cartTotalQty} {cartTotalQty === 1 ? 'Item' : 'Items'} Selected
                </span>
                <span className="text-sm font-black font-mono">₹{cartSubtotal.toFixed(2)}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsCartOpen(true)}
              className="bg-slate-950 text-amber-400 font-black text-xs py-2.5 px-5 rounded-2xl shadow-lg flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all"
            >
              Review & Place Order
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Cart Modal / Checkout Drawer */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-md p-0 sm:p-4">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  Review Table {tableNo} Order
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded-full font-bold">
                    Zero Web Payment
                  </span>
                </h3>
                <p className="text-xs text-slate-400">Order goes straight to kitchen</p>
              </div>
              <button
                onClick={() => setIsCartOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            {/* Cart Items List */}
            <div className="space-y-2.5 overflow-y-auto flex-1 pr-1">
              {cart.map((c, idx) => (
                <div
                  key={`${c.id}-${idx}`}
                  className="bg-slate-800/40 border border-slate-800 p-3 rounded-2xl flex items-center justify-between gap-3 text-xs"
                >
                  <div className="flex-1">
                    <h5 className="font-bold text-white">{c.name}</h5>
                    <span className="text-slate-400 font-mono text-[11px]">
                      ₹{c.price.toFixed(2)} × {c.qty}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="bg-slate-800 text-white rounded-xl flex items-center px-2 py-1">
                      <button
                        type="button"
                        onClick={() => removeFromCart(c.id)}
                        className="p-1 hover:text-amber-400"
                      >
                        <Minus size={12} />
                      </button>
                      <span className="font-mono text-xs w-5 text-center">{c.qty}</span>
                      <button
                        type="button"
                        onClick={() => {
                          const item = items.find((i) => i.id === c.itemId);
                          if (item) addToCart(item);
                        }}
                        className="p-1 hover:text-amber-400"
                      >
                        <Plus size={12} />
                      </button>
                    </div>

                    <span className="font-black text-amber-400 font-mono w-16 text-right">
                      ₹{(c.price * c.qty).toFixed(2)}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Special Cooking Instructions */}
            <div>
              <label className="text-[11px] text-slate-400 font-semibold block mb-1">
                Kitchen Instructions (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Less spicy, extra onions, no coriander"
                value={orderNote}
                onChange={(e) => setOrderNote(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 text-xs text-white p-2.5 rounded-xl focus:outline-none focus:border-amber-500"
              />
            </div>

            {/* Summary & Notice */}
            <div className="space-y-2 border-t border-slate-800 pt-3">
              <div className="flex justify-between text-xs text-slate-300">
                <span>Subtotal ({cartTotalQty} items)</span>
                <span className="font-mono font-bold text-white">₹{cartSubtotal.toFixed(2)}</span>
              </div>

              <div className="bg-emerald-950/40 border border-emerald-500/30 p-2.5 rounded-xl flex items-center gap-2 text-[11px] text-emerald-300">
                <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
                <span>
                  No online payment needed here! Order goes straight to kitchen. Pay by Cash / UPI / Card when finished.
                </span>
              </div>
            </div>

            {/* Place Order Button */}
            <button
              type="button"
              disabled={isSubmittingOrder}
              onClick={handlePlaceOrder}
              className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-xs py-3.5 rounded-2xl shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-50"
            >
              <ChefHat size={16} />
              {isSubmittingOrder
                ? 'Sending Order to Kitchen...'
                : activeOrderId
                ? '⚡ Send Additional Round to Kitchen'
                : `⚡ Send Order to Kitchen (₹${cartSubtotal.toFixed(2)})`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
