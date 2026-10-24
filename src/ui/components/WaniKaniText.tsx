import { Text, type TextProps, type TextStyle } from 'react-native';

import { subjectColors } from '../theme/colors';
import { useTheme } from '../theme/ThemeProvider';

/** Interpret WaniKani's inline emphasis without treating API content as HTML. */
export function WaniKaniText({
  children,
  ...props
}: Omit<TextProps, 'children'> & { readonly children: string }) {
  const theme = useTheme();
  const colors: Readonly<Record<string, string>> =
    theme.scheme === 'dark'
      ? { radical: '#65D6F3', kanji: '#FF80C3', vocabulary: '#C3ACFF' }
      : {
          radical: subjectColors.radical.background,
          kanji: subjectColors.kanji.background,
          vocabulary: subjectColors.vocabulary.background,
        };
  const active: string[] = [];
  const parts = children.split(/(<[^>]+>)/g).map((part, index) => {
    const tag = /^<(\/?)([a-z_]+)(?:\s[^>]*)?\/?\s*>$/i.exec(part);
    if (tag !== null) {
      const name = tag[2]!.toLowerCase();
      if (name === 'br') return '\n';
      if (tag[1] === '/') {
        const opened = active.lastIndexOf(name);
        if (opened !== -1) active.splice(opened);
      } else {
        active.push(name);
      }
      return null;
    }
    const emphasis = active.filter((name) =>
      [
        'radical',
        'kanji',
        'vocabulary',
        'meaning',
        'reading',
        'b',
        'strong',
        'em',
        'i',
      ].includes(name),
    );
    const colorTag = [...emphasis]
      .reverse()
      .find((name) => colors[name] !== undefined);
    const style: TextStyle = {
      ...(emphasis.length > 0 ? { fontWeight: '700' } : {}),
      ...(colorTag === undefined ? {} : { color: colors[colorTag] }),
    };
    return part.length === 0 ? null : (
      <Text key={index} style={style}>
        {part}
      </Text>
    );
  });
  return <Text {...props}>{parts}</Text>;
}
