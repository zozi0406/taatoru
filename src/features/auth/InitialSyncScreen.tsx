import { useEffect } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  FadeInDown,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/ui/theme/ThemeProvider';

import type { InitialSyncPhase, InitialSyncState } from './AuthProvider';

interface InitialSyncScreenProps {
  readonly state: InitialSyncState;
  readonly busy: boolean;
  readonly onRetry: () => Promise<void>;
  readonly onUseDifferentToken: () => Promise<void>;
  readonly onContinueInterrupted: () => Promise<void>;
  readonly onUseAnotherApiKey: () => Promise<void>;
}

interface PhaseDefinition {
  readonly id: InitialSyncPhase;
  readonly label: string;
  readonly detail: string;
}

const PHASES: readonly PhaseDefinition[] = [
  {
    id: 'account-connected',
    label: 'Account connected',
    detail: 'Your WaniKani account is ready.',
  },
  {
    id: 'subjects',
    label: 'Downloading subjects',
    detail: 'Loading kanji, vocabulary, and radicals.',
  },
  {
    id: 'account-data',
    label: 'Syncing your progress',
    detail: 'Bringing over assignments and review history.',
  },
  {
    id: 'offline-library',
    label: 'Building offline library',
    detail: 'Finishing the data you can use without a connection.',
  },
];

export function InitialSyncScreen({
  state,
  busy,
  onRetry,
  onUseDifferentToken,
  onContinueInterrupted,
  onUseAnotherApiKey,
}: InitialSyncScreenProps) {
  const theme = useTheme();
  const connectionIssues = state.status === 'connection-issues';
  const attention = state.status === 'attention';
  const phaseIndex = PHASES.findIndex((phase) => phase.id === state.phase);

  return (
    <ScrollView
      contentContainerStyle={styles.screenContent}
      contentInsetAdjustmentBehavior="automatic"
      testID="initial-sync-screen"
      style={[styles.screen, { backgroundColor: theme.colors.canvas }]}
    >
      <Animated.View
        entering={FadeInDown.duration(220).reduceMotion(ReduceMotion.System)}
        style={styles.heading}
      >
        <View
          style={[
            styles.brandMark,
            { backgroundColor: theme.colors.accent },
          ]}
        >
          <Text
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[
              styles.brandGlyph,
              { color: theme.colors.accentForeground },
            ]}
          >
            多
          </Text>
        </View>
        <Text
          accessibilityLiveRegion="polite"
          accessibilityRole="header"
          style={[styles.title, { color: theme.colors.text }]}
        >
          {connectionIssues
            ? 'Connection issues'
            : attention
              ? 'Setup needs attention'
              : 'Preparing Taatoru'}
        </Text>
        <Text
          style={[styles.intro, { color: theme.colors.textMuted }]}
        >
          {connectionIssues
            ? 'Your progress is safe. Taatoru will try again automatically when your connection returns.'
            : attention
              ? state.message ?? 'Taatoru could not finish setting up your account.'
              : 'We’re creating your private offline library. You can start learning as soon as this finishes.'}
        </Text>
      </Animated.View>

      <View
        style={[
          styles.phaseCard,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
          },
        ]}
      >
        {PHASES.map((phase, index) => {
          const phaseState =
            index < phaseIndex
              ? 'completed'
              : index === phaseIndex
                ? 'in progress'
                : 'upcoming';
          return (
            <PhaseRow
              key={phase.id}
              definition={phase}
              phaseState={phaseState}
              showConnector={index < PHASES.length - 1}
              stalled={connectionIssues || attention}
            />
          );
        })}
      </View>

      {connectionIssues || attention ? (
        <Animated.View
          entering={FadeInDown.duration(220)
            .delay(80)
            .reduceMotion(ReduceMotion.System)}
          style={styles.actions}
        >
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => void onRetry()}
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: theme.colors.accent },
              (pressed || busy) && styles.pressed,
            ]}
          >
            {busy ? (
              <ActivityIndicator color={theme.colors.accentForeground} />
            ) : (
              <Text
                style={[
                  styles.primaryButtonText,
                  { color: theme.colors.accentForeground },
                ]}
              >
                Retry now
              </Text>
            )}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => void onUseDifferentToken()}
            style={({ pressed }) => [
              styles.secondaryButton,
              { borderColor: theme.colors.border },
              pressed && styles.pressed,
            ]}
          >
            <Text
              style={[
                styles.secondaryButtonText,
                { color: theme.colors.text },
              ]}
            >
              Use a different API token
            </Text>
          </Pressable>
          <Text
            style={[styles.retryNote, { color: theme.colors.textMuted }]}
          >
            Retry is paced to protect your WaniKani rate limit.
          </Text>
        </Animated.View>
      ) : (
        <View style={styles.waitingRow}>
          <ActivityIndicator color={theme.colors.accent} />
          <Text
            style={[styles.waitingText, { color: theme.colors.textMuted }]}
          >
            Keep Taatoru open while setup finishes
          </Text>
        </View>
      )}

      <InterruptedSetupModal
        busy={busy}
        visible={state.status === 'interrupted'}
        onContinue={onContinueInterrupted}
        onUseAnotherApiKey={onUseAnotherApiKey}
      />
    </ScrollView>
  );
}

