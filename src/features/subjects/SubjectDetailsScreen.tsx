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
// Modified by Taatoru from Tsurukame's SubjectDetailsView.swift at revision
// 8e18ddf7f12c44e91cb0ad63bab31af7440648ea.

import { ArrowLeft } from 'lucide-react-native';
import { useAudioPlayer } from 'expo-audio';
import { type ReactNode, useState } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  Text,
  TextInput,
  View,
  type TextStyle,
} from 'react-native';

import type { SubjectResource } from '@/api/types';
import { useScreenPadding } from '@/ui/theme/useScreenPadding';
import { WaniKaniText } from '@/ui/components/WaniKaniText';
import { Card } from '@/ui/components/Card';
import { SubjectChip } from '@/ui/components/SubjectChip';
import { minimumTouchTarget } from '@/ui/theme/spacing';
import { subjectColors } from '@/ui/theme/colors';
import {
  type TaatoruTheme,
  useTheme,
} from '@/ui/theme/ThemeProvider';
import type {
  RelatedSubject,
  SubjectAudio,
  SubjectDetailsSnapshot,
} from './subjectDetails';

export interface StudyMaterialDraft {
  readonly meaningNote: string | null;
  readonly meaningSynonyms: readonly string[];
  readonly readingNote: string | null;
}

interface SubjectDetailsScreenProps {
  readonly details: SubjectDetailsSnapshot;
  readonly onBack: () => void;
  readonly onOpenSubject: (subjectId: number) => void;
  readonly onPlayAudio?: (audio: SubjectAudio) => void;
  readonly onSaveStudyMaterial: (
    material: StudyMaterialDraft,
  ) => Promise<void>;
}

type DetailSection =
  | 'meanings'
  | 'readings'
  | 'explanations'
  | 'context'
  | 'relationships'
  | 'progress'
  | 'study-materials';

const SECTIONS: readonly DetailSection[] = [
  'meanings',
  'readings',
  'explanations',
  'context',
  'relationships',
  'progress',
  'study-materials',
];

export function SubjectDetailsScreen({
  details,
  onBack,
  onOpenSubject,
  onPlayAudio,
  onSaveStudyMaterial,
}: SubjectDetailsScreenProps) {
  const theme = useTheme();
  const screenPadding = useScreenPadding();
  const [meaningNote, setMeaningNote] = useState(
    details.studyMaterial.meaningNote ?? '',
  );
  const [readingNote, setReadingNote] = useState(
    details.studyMaterial.readingNote ?? '',
  );
  const [synonyms, setSynonyms] = useState(
    details.studyMaterial.meaningSynonyms.join('\n'),
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    setSaveError(null);
    try {
      await onSaveStudyMaterial({
        meaningNote: optionalText(meaningNote),
        readingNote: optionalText(readingNote),
        meaningSynonyms: normalizedSynonyms(synonyms),
      });
      setSaved(true);
    } catch {
      setSaveError('Unable to save study materials on this device');
    } finally {
      setSaving(false);
    }
  };

  return (
    <FlatList
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        gap: theme.spacing.lg,
        ...screenPadding,
      }}
      data={SECTIONS}
      extraData={{
        meaningNote,
        readingNote,
        saveError,
        saved,
        saving,
        synonyms,
      }}
      keyExtractor={(section) => section}
      style={{ backgroundColor: theme.colors.canvas }}
      ListHeaderComponent={
        <SubjectHeader
          details={details}
          onBack={onBack}
          theme={theme}
        />
      }
      renderItem={({ item }) =>
        renderSection({
          item,
          details,
          meaningNote,
          onOpenSubject,
          onPlayAudio,
          readingNote,
          saved,
          saveError,
          saving,
          setMeaningNote,
          setReadingNote,
          setSynonyms,
          synonyms,
          save,
          theme,
        })
      }
    />
  );
}

