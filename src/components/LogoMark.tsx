import React from 'react';
import Svg, {Path} from 'react-native-svg';
import {colors} from '../theme';

/**
 * The "Loop" mark: an open ring (recurring tasks) with a checkmark (done).
 * Path data is identical to the Android launcher icon
 * (android/app/src/main/res/drawable/ic_launcher_foreground.xml) so the
 * in-app mark and the app icon are the same shape, not just similar.
 */
export function LogoMark({size = 28}: {size?: number}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 108 108">
      <Path
        d="M78,54 A24,24 0 1,1 54,30"
        fill="none"
        stroke={colors.accent}
        strokeWidth={6.5}
        strokeLinecap="round"
      />
      <Path
        d="M41,57 L50,65 L68,44"
        fill="none"
        stroke={colors.success}
        strokeWidth={6.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
