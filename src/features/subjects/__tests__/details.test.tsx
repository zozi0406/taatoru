import { fireEvent, screen } from '@testing-library/react-native';

import { migrateDatabase } from '@/db/migrate';
import { NodeTestDatabase } from '@/db/NodeTestDatabase';
import { AssignmentRepository } from '@/db/repositories/AssignmentRepository';
import { ResourceRepository } from '@/db/repositories/ResourceRepository';
import { ReviewStatisticRepository } from '@/db/repositories/ReviewStatisticRepository';
import { StudyMaterialRepository } from '@/db/repositories/StudyMaterialRepository';
import { SubjectRepository } from '@/db/repositories/SubjectRepository';
import {
  assignmentFixture,
  kanjiFixture,
  radicalFixture,
  reviewStatisticFixture,
  studyMaterialFixture,
  userFixture,
  vocabularyFixture,
} from '@/fixtures/api';
import { renderApp } from '@/test/render';
import { ThemeProvider } from '@/ui/theme/ThemeProvider';
import { SubjectDetailsScreen } from '../SubjectDetailsScreen';
import {
  loadSubjectDetails,
  type SubjectDetailsSnapshot,
} from '../subjectDetails';

jest.mock('expo-audio', () => ({
  useAudioPlayer: () => ({
    play: jest.fn(),
    seekTo: jest.fn(async () => undefined),
  }),
}));

test('loads complete subject details and API relationships from local data', async () => {
  const db = await NodeTestDatabase.open();
  await migrateDatabase(db);
  try {
    await new ResourceRepository(db).replaceUser(userFixture);
    await new SubjectRepository(db).replaceSubjects(
      [radicalFixture, kanjiFixture, vocabularyFixture],
      null,
    );
    await new AssignmentRepository(db).replaceAssignments(
      [assignmentFixture],
      null,
    );
    await new StudyMaterialRepository(db).replaceStudyMaterials(
      [studyMaterialFixture],
      null,
    );
    await new ReviewStatisticRepository(db).replaceReviewStatistics(
      [reviewStatisticFixture],
      null,
    );

    const details = await loadSubjectDetails(db, kanjiFixture.id, {
      includeSimilarAboveLevel: false,
    });
    expect(details).toEqual(
      expect.objectContaining({
        subject: expect.objectContaining({ id: kanjiFixture.id }),
        assignment: expect.objectContaining({ srsStage: 2 }),
        reviewStatistics: expect.objectContaining({ percentageCorrect: 85 }),
        studyMaterial: {
          meaningNote: 'An invented meaning note.',
          meaningSynonyms: ['Single'],
          readingNote: 'An invented reading note.',
        },
        components: [expect.objectContaining({ id: radicalFixture.id })],
        amalgamations: [
          expect.objectContaining({ id: vocabularyFixture.id }),
        ],
      }),
    );
  } finally {
    await db.close();
  }
});

test('renders study information and queues edited notes and synonyms', async () => {
  const onSaveStudyMaterial = jest.fn(async () => undefined);
  const onPlayAudio = jest.fn();
  const onOpenSubject = jest.fn();
  await renderApp(
    <ThemeProvider scheme="light">
      <SubjectDetailsScreen
        details={detailsFixture()}
        onBack={jest.fn()}
        onOpenSubject={onOpenSubject}
        onPlayAudio={onPlayAudio}
        onSaveStudyMaterial={onSaveStudyMaterial}
      />
    </ThemeProvider>,
  );

  expect(screen.getAllByText('一')).not.toHaveLength(0);
  expect(screen.getByText('One')).toBeOnTheScreen();
  expect(screen.getByText('いち')).toBeOnTheScreen();
  expect(screen.getByText('One line is one.')).toBeOnTheScreen();
  expect(screen.getByText('Imagine saying ichi.')).toBeOnTheScreen();
  expect(screen.getByText('Hint: Picture a single line.')).toBeOnTheScreen();
  expect(screen.getByText('Hint: Say ichi clearly.')).toBeOnTheScreen();
  expect(screen.getByText('85% correct')).toBeOnTheScreen();
  expect(screen.getByText('Radicals')).toBeOnTheScreen();
  expect(screen.getByText('Used in')).toBeOnTheScreen();
  expect(screen.getByText('Visually similar kanji')).toBeOnTheScreen();

  await fireEvent.press(
    screen.getByRole('button', { name: 'Play いち audio' }),
  );
  expect(onPlayAudio).toHaveBeenCalledTimes(1);
  await fireEvent.press(screen.getByRole('button', { name: 'Open Ground' }));
  expect(onOpenSubject).toHaveBeenCalledWith(radicalFixture.id);

  await fireEvent.changeText(
    screen.getByLabelText('Meaning note'),
    '  Updated meaning note  ',
  );
  await fireEvent.changeText(
    screen.getByLabelText('Reading note'),
    'Updated reading note',
  );
  await fireEvent.changeText(
    screen.getByLabelText('Meaning synonyms'),
    'Single\nUnity\nsingle',
  );
  await fireEvent.press(
    screen.getByRole('button', { name: 'Save study materials' }),
  );

  expect(onSaveStudyMaterial).toHaveBeenCalledWith({
    meaningNote: 'Updated meaning note',
    meaningSynonyms: ['single', 'unity'],
    readingNote: 'Updated reading note',
  });
  expect(await screen.findByText('Saved on this device')).toBeOnTheScreen();
});

