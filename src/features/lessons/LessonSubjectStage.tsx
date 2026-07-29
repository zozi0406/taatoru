import { useAudioPlayer } from 'expo-audio';
import {
  Image,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SvgUri } from 'react-native-svg';

import type { SubjectResource } from '@/api/types';
import { minimumTouchTarget } from '@/ui/theme/spacing';
import { subjectColors } from '@/ui/theme/colors';
import { useTheme } from '@/ui/theme/ThemeProvider';

interface LessonSubjectStageProps {
  readonly index: number;
  readonly onExit: () => void;
  readonly onNext: () => void;
  readonly onPlayAudio?: (url: string) => void;
  readonly subject: SubjectResource;
  readonly total: number;
}

export function LessonSubjectStage({
  index,
  onExit,
  onNext,
  onPlayAudio,
  subject,
  total,
}: LessonSubjectStageProps) {
  const theme = useTheme();
  const colors = subjectColors[subject.object];
  const meaning = primaryMeaning(subject);
  const readings =
    'readings' in subject.data
      ? subject.data.readings.map(({ reading }) => reading).join(', ')
      : '';
  const image =
    subject.object === 'radical'
      ? subject.data.character_images[0]
      : undefined;
  const audio =
    'pronunciation_audios' in subject.data
      ? subject.data.pronunciation_audios[0]
      : undefined;
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        flexGrow: 1,
        gap: theme.spacing.xl,
        padding: theme.spacing.xl,
      }}
      style={{ backgroundColor: colors.background }}
    >
      <View
        style={{
          alignItems: 'center',
          flexDirection: 'row',
          justifyContent: 'space-between',
        }}
      >
        <Text
          selectable
          style={[theme.typography.label, { color: colors.foreground }]}
        >
          Subject {index + 1} of {total}
        </Text>
        <Pressable
          accessibilityLabel="Exit lesson session"
          accessibilityRole="button"
          onPress={onExit}
          style={{ justifyContent: 'center', minHeight: minimumTouchTarget }}
        >
          <Text style={[theme.typography.label, { color: colors.foreground }]}>
            Exit
          </Text>
        </Pressable>
      </View>
      <View style={{ alignItems: 'center', gap: theme.spacing.md }}>
        {subject.data.characters !== null ? (
          <Text
            selectable
            style={{
              color: colors.foreground,
              fontSize: 92,
              fontWeight: '500',
              lineHeight: 112,
            }}
          >
            {subject.data.characters}
          </Text>
        ) : image?.content_type === 'image/svg+xml' ? (
          <SvgUri
            accessibilityLabel={`${meaning} radical image`}
            height={112}
            uri={image.url}
            width={112}
          />
        ) : image === undefined ? null : (
          <Image
            accessibilityLabel={`${meaning} radical image`}
            source={{ uri: image.url }}
            style={{ height: 112, width: 112 }}
          />
        )}
        <Text
          selectable
          style={[
            theme.typography.screenTitle,
            { color: colors.foreground, textAlign: 'center' },
          ]}
        >
          {meaning}
        </Text>
        {readings.length === 0 ? null : (
          <Text
            selectable
            style={[
              theme.typography.sectionTitle,
              { color: colors.foreground },
            ]}
          >
            {readings}
          </Text>
        )}
      </View>
      <View
        style={{
          backgroundColor: theme.colors.surface,
          borderCurve: 'continuous',
          borderRadius: 18,
          gap: theme.spacing.md,
          padding: theme.spacing.xl,
        }}
      >
        <Text
          selectable
          style={[
            theme.typography.sectionTitle,
            { color: theme.colors.text },
          ]}
        >
          Meaning mnemonic
        </Text>
        <Text selectable style={[theme.typography.body, { color: theme.colors.text }]}>
          {subject.data.meaning_mnemonic}
        </Text>
        {'reading_mnemonic' in subject.data ? (
          <>
            <Text
              selectable
              style={[
                theme.typography.sectionTitle,
                { color: theme.colors.text },
              ]}
            >
              Reading mnemonic
            </Text>
            <Text
              selectable
              style={[theme.typography.body, { color: theme.colors.text }]}
            >
              {subject.data.reading_mnemonic}
            </Text>
          </>
        ) : null}
        {audio === undefined ? null : onPlayAudio === undefined ? (
          <NativeLessonAudio
            pronunciation={audio.metadata.pronunciation}
            url={audio.url}
          />
        ) : (
          <Pressable
            accessibilityLabel={`Play ${audio.metadata.pronunciation} pronunciation`}
            accessibilityRole="button"
            onPress={() => onPlayAudio(audio.url)}
            style={{ justifyContent: 'center', minHeight: minimumTouchTarget }}
          >
            <Text style={[theme.typography.label, { color: theme.colors.accent }]}>
              Play pronunciation
            </Text>
          </Pressable>
        )}
      </View>
      <Pressable
        accessibilityLabel={
          index + 1 === total ? 'Continue to quiz' : 'Next lesson subject'
        }
        accessibilityRole="button"
        onPress={onNext}
        style={{
          alignItems: 'center',
          backgroundColor: theme.colors.surface,
          borderCurve: 'continuous',
          borderRadius: 14,
          justifyContent: 'center',
          minHeight: minimumTouchTarget,
        }}
      >
        <Text style={[theme.typography.label, { color: theme.colors.accent }]}>
          {index + 1 === total ? 'Start quiz' : 'Next'}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

function NativeLessonAudio({
  pronunciation,
  url,
}: {
  readonly pronunciation: string;
  readonly url: string;
}) {
  const player = useAudioPlayer(url);
  const theme = useTheme();
  return (
    <Pressable
      accessibilityLabel={`Play ${pronunciation} pronunciation`}
      accessibilityRole="button"
      onPress={() => {
        void player.seekTo(0).then(() => player.play());
      }}
      style={{ justifyContent: 'center', minHeight: minimumTouchTarget }}
    >
      <Text style={[theme.typography.label, { color: theme.colors.accent }]}>
        Play pronunciation
      </Text>
    </Pressable>
  );
}

export function primaryMeaning(subject: SubjectResource): string {
  return (
    subject.data.meanings.find(({ primary }) => primary)?.meaning ??
    subject.data.meanings[0]?.meaning ??
    subject.data.slug
  );
}