interface RenderSectionOptions {
  readonly item: DetailSection;
  readonly details: SubjectDetailsSnapshot;
  readonly meaningNote: string;
  readonly onOpenSubject: (subjectId: number) => void;
  readonly onPlayAudio?: (audio: SubjectAudio) => void;
  readonly readingNote: string;
  readonly saved: boolean;
  readonly saveError: string | null;
  readonly saving: boolean;
  readonly setMeaningNote: (value: string) => void;
  readonly setReadingNote: (value: string) => void;
  readonly setSynonyms: (value: string) => void;
  readonly synonyms: string;
  readonly save: () => Promise<void>;
  readonly theme: TaatoruTheme;
}

function renderSection(options: RenderSectionOptions) {
  const { details, item, theme } = options;
  if (item === 'meanings') {
    return (
      <DetailCard title="Meanings" theme={theme}>
        <Text selectable style={bodyStyle(theme)}>
          {details.meanings.join(', ')}
        </Text>
      </DetailCard>
    );
  }
  if (item === 'readings') {
    if (details.readings.length === 0) {
      return null;
    }
    return (
      <DetailCard title="Readings" theme={theme}>
        <Text selectable style={bodyStyle(theme)}>
          {details.readings.join(', ')}
        </Text>
        {details.audio.map((audio) => (
          <AudioAction
            key={`${audio.pronunciation}-${audio.voiceActorName}`}
            audio={audio}
            onPlayAudio={options.onPlayAudio}
          />
        ))}
      </DetailCard>
    );
  }
  if (item === 'explanations') {
    return <Explanations details={details} theme={theme} />;
  }
  if (item === 'context') {
    return <VocabularyContext details={details} theme={theme} />;
  }
  if (item === 'relationships') {
    return (
      <Relationships
        details={details}
        onOpenSubject={options.onOpenSubject}
        theme={theme}
      />
    );
  }
  if (item === 'progress') {
    return <Progress details={details} theme={theme} />;
  }
  return (
    <DetailCard title="Your study materials" theme={theme}>
      <EditableField
        label="Meaning note"
        onChangeText={options.setMeaningNote}
        value={options.meaningNote}
      />
      <EditableField
        label="Reading note"
        onChangeText={options.setReadingNote}
        value={options.readingNote}
      />
      <EditableField
        label="Meaning synonyms"
        onChangeText={options.setSynonyms}
        placeholder="One synonym per line"
        value={options.synonyms}
      />
      <Pressable
        accessibilityLabel="Save study materials"
        accessibilityRole="button"
        disabled={options.saving}
        onPress={() => void options.save()}
        style={{
          alignItems: 'center',
          backgroundColor: theme.colors.accent,
          borderCurve: 'continuous',
          borderRadius: 12,
          justifyContent: 'center',
          minHeight: minimumTouchTarget,
          opacity: options.saving ? 0.55 : 1,
          paddingHorizontal: theme.spacing.lg,
        }}
      >
        <Text
          style={[
            theme.typography.label,
            { color: theme.colors.accentForeground },
          ]}
        >
          {options.saving ? 'Saving…' : 'Save'}
        </Text>
      </Pressable>
      {options.saved ? (
        <Text
          accessibilityLiveRegion="polite"
          selectable
          style={[theme.typography.caption, { color: theme.colors.textMuted }]}
        >
          Saved on this device
        </Text>
      ) : null}
      {options.saveError === null ? null : (
        <Text
          accessibilityRole="alert"
          selectable
          style={[theme.typography.caption, { color: theme.colors.danger }]}
        >
          {options.saveError}
        </Text>
      )}
    </DetailCard>
  );
}