test('renders vocabulary context, parts of speech, and pronunciation audio', async () => {
  const fixture = detailsFixture();
  await renderApp(
    <ThemeProvider scheme="light">
      <SubjectDetailsScreen
        details={{
          ...fixture,
          subject: vocabularyFixture,
          meanings: ['One Thing'],
          readings: ['ひとつ'],
          audio: [
            {
              pronunciation: 'ひとつ',
              url: 'https://files.wanikani.com/fixture-vocabulary.mp3',
              voiceActorName: 'Fixture Voice',
            },
          ],
          similarKanji: [],
        }}
        onBack={jest.fn()}
        onOpenSubject={jest.fn()}
        onPlayAudio={jest.fn()}
        onSaveStudyMaterial={jest.fn(async () => undefined)}
      />
    </ThemeProvider>,
  );

  expect(screen.getByText('りんごが一つあります。')).toBeOnTheScreen();
  expect(screen.getByText('There is one apple.')).toBeOnTheScreen();
  expect(screen.getByText('numeral')).toBeOnTheScreen();
  expect(
    screen.getByRole('button', { name: 'Play ひとつ audio' }),
  ).toBeOnTheScreen();
});

function detailsFixture(): SubjectDetailsSnapshot {
  return {
    subject: {
      ...kanjiFixture,
      data: {
        ...kanjiFixture.data,
        meaning_hint: 'Picture a single line.',
        reading_hint: 'Say ichi clearly.',
      },
    },
    meanings: ['One', 'One Thing'],
    readings: ['いち'],
    assignment: {
      srsStage: 2,
      availableAt: '2026-07-29T13:00:00.000Z',
      burnedAt: null,
      passedAt: null,
      startedAt: '2026-07-02T12:00:00.000Z',
    },
    reviewStatistics: {
      meaningCorrect: 8,
      meaningIncorrect: 1,
      percentageCorrect: 85,
      readingCorrect: 9,
      readingIncorrect: 2,
    },
    studyMaterial: {
      meaningNote: 'An invented meaning note.',
      meaningSynonyms: ['Single'],
      readingNote: 'An invented reading note.',
    },
    audio: [
      {
        pronunciation: 'いち',
        url: 'https://files.wanikani.com/fixture.mp3',
        voiceActorName: 'Fixture Voice',
      },
    ],
    components: [
      {
        id: radicalFixture.id,
        object: radicalFixture.object,
        level: radicalFixture.data.level,
        characters: radicalFixture.data.characters,
        primaryMeaning: 'Ground',
        primaryReading: null,
      },
    ],
    amalgamations: [
      {
        id: vocabularyFixture.id,
        object: vocabularyFixture.object,
        level: vocabularyFixture.data.level,
        characters: vocabularyFixture.data.characters,
        primaryMeaning: 'One Thing',
        primaryReading: 'ひとつ',
      },
    ],
    similarKanji: [
      {
        id: 202,
        level: 2,
        characters: '二',
        primaryMeaning: 'Two',
      },
    ],
  };
}
