import { useRef, useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import { Card } from '@/ui/components/Card';
import { Screen } from '@/ui/components/Screen';
import { useTheme } from '@/ui/theme/ThemeProvider';
import { StudyAction } from '@/features/sessions/StudySubjectInformation';
import type {
  StudySettings,
  ReviewOrder,
  QuestionOrder,
} from './studySettings';

export function StudySettingsScreen({
  settings,
  onSave,
  onClose,
}: {
  readonly settings: StudySettings;
  readonly onSave: (settings: StudySettings) => Promise<void>;
  readonly onClose?: () => void;
}) {
  const theme = useTheme();
  const [draft, setDraft] = useState(settings);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const working = useRef(false);
  const set = <K extends keyof StudySettings>(
    key: K,
    value: StudySettings[K],
  ) => {
    setDraft((old) => ({ ...old, [key]: value }));
    setMessage(null);
  };
  const toggle = (
    key:
      | 'exactMatch'
      | 'allowOverrides'
      | 'autoAdvance'
      | 'showFullAnswer'
      | 'prioritizeCurrentLevel'
      | 'showKanaVocabulary'
      | 'autoplay',
    title: string,
    detail: string,
  ) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ flex: 1, gap: 5 }}>
        <Text style={[theme.typography.label, { color: theme.colors.text }]}>
          {title}
        </Text>
        <Text
          style={[theme.typography.caption, { color: theme.colors.textMuted }]}
        >
          {detail}
        </Text>
      </View>
      <Switch
        accessibilityLabel={title}
        disabled={busy}
        value={draft[key]}
        onValueChange={(value) => set(key, value)}
        style={{ minHeight: 48, minWidth: 48 }}
        trackColor={{ true: theme.colors.accent, false: theme.colors.border }}
      />
    </View>
  );
  return (
    <Screen
      title="Study settings"
      intro={
        <Text
          style={[theme.typography.body, { color: theme.colors.textMuted }]}
        >
          Saved on this device. Queue settings apply to your next session.
        </Text>
      }
    >
      {onClose === undefined ? null : (
        <StudyAction label="Back to study" onPress={onClose} disabled={busy} />
      )}
      <Card style={{ gap: 22 }}>
        <SectionTitle label="Answers & marking" />
        {toggle(
          'autoAdvance',
          'Advance correct answers automatically',
          'Turn off to inspect every result before continuing.',
        )}
        {toggle(
          'allowOverrides',
          'Allow answer overrides',
          'Correct a typo, add a meaning synonym, or ask again later.',
        )}
        {toggle(
          'exactMatch',
          'Exact matching',
          'Close spellings ask you to retry without a penalty.',
        )}
        {toggle(
          'showFullAnswer',
          'Reveal all subject information',
          'Show both meaning and reading after an answer.',
        )}
        {toggle(
          'autoplay',
          'Play pronunciation automatically',
          'Play vocabulary audio after a correct reading.',
        )}
        <Choice
          label="Reading input"
          value={draft.readingInput}
          disabled={busy}
          options={[
            { label: 'Convert to kana', value: 'kana' },
            { label: 'Keep romaji', value: 'romaji' },
          ]}
          onChange={(value) =>
            set('readingInput', value as StudySettings['readingInput'])
          }
        />
      </Card>
      <Card style={{ gap: 22 }}>
        <SectionTitle label="Review order" />
        <Choice
          label="Question order"
          value={draft.questionOrder}
          disabled={busy}
          options={[
            { label: 'Meaning → Reading', value: 'meaning-first' },
            { label: 'Reading → Meaning', value: 'reading-first' },
            { label: 'Mixed questions', value: 'mixed' },
          ]}
          onChange={(value) => set('questionOrder', value as QuestionOrder)}
        />
        <Choice
          label="Review order"
          value={draft.reviewOrder}
          disabled={busy}
          options={[
            { label: 'Random', value: 'random' },
            { label: 'Oldest first', value: 'oldest-first' },
            { label: 'Newest first', value: 'newest-first' },
            { label: 'Lowest level', value: 'lowest-level' },
            { label: 'Highest level', value: 'highest-level' },
            { label: 'Lower SRS first', value: 'srs-ascending' },
            { label: 'Higher SRS first', value: 'srs-descending' },
          ]}
          onChange={(value) => set('reviewOrder', value as ReviewOrder)}
        />
        <Choice
          label="Mixed-question pool size"
          value={String(draft.reviewBatchSize)}
          disabled={busy}
          options={numberOptions(
            Array.from({ length: 10 }, (_, index) => index + 1),
            draft.reviewBatchSize,
          )}
          onChange={(value) => set('reviewBatchSize', Number(value))}
        />
        <Choice
          label="Repeat mistakes after other subjects"
          value={String(draft.incorrectAnswerDelay)}
          disabled={busy}
          options={numberOptions(
            Array.from({ length: 11 }, (_, index) => index),
            draft.incorrectAnswerDelay,
          )}
          onChange={(value) => set('incorrectAnswerDelay', Number(value))}
        />
        <Choice
          label="Review session limit"
          value={String(draft.reviewLimit)}
          disabled={busy}
          options={[
            { label: 'All available', value: 'null' },
            ...numberOptions([10, 15, 30, 50], draft.reviewLimit),
          ]}
          onChange={(value) =>
            set('reviewLimit', value === 'null' ? null : Number(value))
          }
        />
      </Card>
      <Card style={{ gap: 22 }}>
        <SectionTitle label="Lessons" />
        <Choice
          label="Lesson batch size"
          value={String(draft.lessonBatchSize)}
          disabled={busy}
          options={numberOptions(
            Array.from({ length: 10 }, (_, index) => index + 1),
            draft.lessonBatchSize,
          )}
          onChange={(value) => set('lessonBatchSize', Number(value))}
        />
        <Text style={[theme.typography.label, { color: theme.colors.text }]}>
          Subject priority
        </Text>
        {draft.lessonSubjectOrder.map((type, index) => (
          <View
            key={type}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
          >
            <Text
              style={[
                theme.typography.body,
                { color: theme.colors.text, flex: 1 },
              ]}
            >
              {index + 1}.{' '}
              {type === 'radical'
                ? 'Radicals'
                : type === 'kanji'
                  ? 'Kanji'
                  : type === 'vocabulary'
                    ? 'Vocabulary'
                    : 'Kana vocabulary'}
            </Text>
            <StudyAction
              label="Move up"
              accessibilityLabel={`Move ${type} up`}
              disabled={busy || index === 0}
              onPress={() => {
                const order = [...draft.lessonSubjectOrder];
                [order[index - 1], order[index]] = [
                  order[index]!,
                  order[index - 1]!,
                ];
                set('lessonSubjectOrder', order);
              }}
            />
          </View>
        ))}
        {toggle(
          'prioritizeCurrentLevel',
          'Prioritize current level',
          'Teach items from your current level first.',
        )}
        {toggle(
          'showKanaVocabulary',
          'Include kana-only vocabulary',
          'Include these subjects when automatically choosing lessons.',
        )}
        <Choice
          label="Apprentice limit"
          value={String(draft.apprenticeLimit)}
          disabled={busy}
          options={[
            { label: 'No limit', value: 'null' },
            ...numberOptions(
              Array.from({ length: 8 }, (_, index) => (index + 1) * 25),
              draft.apprenticeLimit,
            ),
          ]}
          onChange={(value) =>
            set('apprenticeLimit', value === 'null' ? null : Number(value))
          }
        />
      </Card>
      {message === null ? null : (
        <Text
          accessibilityRole={
            message === 'Settings saved.' ? undefined : 'alert'
          }
          accessibilityLiveRegion="polite"
          style={[theme.typography.body, { color: theme.colors.text }]}
        >
          {message}
        </Text>
      )}
      <StudyAction
        label={busy ? 'Saving settings…' : 'Save settings'}
        primary
        disabled={busy}
        onPress={() => {
          if (working.current) return;
          working.current = true;
          setBusy(true);
          setMessage(null);
          void onSave(draft)
            .then(() => setMessage('Settings saved.'))
            .catch(() =>
              setMessage('Unable to save settings. Please try again.'),
            )
            .finally(() => {
              working.current = false;
              setBusy(false);
            });
        }}
      />
      {onClose === undefined ? null : (
        <StudyAction label="Back to study" onPress={onClose} disabled={busy} />
      )}
    </Screen>
  );
}

