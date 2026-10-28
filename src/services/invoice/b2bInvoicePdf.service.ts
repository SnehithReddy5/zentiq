import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { CKOrder, CKProfile } from '../../types/centralKitchen.types';
import { TenantBranding } from '../../types/tenant.types';

export class B2BInvoicePdfService {
  /**
   * Generates a printable, compliant Indian B2B GST Tax Invoice HTML string
   */
  static generateInvoiceHtml(order: CKOrder, ckProfile?: CKProfile | null, branding?: TenantBranding | null): string {
    const invoiceNo = order.invoiceNumber || `INV-CK-${order.orderNumber}`;
    const invoiceDate = new Date().toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });

    const isPaid = order.paymentStatus === 'PAID';
    const subtotal = order.subtotal || order.items.reduce((sum, it) => sum + it.amount, 0);
    const cgst = Number((subtotal * 0.025).toFixed(2));
    const sgst = Number((subtotal * 0.025).toFixed(2));
    const totalTax = Number((cgst + sgst).toFixed(2));
    const grandTotal = Number((subtotal + totalTax).toFixed(2));

    const supplierGstin = ckProfile?.gstin?.trim() || branding?.gstin?.trim() || 'GSTIN Pending';
    const supplierFssai = ckProfile?.fssaiNumber?.trim() || branding?.fssaiNumber?.trim() || 'FSSAI Lic. Pending';
    const supplierName = ckProfile?.businessName || branding?.displayName || branding?.businessName || order.sellerBusinessName || 'CENTRAL KITCHEN HUB';

    const itemsHtml = order.items
      .map(
        (it, idx) => `
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 10px 8px; text-align: center; color: #64748b; font-size: 11px;">${idx + 1}</td>
          <td style="padding: 10px 8px;">
            <div style="font-weight: 700; color: #1e293b; font-size: 13px;">${it.name}</div>
            <div style="color: #64748b; font-size: 10px;">${it.category || 'Prepared Food Base'}</div>
          </td>
          <td style="padding: 10px 8px; text-align: center; font-family: monospace; font-size: 11px; color: #475569;">2106</td>
          <td style="padding: 10px 8px; text-align: right; font-weight: 600; font-size: 12px;">${it.quantity} ${it.unit}</td>
          <td style="padding: 10px 8px; text-align: right; font-size: 12px;">&#8377;${it.ratePerUnit.toFixed(2)}</td>
          <td style="padding: 10px 8px; text-align: right; font-weight: 700; color: #0f172a; font-size: 12px;">&#8377;${it.amount.toFixed(2)}</td>
        </tr>
      `
      )
      .join('');

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>GST Tax Invoice - ${invoiceNo}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      margin: 0;
      padding: 24px;
      color: #0f172a;
      background: #ffffff;
      font-size: 12px;
    }
    .header-box {
      border-bottom: 2px solid #4f46e5;
      padding-bottom: 14px;
      margin-bottom: 16px;
    }
    .title-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    .invoice-title {
      font-size: 20px;
      font-weight: 900;
      color: #4f46e5;
      letter-spacing: 0.5px;
    }
    .invoice-subtitle {
      font-size: 10px;
      color: #64748b;
      margin-top: 2px;
      text-transform: uppercase;
      font-weight: 600;
    }
    .meta-box {
      text-align: right;
    }
    .meta-badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 6px;
      font-weight: 800;
      font-size: 11px;
      text-transform: uppercase;
      margin-bottom: 4px;
    }
    .badge-paid {
      background: #dcfce7;
      color: #15803d;
      border: 1px solid #86efac;
    }
    .badge-unpaid {
      background: #fef3c7;
      color: #b45309;
      border: 1px solid #fde68a;
    }
    .party-grid {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 20px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 12px 16px;
    }
    .party-col {
      flex: 1;
    }
    .party-label {
      font-size: 9px;
      font-weight: 800;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 4px;
    }
    .party-name {
      font-size: 14px;
      font-weight: 800;
      color: #0f172a;
    }
    .party-details {
      font-size: 11px;
      color: #475569;
      margin-top: 3px;
      line-height: 1.4;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 16px;
    }
    th {
      background: #f1f5f9;
      color: #475569;
      font-size: 10px;
      font-weight: 800;
      text-transform: uppercase;
      padding: 8px;
      border-top: 1px solid #cbd5e1;
      border-bottom: 2px solid #cbd5e1;
    }
    .totals-container {
      display: flex;
      justify-content: flex-end;
      margin-top: 10px;
    }
    .totals-table {
      width: 320px;
      border-collapse: collapse;
    }
    .totals-table td {
      padding: 5px 8px;
      font-size: 12px;
    }
    .totals-table .label {
      color: #64748b;
    }
    .totals-table .val {
      text-align: right;
      font-weight: 600;
      color: #1e293b;
    }
    .grand-total-row td {
      border-top: 2px solid #0f172a;
      border-bottom: 2px solid #0f172a;
      padding: 8px 8px;
      font-size: 15px;
      font-weight: 900;
      color: #4f46e5;
    }
    .footer-note {
      margin-top: 30px;
      padding-top: 12px;
      border-top: 1px dashed #cbd5e1;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    .terms {
      font-size: 10px;
      color: #94a3b8;
      max-width: 350px;
      line-height: 1.4;
    }
    .stamp-box {
      text-align: center;
      padding: 10px 20px;
      border: 2px dashed #94a3b8;
      border-radius: 8px;
      font-size: 10px;
      color: #64748b;
      font-weight: 700;
    }
  </style>