function PhaseRow({
  definition,
  phaseState,
  showConnector,
  stalled,
}: {
  readonly definition: PhaseDefinition;
  readonly phaseState: 'completed' | 'in progress' | 'upcoming';
  readonly showConnector: boolean;
  readonly stalled: boolean;
}) {
  const theme = useTheme();
  const active = phaseState === 'in progress';
  const completed = phaseState === 'completed';
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (active && !stalled) {
      pulse.value = withRepeat(
        withTiming(1.14, {
          duration: 260,
          reduceMotion: ReduceMotion.System,
        }),
        -1,
        true,
      );
    } else {
      pulse.value = withTiming(1, {
        duration: 180,
        reduceMotion: ReduceMotion.System,
      });
    }
  }, [active, pulse, stalled]);

  const animatedMarker = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));

  return (
    <View
      accessibilityLabel={`${definition.label}, ${phaseState}`}
      accessibilityState={{ busy: active && !stalled }}
      accessible
      style={styles.phaseRow}
    >
      <View style={styles.markerColumn}>
        <Animated.View
          style={[
            styles.marker,
            {
              backgroundColor:
                active || completed
                  ? theme.colors.accent
                  : theme.colors.surfaceMuted,
              borderColor:
                active || completed
                  ? theme.colors.accent
                  : theme.colors.border,
            },
            active && animatedMarker,
          ]}
        >
          <Text
            style={[
              styles.markerText,
              {
                color:
                  active || completed
                    ? theme.colors.accentForeground
                    : theme.colors.textMuted,
              },
            ]}
          >
            {completed ? '✓' : active ? '•' : ''}
          </Text>
        </Animated.View>
        {showConnector ? (
          <View
            style={[
              styles.connector,
              {
                backgroundColor: completed
                  ? theme.colors.accent
                  : theme.colors.border,
              },
            ]}
          />
        ) : null}
      </View>
      <View style={styles.phaseCopy}>
        <Text
          style={[
            styles.phaseLabel,
            {
              color:
                phaseState === 'upcoming'
                  ? theme.colors.textMuted
                  : theme.colors.text,
            },
          ]}
        >
          {definition.label}
        </Text>
        <Text
          style={[styles.phaseDetail, { color: theme.colors.textMuted }]}
        >
          {definition.detail}
        </Text>
      </View>
    </View>
  );
}

function InterruptedSetupModal({
  visible,
  busy,
  onContinue,
  onUseAnotherApiKey,
}: {
  readonly visible: boolean;
  readonly busy: boolean;
  readonly onContinue: () => Promise<void>;
  readonly onUseAnotherApiKey: () => Promise<void>;
}) {
  const theme = useTheme();
  return (
    <Modal
      animationType="fade"
      onRequestClose={() => undefined}
      transparent
      visible={visible}
    >
      <View
        accessibilityViewIsModal
        style={[
          styles.modalBackdrop,
          { backgroundColor: 'rgba(5, 12, 24, 0.62)' },
        ]}
      >
        <View
          style={[
            styles.modalCard,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <Text
            accessibilityRole="header"
            style={[styles.modalTitle, { color: theme.colors.text }]}
          >
            Setup was interrupted
          </Text>
          <Text
            style={[styles.modalBody, { color: theme.colors.textMuted }]}
          >
            To make sure nothing is out of date, Taatoru will discard the
            partial download and restart the download from the beginning.
          </Text>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => void onContinue()}
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: theme.colors.accent },
              (pressed || busy) && styles.pressed,
            ]}
          >
            {busy ? (
              <ActivityIndicator color={theme.colors.accentForeground} />
            ) : (
              <Text
                style={[
                  styles.primaryButtonText,
                  { color: theme.colors.accentForeground },
                ]}
              >
                Continue syncing
              </Text>
            )}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => void onUseAnotherApiKey()}
            style={({ pressed }) => [
              styles.secondaryButton,
              { borderColor: theme.colors.border },
              pressed && styles.pressed,
            ]}
          >
            <Text
              style={[
                styles.secondaryButtonText,
                { color: theme.colors.text },
              ]}
            >
              Use another API key
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  actions: {
    gap: 12,
    marginTop: 24,
  },
  brandGlyph: {
    fontSize: 24,
    fontWeight: '800',
  },
  brandMark: {
    alignItems: 'center',
    borderRadius: 18,
    height: 56,
    justifyContent: 'center',
    marginBottom: 20,
    width: 56,
  },
  connector: {
    flex: 1,
    marginVertical: 4,
    width: 2,
  },
  heading: {
    alignItems: 'center',
    marginBottom: 28,
  },
  intro: {
    fontSize: 16,
    lineHeight: 23,
    marginTop: 10,
    maxWidth: 420,
    textAlign: 'center',
  },
  marker: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 2,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  markerColumn: {
    alignItems: 'center',
    marginRight: 14,
    width: 28,
  },
  markerText: {
    fontSize: 17,
    fontWeight: '800',
    lineHeight: 19,
  },
  modalBackdrop: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  modalBody: {
    fontSize: 16,
    lineHeight: 23,
    marginBottom: 22,
  },
  modalCard: {
    borderRadius: 22,
    borderWidth: 1,
    gap: 12,
    maxWidth: 440,
    padding: 24,
    width: '100%',
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  phaseCard: {
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 20,
  },
  phaseCopy: {
    flex: 1,
    paddingBottom: 24,
  },
  phaseDetail: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: 3,
  },
  phaseLabel: {
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 22,
  },
  phaseRow: {
    flexDirection: 'row',
    minHeight: 74,
  },
  pressed: {
    opacity: 0.65,
  },
  primaryButton: {
    alignItems: 'center',
    borderRadius: 14,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: 18,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
  retryNote: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  screen: {
    flex: 1,
  },
  screenContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 22,
    paddingVertical: 36,
  },
  secondaryButton: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: 18,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.7,
    textAlign: 'center',
  },
  waitingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    marginTop: 24,
  },
  waitingText: {
    fontSize: 14,
    lineHeight: 20,
  },
});
