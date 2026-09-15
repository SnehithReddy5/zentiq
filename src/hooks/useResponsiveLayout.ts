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

  if (width >= 1100) {
    deviceType = 'DESKTOP_POS';
    isPhone = false;
    isLargePOS = true;
    isDesktop = true;
  } else if (width >= 800) {
    deviceType = 'LARGE_TABLET_POS';
    isPhone = false;
    isLargePOS = true;
  } else if (width >= 600) {
    deviceType = 'SMALL_TABLET';
    isPhone = false;
    isSmallTablet = true;
  }

  // Adaptive column calculations for tables, menu, and orders
  const tableGridColumns = width >= 1400 ? 8 : width >= 1100 ? 6 : width >= 800 ? (isLandscape ? 5 : 4) : width >= 600 ? 4 : 3;
  const menuGridColumns = width >= 1400 ? 4 : width >= 1100 ? 3 : width >= 800 ? 2 : width >= 600 ? 2 : 1;
  const ordersGridColumns = width >= 1200 ? 3 : width >= 768 ? 2 : 1;
  const isSplitView = isLargePOS;

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
