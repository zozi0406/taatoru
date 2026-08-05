// Copyright 2025 David Sansome
// Copyright 2026 Taatoru contributors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// Modified by Taatoru from Tsurukame's LessonPickerViewController.swift at
// revision 8e18ddf7f12c44e91cb0ad63bab31af7440648ea.

import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  View,
} from 'react-native';

import type { SubjectResource } from '@/api/types';
import type { Database } from '@/db/Database';
import { NOT_EXCLUDED } from '@/db/repositories/AssignmentRepository';
import { SUBJECT_WITHIN_GRANTED_LEVEL } from '@/db/subscription';
import { Card } from '@/ui/components/Card';
import { SubjectChip } from '@/ui/components/SubjectChip';
import { minimumTouchTarget } from '@/ui/theme/spacing';
import { useTheme } from '@/ui/theme/ThemeProvider';
import { LessonSelection, groupLessonCandidates } from './selection';
import type { LessonCandidate, LessonSubjectType } from './types';

export interface LessonPickerItem extends LessonCandidate {
  readonly characters: string | null;
  readonly primaryMeaning: string;
}

interface LessonPickerScreenProps {
  readonly loadCandidates: () => Promise<readonly LessonPickerItem[]>;
  readonly onBegin: (
    items: readonly LessonPickerItem[],
  ) => Promise<void>;
  readonly onCancel: () => void;
  readonly onSelectionChange: (
    items: readonly LessonPickerItem[],
  ) => Promise<void>;
  readonly restoredSelectedIds?: readonly number[];
}

type PickerRow =
  | {
      readonly key: string;
      readonly kind: 'level';
      readonly level: number;
    }
  | {
      readonly key: string;
      readonly kind: 'type';
      readonly subjectType: LessonSubjectType;
      readonly count: number;
    }
  | {
      readonly key: string;
      readonly kind: 'item';
      readonly item: LessonPickerItem;
    };