function SubjectHeader({
  details,
  onBack,
  theme,
}: {
  readonly details: SubjectDetailsSnapshot;
  readonly onBack: () => void;
  readonly theme: TaatoruTheme;
}) {
  const subject = details.subject;
  const colors = subjectColors[subject.object];
  const image = radicalImage(subject);
  const primaryMeaning = details.meanings[0] ?? subject.data.slug;
  return (
    <View style={{ gap: theme.spacing.lg }}>
      <Pressable
        accessibilityLabel="Back"
        accessibilityRole="button"
        onPress={onBack}
        style={{
          alignItems: 'center',
          alignSelf: 'flex-start',
          flexDirection: 'row',
          gap: theme.spacing.sm,
          justifyContent: 'center',
          minHeight: minimumTouchTarget,
          minWidth: minimumTouchTarget,
        }}
      >
        <ArrowLeft size={18} color={theme.colors.accent} />
        <Text style={[theme.typography.label, { color: theme.colors.accent }]}>
          Back
        </Text>
      </Pressable>
      <View
        style={{
          alignItems: 'center',
          backgroundColor: colors.background,
          borderCurve: 'continuous',
          borderRadius: 28,
          gap: theme.spacing.md,
          padding: theme.spacing.xl,
        }}
      >
        {image === null ? (
          <Text
            accessibilityRole="header"
            selectable
            style={{
              color: colors.foreground,
              fontSize: 64,
              fontWeight: '700',
            }}
          >
            {subject.data.characters ?? subject.data.slug}
          </Text>
        ) : (
          <Image
            accessibilityLabel={`${primaryMeaning} radical`}
            source={{ uri: image }}
            style={{ height: 96, width: 96 }}
          />
        )}
        <Text
          selectable
          style={[
            theme.typography.screenTitle,
            { color: colors.foreground },
          ]}
        >
          {primaryMeaning}
        </Text>
      </View>
      <View
        style={{
          alignItems: 'center',
          flexDirection: 'row',
          gap: theme.spacing.md,
        }}
      >
        <SubjectChip type={subject.object} />
        <Text selectable style={[theme.typography.label, bodyStyle(theme)]}>
          Level {subject.data.level}
        </Text>
      </View>
    </View>
  );
}

function Explanations({
  details,
  theme,
}: {
  readonly details: SubjectDetailsSnapshot;
  readonly theme: TaatoruTheme;
}) {
  const data = details.subject.data;
  const readingMnemonic =
    'reading_mnemonic' in data ? data.reading_mnemonic : null;
  const meaningHint = 'meaning_hint' in data ? data.meaning_hint : null;
  const readingHint = 'reading_hint' in data ? data.reading_hint : null;
  return (
    <View style={{ gap: theme.spacing.lg }}>
      <ExplanationCard
        hint={meaningHint}
        text={data.meaning_mnemonic}
        theme={theme}
        title="Meaning explanation"
      />
      {readingMnemonic === null ? null : (
        <ExplanationCard
          hint={readingHint}
          text={readingMnemonic}
          theme={theme}
          title="Reading explanation"
        />
      )}
    </View>
  );
}

function ExplanationCard({
  hint,
  text,
  theme,
  title,
}: {
  readonly hint: string | null;
  readonly text: string;
  readonly theme: TaatoruTheme;
  readonly title: string;
}) {
  if (text.length === 0 && hint === null) {
    return null;
  }
  return (
    <DetailCard title={title} theme={theme}>
      {text.length === 0 ? null : (
        <WaniKaniText selectable style={bodyStyle(theme)}>
          {text}
        </WaniKaniText>
      )}
      {hint === null ? null : (
        <WaniKaniText
          selectable
          style={[theme.typography.caption, { color: theme.colors.textMuted }]}
        >
          {`Hint: ${hint}`}
        </WaniKaniText>
      )}
    </DetailCard>
  );
}

function VocabularyContext({
  details,
  theme,
}: {
  readonly details: SubjectDetailsSnapshot;
  readonly theme: TaatoruTheme;
}) {
  const data = details.subject.data;
  if (!('context_sentences' in data)) {
    return null;
  }
  return (
    <View style={{ gap: theme.spacing.lg }}>
      <DetailCard title="Context sentences" theme={theme}>
        {data.context_sentences.map((sentence) => (
          <View key={`${sentence.ja}-${sentence.en}`}>
            <Text selectable style={bodyStyle(theme)}>
              {sentence.ja}
            </Text>
            <Text
              selectable
              style={[
                theme.typography.caption,
                { color: theme.colors.textMuted },
              ]}
            >
              {sentence.en}
            </Text>
          </View>
        ))}
      </DetailCard>
      <DetailCard title="Parts of speech" theme={theme}>
        <Text selectable style={bodyStyle(theme)}>
          {data.parts_of_speech.join(', ')}
        </Text>
      </DetailCard>
    </View>
  );
}

