import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  closeRequest = 0,
  onDirtyChange,
}: {
  readonly closeRequest?: number;
  readonly onDirtyChange?: (dirty: boolean) => void;
  readonly settings: StudySettings;
  readonly onSave: (settings: StudySettings) => Promise<void>;
  readonly onClose?: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [section, setSection] = useState<
    'Answers' | 'Reviews' | 'Lessons' | 'Audio'
  >('Answers');
  const scroll = useRef<import('react-native').ScrollView>(null);
  const [draft, setDraft] = useState(settings);
  const [saved, setSaved] = useState(settings);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const requested = useRef(closeRequest);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const working = useRef(false);
  const requestClose = () => {
    if (working.current || onClose === undefined) return;
    if (!dirty) {
      onClose();
      return;
    }
    Alert.alert(
      'Discard unsaved settings?',
      'Your saved settings will stay unchanged.',
      [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: onClose },
      ],
    );
  };
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (requested.current === closeRequest) return;
    requested.current = closeRequest;
    requestClose();
  });
  const [previousSettings, setPreviousSettings] = useState(settings);
  if (settings !== previousSettings) {
    setPreviousSettings(settings);
    // A clean retained Settings tab can refresh after a study-modal save.
    if (!dirty) {
      setDraft(settings);
      setSaved(settings);
    }
  }
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
      | 'allowSkipping'
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
    <View style={{ flex: 1, backgroundColor: theme.colors.canvas }}>
      <Screen
        ref={scroll}
        style={{ flex: 1 }}
        title="Study settings"
        intro={
          <Text
            style={[theme.typography.body, { color: theme.colors.textMuted }]}
          >
            Saved on this device. Answer controls, disclosure and question
            scheduling apply when you continue in lessons and reviews. Queue
            order, limits and lesson selection apply to the next session.
          </Text>
        }
      >
        {onClose === undefined ? null : (
          <StudyAction
            label="Back to study"
            onPress={requestClose}
            disabled={busy}
          />
        )}
        <View
          accessibilityRole="tablist"
          accessibilityLabel="Study settings sections"
          style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}
        >
          {(['Answers', 'Reviews', 'Lessons', 'Audio'] as const).map((item) => (
            <Pressable
              key={item}
              accessibilityRole="tab"
              accessibilityLabel={item}
              accessibilityState={{ selected: section === item }}
              onPress={() => {
                setSection(item);
                scroll.current?.scrollTo({ y: 0, animated: false });
              }}
              style={{
                minHeight: 48,
                paddingHorizontal: 14,
                paddingVertical: 12,
                borderRadius: 12,
                backgroundColor:
                  section === item
                    ? theme.colors.accentSurface
                    : theme.colors.surfaceMuted,
                borderWidth: 1,
                borderColor:
                  section === item ? theme.colors.accent : theme.colors.border,
              }}
            >
              <Text
                style={[
                  theme.typography.label,
                  {
                    color:
                      section === item
                        ? theme.colors.accent
                        : theme.colors.textMuted,
                  },
                ]}
              >
                {item}
              </Text>
            </Pressable>
          ))}
        </View>
        {section === 'Answers' ? (
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
              'Correct a typo or add a meaning synonym in lessons and reviews.',
            )}
            {toggle(
              'allowSkipping',
              'Allow skipping',
              'Ask again later resets completed answers for that subject in lessons and reviews. In reviews it also resets mistake counts. The subject moves to the end and remains available until completed.',
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
        ) : null}
        {section === 'Reviews' ? (
          <Card style={{ gap: 22 }}>
            <SectionTitle label="Review scheduling" />
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
        ) : null}
        {section === 'Lessons' ? (
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
            <Text
              style={[theme.typography.label, { color: theme.colors.text }]}
            >
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
        ) : null}
        {section === 'Audio' ? (
          <Card style={{ gap: 22 }}>
            <SectionTitle label="Pronunciation" />
            {toggle(
              'autoplay',
              'Play pronunciation automatically',
              'Play vocabulary audio after a correct reading.',
            )}
          </Card>
        ) : null}
      </Screen>
      <View
        style={{
          padding: 16,
          paddingLeft: 16 + insets.left,
          paddingRight: 16 + insets.right,
          paddingBottom: 12 + insets.bottom,
          gap: 10,
          borderTopWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
        }}
      >
        {message === null ? (
          <Text
            style={[
              theme.typography.caption,
              { color: theme.colors.textMuted },
            ]}
          >
            {dirty ? 'Unsaved changes' : 'Saved on this device'}
          </Text>
        ) : (
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
              .then(() => {
                setSaved(draft);
                setMessage('Settings saved.');
              })
              .catch(() =>
                setMessage('Unable to save settings. Please try again.'),
              )
              .finally(() => {
                working.current = false;
                setBusy(false);
              });
          }}
        />
      </View>
    </View>
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