export function LessonPickerScreen({
  loadCandidates,
  onBegin,
  onCancel,
  onSelectionChange,
  restoredSelectedIds = [],
}: LessonPickerScreenProps) {
  const theme = useTheme();
  const [selection, setSelection] = useState<LessonSelection | null>(null);
  const [items, setItems] = useState<readonly LessonPickerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const restoredKey = restoredSelectedIds.join(',');

  useEffect(() => {
    let active = true;
    void loadCandidates()
      .then((loaded) => {
        if (!active) return;
        setItems(loaded);
        setSelection(new LessonSelection(
          loaded,
          restoredKey.length === 0
            ? []
            : restoredKey.split(',').map(Number),
        ));
      })
      .catch(() => {
        if (active) {
          setMessage('Unable to load lessons from this device.');
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [loadCandidates, restoredKey]);

  const selectedItems = (): readonly LessonPickerItem[] => {
    const selectedIds = new Set(selection?.selectedIds ?? []);
    return items.filter(({ subjectId }) => selectedIds.has(subjectId));
  };

  const toggle = async (subjectId: number) => {
    selection?.toggle(subjectId);
    setRevision((value) => value + 1);
    setMessage(null);
    try {
      await onSelectionChange(selectedItems());
    } catch {
      setMessage('Unable to preserve this selection on your device.');
    }
  };

  const begin = async () => {
    const current = selection;
    if (current === null || !current.canBegin) {
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const latest = await loadCandidates();
      current.revalidate(latest);
      setItems(latest);
      setRevision((value) => value + 1);
      const selectedIds = new Set(current.selectedIds);
      const selected = latest.filter(({ subjectId }) =>
        selectedIds.has(subjectId),
      );
      await onSelectionChange(selected);
      if (selected.length === 0) {
        setMessage(
          'Your selection changed because some lessons are no longer available.',
        );
        return;
      }
      await onBegin(selected);
    } catch {
      setMessage('Unable to begin these lessons.');
    } finally {
      setBusy(false);
    }
  };

  const rows = pickerRows(items);
  const selectedCount = selection?.selectedCount ?? 0;
  return (
    <FlatList
      testID="lesson-picker-list"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        flexGrow: 1,
        gap: theme.spacing.sm,
        padding: theme.spacing.xl,
      }}
      data={rows}
      extraData={{ busy, message, revision }}
      keyExtractor={({ key }) => key}
      style={{ backgroundColor: theme.colors.canvas }}
      ListHeaderComponent={
        <View style={{ gap: theme.spacing.md }}>
          <Text
            accessibilityRole="header"
            selectable
            style={[
              theme.typography.screenTitle,
              { color: theme.colors.text },
            ]}
          >
            Lesson picker
          </Text>
          <Text
            selectable
            style={[
              theme.typography.body,
              { color: theme.colors.textMuted },
            ]}
          >
            Choose exactly which available subjects to learn.
          </Text>
          <Text
            accessibilityLiveRegion="polite"
            selectable
            style={[
              theme.typography.label,
              { color: theme.colors.text },
            ]}
          >
            {selectedCount} selected
          </Text>
          <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
            <ActionButton
              disabled={busy || selectedCount === 0}
              label={busy ? 'Preparing…' : 'Begin'}
              accessibilityLabel="Begin selected lessons"
              onPress={() => void begin()}
              primary
            />
            <ActionButton
              disabled={busy}
              label="Cancel"
              accessibilityLabel="Cancel lesson selection"
              onPress={onCancel}
            />
          </View>
          {loading ? (
            <ActivityIndicator accessibilityLabel="Loading available lessons" />
          ) : null}
          {message === null ? null : (
            <Text
              accessibilityRole="alert"
              selectable
              style={[theme.typography.body, { color: theme.colors.danger }]}
            >
              {message}
            </Text>
          )}
        </View>
      }
      ListEmptyComponent={
        loading ? null : (
          <Text
            selectable
            style={[
              theme.typography.body,
              { color: theme.colors.textMuted, paddingTop: theme.spacing.lg },
            ]}
          >
            No lessons are currently available.
          </Text>
        )
      }
      renderItem={({ item: row }) => {
        if (row.kind === 'level') {
          return (
            <Text
              accessibilityRole="header"
              selectable
              style={[
                theme.typography.sectionTitle,
                {
                  color: theme.colors.text,
                  paddingTop: theme.spacing.lg,
                },
              ]}
            >
              Level {row.level}
            </Text>
          );
        }
        if (row.kind === 'type') {
          return (
            <Text
              selectable
              style={[
                theme.typography.caption,
                { color: theme.colors.textMuted },
              ]}
            >
              {subjectTypeLabel(row.subjectType)} ({row.count})
            </Text>
          );
        }
        const checked =
          selection?.isSelected(row.item.subjectId) ?? false;
        return (
          <Pressable
            accessibilityLabel={row.item.primaryMeaning}
            accessibilityRole="checkbox"
            accessibilityState={{ checked }}
            onPress={() => void toggle(row.item.subjectId)}
            style={{ minHeight: minimumTouchTarget }}
          >
            <Card
              style={{
                alignItems: 'center',
                borderColor: checked
                  ? theme.colors.accent
                  : theme.colors.border,
                borderWidth: checked ? 2 : 1,
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
                {row.item.characters ?? '◻︎'}
              </Text>
              <View style={{ flex: 1, gap: theme.spacing.xs }}>
                <Text
                  selectable
                  style={[
                    theme.typography.sectionTitle,
                    { color: theme.colors.text },
                  ]}
                >
                  {row.item.primaryMeaning}
                </Text>
                <SubjectChip type={row.item.subjectType} />
              </View>
              <Text
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={[
                  theme.typography.sectionTitle,
                  { color: theme.colors.accent },
                ]}
              >
                {checked ? '✓' : ''}
              </Text>
            </Card>
          </Pressable>
        );
      }}
    />
  );
}

export async function loadLessonPickerItems(
  db: Database,
): Promise<readonly LessonPickerItem[]> {
  const rows = await db.all<{
    assignmentId: number;
    lessonPosition: number;
    level: number;
    resourceJson: string;
    subjectId: number;
    subjectType: LessonSubjectType;
  }>(
    `SELECT a.id AS assignmentId,
            a.subject_id AS subjectId,
            s.object AS subjectType,
            s.level,
            s.lesson_position AS lessonPosition,
            s.resource_json AS resourceJson
     FROM assignments a
     JOIN subjects s ON s.id = a.subject_id
     WHERE a.srs_stage = 0
       AND a.unlocked_at IS NOT NULL
       AND a.started_at IS NULL
       AND a.hidden = 0
       AND s.hidden_at IS NULL
       AND ${SUBJECT_WITHIN_GRANTED_LEVEL}
       AND ${NOT_EXCLUDED}
     ORDER BY s.level, s.lesson_position, s.id`,
  );
  return rows.map((row) => {
    const subject = JSON.parse(row.resourceJson) as SubjectResource;
    return {
      assignmentId: row.assignmentId,
      available: true,
      characters: subject.data.characters,
      excluded: false,
      lessonPosition: row.lessonPosition,
      level: row.level,
      primaryMeaning:
        subject.data.meanings.find(({ primary }) => primary)?.meaning ??
        subject.data.meanings[0]?.meaning ??
        subject.data.slug,
      subjectId: row.subjectId,
      subjectType: row.subjectType,
    };
  });
}

function pickerRows(items: readonly LessonPickerItem[]): readonly PickerRow[] {
  return groupLessonCandidates(items).flatMap((group) => [
    {
      key: `level-${group.level}`,
      kind: 'level' as const,
      level: group.level,
    },
    ...group.sections.flatMap((section) => [
      {
        key: `level-${group.level}-type-${section.subjectType}`,
        kind: 'type' as const,
        subjectType: section.subjectType,
        count: section.items.length,
      },
      ...section.items.map((item) => ({
        key: `subject-${item.subjectId}`,
        kind: 'item' as const,
        item: item as LessonPickerItem,
      })),
    ]),
  ]);
}

function subjectTypeLabel(subjectType: LessonSubjectType): string {
  switch (subjectType) {
    case 'radical':
      return 'Radicals';
    case 'kanji':
      return 'Kanji';
    case 'vocabulary':
      return 'Vocabulary';
    case 'kana_vocabulary':
      return 'Kana vocabulary';
  }
}

function ActionButton({
  accessibilityLabel,
  disabled,
  label,
  onPress,
  primary = false,
}: {
  readonly accessibilityLabel: string;
  readonly disabled: boolean;
  readonly label: string;
  readonly onPress: () => void;
  readonly primary?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        alignItems: 'center',
        backgroundColor: primary
          ? theme.colors.accent
          : theme.colors.surfaceMuted,
        borderCurve: 'continuous',
        borderRadius: 12,
        justifyContent: 'center',
        minHeight: minimumTouchTarget,
        opacity: disabled ? 0.5 : 1,
        paddingHorizontal: theme.spacing.lg,
      }}
    >
      <Text
        style={[
          theme.typography.label,
          {
            color: primary
              ? theme.colors.accentForeground
              : theme.colors.accent,
          },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}
