import { screen } from '@testing-library/react-native';

import IndexScreen from '../../../app/index';
import { renderApp } from '../../test/render';

test('shows the Taatoru working title', async () => {
  await renderApp(<IndexScreen />);

  expect(screen.getByRole('header', { name: 'Taatoru' })).toBeOnTheScreen();
});
