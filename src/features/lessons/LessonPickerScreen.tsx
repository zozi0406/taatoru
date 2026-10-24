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

import { useEffect, useRef, useState } from 'react';
import { Check, ArrowRight } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { PageHeading } from '@/ui/components/PageHeading';
import { SubjectGlyph } from '@/ui/components/SubjectGlyph';
import { useScreenPadding } from '@/ui/theme/useScreenPadding';
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
  readonly onBegin: (items: readonly LessonPickerItem[]) => Promise<void>;
  readonly onCancel: () => void | Promise<void>;
  readonly onSelectionChange: (
    items: readonly LessonPickerItem[],
  ) => Promise<void>;
  readonly restoredSelectedIds?: readonly number[];
  readonly maxSelection?: number;
  readonly selectionHint?: string;
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
      readonly level: number;
      readonly subjectIds: readonly number[];
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
  maxSelection = Number.POSITIVE_INFINITY,
  selectionHint,
}: LessonPickerScreenProps) {
  const theme = useTheme();
  const screenPadding = useScreenPadding();
  const insets = useSafeAreaInsets();
  const [selection, setSelection] = useState<LessonSelection | null>(null);
  const [items, setItems] = useState<readonly LessonPickerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const pendingSave = useRef<Promise<void>>(Promise.resolve());
  const actionInProgress = useRef(false);
  const restoredKey = restoredSelectedIds.join(',');

  useEffect(() => {
    let active = true;
    void loadCandidates()
      .then((loaded) => {
        if (!active) return;
        setItems(loaded);
        setSelection(
          new LessonSelection(
            loaded,
            restoredKey.length === 0 ? [] : restoredKey.split(',').map(Number),
            maxSelection,
          ),
        );
      })
      .catch(() => {
        if (active) {
          setLoadFailed(true);
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
  }, [loadCandidates, restoredKey, maxSelection, loadAttempt]);

  const selectedItems = (current = selection): readonly LessonPickerItem[] => {
    const selectedIds = new Set(current?.selectedIds ?? []);
    return items.filter(({ subjectId }) => selectedIds.has(subjectId));
  };

  const saveSelection = (selected: readonly LessonPickerItem[]) => {
    // A slow draft save must finish before a later draft, Begin, or Cancel.
    const next = pendingSave.current
      .catch(() => undefined)
      .then(() => onSelectionChange(selected));
    pendingSave.current = next;
    return next;
  };

  const updateSelection = async (
    update: (current: LessonSelection) => void,
  ) => {
    if (actionInProgress.current || selection === null) return;
    const nextSelection = new LessonSelection(
      items,
      selection.selectedIds,
      maxSelection,
    );
    update(nextSelection);
    setSelection(nextSelection);
    setRevision((value) => value + 1);
    setMessage(null);
    try {
      await saveSelection(selectedItems(nextSelection));
    } catch {
      setMessage('Unable to preserve this selection on your device.');
    }
  };

  const cancel = async () => {
    if (actionInProgress.current) return;
    actionInProgress.current = true;
    setBusy(true);
    try {
      await pendingSave.current.catch(() => undefined);
      await onCancel();
    } catch {
      setMessage('Unable to cancel this selection. Please try again.');
    } finally {
      actionInProgress.current = false;
      setBusy(false);
    }
  };

  const begin = async () => {
    const current =
      selection === null
        ? null
        : new LessonSelection(items, selection.selectedIds, maxSelection);
    if (actionInProgress.current || current === null || !current.canBegin) {
      return;
    }
    actionInProgress.current = true;
    setBusy(true);
    setMessage(null);
    try {
      const latest = await loadCandidates();
      current.revalidate(latest);
      setSelection(current);
      setItems(latest);
      setRevision((value) => value + 1);
      const selectedIds = new Set(current.selectedIds);
      const selected = latest.filter(({ subjectId }) =>
        selectedIds.has(subjectId),
      );
      await saveSelection(selected);
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
      actionInProgress.current = false;
      setBusy(false);
    }
  };

  const rows = pickerRows(items);
  const selectedCount = selection?.selectedCount ?? 0;
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.canvas }}>
      <FlatList
        testID="lesson-picker-list"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          flexGrow: 1,
          gap: theme.spacing.sm,
          ...screenPadding,
        }}
        data={rows}
        extraData={{ busy, message, revision }}
        keyExtractor={({ key }) => key}
        style={{ backgroundColor: theme.colors.canvas }}
        ListHeaderComponent={
          <View style={{ gap: theme.spacing.md }}>
            <PageHeading
              title="Choose lessons"
              eyebrow="LEARN YOUR WAY"
              intro={
                <Text
                  style={[
                    theme.typography.body,
                    { color: theme.colors.textMuted },
                  ]}
                >
                  Select subjects to study in your next lesson batch.
                </Text>
              }
            />
            {loading ? (
              <ActivityIndicator accessibilityLabel="Loading available lessons" />
            ) : null}
            {selectionHint === undefined ? null : (
              <Text
                style={[
                  theme.typography.caption,
                  { color: theme.colors.textMuted },
                ]}
              >
                {selectionHint}
              </Text>
            )}
            {loadFailed ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Retry loading lessons"
                onPress={() => {
                  setLoading(true);
                  setLoadFailed(false);
                  setMessage(null);
                  setLoadAttempt((attempt) => attempt + 1);
                }}
                style={{
                  minHeight: minimumTouchTarget,
                  justifyContent: 'center',
                }}
              >
                <Text
                  style={[
                    theme.typography.label,
                    { color: theme.colors.accent },
                  ]}
                >
                  Retry
                </Text>
              </Pressable>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          loading || loadFailed ? null : (
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
            const hasSelection = row.subjectIds.some((id) =>
              selection?.isSelected(id),
            );
            return (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: theme.spacing.sm,
                }}
              >
                <Text
                  style={[
                    theme.typography.caption,
                    { color: theme.colors.textMuted, flex: 1 },
                  ]}
                >
                  {subjectTypeLabel(row.subjectType)} ({row.count})
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${hasSelection ? 'Clear' : 'Select'} ${subjectTypeLabel(row.subjectType)} at level ${row.level}`}
                  disabled={busy || (!hasSelection && selection?.atLimit)}
                  onPress={() =>
                    void updateSelection((current) => {
                      if (hasSelection) current.deselect(row.subjectIds);
                      else current.select(row.subjectIds);
                    })
                  }
                  style={{
                    minHeight: minimumTouchTarget,
                    justifyContent: 'center',
                    paddingHorizontal: theme.spacing.sm,
                    opacity:
                      busy || (!hasSelection && selection?.atLimit) ? 0.5 : 1,
                  }}
                >
                  <Text
                    style={[
                      theme.typography.label,
                      { color: theme.colors.accent },
                    ]}
                  >
                    {hasSelection ? 'Clear' : 'Select group'}
                  </Text>
                </Pressable>
              </View>
            );
          }
          const checked = selection?.isSelected(row.item.subjectId) ?? false;
          return (
            <Pressable
              accessibilityLabel={row.item.primaryMeaning}
              accessibilityRole="checkbox"
              accessibilityState={{
                checked,
                disabled: busy || (!checked && selection?.atLimit),
              }}
              disabled={busy || (!checked && selection?.atLimit)}
              onPress={() =>
                void updateSelection((current) =>
                  current.toggle(row.item.subjectId),
                )
              }
              style={{ minHeight: minimumTouchTarget }}
            >
              <Card
                pointerEvents="none"
                style={{
                  alignItems: 'center',
                  borderColor: checked
                    ? theme.colors.accent
                    : theme.colors.border,
                  borderWidth: 1,
                  backgroundColor: checked
                    ? theme.colors.accentSurface
                    : theme.colors.surface,
                  flexDirection: 'row',
                  gap: theme.spacing.lg,
                }}
              >
                <SubjectGlyph
                  characters={row.item.characters}
                  type={row.item.subjectType}
                />
                <View style={{ flex: 1, gap: theme.spacing.xs }}>
                  <Text
                    style={[
                      theme.typography.sectionTitle,
                      { color: theme.colors.text },
                    ]}
                  >
                    {row.item.primaryMeaning}
                  </Text>
                  <SubjectChip type={row.item.subjectType} />
                </View>
                <View
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  style={{
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: checked
                      ? theme.colors.accent
                      : theme.colors.border,
                    backgroundColor: checked
                      ? theme.colors.accent
                      : theme.colors.surface,
                    height: 26,
                    width: 26,
                  }}
                >
                  {checked ? (
                    <Check
                      size={17}
                      color={theme.colors.accentForeground}
                      strokeWidth={2.5}
                    />
                  ) : null}
                </View>
              </Card>
            </Pressable>
          );
        }}
      />
      <View
        style={{
          gap: 12,
          paddingLeft: theme.spacing.xl + insets.left,
          paddingRight: theme.spacing.xl + insets.right,
          paddingTop: 16,
          paddingBottom: theme.spacing.xl + insets.bottom,
          backgroundColor: theme.colors.surface,
          borderTopWidth: 1,
          borderColor: theme.colors.border,
        }}
      >
        {message === null ? null : (
          <Text
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            style={[theme.typography.body, { color: theme.colors.danger }]}
          >
            {message}
          </Text>
        )}
        <Text
          accessibilityLiveRegion="polite"
          style={[theme.typography.label, { color: theme.colors.text }]}
        >
          {Number.isFinite(maxSelection)
            ? `${selectedCount} of ${maxSelection} selected`
            : `${selectedCount} selected`}
        </Text>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <ActionButton
            disabled={busy}
            label="Cancel"
            accessibilityLabel="Cancel lesson selection"
            onPress={() => void cancel()}
          />
          <ActionButton
            disabled={busy || selectedCount === 0}
            label={busy ? 'Preparing…' : 'Begin'}
            accessibilityLabel="Begin selected lessons"
            onPress={() => void begin()}
            primary
          />
        </View>
      </View>
    </View>
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
        level: group.level,
        subjectIds: section.items.map(({ subjectId }) => subjectId),
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
        flex: 1,
        flexDirection: 'row',
        gap: 10,
        paddingVertical: 12,
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
      {primary ? (
        <ArrowRight size={18} color={theme.colors.accentForeground} />
      ) : null}
    </Pressable>
  );
}
