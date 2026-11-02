import { registerRootComponent } from 'expo';
import { ExpoRoot } from 'expo-router';

// Explicit context avoids SDK-specific entry-root inference; these are the real app routes.
export function E2EApp() {
  const context = require.context('../../../app', true, /\.tsx$/);
  return <ExpoRoot context={context} />;
}

registerRootComponent(E2EApp);
