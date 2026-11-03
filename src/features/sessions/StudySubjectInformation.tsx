import { useState } from 'react';
import { useAudioPlayer } from 'expo-audio';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { ChevronDown, ChevronUp, Volume2 } from 'lucide-react-native';
import type { ReactNode } from 'react';

import type { SubjectResource } from '@/api/types';
import { radicalImageSource } from '@/features/media/radicalImages';
import type { SubjectStudyMaterial } from '@/features/subjects/subjectDetails';
import type { ReviewPrompt } from '@/features/reviews/types';
import { WaniKaniText } from '@/ui/components/WaniKaniText';
import { RadicalImage } from '@/ui/components/RadicalImage';
import { subjectColors } from '@/ui/theme/colors';
import { minimumTouchTarget } from '@/ui/theme/spacing';
import { useTheme } from '@/ui/theme/ThemeProvider';

export function StudySubjectHero({
  subject,
  onReadyChange,
  compact: compactOverride = false,
}: {
  readonly subject: SubjectResource;
  readonly compact?: boolean;
  readonly onReadyChange?: (ready: boolean) => void;
}) {
  const compact = useWindowDimensions().height < 500 || compactOverride;
  const theme = useTheme();
  const colors = subjectColors[subject.object];
  const ink = theme.scheme === 'light' ? colors.background : colors.foreground;
  return (
    <View
      style={{
        backgroundColor: theme.scheme === 'light' ? `${colors.background}14` : colors.background,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: compact ? 84 : 174,
        paddingHorizontal: 20,
        paddingVertical: compact ? 6 : 12,
        borderRadius: 16,
      }}
    >
      {subject.data.characters !== null ? (
        <Text
          selectable
          adjustsFontSizeToFit
          numberOfLines={2}
          style={{
            color: ink,
            fontSize: compact ? 52 : 82,
            lineHeight: compact ? 66 : 104,
            textAlign: 'center',
            alignSelf: 'stretch',
          }}
        >
          {subject.data.characters}
        </Text>
      ) : (
        <RadicalImage
          key={subject.id}
          image={radicalImageSource(subject)}
          size={compact ? 52 : 80}
          color={ink}
          onReadyChange={onReadyChange}
        />
      )}
    </View>
  );
}

export function StudySubjectInformation({
  subject,
  material,
  revealedPrompt,
  showAll = true,
  onShowAll,
  onPlayAudio,
  onOpenSubject,
  presentation = false,
}: {
  readonly subject: SubjectResource;
  readonly material?: SubjectStudyMaterial;
  readonly revealedPrompt?: ReviewPrompt;
  readonly showAll?: boolean;
  readonly onShowAll?: () => void;
  readonly onPlayAudio?: (url: string) => void;
  readonly onOpenSubject?: (id: number) => void;
  readonly presentation?: boolean;
}) {
  const theme = useTheme();
  const showMeaning = showAll || revealedPrompt === 'meaning';
  const showReading = showAll || revealedPrompt === 'reading';
  const audio =
    'pronunciation_audios' in subject.data
      ? subject.data.pronunciation_audios[0]
      : undefined;
  const textStyle = [theme.typography.body, { color: theme.colors.text }];
  const readingSection = (
    <InformationSection title="Reading">
      {'readings' in subject.data ? (
        [...subject.data.readings]
          .sort((a, b) => Number(b.primary) - Number(a.primary))
          .map((reading) => (
            <Text key={reading.reading} selectable style={textStyle}>
              {reading.reading}
              {'type' in reading
                ? ` · ${reading.type === 'onyomi' ? 'On’yomi' : reading.type === 'kunyomi' ? 'Kun’yomi' : 'Nanori'}`
                : ''}
              {reading.primary ? ' · Primary' : ''}
            </Text>
          ))
      ) : (
        <Text selectable style={textStyle}>
          {subject.data.characters}
        </Text>
      )}
      {audio === undefined ? null : (
        <StudyAudio
          url={audio.url}
          pronunciation={audio.metadata.pronunciation}
          onPlayAudio={onPlayAudio}
        />
      )}
    </InformationSection>
  );
  return (
    <View style={{ gap: 18 }}>
      {presentation &&
      showReading &&
      ('readings' in subject.data || subject.object === 'kana_vocabulary')
        ? readingSection
        : null}
      {showMeaning ? (
        <>
          <InformationSection title="Meaning">
            <Text selectable style={textStyle}>
              {subject.data.meanings.map(({ meaning }) => meaning).join(', ')}
            </Text>
            {(material?.meaningSynonyms.length ?? 0) > 0 ? (
              <Text selectable style={textStyle}>
                Your synonyms: {material!.meaningSynonyms.join(', ')}
              </Text>
            ) : null}
          </InformationSection>
          <InformationSection title="Meaning mnemonic">
            <WaniKaniText selectable style={textStyle}>
              {subject.data.meaning_mnemonic}
            </WaniKaniText>
            {'meaning_hint' in subject.data && subject.data.meaning_hint ? (
              <WaniKaniText selectable style={textStyle}>
                {subject.data.meaning_hint}
              </WaniKaniText>
            ) : null}
            {material?.meaningNote ? (
              <Text selectable style={textStyle}>
                Your note: {material.meaningNote}
              </Text>
            ) : null}
          </InformationSection>
        </>
      ) : null}
      {showReading &&
      ('readings' in subject.data || subject.object === 'kana_vocabulary') ? (
        <>
          {presentation ? null : readingSection}
          {'reading_mnemonic' in subject.data ? (
            <InformationSection title="Reading mnemonic">
              <WaniKaniText selectable style={textStyle}>
                {subject.data.reading_mnemonic}
              </WaniKaniText>
              {'reading_hint' in subject.data && subject.data.reading_hint ? (
                <WaniKaniText selectable style={textStyle}>
                  {subject.data.reading_hint}
                </WaniKaniText>
              ) : null}
              {material?.readingNote ? (
                <Text selectable style={textStyle}>
                  Your note: {material.readingNote}
                </Text>
              ) : null}
            </InformationSection>
          ) : null}
        </>
      ) : null}
      {showAll &&
      'context_sentences' in subject.data &&
      subject.data.context_sentences.length > 0 ? (
        <InformationSection title="Context sentences" collapsible>
          {subject.data.context_sentences.map((sentence) => (
            <View key={sentence.ja} style={{ gap: 6 }}>
              <Text selectable style={textStyle}>
                {sentence.ja}
              </Text>
              <Text
                selectable
                style={[
                  theme.typography.body,
                  { color: theme.colors.textMuted },
                ]}
              >
                {sentence.en}
              </Text>
            </View>
          ))}
        </InformationSection>
      ) : null}
      {showAll && 'parts_of_speech' in subject.data ? (
        <InformationSection title="Part of speech" collapsible>
          <Text selectable style={textStyle}>
            {subject.data.parts_of_speech.join(', ')}
          </Text>
        </InformationSection>
      ) : null}
      {!showAll && onShowAll !== undefined ? (
        <StudyAction label="Show all information" onPress={onShowAll} />
      ) : null}
      {onOpenSubject === undefined ? null : (
        <StudyAction
          label="Open full subject details"
          onPress={() => onOpenSubject(subject.id)}
        />
      )}
    </View>
  );
}