function Relationships({
  details,
  onOpenSubject,
  theme,
}: {
  readonly details: SubjectDetailsSnapshot;
  readonly onOpenSubject: (subjectId: number) => void;
  readonly theme: TaatoruTheme;
}) {
  const groups = [
    {
      title:
        details.subject.object === 'vocabulary' ? 'Kanji' : 'Radicals',
      subjects: details.components,
    },
    { title: 'Used in', subjects: details.amalgamations },
    {
      title: 'Visually similar kanji',
      subjects: details.similarKanji.map((subject) => ({
        ...subject,
        object: 'kanji' as const,
        primaryReading: null,
      })),
    },
  ].filter(({ subjects }) => subjects.length > 0);
  if (groups.length === 0) {
    return null;
  }
  return (
    <View style={{ gap: theme.spacing.lg }}>
      {groups.map(({ title, subjects }) => (
        <DetailCard key={title} title={title} theme={theme}>
          {subjects.map((subject) => (
            <RelatedSubjectAction
              key={subject.id}
              onOpenSubject={onOpenSubject}
              subject={subject}
              theme={theme}
            />
          ))}
        </DetailCard>
      ))}
    </View>
  );
}

function RelatedSubjectAction({
  onOpenSubject,
  subject,
  theme,
}: {
  readonly onOpenSubject: (subjectId: number) => void;
  readonly subject: RelatedSubject;
  readonly theme: TaatoruTheme;
}) {
  return (
    <Pressable
      accessibilityLabel={`Open ${subject.primaryMeaning}`}
      accessibilityRole="button"
      onPress={() => onOpenSubject(subject.id)}
      style={{
        alignItems: 'center',
        flexDirection: 'row',
        gap: theme.spacing.md,
        minHeight: minimumTouchTarget,
      }}
    >
      <Text
        style={[
          theme.typography.sectionTitle,
          { color: theme.colors.text, minWidth: 42 },
        ]}
      >
        {subject.characters ?? '◻︎'}
      </Text>
      <View style={{ flex: 1 }}>
        <Text style={[theme.typography.label, { color: theme.colors.text }]}>
          {subject.primaryMeaning}
        </Text>
        <Text
          style={[
            theme.typography.caption,
            { color: theme.colors.textMuted },
          ]}
        >
          Level {subject.level}
          {subject.primaryReading === null
            ? ''
            : ` · ${subject.primaryReading}`}
        </Text>
      </View>
    </Pressable>
  );
}

function Progress({
  details,
  theme,
}: {
  readonly details: SubjectDetailsSnapshot;
  readonly theme: TaatoruTheme;
}) {
  if (details.assignment === null && details.reviewStatistics === null) {
    return null;
  }
  return (
    <DetailCard title="Progress" theme={theme}>
      {details.assignment === null ? null : (
        <>
          <Stat label="SRS stage" value={String(details.assignment.srsStage)} />
          <OptionalDate label="Started" value={details.assignment.startedAt} />
          <OptionalDate
            label="Next review"
            value={details.assignment.availableAt}
          />
          <OptionalDate label="Passed" value={details.assignment.passedAt} />
          <OptionalDate label="Burned" value={details.assignment.burnedAt} />
        </>
      )}
      {details.reviewStatistics === null ? null : (
        <>
          <Text selectable style={bodyStyle(theme)}>
            {details.reviewStatistics.percentageCorrect}% correct
          </Text>
          <Stat
            label="Meaning answers"
            value={`${details.reviewStatistics.meaningCorrect} correct · ${details.reviewStatistics.meaningIncorrect} incorrect`}
          />
          <Stat
            label="Reading answers"
            value={`${details.reviewStatistics.readingCorrect} correct · ${details.reviewStatistics.readingIncorrect} incorrect`}
          />
        </>
      )}
    </DetailCard>
  );
}

