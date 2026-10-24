import { useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Settings2 } from 'lucide-react-native';

import type { SubjectResource } from '@/api/types';
import type {
  AnswerResult,
  ReviewPrompt,
  RetryReason,
} from '@/features/reviews/types';
import type { StudySettings } from '@/features/settings/studySettings';
import type { SubjectStudyMaterial } from '@/features/subjects/subjectDetails';
import { romajiToKana } from '@/features/search/kana';
import { useTheme } from '@/ui/theme/ThemeProvider';
import { minimumTouchTarget } from '@/ui/theme/spacing';
import {
  StudyAction,
  StudySubjectHero,
  StudySubjectInformation,
} from './StudySubjectInformation';

export interface StudyQuestionProps {
  readonly feedback: AnswerResult | null;
  readonly index: number;
  readonly total: number;
  readonly subject: SubjectResource;
  readonly prompt: ReviewPrompt;
  readonly settings: StudySettings;
  readonly busy: boolean;
  readonly error: string | null;
  readonly onExit: () => void;
  readonly onSubmit: (answer: string) => void;
  readonly onContinue: () => void;
  readonly onOverride: () => void;
  readonly onSkip: () => void;
  readonly onRetrySave: () => void;
  readonly onAddSynonym?: (answer: string) => void;
  readonly onReload?: () => void;
  readonly onSettings?: () => void;
  readonly material?: SubjectStudyMaterial;
  readonly onPlayAudio?: (url: string) => void;
  readonly onOpenSubject?: (id: number) => void;
}