</head>
<body>
  <div class="header-box">
    <div class="title-row">
      <div>
        <div class="invoice-title">TAX INVOICE</div>
        <div class="invoice-subtitle">Rule 46 of CGST Rules, 2017 &bull; B2B Wholesale Supply</div>
      </div>
      <div class="meta-box">
        <div class="meta-badge ${isPaid ? 'badge-paid' : 'badge-unpaid'}">
          ${isPaid ? `&#10003; PAID (${order.paymentMode || 'ONLINE'})` : 'PENDING PAYMENT'}
        </div>
        <div style="font-weight: 800; font-size: 13px; color: #1e293b;">${invoiceNo}</div>
        <div style="font-size: 11px; color: #64748b;">Date: ${invoiceDate}</div>
      </div>
    </div>
  </div>

  <div class="party-grid">
    <div class="party-col">
      <div class="party-label">SUPPLIER (CENTRAL KITCHEN)</div>
      <div class="party-name">${supplierName}</div>
      <div class="party-details">
        <b>GSTIN:</b> ${supplierGstin}<br>
        <b>FSSAI Lic:</b> ${supplierFssai}<br>
        ${ckProfile?.partnerCode ? `<b>Partner Code:</b> ${ckProfile.partnerCode}` : ''}
      </div>
    </div>
    <div class="party-col">
      <div class="party-label">BUYER (RESTAURANT OUTLET)</div>
      <div class="party-name">${order.buyerBusinessName}</div>
      <div class="party-details">
        <b>Shift:</b> ${order.deliveryShift.replace(/_/g, ' ')}<br>
        <b>Delivery Date:</b> ${order.shiftDate || invoiceDate}<br>
        <b>Order Ref:</b> #${order.orderNumber}
      </div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width: 30px; text-align: center;">#</th>
        <th style="text-align: left;">Item Description</th>
        <th style="text-align: center; width: 60px;">HSN</th>
        <th style="text-align: right; width: 80px;">Qty</th>
        <th style="text-align: right; width: 90px;">Rate</th>
        <th style="text-align: right; width: 100px;">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${itemsHtml}
    </tbody>
  </table>

  <div class="totals-container">
    <table class="totals-table">
      <tr>
        <td class="label">Taxable Subtotal:</td>
        <td class="val">&#8377;${subtotal.toFixed(2)}</td>
      </tr>
      <tr>
        <td class="label">CGST (2.5%):</td>
        <td class="val">&#8377;${cgst.toFixed(2)}</td>
      </tr>
      <tr>
        <td class="label">SGST (2.5%):</td>
        <td class="val">&#8377;${sgst.toFixed(2)}</td>
      </tr>
      <tr class="grand-total-row">
        <td>TOTAL INVOICE:</td>
        <td style="text-align: right;">&#8377;${grandTotal.toFixed(2)}</td>
      </tr>
    </table>
  </div>

  <div class="footer-note">
    <div class="terms">
      <b>Declaration:</b> We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct. Goods once received in verified hygiene batch are non-returnable.
    </div>
    <div class="stamp-box">
      AUTHORIZED SIGNATORY<br>
      <span style="font-size: 8px; font-weight: normal; color: #94a3b8;">Central Kitchen Dispatch Desk</span>
    </div>
  </div>
