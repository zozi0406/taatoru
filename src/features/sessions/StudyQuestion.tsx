import { useCallback, useEffect, useRef, useState } from 'react';
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
import { ArrowRight, Check, CheckCircle2, XCircle } from 'lucide-react-native';

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
import { StudyHeader } from './StudyHeader';
import { minimumTouchTarget } from '@/ui/theme/spacing';
import {
  InformationSection,
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
  readonly onWrapUp?: () => void;
  readonly wrappingUp?: boolean;
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
  onWrapUp,
  wrappingUp,
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
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () =>
      setKeyboardVisible(true),
    );
    const hide = Keyboard.addListener('keyboardDidHide', () =>
      setKeyboardVisible(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  const [answer, setAnswer] = useState('');
  const [readyImageSubject, setReadyImageSubject] = useState<number | null>(
    null,
  );
  const imageReady =
    subject.data.characters !== null || readyImageSubject === subject.id;
  const onImageReady = useCallback(
    (ready: boolean) => {
      setReadyImageSubject(ready ? subject.id : null);
    },
    [subject.id],
  );
  const [revealedAll, setShowAll] = useState(false);
  const showAll = settings.showFullAnswer || revealedAll;
  const graded = feedback !== null && feedback.verdict !== 'retry';
  useEffect(() => {
    if (graded && !busy) Keyboard.dismiss();
  }, [graded, busy]);
  const submit = () => {
    if (busy || error !== null) return;
    if (graded) onContinue();
    else if (imageReady && answer.trim() !== '' && !busy) onSubmit(answer);
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
      <View style={{ paddingLeft: insets.left, paddingRight: insets.right }}>
        <StudyHeader
          title={title}
          index={index}
          total={total}
          busy={busy}
          exitLabel={exitLabel}
          onExit={onExit}
          onSettings={onSettings}
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
        <StudySubjectHero
          subject={subject}
          compact={compact || keyboardVisible}
          onReadyChange={onImageReady}
        />
        {!graded && (
          <Text accessibilityRole="header"
            style={[theme.typography.sectionTitle, { color: theme.colors.text, textAlign: 'center' }]}>
            {typeLabel} {prompt}
          </Text>
        )}
        {feedback === null ? null : (
          <View
            accessibilityLiveRegion="polite"
            style={{
              gap: 12,
              padding: 16,
              borderBottomWidth: 1,
              borderColor: theme.colors.border,
            }}
          >
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
            >
              {feedback.verdict === 'correct' ? (
                <CheckCircle2 color={resultColor} size={22} />
              ) : feedback.verdict === 'incorrect' ? (
                <XCircle color={resultColor} size={22} />
              ) : null}
              <Text
                style={[
                  theme.typography.label,
                  { color: resultColor, flex: 1 },
                ]}
              >
                {feedback.verdict === 'correct'
                  ? 'Correct'
                  : feedback.verdict === 'incorrect'
                    ? 'Incorrect'
                    : 'Check the prompt and try again'}
              </Text>
            </View>
            {feedback.verdict === 'correct' && (
              <Text selectable style={[theme.typography.body, { color: theme.colors.text }]}>
                {answer}
              </Text>
            )}
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
              <>
                <View style={{ gap: 4 }}>
                  <Text
                    style={[
                      theme.typography.caption,
                      { color: theme.colors.textMuted },
                    ]}
                  >
                    Your answer
                  </Text>
                  <Text
                    selectable
                    style={[
                      theme.typography.body,
                      { color: theme.colors.text },
                    ]}
                  >
                    {answer}
                  </Text>
                </View>
                <View style={{ gap: 4 }}>
                  <Text
                    style={[
                      theme.typography.caption,
                      { color: theme.colors.textMuted },
                    ]}
                  >
                    Accepted answer
                  </Text>
                  <Text
                    selectable
                    style={[
                      theme.typography.sectionTitle,
                      { color: theme.colors.text },
                    ]}
                  >
                    {feedback.expected.join(', ')}
                  </Text>
                </View>
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
              </>
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
        {graded && !busy ? (
          <>
            {feedback.verdict === 'incorrect' && settings.allowOverrides ? (
              <View style={{ gap: 10 }}>
                <StudyAction
                  quiet
                  label="My answer was correct"
                  onPress={onOverride}
                  disabled={busy || error !== null}
                />
                {prompt === 'meaning' && onAddSynonym !== undefined ? (
                  <StudyAction
                    quiet
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
        {wrappingUp ? (
          <Text
            style={[
              theme.typography.caption,
              { color: theme.colors.textMuted },
            ]}
          >
            Wrapping up attempted subjects. Untouched reviews remain due.
          </Text>
        ) : null}
        {settings.allowSkipping || (onWrapUp !== undefined && !wrappingUp) ? (
          <InformationSection title="Session options" collapsible>
            {settings.allowSkipping ? (
              <>
                <Text
                  style={[
                    theme.typography.caption,
                    { color: theme.colors.textMuted },
                  ]}
                >
                  Ask again later resets this subject’s completed answers. In
                  reviews it also resets mistake counts. It remains available until
                  completed.
                </Text>
                <StudyAction
                  label="Ask again later"
                  onPress={onSkip}
                  disabled={busy || error !== null}
                />
              </>
            ) : null}
            {onWrapUp === undefined || wrappingUp ? null : (
              <StudyAction
                label="Wrap up reviews"
                onPress={onWrapUp}
                disabled={busy || error !== null || graded}
              />
            )}
          </InformationSection>
        ) : null}
      </ScrollView>
      <View
        style={{
          paddingTop: 10,
          paddingHorizontal: 16,
          paddingLeft: 16 + insets.left,
          paddingRight: 16 + insets.right,
          paddingBottom: 10 + (keyboardVisible ? 0 : insets.bottom),
          flexDirection: 'row',
          gap: 8,
          backgroundColor: theme.colors.surface,
          borderTopWidth: 1,
          borderColor: theme.colors.border,
        }}
      >
        {!graded && (
        <TextInput
          ref={input}
          testID={`study-answer-${subject.id}-${prompt}`}
          autoFocus
          accessibilityLabel={`${prompt === 'meaning' ? 'Meaning' : 'Reading'} answer`}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          editable={!graded && !busy && imageReady}
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
              flex: 1,
              backgroundColor: theme.colors.surface,
              color: theme.colors.text,
              borderWidth: 1,
              borderColor: theme.colors.border,
              borderRadius: 12,
              minHeight: 56,
              paddingHorizontal: 14,
              paddingVertical: 12,
            },
          ]}
        />
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={graded ? 'Continue' : 'Submit answer'}
          disabled={
            busy ||
            error !== null ||
            (!graded && (!imageReady || answer.trim() === ''))
          }
          onPress={submit}
          style={{
            flex: graded ? 1 : undefined,
            minWidth: 56,
            flexDirection: 'row',
            gap: 8,
            minHeight: minimumTouchTarget,
            padding: 12,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.accent,
            opacity:
              busy ||
              error !== null ||
              (!graded && (!imageReady || answer.trim() === ''))
                ? 0.5
                : 1,
          }}
        >
          {graded || busy ? <Text
            style={[
              theme.typography.label,
              { color: theme.colors.accentForeground },
            ]}
          >
            {busy
              ? feedback?.verdict === 'correct'
                ? 'Continuing…'
                : 'Saving…'
              : graded
                ? 'Continue'
                : 'Check answer'}
          </Text> : <Check size={24} color={theme.colors.accentForeground} />}
          {graded && !busy && <ArrowRight size={20} color={theme.colors.accentForeground} />}
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
    return (
      romajiToKana(value.slice(0, -1)).text + value.slice(-1).toLowerCase()
    );
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
