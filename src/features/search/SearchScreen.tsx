import { useRef, useState } from 'react';
import { ChevronRight, Search as SearchIcon } from 'lucide-react-native';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Card } from '@/ui/components/Card';
import { PageHeading } from '@/ui/components/PageHeading';
import { SubjectGlyph } from '@/ui/components/SubjectGlyph';
import { useScreenPadding } from '@/ui/theme/useScreenPadding';
import { SubjectChip } from '@/ui/components/SubjectChip';
import { minimumTouchTarget } from '@/ui/theme/spacing';
import { useTheme } from '@/ui/theme/ThemeProvider';
import type { SubjectSearchResult } from './search';

interface SearchScreenProps {
  readonly loadResults: (
    query: string,
  ) => Promise<readonly SubjectSearchResult[]>;
  readonly onOpenSubject: (subjectId: number) => void;
}

export function SearchScreen({
  loadResults,
  onOpenSubject,
}: SearchScreenProps) {
  const theme = useTheme();
  const screenPadding = useScreenPadding();
  const requestId = useRef(0);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<readonly SubjectSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = async (value: string) => {
    setQuery(value);
    setError(null);
    const normalized = value.trim();
    const currentRequest = requestId.current + 1;
    requestId.current = currentRequest;
    if (normalized.length === 0) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    try {
      const loaded = await loadResults(normalized);
      if (requestId.current === currentRequest) {
        setResults(loaded);
      }
    } catch {
      if (requestId.current === currentRequest) {
        setResults([]);
        setError('Unable to search the local library');
      }
    } finally {
      if (requestId.current === currentRequest) {
        setSearching(false);
      }
    }
  };

  return (
    <FlatList
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        flexGrow: 1,
        gap: theme.spacing.md,
        ...screenPadding,
      }}
      data={results}
      extraData={{ error, query, searching }}
      keyboardShouldPersistTaps="handled"
      keyExtractor={({ id }) => String(id)}
      style={{ backgroundColor: theme.colors.canvas }}
      ListHeaderComponent={
        <View style={{ gap: theme.spacing.lg }}>
          <PageHeading
            title="Search"
            eyebrow="EXPLORE YOUR LIBRARY"
            intro={
              <Text
                style={[
                  theme.typography.body,
                  { color: theme.colors.textMuted },
                ]}
              >
                Every kanji has a connection. Find yours.
              </Text>
            }
          />
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              backgroundColor: theme.colors.surface,
              borderWidth: 1,
              borderColor: theme.colors.border,
              borderRadius: 16,
              paddingHorizontal: 16,
            }}
          >
            <SearchIcon size={20} color={theme.colors.textMuted} />
            <TextInput
              accessibilityLabel="Search subjects"
              autoCapitalize="none"
              autoCorrect={false}
              clearButtonMode="while-editing"
              onChangeText={(value) => void search(value)}
              placeholder="Search your local library"
              placeholderTextColor={theme.colors.textMuted}
              returnKeyType="search"
              style={[
                theme.typography.body,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                  borderRadius: 14,
                  color: theme.colors.text,
                  minHeight: minimumTouchTarget,
                  flex: 1,
                  borderWidth: 0,
                  paddingVertical: 14,
                  paddingHorizontal: 0,
                },
              ]}
              value={query}
            />
          </View>
          {searching ? (
            <ActivityIndicator accessibilityLabel="Searching local library" />
          ) : null}
          {error === null ? null : (
            <Text
              accessibilityRole="alert"
              selectable
              style={[theme.typography.body, { color: theme.colors.danger }]}
            >
              {error}
            </Text>
          )}
        </View>
      }
      ListEmptyComponent={
        query.trim().length === 0 ? (
          <View
            style={{
              alignItems: 'center',
              gap: 14,
              paddingTop: 64,
              paddingHorizontal: 16,
            }}
          >
            <View
              style={{
                backgroundColor: theme.colors.accentSurface,
                borderRadius: 24,
                padding: 22,
              }}
            >
              <SearchIcon
                size={34}
                strokeWidth={1.5}
                color={theme.colors.accent}
              />
            </View>
            <Text
              style={[
                theme.typography.sectionTitle,
                { color: theme.colors.text },
              ]}
            >
              A whole language to explore
            </Text>
            <Text
              style={[
                theme.typography.body,
                { color: theme.colors.textMuted, textAlign: 'center' },
              ]}
            >
              Search by characters, readings, meanings, or your own synonyms.
              Available offline.
            </Text>
          </View>
        ) : !searching && error === null ? (
          <View style={{ gap: 8, paddingTop: 32 }}>
            <Text
              style={[
                theme.typography.sectionTitle,
                { color: theme.colors.text },
              ]}
            >
              No matching subjects
            </Text>
            <Text
              style={[theme.typography.body, { color: theme.colors.textMuted }]}
            >
              Try a meaning, reading, or different spelling.
            </Text>
          </View>
        ) : null
      }
      renderItem={({ item }) => (
        <Pressable
          accessibilityLabel={`Open ${item.primaryMeaning}`}
          accessibilityRole="button"
          onPress={() => onOpenSubject(item.id)}
          style={({ pressed }) => ({
            minHeight: minimumTouchTarget,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Card
            style={{
              alignItems: 'center',
              flexDirection: 'row',
              gap: theme.spacing.lg,
            }}
          >
            <SubjectGlyph characters={item.characters} type={item.object} />
            <View style={{ flex: 1, gap: theme.spacing.xs }}>
              <Text
                selectable
                style={[
                  theme.typography.sectionTitle,
                  { color: theme.colors.text },
                ]}
              >
                {item.primaryMeaning}
              </Text>
              <Text
                selectable
                style={[
                  theme.typography.caption,
                  { color: theme.colors.textMuted },
                ]}
              >
                Level {item.level}
                {item.primaryReading === null
                  ? ''
                  : ` · ${item.primaryReading}`}
              </Text>
              <SubjectChip type={item.object} />
            </View>
            <ChevronRight size={18} color={theme.colors.textMuted} />
          </Card>
        </Pressable>
      )}
    />
  );
}
