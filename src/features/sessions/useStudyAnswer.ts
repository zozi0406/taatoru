import { useRef, useState } from 'react';
import type { SubjectResource } from '@/api/types';
import { checkAnswer } from '@/features/reviews/answerChecker';
import type { AnswerResult, ReviewPrompt } from '@/features/reviews/types';
import type { StudySettings } from '@/features/settings/studySettings';

type AnswerEvent =
  'correct' | 'incorrect' | 'continue-incorrect' | 'override-correct' | 'skip';

/** A grade is applied once; navigation is unlocked only after local persistence. */
export function useStudyAnswer({
  apply,
  settings,
  onAddSynonym,
  kind,
}: {
  readonly apply: (event: AnswerEvent) => Promise<void>;
  readonly settings: StudySettings;
  readonly kind: 'review' | 'lesson';
  readonly onAddSynonym?: (subjectId: number, synonym: string) => Promise<void>;
}) {
  const [feedback, setFeedback] = useState<AnswerResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const working = useRef(false);
  const lastAction = useRef<(() => Promise<void>) | null>(null);

  const perform = async (action: () => Promise<void>, advance = true) => {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError(null);
    const operation = async () => {
      await action();
      if (advance) {
        setFeedback(null);
        setRevision((value) => value + 1);
      }
    };
    lastAction.current = () => perform(action, advance);
    try {
      await operation();
    } catch (failure) {
      setError(
        failure instanceof Error &&
          failure.message.startsWith('Review availability changed')
          ? failure.message
          : `Unable to preserve ${kind} progress. Try saving again.`,
      );
    } finally {
      working.current = false;
      setBusy(false);
    }
  };

  const submit = (
    answer: string,
    prompt: ReviewPrompt,
    subject: SubjectResource,
    synonyms: readonly string[] = [],
  ) => {
    if (
      working.current ||
      error !== null ||
      answer.trim() === '' ||
      (feedback !== null && feedback.verdict !== 'retry')
    )
      return;
    const result = checkAnswer({
      answer,
      prompt,
      subject,
      meaningSynonyms: synonyms,
      exactMatch: settings.exactMatch,
    });
    if (result.verdict === 'retry') {
      setFeedback(result);
      return;
    }
    if (result.verdict === 'correct' && !settings.autoAdvance) {
      setFeedback(result);
      return;
    }
    void perform(async () => {
      await apply(result.verdict);
      if (result.verdict === 'incorrect') setFeedback(result);
    }, result.verdict === 'correct');
  };
  return {
    feedback,
    busy,
    error,
    revision,
    submit,
    continue: () => {
      if (feedback !== null && feedback.verdict !== 'retry')
        void perform(() =>
          apply(
            feedback.verdict === 'correct' ? 'correct' : 'continue-incorrect',
          ),
        );
    },
    override: () => {
      if (settings.allowOverrides && feedback?.verdict === 'incorrect')
        void perform(() => apply('override-correct'));
    },
    skip: () => {
      if (settings.allowOverrides) void perform(() => apply('skip'));
    },
    retrySave: () => {
      void lastAction.current?.();
    },
    addSynonym:
      onAddSynonym === undefined
        ? undefined
        : (subjectId: number, answer: string) => {
            if (!settings.allowOverrides || feedback?.verdict !== 'incorrect')
              return;
            void perform(async () => {
              await onAddSynonym(subjectId, answer.trim());
              await apply('override-correct');
            });
          },
  };
}
