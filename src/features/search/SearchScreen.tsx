import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Card } from '@/ui/components/Card';
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
        padding: theme.spacing.xl,
      }}
      data={results}
      extraData={{ error, query, searching }}
      keyboardShouldPersistTaps="handled"
      keyExtractor={({ id }) => String(id)}
      style={{ backgroundColor: theme.colors.canvas }}
      ListHeaderComponent={
        <View style={{ gap: theme.spacing.lg }}>
          <View style={{ gap: theme.spacing.sm }}>
            <Text
              accessibilityRole="header"
              selectable
              style={[
                theme.typography.screenTitle,
                { color: theme.colors.text },
              ]}
            >
              Search
            </Text>
            <Text
              selectable
              style={[
                theme.typography.body,
                { color: theme.colors.textMuted },
              ]}
            >
              Find cached subjects by characters, readings, meanings, or
              synonyms.
            </Text>
          </View>
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
                borderWidth: 1,
                color: theme.colors.text,
                minHeight: minimumTouchTarget,
                paddingHorizontal: theme.spacing.lg,
              },
            ]}
            value={query}
          />
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
        query.trim().length > 0 && !searching && error === null ? (
          <Text
            selectable
            style={[
              theme.typography.body,
              { color: theme.colors.textMuted, paddingTop: theme.spacing.lg },
            ]}
          >
            No matching subjects
          </Text>
        ) : null
      }
      renderItem={({ item }) => (
        <Pressable
          accessibilityLabel={`Open ${item.primaryMeaning}`}
          accessibilityRole="button"
          onPress={() => onOpenSubject(item.id)}
          style={{ minHeight: minimumTouchTarget }}
        >
          <Card
            style={{
              alignItems: 'center',
              flexDirection: 'row',
              gap: theme.spacing.lg,
            }}
          >
            <Text
              selectable
              style={[
                theme.typography.screenTitle,
                { color: theme.colors.text, minWidth: 52 },
              ]}
            >
              {item.characters ?? '◻︎'}
            </Text>
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
          </Card>
        </Pressable>
      )}
    />
  );
}
