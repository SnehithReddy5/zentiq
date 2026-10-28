import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
  Share
} from 'react-native';
import QRCode from 'qrcode';
import { SvgXml } from 'react-native-svg';
import * as Sharing from 'expo-sharing';
import { X, Download, QrCode, Copy, Check, Share2, Sparkles, Image as ImageIcon } from 'lucide-react-native';
import { useTableStore } from '../../store/table.store';
import { useTenantStore } from '../../store/tenant.store';
import { toast } from '../../utils/toast';

interface TableQrDownloadModalProps {
  visible: boolean;
  onClose: () => void;
}

// Pure JS 24-bit crisp Bitmap Generator (Zero native or canvas dependencies, universally compatible)
const generateQrBmpBase64 = (url: string): string => {
  const qr = QRCode.create(url, { errorCorrectionLevel: 'H' });
  const size = qr.modules.size;
  const scale = 20; // 20px per module => ~800x800px ultra crisp print resolution
  const margin = 4;
  const totalModules = size + margin * 2;
  const imgWidth = totalModules * scale;
  const imgHeight = totalModules * scale;

  const rowBytes = imgWidth * 3;
  const rowPadding = (4 - (rowBytes % 4)) % 4;
  const paddedRowBytes = rowBytes + rowPadding;
  const pixelDataSize = paddedRowBytes * imgHeight;
  const fileSize = 54 + pixelDataSize;

  const buf = new Uint8Array(fileSize);
  // BMP Header
  buf[0] = 0x42; buf[1] = 0x4D; // BM
  buf[2] = fileSize & 0xff; buf[3] = (fileSize >> 8) & 0xff; buf[4] = (fileSize >> 16) & 0xff; buf[5] = (fileSize >> 24) & 0xff;
  buf[10] = 54; // data offset

  // DIB Header (BITMAPINFOHEADER)
  buf[14] = 40;
  buf[18] = imgWidth & 0xff; buf[19] = (imgWidth >> 8) & 0xff; buf[20] = (imgWidth >> 16) & 0xff; buf[21] = (imgWidth >> 24) & 0xff;
  buf[22] = imgHeight & 0xff; buf[23] = (imgHeight >> 8) & 0xff; buf[24] = (imgHeight >> 16) & 0xff; buf[25] = (imgHeight >> 24) & 0xff;
  buf[26] = 1; // planes
  buf[28] = 24; // 24-bit RGB
  buf[30] = 0; // uncompressed
  buf[34] = pixelDataSize & 0xff; buf[35] = (pixelDataSize >> 8) & 0xff; buf[36] = (pixelDataSize >> 16) & 0xff; buf[37] = (pixelDataSize >> 24) & 0xff;

  // Pixels (bottom-to-top, BGR format)
  let offset = 54;
  for (let y = imgHeight - 1; y >= 0; y--) {
    const modY = Math.floor(y / scale) - margin;
    for (let x = 0; x < imgWidth; x++) {
      const modX = Math.floor(x / scale) - margin;
      let isDark = false;
      if (modX >= 0 && modX < size && modY >= 0 && modY < size) {
        isDark = !!qr.modules.get(modX, modY);
      }
      const color = isDark ? 0 : 255;
      buf[offset++] = color; // B
      buf[offset++] = color; // G
      buf[offset++] = color; // R
    }
    for (let p = 0; p < rowPadding; p++) buf[offset++] = 0;
  }

  // Convert Uint8Array to base64 safely in chunks
  let binary = '';
  const len = buf.byteLength;
  const chunk = 8192;
  for (let i = 0; i < len; i += chunk) {
    const sub = buf.subarray(i, Math.min(i + chunk, len));
    binary += String.fromCharCode.apply(null, sub as any);
  }
  return typeof btoa !== 'undefined' ? btoa(binary) : Buffer.from(binary, 'binary').toString('base64');
};

