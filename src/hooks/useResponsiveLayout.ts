import { useWindowDimensions } from 'react-native';

export type DeviceType = 'PHONE' | 'SMALL_TABLET' | 'LARGE_TABLET_POS' | 'DESKTOP_POS';

export interface ResponsiveLayout {
  width: number;
  height: number;
  isLandscape: boolean;
  deviceType: DeviceType;
  isPhone: boolean;
  isSmallTablet: boolean;
  isLargePOS: boolean;
  isDesktop: boolean;
  tableGridColumns: number;
  menuGridColumns: number;
  ordersGridColumns: number;
  isSplitView: boolean;
}

export const useResponsiveLayout = (): ResponsiveLayout => {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  let deviceType: DeviceType = 'PHONE';
  let isPhone = true;
  let isSmallTablet = false;
  let isLargePOS = false;
  let isDesktop = false;

  // Tablets & Desktops in Landscape:
  // On Tablets and iPads held in Portrait (height > width, width ~ 768 - 834px),
  // do NOT force side-by-side desktop layout or fixed 400px columns.
  // Only enable isLargePOS and isSplitView when the device is in Landscape with sufficient width.
  if (isLandscape && width >= 1100) {
    deviceType = 'DESKTOP_POS';
    isPhone = false;
    isLargePOS = true;
    isDesktop = true;
  } else if (isLandscape && width >= 900) {
    deviceType = 'LARGE_TABLET_POS';
    isPhone = false;
    isLargePOS = true;
  } else if (width >= 600) {
    deviceType = 'SMALL_TABLET';
    isPhone = false;
    isSmallTablet = true;
  }

  // Adaptive column calculations for tables, menu, and orders
  const tableGridColumns = width >= 1400 ? 8 : width >= 1100 ? (isLandscape ? 6 : 5) : width >= 800 ? (isLandscape ? 5 : 4) : width >= 600 ? 3 : 2;
  const menuGridColumns = width >= 1400 ? 4 : width >= 1100 ? (isLandscape ? 3 : 2) : width >= 800 ? (isLandscape ? 2 : 2) : 1;
  const ordersGridColumns = width >= 1200 ? (isLandscape ? 3 : 2) : width >= 768 ? 2 : 1;
  const isSplitView = isLandscape && width >= 900;

  return {
    width,
    height,
    isLandscape,
    deviceType,
    isPhone,
    isSmallTablet,
    isLargePOS,
    isDesktop,
    tableGridColumns,
    menuGridColumns,
    ordersGridColumns,
    isSplitView,
  };
};
