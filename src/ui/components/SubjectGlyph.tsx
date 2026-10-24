import { Image, StyleSheet, Text, View } from 'react-native';
import { Shapes } from 'lucide-react-native';
import { SvgUri } from 'react-native-svg';

import type { SubjectObject } from '@/api/types';
import { subjectColors } from '../theme/colors';

/** A subject's identity stays consistent in search, selection, and details. */
export function SubjectGlyph({
  characters,
  type,
  image,
}: {
  readonly characters: string | null;
  readonly type: SubjectObject;
  readonly image?: { readonly url: string; readonly content_type: string };
}) {
  const colors = subjectColors[type];
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.tile, { backgroundColor: colors.background }]}
    >
      {characters !== null ? (
        <Text
          adjustsFontSizeToFit
          numberOfLines={1}
          style={[styles.glyph, { color: colors.foreground }]}
        >
          {characters}
        </Text>
      ) : image?.content_type === 'image/svg+xml' ? (
        <SvgUri height={36} width={36} uri={image.url} />
      ) : image !== undefined ? (
        <Image source={{ uri: image.url }} style={styles.image} />
      ) : (
        <Shapes color={colors.foreground} size={28} strokeWidth={1.6} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    alignItems: 'center',
    borderRadius: 14,
    height: 62,
    justifyContent: 'center',
    padding: 6,
    width: 62,
  },
  glyph: { fontSize: 28, fontWeight: '500' },
  image: { height: 36, width: 36 },
});