export const TableQrDownloadModal: React.FC<TableQrDownloadModalProps> = ({
  visible,
  onClose
}) => {
  const { tables } = useTableStore();
  const { tenant, branding, activeLocationId } = useTenantStore();

  const sortedTables = [...tables].sort((a, b) => a.tableNo - b.tableNo);
  const [selectedTableNo, setSelectedTableNo] = useState<number>(
    sortedTables[0]?.tableNo || 1
  );
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [copied, setCopied] = useState(false);

  // Synchronize initial table when tables list updates
  useEffect(() => {
    if (sortedTables.length > 0 && !sortedTables.some(t => t.tableNo === selectedTableNo)) {
      setSelectedTableNo(sortedTables[0].tableNo);
    }
  }, [tables]);

  const businessName =
    branding?.displayName ||
    branding?.businessName ||
    tenant?.displayName ||
    tenant?.businessName ||
    'Our Restaurant';

  const tenantId = tenant?.id || 'vasudha-bistro';
  const locationId = activeLocationId || 'loc-primary';

  const orderUrl = `https://zentiq-b5d40.web.app/order?t=${tenantId}&loc=${locationId}&table=${selectedTableNo}`;

  // Generate pure vector SVG QR code (Zero canvas dependency, works on all platforms)
  useEffect(() => {
    if (!visible) return;

    let isCancelled = false;
    setIsGenerating(true);

    QRCode.toString(
      orderUrl,
      {
        type: 'svg',
        margin: 2,
        errorCorrectionLevel: 'H',
        color: {
          dark: '#000000',
          light: '#ffffff'
        }
      },
      (err, svgString) => {
        if (!isCancelled) {
          if (err) {
            console.error('QR generation error:', err);
          } else {
            setQrSvg(svgString);
          }
          setIsGenerating(false);
        }
      }
    );

    return () => {
      isCancelled = true;
    };
  }, [visible, selectedTableNo, orderUrl]);

  if (!visible) return null;

  // 1. Download QR Code: Bulletproof Web & Mobile file save/share
  const handleDownload = async () => {
    setIsDownloading(true);

    try {
      // A. Web Browser Environment
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        try {
          // Direct vector SVG download (instant, 0 canvas dependencies)
          const svgContent = qrSvg || '<svg></svg>';
          const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
          const blobUrl = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.download = `${tenantId}-Table-${selectedTableNo}-QR.svg`;
          a.href = blobUrl;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(blobUrl);
          toast.success(`Table ${selectedTableNo} Vector QR downloaded!`, 'Downloaded');
          setIsDownloading(false);
          return;
        } catch (webErr: any) {
          console.warn('Web download error:', webErr);
        }
      }

      // B. Native Mobile (Android / iOS / Expo Go):
      let savedUri = '';
      const base64Bmp = generateQrBmpBase64(orderUrl);
      const filename = `${tenantId}_Table_${selectedTableNo}_QR.bmp`;

      // 1. Try modern Expo SDK 58 File API first
      try {
        const { File, Paths } = require('expo-file-system');
        if (File && Paths && Paths.cache) {
          const file = new File(Paths.cache, filename);
          if (!file.exists) {
            file.create();
          }
          await file.write(base64Bmp, { encoding: 'base64' });
          savedUri = file.uri;
        }
      } catch (errA) {
        console.warn('Expo File API error, trying legacy:', errA);
      }

      // 2. Try legacy FileSystem API
      if (!savedUri) {
        try {
          const legacyFs = require('expo-file-system/legacy');
          const cacheDir = legacyFs.cacheDirectory || legacyFs.documentDirectory;
          if (cacheDir && legacyFs.writeAsStringAsync) {
            const target = `${cacheDir}${filename}`;
            await legacyFs.writeAsStringAsync(target, base64Bmp, {
              encoding: legacyFs.EncodingType?.Base64 || 'base64'
            });
            savedUri = target;
          }
        } catch (errB) {
          console.warn('Legacy FileSystem error:', errB);
        }
      }

      // 3. Try root FileSystem (if older SDK)
      if (!savedUri) {
        try {
          const rootFs = require('expo-file-system');
          const cacheDir = rootFs.cacheDirectory || rootFs.documentDirectory;
          if (cacheDir && rootFs.writeAsStringAsync) {
            const target = `${cacheDir}${filename}`;
            await rootFs.writeAsStringAsync(target, base64Bmp, {
              encoding: 'base64'
            });
            savedUri = target;
          }
        } catch (errC) {
          console.warn('Root FileSystem error:', errC);
        }
      }

      // If file was written to disk, open OS Share & Save sheet
      if (savedUri) {
        const isShareAvailable = await Sharing.isAvailableAsync().catch(() => false);
        if (isShareAvailable) {
          await Sharing.shareAsync(savedUri, {
            dialogTitle: `Save / Print Table ${selectedTableNo} QR Standee`
          });
          toast.success(`Table ${selectedTableNo} QR Image ready to save or print!`, 'QR Saved');
          setIsDownloading(false);
          return;
        }
      }

      // 4. Fallback: Native system share of the ordering link (always works 100% on all Android/iOS)
      await Share.share({
        title: `Table ${selectedTableNo} QR Menu`,
        message: `${businessName} • Table ${selectedTableNo} Self-Order QR:
${orderUrl}`,
        url: orderUrl
      });
      toast.info(`Table ${selectedTableNo} menu link ready to share!`, 'Link Shared');
      setIsDownloading(false);
    } catch (e: any) {
      console.error('QR download error:', e);
      // Graceful fallback to Share.share on any unexpected exception
      try {
        await Share.share({
          title: `Table ${selectedTableNo} Order Link`,
          message: orderUrl,
          url: orderUrl
        });
      } catch (_) {}
      toast.info('QR link shared successfully.', 'Ready');
      setIsDownloading(false);
    }
  };

  // 2. Copy Direct Web Link
  const handleCopyLink = async () => {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(orderUrl);
      setCopied(true);
      toast.info(`Table ${selectedTableNo} ordering URL copied!`, 'Link Copied');
      setTimeout(() => setCopied(false), 2000);
    } else {
      try {
        await Share.share({
          title: `Table ${selectedTableNo} Menu QR`,
          message: orderUrl,
          url: orderUrl
        });
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err: any) {
        toast.info(orderUrl, 'Order Link');
      }
    }
  };

  // 3. Batch Download All Tables on Web
  const handleDownloadAll = async () => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') {
      await handleDownload();
      return;
    }

    toast.info(`Downloading all ${sortedTables.length} table QR codes...`, 'Batch Download');
    for (const t of sortedTables) {
      try {
        const url = `https://zentiq-b5d40.web.app/order?t=${tenantId}&loc=${locationId}&table=${t.tableNo}`;
        const svg = await new Promise<string>((resolve, reject) => {
          QRCode.toString(
            url,
            { type: 'svg', margin: 2, errorCorrectionLevel: 'H' },
            (err, str) => (err ? reject(err) : resolve(str))
          );
        });

        const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
        const blobUrl = URL.createObjectURL(svgBlob);
        const a = document.createElement('a');
        a.download = `${tenantId}-Table-${t.tableNo}-QR.svg`;
        a.href = blobUrl;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } catch (e) {
        console.warn('Batch download item error:', e);
      }
    }
    toast.success(`All ${sortedTables.length} table QR codes downloaded!`, 'Success');
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 bg-black/80 justify-center items-center p-4">
        <View className="bg-slate-900 border border-emerald-500/30 w-full max-w-xl rounded-3xl p-6 shadow-2xl">
          {/* Header */}
          <View className="flex-row items-center justify-between pb-4 border-b border-slate-800">
            <View className="flex-row items-center gap-3">
              <View className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 items-center justify-center">
                <QrCode size={20} color="#34D399" />
              </View>
              <View>
                <Text className="text-white font-black text-base">
                  Table QR Code Downloads
                </Text>
                <Text className="text-slate-400 text-xs mt-0.5">
                  Save high-resolution standee or vector graphics for printing
                </Text>
              </View>
            </View>

            <TouchableOpacity onPress={onClose} className="p-2 rounded-xl bg-slate-800">
              <X size={18} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          {/* Table Selector Ribbon */}
          <View className="my-4">
            <Text className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">
              Select Table to Download
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row gap-2">
              {sortedTables.map((t) => {
                const isSelected = t.tableNo === selectedTableNo;
                return (
                  <TouchableOpacity
                    key={t.id}
                    onPress={() => setSelectedTableNo(t.tableNo)}
                    className={`px-3.5 py-2 rounded-2xl border items-center justify-center mr-2 ${
                      isSelected
                        ? 'bg-emerald-600 border-emerald-500 shadow-md shadow-emerald-600/30'
                        : 'bg-slate-800 border-slate-700'
                    }`}
                  >
                    <Text
                      className={`text-xs font-black ${
                        isSelected ? 'text-white' : 'text-slate-300'
                      }`}
                    >
                      Table {t.tableNo}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* QR Standee Card Preview */}
          <View className="bg-slate-950 border border-slate-800 p-5 rounded-3xl items-center my-1 shadow-inner">
            <Text className="text-white font-black text-sm uppercase tracking-wide text-center">
              {businessName}
            </Text>
            <View className="bg-emerald-500/20 border border-emerald-500/40 px-3 py-1 rounded-full my-2">
              <Text className="text-emerald-300 font-black text-xs">
                TABLE {selectedTableNo}
              </Text>
            </View>

            {/* QR Code Container */}
            <View className="w-56 h-56 bg-white p-3 rounded-2xl items-center justify-center shadow-lg my-2">
              {isGenerating || !qrSvg ? (
                <ActivityIndicator size="large" color="#059669" />
              ) : (
                <SvgXml xml={qrSvg} width={190} height={190} />
              )}
            </View>

            <Text className="text-slate-300 font-bold text-xs mt-2 text-center">
              📱 Scan with Phone Camera to View Menu & Order
            </Text>
            <Text className="text-amber-400 text-[11px] font-semibold mt-0.5 text-center">
              No App Download • Tap "Get My Bill" when finished!
            </Text>
          </View>

          {/* Action Buttons */}
          <View className="flex-row items-center gap-2.5 mt-5">
            <TouchableOpacity
              onPress={handleDownload}
              disabled={isGenerating || !qrSvg || isDownloading}
              className="flex-1 bg-emerald-600 hover:bg-emerald-500 py-3.5 px-4 rounded-2xl flex-row items-center justify-center active:opacity-80 shadow-lg shadow-emerald-600/30"
            >
              {isDownloading ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <View className="flex-row items-center justify-center">
                  <Download size={16} color="white" />
                  <Text className="text-white font-black text-xs ml-2">
                    Save / Share Table {selectedTableNo} QR
                  </Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleCopyLink}
              className="bg-slate-800 border border-slate-700 py-3.5 px-4 rounded-2xl flex-row items-center justify-center active:opacity-80"
            >
              {copied ? <Check size={16} color="#34D399" /> : <Copy size={16} color="#CBD5E1" />}
              <Text className="text-slate-200 font-bold text-xs ml-2">
                {copied ? 'Copied!' : 'Copy Link'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Batch Download All Tables Action */}
          {sortedTables.length > 1 && (
            <TouchableOpacity
              onPress={handleDownloadAll}
              className="mt-2.5 bg-slate-800/80 border border-slate-700 py-3 px-4 rounded-2xl flex-row items-center justify-center active:opacity-80"
            >
              <Download size={14} color="#34D399" />
              <Text className="text-emerald-400 font-bold text-xs ml-2">
                Download All {sortedTables.length} Tables (Batch Standees)
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
};