function SectionTitle({ label }: { readonly label: string }) {
  const theme = useTheme();
  return (
    <Text
      accessibilityRole="header"
      style={[theme.typography.sectionTitle, { color: theme.colors.text }]}
    >
      {label}
    </Text>
  );
}

function numberOptions(values: readonly number[], current: number | null) {
  return [...new Set([...values, ...(current === null ? [] : [current])])]
    .sort((a, b) => a - b)
    .map((value) => ({ label: String(value), value: String(value) }));
}

function Choice({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  readonly label: string;
  readonly value: string;
  readonly options: readonly {
    readonly label: string;
    readonly value: string;
  }[];
  readonly onChange: (value: string) => void;
  readonly disabled: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={{ gap: 10 }}>
      <Text style={[theme.typography.label, { color: theme.colors.text }]}>
        {label}
      </Text>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={label}
        style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}
      >
        {options.map((option) => (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityLabel={`${label}: ${option.label}`}
            accessibilityState={{ checked: value === option.value, disabled }}
            disabled={disabled}
            onPress={() => onChange(option.value)}
            style={{
              minHeight: 48,
              padding: 12,
              borderWidth: 1,
              borderColor:
                value === option.value
                  ? theme.colors.accent
                  : theme.colors.border,
              backgroundColor:
                value === option.value
                  ? theme.colors.accentSurface
                  : theme.colors.surfaceMuted,
              borderRadius: 10,
              justifyContent: 'center',
            }}
          >
            <Text
              style={[
                theme.typography.caption,
                {
                  color:
                    value === option.value
                      ? theme.colors.accent
                      : theme.colors.text,
                },
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
