import { execFileSync, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const VERSION_TAG = /^v(\d+\.\d+\.\d+)(?:-rc\.(\d+))?$/;

export function validateReleaseMetadata(input) {
  if (input.eventName !== 'push' || input.refType !== 'tag') {
    throw new Error('Release builds require a GitHub tag push.');
  }

  const match = VERSION_TAG.exec(input.tag);
  if (!match) {
    throw new Error(`Invalid version tag: ${input.tag}`);
  }
  if (match[1] !== input.appVersion) {
    throw new Error(`Tag ${input.tag} does not match app version ${input.appVersion}.`);
  }
  if (!Number.isInteger(input.versionCode) || input.versionCode < 1) {
    throw new Error('android.versionCode must be a positive integer.');
  }
  if (input.expectedCommitSha !== input.headCommitSha) {
    throw new Error('The checked-out commit does not match the tag event commit.');
  }
  if (!input.isOnMain) {
    throw new Error('The tagged commit is not reachable from origin/main.');
  }

  return { version: match[1], prerelease: match[2] !== undefined };
}

function output(command, args) {
  return execFileSync(command, args, { encoding: 'utf8' }).trim();
}

function resolveCommit(ref) {
  return output('git', ['rev-parse', `${ref}^{commit}`]);
}

function isAncestorOfMain(commitSha) {
  const result = spawnSync('git', ['merge-base', '--is-ancestor', commitSha, 'origin/main'], {
    stdio: 'ignore',
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status === 0) {
    return true;
  }
  if (result.status === 1) {
    return false;
  }
  throw new Error(`Unable to verify origin/main ancestry (git exit ${result.status}).`);
}

function main(args) {
  if (args.length !== 4) {
    throw new Error(
      'Usage: npm run validate:release -- <event_name> <ref_type> <tag> <github_sha>',
    );
  }

  const [eventName, refType, tag, expectedCommitRef] = args;
  const expoConfig = JSON.parse(output('npx', ['expo', 'config', '--type', 'public', '--json']));
  const headCommitSha = resolveCommit('HEAD');
  const expectedCommitSha = resolveCommit(expectedCommitRef);
  const result = validateReleaseMetadata({
    eventName,
    refType,
    tag,
    expectedCommitSha,
    headCommitSha,
    appVersion: expoConfig.version,
    versionCode: expoConfig.android?.versionCode,
    isOnMain: isAncestorOfMain(headCommitSha),
  });

  console.log(
    `Validated ${tag}: version=${result.version} versionCode=${expoConfig.android.versionCode} prerelease=${result.prerelease}`,
  );
}

const isCommandLine = process.argv[1]
  ? import.meta.url === pathToFileURL(resolve(process.argv[1])).href
  : false;

if (isCommandLine) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
