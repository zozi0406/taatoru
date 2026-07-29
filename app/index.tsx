import { StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function IndexScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <Text accessibilityRole="header" style={styles.title}>
        Taatoru
      </Text>
      <Text style={styles.status}>Preparing your local library…</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: '#F7F8FA',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  status: {
    color: '#68707D',
    fontSize: 16,
    marginTop: 8,
    textAlign: 'center',
  },
  title: {
    color: '#17202A',
    fontSize: 32,
    fontWeight: '700',
  },
});
