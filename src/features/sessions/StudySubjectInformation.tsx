import { useAudioPlayer } from 'expo-audio';
import {
  Image,
  Pressable,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SvgUri } from 'react-native-svg';
import { Volume2 } from 'lucide-react-native';
import type { ReactNode } from 'react';

import type { SubjectResource } from '@/api/types';
import type { SubjectStudyMaterial } from '@/features/subjects/subjectDetails';
import type { ReviewPrompt } from '@/features/reviews/types';
import { WaniKaniText } from '@/ui/components/WaniKaniText';
import { subjectColors } from '@/ui/theme/colors';
import { minimumTouchTarget } from '@/ui/theme/spacing';
import { useTheme } from '@/ui/theme/ThemeProvider';

export function StudySubjectHero({
  subject,
}: {
  readonly subject: SubjectResource;
}) {
  const compact = useWindowDimensions().height < 500;
  const colors = subjectColors[subject.object];
  const image =
    subject.object === 'radical'
      ? (subject.data.character_images.find(
          (item) => item.content_type === 'image/svg+xml',
        ) ?? subject.data.character_images[0])
      : undefined;
  const meaning =
    subject.data.meanings.find(({ primary }) => primary)?.meaning ??
    subject.data.slug;
  return (
    <View
      style={{
        backgroundColor: colors.background,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: compact ? 80 : 150,
        paddingHorizontal: 20,
        paddingVertical: compact ? 8 : 20,
        borderRadius: 16,
      }}
    >
      {subject.data.characters !== null ? (
        <Text
          selectable
          adjustsFontSizeToFit
          numberOfLines={2}
          style={{
            color: colors.foreground,
            fontSize: compact ? 44 : 76,
            lineHeight: compact ? 56 : 100,
            textAlign: 'center',
            alignSelf: 'stretch',
          }}
        >
          {subject.data.characters}
        </Text>
      ) : image?.content_type === 'image/svg+xml' ? (
        <SvgUri
          accessibilityLabel={`${meaning} radical image`}
          uri={image.url}
          width={compact ? 64 : 100}
          height={compact ? 64 : 100}
        />
      ) : image !== undefined ? (
        <Image
          accessibilityLabel={`${meaning} radical image`}
          source={{ uri: image.url }}
          style={{ width: compact ? 64 : 100, height: compact ? 64 : 100 }}
        />
      ) : (
        <Text style={{ color: colors.foreground }}>{meaning} radical</Text>
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
}: {
  readonly subject: SubjectResource;
  readonly material?: SubjectStudyMaterial;
  readonly revealedPrompt?: ReviewPrompt;
  readonly showAll?: boolean;
  readonly onShowAll?: () => void;
  readonly onPlayAudio?: (url: string) => void;
  readonly onOpenSubject?: (id: number) => void;
}) {
  const theme = useTheme();
  const showMeaning = showAll || revealedPrompt === 'meaning';
  const showReading = showAll || revealedPrompt === 'reading';
  const audio =
    'pronunciation_audios' in subject.data
      ? subject.data.pronunciation_audios[0]
      : undefined;
  const textStyle = [theme.typography.body, { color: theme.colors.text }];
  return (
    <View style={{ gap: 18 }}>
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
        <InformationSection title="Context sentences">
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
        <InformationSection title="Part of speech">
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
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        gap: 10,
        padding: 18,
        backgroundColor: theme.colors.surface,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: theme.colors.border,
      }}
    >
      <Text
        accessibilityRole="header"
        style={[theme.typography.label, { color: theme.colors.textMuted }]}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

export function StudyAction({
  label,
  accessibilityLabel,
  onPress,
  disabled = false,
  primary = false,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly disabled?: boolean;
  readonly primary?: boolean;
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
          : theme.colors.surfaceMuted,
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
