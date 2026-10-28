import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import JSZip from 'jszip';
import {
  X,
  Download,
  Printer,
  Sparkles,
  QrCode,
  Layers,
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Copy,
  FolderArchive
} from 'lucide-react';

interface TableQrModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenant: {
    id: string;
    businessName?: string;
    displayName?: string;
  };
  locations?: Array<{ id: string; name: string }>;
}

export const TableQrModal: React.FC<TableQrModalProps> = ({
  isOpen,
  onClose,
  tenant,
  locations = []
}) => {
  const [selectedLocationId, setSelectedLocationId] = useState(
    locations[0]?.id || 'loc-primary'
  );
  const [startTable, setStartTable] = useState(1);
  const [endTable, setEndTable] = useState(10);
  const [activePreviewTable, setActivePreviewTable] = useState(1);
  const [theme, setTheme] = useState<'DARK' | 'LIGHT'>('DARK');
  const [cardStyle, setCardStyle] = useState<'STAND' | 'MINIMAL'>('STAND');
  const [isGeneratingZip, setIsGeneratingZip] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const businessName =
    tenant.businessName || tenant.displayName || 'Our Restaurant';
  const effectiveHost =
    window.location.origin.includes('localhost')
      ? 'https://zentiq-b5d40.web.app'
      : window.location.origin;

  const getTableUrl = (tableNo: number) => {
    return `${effectiveHost}/order?t=${tenant.id}&loc=${selectedLocationId}&table=${tableNo}`;
  };

  // Generate canvas standee card
  const drawCard = async (
    targetCanvas: HTMLCanvasElement,
    tableNo: number,
    themeMode: 'DARK' | 'LIGHT'
  ) => {
    const ctx = targetCanvas.getContext('2d');
    if (!ctx) return;

    // Card dimensions: 1200 x 1600 (3:4 ratio standard for acrylic stands)
    const width = 1200;
    const height = 1600;
    targetCanvas.width = width;
    targetCanvas.height = height;

    const isDark = themeMode === 'DARK';
    const bgColor = isDark ? '#0b0f19' : '#ffffff';
    const cardBorderColor = isDark ? '#1e293b' : '#e2e8f0';
    const textColor = isDark ? '#ffffff' : '#0f172a';
    const subTextColor = isDark ? '#94a3b8' : '#475569';
    const accentColor = '#6366f1'; // Indigo

    // 1. Background
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, height);

    // Decorative background glow
    if (isDark) {
      const grad = ctx.createRadialGradient(width / 2, 400, 50, width / 2, 400, 700);
      grad.addColorStop(0, 'rgba(99, 102, 241, 0.18)');
      grad.addColorStop(1, 'rgba(11, 15, 25, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
    }

    // Outer card border
    ctx.strokeStyle = cardBorderColor;
    ctx.lineWidth = 12;
    ctx.strokeRect(30, 30, width - 60, height - 60);

    // 2. Top Header - Restaurant Name
    ctx.fillStyle = textColor;
    ctx.font = 'bold 54px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(businessName.toUpperCase(), width / 2, 170);

    // Subtitle
    ctx.fillStyle = subTextColor;
    ctx.font = '500 28px system-ui, -apple-system, sans-serif';
    ctx.fillText('CONTACTLESS TABLE MENU', width / 2, 220);

    // 3. Table Number Badge
    const badgeWidth = 440;
    const badgeHeight = 110;
    const badgeX = (width - badgeWidth) / 2;
    const badgeY = 270;

    ctx.fillStyle = isDark ? '#1e1b4b' : '#e0e7ff';
    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, 55);
    ctx.fill();

    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.fillStyle = isDark ? '#818cf8' : '#4338ca';
    ctx.font = '900 52px system-ui, -apple-system, sans-serif';
    ctx.fillText(`TABLE ${tableNo}`, width / 2, badgeY + 74);

    // 4. Generate QR code on an offscreen canvas
    const qrCanvas = document.createElement('canvas');
    const orderUrl = getTableUrl(tableNo);
    await QRCode.toCanvas(qrCanvas, orderUrl, {
      width: 680,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#ffffff'
      },
      errorCorrectionLevel: 'H'
    });

    // Draw white container for QR code
    const qrBoxSize = 740;
    const qrBoxX = (width - qrBoxSize) / 2;
    const qrBoxY = 440;

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(qrBoxX, qrBoxY, qrBoxSize, qrBoxSize, 40);
    ctx.fill();

    ctx.strokeStyle = isDark ? '#334155' : '#cbd5e1';
    ctx.lineWidth = 4;
    ctx.stroke();

    // Draw QR image
    ctx.drawImage(qrCanvas, qrBoxX + 30, qrBoxY + 30, 680, 680);

    // Center icon badge on QR code
    const iconBadgeSize = 110;
    const iconBadgeX = (width - iconBadgeSize) / 2;
    const iconBadgeY = qrBoxY + (qrBoxSize - iconBadgeSize) / 2;

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(iconBadgeX, iconBadgeY, iconBadgeSize, iconBadgeSize, 24);
    ctx.fill();

    ctx.fillStyle = accentColor;
    ctx.font = 'bold 50px system-ui, sans-serif';
    ctx.fillText('🍽️', width / 2, iconBadgeY + 76);

    // 5. Instruction Section
    ctx.fillStyle = textColor;
    ctx.font = 'bold 42px system-ui, -apple-system, sans-serif';
    ctx.fillText('📱 Scan with Camera to View Menu', width / 2, 1260);

    ctx.fillStyle = subTextColor;
    ctx.font = '500 30px system-ui, -apple-system, sans-serif';
    ctx.fillText('No App Download Required • Instant Ordering', width / 2, 1315);

    // Bill notification banner at bottom
    const billBannerY = 1370;
    ctx.fillStyle = isDark ? '#141e33' : '#f1f5f9';
    ctx.beginPath();
    ctx.roundRect(140, billBannerY, width - 280, 110, 24);
    ctx.fill();

    ctx.fillStyle = isDark ? '#38bdf8' : '#0284c7';
    ctx.font = 'bold 30px system-ui, -apple-system, sans-serif';
    ctx.fillText('🧾 Finished dining? Tap "Get My Bill" on your phone', width / 2, billBannerY + 68);

    // 6. Footer
    ctx.fillStyle = isDark ? '#475569' : '#94a3b8';
    ctx.font = '500 22px system-ui, -apple-system, sans-serif';
    ctx.fillText('Powered by Zentiq POS • Digital Smart Dining', width / 2, 1540);
  };

  // Re-draw preview whenever settings change
  useEffect(() => {
    if (!isOpen || !canvasRef.current) return;
    drawCard(canvasRef.current, activePreviewTable, theme);
  }, [isOpen, activePreviewTable, theme, selectedLocationId, tenant]);

  if (!isOpen) return null;

  // Single Standee Card Download (1200 x 1600 PNG)
  const handleDownloadSingleCard = () => {
    if (!canvasRef.current) return;
    const link = document.createElement('a');
    link.download = `${tenant.id}-table-${activePreviewTable}-standee.png`;
    link.href = canvasRef.current.toDataURL('image/png', 1.0);
    link.click();
  };

  // Pure High-Res QR Code Only Download (1024 x 1024 PNG)
  const handleDownloadRawQr = async () => {
    const rawCanvas = document.createElement('canvas');
    await QRCode.toCanvas(rawCanvas, getTableUrl(activePreviewTable), {
      width: 1024,
      margin: 2,
      errorCorrectionLevel: 'H'
    });
    const link = document.createElement('a');
    link.download = `${tenant.id}-table-${activePreviewTable}-qr-raw-1024px.png`;
    link.href = rawCanvas.toDataURL('image/png', 1.0);
    link.click();
  };

  // Batch ZIP Download of All Tables (Tables startTable to endTable)
  const handleDownloadAllZip = async () => {
    if (startTable > endTable) {
      alert('Start table cannot be greater than End table');
      return;
    }

    setIsGeneratingZip(true);
    try {
      const zip = new JSZip();
      const standeesFolder = zip.folder('standee_cards_ready_to_print');
      const rawQrsFolder = zip.folder('raw_high_res_qr_codes');

      const tempCanvas = document.createElement('canvas');

      for (let tableNo = startTable; tableNo <= endTable; tableNo++) {
        // 1. Draw Standee Card
        await drawCard(tempCanvas, tableNo, theme);
        const cardBlob = await new Promise<Blob | null>((resolve) =>
          tempCanvas.toBlob((b) => resolve(b), 'image/png', 1.0)
        );
        if (cardBlob && standeesFolder) {
          standeesFolder.file(`Table_${tableNo}_Standee_1200x1600.png`, cardBlob);
        }

        // 2. Raw 1024px QR code
        const rawCanvas = document.createElement('canvas');
        await QRCode.toCanvas(rawCanvas, getTableUrl(tableNo), {
          width: 1024,
          margin: 2,
          errorCorrectionLevel: 'H'
        });
        const rawBlob = await new Promise<Blob | null>((resolve) =>
          rawCanvas.toBlob((b) => resolve(b), 'image/png', 1.0)
        );
        if (rawBlob && rawQrsFolder) {
          rawQrsFolder.file(`Table_${tableNo}_QR_Raw_1024px.png`, rawBlob);
        }
      }

      // Generate zip and trigger download
      const content = await zip.generateAsync({ type: 'blob' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(content);
      link.download = `${tenant.id}_Tables_${startTable}_to_${endTable}_QR_Standees.zip`;
      link.click();
    } catch (err: any) {
      alert('Failed to generate ZIP: ' + err.message);
    } finally {
      setIsGeneratingZip(false);
    }
  };

  // Browser Print Preview
  const handlePrint = () => {
    if (!canvasRef.current) return;
    const dataUrl = canvasRef.current.toDataURL('image/png');
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head>
          <title>Table ${activePreviewTable} Standee - ${businessName}</title>
          <style>
            @page { size: auto; margin: 0mm; }
            body { margin: 0; display: flex; align-items: center; justify-content: center; height: 100vh; background: #fff; }
            img { max-height: 95vh; max-width: 95vw; object-fit: contain; }
          </style>
        </head>
        <body>
          <img src="${dataUrl}" onload="window.print(); window.close();" />
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div className="bg-slate-900 border border-emerald-500/30 w-full max-w-5xl rounded-3xl p-6 shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="flex justify-between items-center border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
              <QrCode className="text-emerald-400" size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Table QR Standees & High-Res Downloads
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold">
                  Zero Web Payment
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                {businessName} • Download high-resolution cards for acrylic table stands or stickers
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800 transition-all cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content Body: Left Controls, Right Preview */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 pt-5 overflow-y-auto flex-1 pr-1">
          {/* Left Column: Settings & Batch Range (5 cols) */}
          <div className="md:col-span-5 space-y-4">
            {/* Branch Selector */}
            {locations.length > 1 && (
              <div>
                <label className="text-xs text-slate-300 font-semibold block mb-1">Select Branch</label>
                <select
                  value={selectedLocationId}
                  onChange={(e) => setSelectedLocationId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-xs text-white p-2.5 rounded-xl focus:outline-none focus:border-emerald-500"
                >
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Table Batch Range */}
            <div className="bg-slate-800/40 border border-slate-800 p-4 rounded-2xl space-y-3">
              <span className="text-xs font-bold text-white flex items-center gap-2">
                <Layers size={14} className="text-emerald-400" />
                Table Range to Generate
              </span>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">From Table #</label>
                  <input
                    type="number"
                    min={1}
                    value={startTable}
                    onChange={(e) => {
                      const v = Number(e.target.value) || 1;
                      setStartTable(v);
                      if (activePreviewTable < v) setActivePreviewTable(v);
                    }}
                    className="w-full bg-slate-900 border border-slate-700 text-sm text-white font-bold p-2.5 rounded-xl text-center focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">To Table #</label>
                  <input
                    type="number"
                    min={startTable}
                    value={endTable}
                    onChange={(e) => {
                      const v = Number(e.target.value) || startTable;
                      setEndTable(v);
                    }}
                    className="w-full bg-slate-900 border border-slate-700 text-sm text-white font-bold p-2.5 rounded-xl text-center focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
              <div className="text-[11px] text-slate-400 flex justify-between pt-1 border-t border-slate-800/80">
                <span>Total Tables:</span>
                <strong className="text-emerald-400 font-mono">
                  {Math.max(0, endTable - startTable + 1)} Tables
                </strong>
              </div>
            </div>

            {/* Standee Theme */}
            <div className="bg-slate-800/40 border border-slate-800 p-4 rounded-2xl space-y-2">
              <label className="text-xs font-bold text-white block">Standee Card Theme</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setTheme('DARK')}
                  className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                    theme === 'DARK'
                      ? 'bg-slate-950 text-white border-emerald-500 shadow-md shadow-emerald-500/10'
                      : 'bg-slate-800/50 text-slate-400 border-slate-700 hover:text-white'
                  }`}
                >
                  🌙 Sleek Dark Mode
                </button>
                <button
                  type="button"
                  onClick={() => setTheme('LIGHT')}
                  className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                    theme === 'LIGHT'
                      ? 'bg-white text-slate-900 border-emerald-500 shadow-md shadow-emerald-500/10'
                      : 'bg-slate-800/50 text-slate-400 border-slate-700 hover:text-white'
                  }`}
                >
                  ☀️ Classic Light Mode
                </button>
              </div>
            </div>

            {/* Direct URL copy */}
            <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 text-xs space-y-1.5">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">
                Direct Web Menu Link (Table {activePreviewTable})
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={getTableUrl(activePreviewTable)}
                  className="flex-1 bg-transparent text-[11px] font-mono text-slate-300 truncate focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(getTableUrl(activePreviewTable));
                    setCopiedUrl(true);
                    setTimeout(() => setCopiedUrl(false), 2000);
                  }}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 p-1.5 rounded-lg transition-all cursor-pointer"
                  title="Copy Link"
                >
                  {copiedUrl ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                </button>
              </div>
            </div>

            {/* Batch ZIP Download Action */}
            <div className="pt-1">
              <button
                type="button"
                onClick={handleDownloadAllZip}
                disabled={isGeneratingZip}
                className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs py-3.5 rounded-xl shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-50"
              >
                <FolderArchive size={16} />
                {isGeneratingZip
                  ? 'Packaging All Table Standees...'
                  : `Download All ${Math.max(0, endTable - startTable + 1)} Tables (.ZIP)`}
              </button>
              <p className="text-[10px] text-slate-500 text-center mt-1.5">
                Includes both print-ready 1200x1600 cards & 1024px raw QR codes for print shops
              </p>
            </div>
          </div>

          {/* Right Column: Live Standee Preview & Single Actions (7 cols) */}
          <div className="md:col-span-7 flex flex-col items-center justify-between bg-slate-950/80 p-5 rounded-2xl border border-slate-800">
            {/* Table Switcher Bar */}
            <div className="w-full flex items-center justify-between pb-3 border-b border-slate-800/80">
              <button
                type="button"
                disabled={activePreviewTable <= startTable}
                onClick={() => setActivePreviewTable((prev) => Math.max(startTable, prev - 1))}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-30 cursor-pointer"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-xs font-bold text-white flex items-center gap-2">
                Viewing Standee for:
                <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2.5 py-0.5 rounded-lg font-mono">
                  Table {activePreviewTable}
                </span>
              </span>
              <button
                type="button"
                disabled={activePreviewTable >= endTable}
                onClick={() => setActivePreviewTable((prev) => Math.min(endTable, prev + 1))}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-30 cursor-pointer"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            {/* Canvas Preview Container (Scales to fit modal) */}
            <div className="my-3 flex items-center justify-center w-full max-h-[380px] overflow-hidden rounded-xl shadow-2xl border border-slate-800">
              <canvas
                ref={canvasRef}
                className="max-h-[380px] w-auto object-contain rounded-xl shadow-2xl"
              />
            </div>

            {/* Individual Actions for Active Table */}
            <div className="w-full grid grid-cols-3 gap-2.5 pt-2">
              <button
                type="button"
                onClick={handleDownloadSingleCard}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs py-2.5 px-3 rounded-xl shadow-md shadow-emerald-600/20 flex items-center justify-center gap-1.5 cursor-pointer transition-all"
              >
                <Download size={14} />
                Download Card (1200x1600)
              </button>
              <button
                type="button"
                onClick={handleDownloadRawQr}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs py-2.5 px-3 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition-all"
                title="Download 1024x1024 QR only to scale to any size"
              >
                <QrCode size={14} />
                Raw QR (1024px)
              </button>
              <button
                type="button"
                onClick={handlePrint}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs py-2.5 px-3 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition-all"
              >
                <Printer size={14} />
                Print Standee
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