export function InformationSection({
  title,
  children,
  collapsible = false,
}: {
  readonly title: string;
  readonly children: ReactNode;
  readonly collapsible?: boolean;
}) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);
  const heading = (
    <Text
      accessibilityRole={collapsible ? undefined : 'header'}
      style={[
        theme.typography.label,
        { color: theme.colors.textMuted, flex: 1 },
      ]}
    >
      {title}
    </Text>
  );
  return (
    <View
      style={{
        gap: 10,
        paddingVertical: 14,
        borderTopWidth: 1,
        borderColor: theme.colors.border,
      }}
    >
      {collapsible ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={title}
          accessibilityState={{ expanded }}
          onPress={() => setExpanded((value) => !value)}
          style={{
            minHeight: 48,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
          }}
        >
          {heading}
          {expanded ? (
            <ChevronUp size={20} color={theme.colors.textMuted} />
          ) : (
            <ChevronDown size={20} color={theme.colors.textMuted} />
          )}
        </Pressable>
      ) : (
        heading
      )}
      {!collapsible || expanded ? children : null}
    </View>
  );
}

export function StudyAction({
  label,
  accessibilityLabel,
  onPress,
  disabled = false,
  primary = false,
  quiet = false,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly disabled?: boolean;
  readonly primary?: boolean;
  readonly quiet?: boolean;
  readonly accessibilityLabel?: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      disabled={disabled}
      style={({ pressed }) => ({
        minHeight: minimumTouchTarget,
        paddingHorizontal: 16,
        paddingVertical: 12,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 12,
        backgroundColor: primary
          ? theme.colors.accent
          : quiet
            ? 'transparent'
            : theme.colors.surfaceMuted,
        borderWidth: quiet ? 1 : 0,
        borderColor: theme.colors.border,
        opacity: disabled || pressed ? 0.5 : 1,
      })}
      onPress={onPress}
    >
      <Text
        style={[
          theme.typography.label,
          {
            color: primary ? theme.colors.accentForeground : theme.colors.text,
            textAlign: 'center',
          },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function StudyAudio({
  url,
  pronunciation,
  onPlayAudio,
}: {
  readonly url: string;
  readonly pronunciation: string;
  readonly onPlayAudio?: (url: string) => void;
}) {
  const player = useAudioPlayer(url);
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Play ${pronunciation} pronunciation`}
      onPress={() => {
        if (onPlayAudio !== undefined) onPlayAudio(url);
        else {
          void player.seekTo(0);
          player.play();
        }
      }}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        minHeight: minimumTouchTarget,
      }}
    >
      <Volume2 size={20} color={theme.colors.accent} />
      <Text style={[theme.typography.label, { color: theme.colors.accent }]}>
        Play pronunciation
      </Text>
    </Pressable>
  );
}