</body>
</html>
    `;
  }

  /**
   * Generates PDF file and downloads directly to device storage (Downloads folder)
   */
  static async downloadAndShareInvoicePdf(
    order: CKOrder,
    ckProfile?: CKProfile | null,
    branding?: TenantBranding | null
  ): Promise<{ success: boolean; method: 'DOWNLOAD' | 'SHARE' }> {
    const html = this.generateInvoiceHtml(order, ckProfile, branding);
    const filename = `Invoice_${order.orderNumber || Date.now()}`;

    // A. Web Browser Direct File Download (Windows, Mac, Linux)
    // NEVER call Print.printToFileAsync on web because expo-print calls window.print() (which prints the screen)
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      try {
        const { jsPDF } = await import('jspdf');
        const html2canvas = (await import('html2canvas')).default;

        // Create detached off-screen container for rendering the invoice HTML
        const container = document.createElement('div');
        container.style.position = 'fixed';
        container.style.left = '-9999px';
        container.style.top = '0';
        container.style.width = '794px'; // standard A4 at 96 DPI
        container.style.backgroundColor = '#ffffff';
        container.style.color = '#000000';
        container.innerHTML = html;
        document.body.appendChild(container);

        // Render to crisp canvas
        const canvas = await html2canvas(container, {
          scale: 2, // 2x resolution for razor-sharp text and borders
          useCORS: true,
          backgroundColor: '#ffffff',
          logging: false,
        });

        document.body.removeChild(container);

        // Convert canvas to real A4 PDF document
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF({
          orientation: 'portrait',
          unit: 'pt',
          format: 'a4',
        });

        const imgWidth = 595.28; // A4 width in pt
        const pageHeight = 841.89; // A4 height in pt
        const imgHeight = (canvas.height * imgWidth) / canvas.width;

        let heightLeft = imgHeight;
        let position = 0;

        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;

        while (heightLeft > 0) {
          position = heightLeft - imgHeight;
          pdf.addPage();
          pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
          heightLeft -= pageHeight;
        }

        // Direct download into Windows / browser Downloads folder!
        pdf.save(`${filename}.pdf`);
        return { success: true, method: 'DOWNLOAD' };
      } catch (webErr) {
        console.warn('jsPDF generation failed, falling back to clean standalone HTML download:', webErr);
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = `${filename}.html`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
        return { success: true, method: 'DOWNLOAD' };
      }
    }

    // B. Native Mobile (Android & iOS)
    const { uri } = await Print.printToFileAsync({ html });

    // B1. Android Direct Storage Download (Downloads folder via StorageAccessFramework)
    if (Platform.OS === 'android') {
      try {
        const legacyFs = require('expo-file-system/legacy');
        const saf = legacyFs?.StorageAccessFramework;
        if (saf) {
          const initialUri = saf.getUriForDirectoryInRoot('Download');
          const permission = await saf.requestDirectoryPermissionsAsync(initialUri);
          if (permission.granted) {
            const createdFileUri = await saf.createFileAsync(
              permission.directoryUri,
              filename,
              'application/pdf'
            );
            const base64Data = await legacyFs.readAsStringAsync(uri, {
              encoding: legacyFs.EncodingType.Base64,
            });
            await saf.writeAsStringAsync(createdFileUri, base64Data, {
              encoding: legacyFs.EncodingType.Base64,
            });
            return { success: true, method: 'DOWNLOAD' };
          }
        }
      } catch (safErr) {
        console.warn('Direct SAF download failed, falling back to system share:', safErr);
      }
    }

    // B2. iOS or fallback when user dismisses directory selector
    const isAvailable = await Sharing.isAvailableAsync().catch(() => false);
    if (isAvailable) {
      await Sharing.shareAsync(uri, {
        UTI: 'com.adobe.pdf',
        mimeType: 'application/pdf',
        dialogTitle: `Download B2B GST Invoice - #${order.orderNumber}`,
      });
      return { success: true, method: 'SHARE' };
    }

    throw new Error('Direct file download or storage is not available on this device');
  }
}