function Stat({ label, value }: { readonly label: string; readonly value: string }) {
  const theme = useTheme();
  return (
    <Text selectable style={bodyStyle(theme)}>
      {label} {value}
    </Text>
  );
}

function OptionalDate({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string | null;
}) {
  if (value === null) {
    return null;
  }
  return <Stat label={label} value={formatDate(value)} />;
}

function EditableField({
  label,
  onChangeText,
  placeholder,
  value,
}: {
  readonly label: string;
  readonly onChangeText: (value: string) => void;
  readonly placeholder?: string;
  readonly value: string;
}) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.xs }}>
      <Text style={[theme.typography.label, { color: theme.colors.text }]}>
        {label}
      </Text>
      <TextInput
        accessibilityLabel={label}
        multiline
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textMuted}
        style={[
          theme.typography.body,
          {
            borderColor: theme.colors.border,
            borderRadius: 12,
            borderWidth: 1,
            color: theme.colors.text,
            minHeight: 72,
            padding: theme.spacing.md,
            textAlignVertical: 'top',
          },
        ]}
        value={value}
      />
    </View>
  );
}

function AudioAction({
  audio,
  onPlayAudio,
}: {
  readonly audio: SubjectAudio;
  readonly onPlayAudio?: (audio: SubjectAudio) => void;
}) {
  return onPlayAudio === undefined ? (
    <NativeAudioAction audio={audio} />
  ) : (
    <AudioButton audio={audio} onPress={() => onPlayAudio(audio)} />
  );
}

function NativeAudioAction({ audio }: { readonly audio: SubjectAudio }) {
  const player = useAudioPlayer(audio.url);
  return (
    <AudioButton
      audio={audio}
      onPress={() => {
        void player.seekTo(0).then(() => player.play());
      }}
    />
  );
}

function AudioButton({
  audio,
  onPress,
}: {
  readonly audio: SubjectAudio;
  readonly onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityLabel={`Play ${audio.pronunciation} audio`}
      accessibilityRole="button"
      onPress={onPress}
      style={{
        alignItems: 'center',
        alignSelf: 'flex-start',
        backgroundColor: theme.colors.surfaceMuted,
        borderCurve: 'continuous',
        borderRadius: 12,
        justifyContent: 'center',
        minHeight: minimumTouchTarget,
        paddingHorizontal: theme.spacing.lg,
      }}
    >
      <Text style={[theme.typography.label, { color: theme.colors.accent }]}>
        Play · {audio.voiceActorName}
      </Text>
    </Pressable>
  );
}

function DetailCard({
  children,
  theme,
  title,
}: {
  readonly children: ReactNode;
  readonly theme: TaatoruTheme;
  readonly title: string;
}) {
  return (
    <Card>
      <Text
        accessibilityRole="header"
        selectable
        style={[
          theme.typography.sectionTitle,
          { color: theme.colors.text },
        ]}
      >
        {title}
      </Text>
      {children}
    </Card>
  );
}

function bodyStyle(theme: TaatoruTheme): TextStyle {
  return {
    ...theme.typography.body,
    color: theme.colors.text,
  };
}

function optionalText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function normalizedSynonyms(value: string): readonly string[] {
  const normalized = value
    .split(/\n|,/)
    .map((synonym) => synonym.trim().toLowerCase())
    .filter((synonym) => synonym.length > 0);
  return [...new Set(normalized)];
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function radicalImage(subject: SubjectResource): string | null {
  if (subject.object !== 'radical' || subject.data.characters !== null) {
    return null;
  }
  return (
    subject.data.character_images.find(
      ({ content_type }) => content_type === 'image/png',
    )?.url ?? null
  );
}