export function StudyQuestion({
  feedback,
  index,
  total,
  subject,
  prompt,
  settings,
  busy,
  error,
  onExit,
  onSubmit,
  onContinue,
  onOverride,
  onSkip,
  onAddSynonym,
  onRetrySave,
  onReload,
  onSettings,
  material,
  onPlayAudio,
  onOpenSubject,
  title,
  exitLabel,
}: StudyQuestionProps & {
  readonly title: string;
  readonly exitLabel: string;
}) {
  const theme = useTheme();
  const compact = useWindowDimensions().height < 500;
  const insets = useSafeAreaInsets();
  const input = useRef<TextInput>(null);
  const [answer, setAnswer] = useState('');
  const [showAll, setShowAll] = useState(settings.showFullAnswer);
  const graded = feedback !== null && feedback.verdict !== 'retry';
  useEffect(() => {
    if (graded) Keyboard.dismiss();
  }, [graded]);
  const submit = () => {
    if (graded) onContinue();
    else if (answer.trim() !== '' && !busy) onSubmit(answer);
  };
  const resultColor =
    feedback?.verdict === 'correct'
      ? theme.colors.success
      : feedback?.verdict === 'incorrect'
        ? theme.colors.danger
        : theme.colors.text;
  const typeLabel =
    subject.object === 'kana_vocabulary'
      ? 'Kana vocabulary'
      : subject.object.charAt(0).toUpperCase() + subject.object.slice(1);
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{
        flex: 1,
        backgroundColor: theme.colors.canvas,
        paddingTop: insets.top,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16 + insets.left,
          paddingRight: 16 + insets.right,
          gap: 8,
        }}
      >
        <Text
          style={[
            theme.typography.label,
            { color: theme.colors.textMuted, flex: 1 },
          ]}
        >
          {title} · {index} / {total} complete
        </Text>
        {onSettings === undefined ? null : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Study settings"
            onPress={onSettings}
            disabled={busy}
            style={{
              minHeight: minimumTouchTarget,
              minWidth: minimumTouchTarget,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Settings2 size={22} color={theme.colors.accent} />
          </Pressable>
        )}
        <Pressable
          accessibilityLabel={exitLabel}
          accessibilityRole="button"
          disabled={busy}
          onPress={onExit}
          style={{
            minHeight: minimumTouchTarget,
            paddingHorizontal: 12,
            justifyContent: 'center',
          }}
        >
          <Text
            style={[theme.typography.label, { color: theme.colors.accent }]}
          >
            Exit
          </Text>
        </Pressable>
      </View>
      <View
        accessibilityRole="progressbar"
        accessibilityLabel={`${title} progress`}
        accessibilityValue={{ min: 0, max: Math.max(1, total), now: index }}
        style={{ height: 3, backgroundColor: theme.colors.surfaceMuted }}
      >
        <View
          style={{
            backgroundColor: theme.colors.accent,
            height: 3,
            width: `${total ? (index / total) * 100 : 0}%`,
          }}
        />
      </View>
      <ScrollView
        testID="study-question-content"
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{
          gap: 14,
          padding: 16,
          paddingLeft: 16 + insets.left,
          paddingRight: 16 + insets.right,
        }}
      >
        <StudySubjectHero subject={subject} />
        <View
          style={{
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: compact ? 'row' : 'column',
            gap: compact ? 12 : 3,
          }}
        >
          <Text
            style={[
              theme.typography.caption,
              { color: theme.colors.textMuted },
            ]}
          >
            {typeLabel}
          </Text>
          <Text
            accessibilityRole="header"
            style={[
              theme.typography.sectionTitle,
              { color: theme.colors.text },
            ]}
          >
            {prompt === 'meaning' ? 'Meaning' : 'Reading'}
          </Text>
        </View>
        <TextInput
          ref={input}
          autoFocus
          accessibilityLabel={`${prompt === 'meaning' ? 'Meaning' : 'Reading'} answer`}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          editable={!graded && !busy}
          onChangeText={(value) =>
            setAnswer(
              prompt === 'reading' && settings.readingInput === 'kana'
                ? kanaInput(value)
                : value,
            )
          }
          onSubmitEditing={submit}
          submitBehavior="submit"
          returnKeyType="done"
          placeholder={prompt === 'meaning' ? 'Your answer' : 'こたえ'}
          placeholderTextColor={theme.colors.textMuted}
          value={answer}
          style={[
            theme.typography.sectionTitle,
            {
              backgroundColor: graded
                ? feedback.verdict === 'correct'
                  ? theme.colors.successSurface
                  : theme.colors.dangerSurface
                : theme.colors.surface,
              color: resultColor,
              textAlign: 'center',
              borderWidth: 1,
              borderColor: graded ? resultColor : theme.colors.border,
              borderRadius: 12,
              minHeight: 56,
              paddingHorizontal: 14,
              paddingVertical: 12,
            },
          ]}
        />
        {feedback === null ? null : (
          <View accessibilityLiveRegion="polite" style={{ gap: 8 }}>
            <Text style={[theme.typography.label, { color: resultColor }]}>
              {feedback.verdict === 'correct'
                ? 'Correct'
                : feedback.verdict === 'incorrect'
                  ? 'Incorrect'
                  : 'Check the prompt and try again'}
            </Text>
            {feedback.verdict === 'retry' ? (
              <Text
                style={[
                  theme.typography.body,
                  { color: theme.colors.textMuted },
                ]}
              >
                {retryMessage(feedback.reason)}
              </Text>
            ) : null}
            {feedback.verdict === 'incorrect' ? (
              <Text
                selectable
                style={[theme.typography.body, { color: theme.colors.text }]}
              >
                Accepted: {feedback.expected.join(', ')}
              </Text>
            ) : null}
            {feedback.verdict === 'incorrect' ? (
              <Text
                style={[
                  theme.typography.caption,
                  { color: theme.colors.textMuted },
                ]}
              >
                {total - index <= 1 || settings.incorrectAnswerDelay === 0
                  ? 'Continue to try this question again.'
                  : 'Continue with other subjects. This question will return.'}
              </Text>
            ) : null}
          </View>
        )}
        {error === null ? null : (
          <View
            style={{
              gap: 10,
              padding: 14,
              backgroundColor: theme.colors.dangerSurface,
              borderRadius: 12,
            }}
          >
            <Text
              accessibilityRole="alert"
              style={[theme.typography.body, { color: theme.colors.danger }]}
            >
              {error}
            </Text>
            <StudyAction
              label="Try saving again"
              onPress={onRetrySave}
              disabled={busy}
            />
            {onReload === undefined ? null : (
              <StudyAction
                label="Reload reviews"
                onPress={onReload}
                disabled={busy}
              />
            )}
          </View>
        )}
        {graded ? (
          <>
            {feedback.verdict === 'incorrect' && settings.allowOverrides ? (
              <View style={{ gap: 10 }}>
                <StudyAction
                  label="My answer was correct"
                  onPress={onOverride}
                  disabled={busy || error !== null}
                />
                {prompt === 'meaning' && onAddSynonym !== undefined ? (
                  <StudyAction
                    label="Add synonym and mark correct"
                    onPress={() => onAddSynonym(answer)}
                    disabled={busy || error !== null}
                  />
                ) : null}
              </View>
            ) : null}
            <StudySubjectInformation
              subject={subject}
              material={material}
              revealedPrompt={prompt}
              showAll={showAll}
              onShowAll={() => setShowAll(true)}
              onPlayAudio={onPlayAudio}
              onOpenSubject={onOpenSubject}
            />
          </>
        ) : null}
        {settings.allowOverrides ? (
          <StudyAction
            label="Ask again later"
            onPress={onSkip}
            disabled={busy || error !== null}
          />
        ) : null}
      </ScrollView>
      <View
        style={{
          paddingTop: 10,
          paddingHorizontal: 16,
          paddingLeft: 16 + insets.left,
          paddingRight: 16 + insets.right,
          paddingBottom: 10 + insets.bottom,
          backgroundColor: theme.colors.surface,
          borderTopWidth: 1,
          borderColor: theme.colors.border,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={graded ? 'Continue' : 'Submit answer'}
          disabled={busy || error !== null || (!graded && answer.trim() === '')}
          onPress={submit}
          style={{
            minHeight: minimumTouchTarget,
            padding: 12,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.accent,
            opacity:
              busy || error !== null || (!graded && answer.trim() === '')
                ? 0.5
                : 1,
          }}
        >
          <Text
            style={[
              theme.typography.label,
              { color: theme.colors.accentForeground },
            ]}
          >
            {busy ? 'Saving…' : graded ? 'Continue' : 'Check answer'}
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

/** Keep nasal consonants unfinished until the next keystroke resolves the syllable. */
export function kanaInput(value: string): string {
  if (/nn$/i.test(value)) return romajiToKana(value.slice(0, -2)).text + 'ん';
  if (/mm$/i.test(value)) return romajiToKana(value.slice(0, -2)).text + 'っm';
  if (/[nm]$/i.test(value))
    return romajiToKana(value.slice(0, -1)).text + value.slice(-1).toLowerCase();
  return romajiToKana(value).text;
}

function retryMessage(reason: RetryReason): string {
  switch (reason) {
    case 'other-kanji-reading':
      return 'That is another reading for this kanji. Use its primary reading.';
    case 'close-answer':
      return 'Almost correct. Exact matching is on; check your spelling.';
    case 'meaning-instead-of-reading':
      return 'That is the meaning. Enter the Japanese reading.';
    case 'reading-instead-of-meaning':
      return 'That is a reading. Enter the English meaning.';
    case 'mismatching-okurigana':
      return 'Check the kana ending of this word.';
    default:
      return 'Use English for meanings and kana for readings. No mistake was recorded.';
  }
}
