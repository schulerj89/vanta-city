import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { format } from 'prettier';

const logicalIdPattern = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
const kebabIdPattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));

export const repositoryRoot = path.resolve(scriptDirectory, '../..');
export const sourcePath = path.join(
  repositoryRoot,
  'narrative/ashfall-story-bible.json',
);
export const documentPath = path.join(
  repositoryRoot,
  'docs/narrative/ashfall-story-bible.md',
);

export async function loadStoryBible() {
  return JSON.parse(await readFile(sourcePath, 'utf8'));
}

export function validateStoryBible(bible) {
  const issues = [];
  const ids = new Map();
  const register = (id, label, pattern = logicalIdPattern) => {
    if (typeof id !== 'string' || !pattern.test(id)) {
      issues.push(`${label} has invalid id "${String(id)}"`);
      return;
    }
    const owner = ids.get(id);
    if (owner) issues.push(`${label} duplicates ${owner} id "${id}"`);
    else ids.set(id, label);
  };
  const requireText = (value, label) => {
    if (typeof value !== 'string' || value.trim().length === 0) {
      issues.push(`${label} must be non-empty text`);
    }
  };

  if (bible.schemaVersion !== 1) issues.push('schemaVersion must be 1');
  register(bible.setting?.settingId, 'setting', kebabIdPattern);
  if (bible.setting?.year !== 1997) issues.push('setting.year must be 1997');
  requireText(bible.setting?.preciseDateRange, 'setting.preciseDateRange');

  const authority = bible.canonAuthority ?? {};
  if (authority.defaultPlayableCharacterId !== 'casual') {
    issues.push('canonAuthority.defaultPlayableCharacterId must stay "casual"');
  }
  if (authority.playerDialogueIdentityId !== 'rook') {
    issues.push('canonAuthority.playerDialogueIdentityId must stay "rook"');
  }
  for (const id of ['mack', 'nox', 'raze']) {
    if (!authority.authoritativeNpcIds?.includes(id)) {
      issues.push(`canonAuthority.authoritativeNpcIds must include "${id}"`);
    }
  }

  for (const district of bible.districts ?? []) {
    register(district.id, 'district', kebabIdPattern);
    requireText(district.history, `${district.id}.history`);
    if (!district.currentPressures?.length) {
      issues.push(`${district.id}.currentPressures must not be empty`);
    }
  }
  for (const faction of bible.factions ?? []) {
    register(faction.id, 'faction', kebabIdPattern);
    for (const field of ['goal', 'resources', 'methods']) {
      if (!faction[field]?.length)
        issues.push(`${faction.id}.${field} is empty`);
    }
  }

  const speakers = new Set();
  const entities = new Set();
  for (const character of bible.characters ?? []) {
    register(character.id, 'character', kebabIdPattern);
    if (!kebabIdPattern.test(character.speakerId ?? '')) {
      issues.push(`${character.id}.speakerId must be kebab-case`);
    }
    if (!kebabIdPattern.test(character.entityId ?? '')) {
      issues.push(`${character.id}.entityId must be kebab-case`);
    }
    if (speakers.has(character.speakerId)) {
      issues.push(`duplicate speakerId "${character.speakerId}"`);
    }
    if (entities.has(character.entityId)) {
      issues.push(`duplicate entityId "${character.entityId}"`);
    }
    speakers.add(character.speakerId);
    entities.add(character.entityId);
    for (const field of [
      'goal',
      'pressure',
      'contradiction',
      'leverage',
      'relationshipChange',
      'gameplayFunction',
      'arc',
      'voicePattern',
      'visualAssetDependency',
    ]) {
      requireText(character[field], `${character.id}.${field}`);
    }
  }
  const rook = (bible.characters ?? []).find(({ id }) => id === 'rook');
  if (rook?.entityId !== 'casual' || rook?.speakerId !== 'rook') {
    issues.push('Rook must remain speaker "rook" backed by entity "casual"');
  }

  const locationIds = new Set();
  for (const entry of bible.locationGlossary ?? []) {
    if (!logicalIdPattern.test(entry.id ?? '')) {
      issues.push(`location has invalid id "${String(entry.id)}"`);
    } else if (locationIds.has(entry.id)) {
      issues.push(`duplicate location id "${entry.id}"`);
    }
    locationIds.add(entry.id);
    requireText(entry.runtimeStatus, `${entry.id}.runtimeStatus`);
  }
  for (const fact of bible.worldStateFacts ?? []) {
    register(fact.id, 'world-state fact', kebabIdPattern);
    requireText(fact.initialValue, `${fact.id}.initialValue`);
  }
  for (const beat of bible.threeActSpine ?? []) {
    register(beat.id, 'story beat', kebabIdPattern);
    requireText(beat.irreversibleTurn, `${beat.id}.irreversibleTurn`);
  }

  if (bible.missions?.length !== 6) {
    issues.push(
      `expected exactly 6 mission premises, found ${bible.missions?.length ?? 0}`,
    );
  }
  const missionIds = new Set((bible.missions ?? []).map(({ id }) => id));
  for (const mission of bible.missions ?? []) {
    register(mission.id, 'mission', kebabIdPattern);
    requireText(mission.title, `${mission.id}.title`);
    requireText(mission.narrativePurpose, `${mission.id}.narrativePurpose`);
    requireText(mission.characterChange, `${mission.id}.characterChange`);
    requireText(mission.startTrigger?.id, `${mission.id}.startTrigger.id`);
    requireText(
      mission.startTrigger?.locationId,
      `${mission.id}.startTrigger.locationId`,
    );
    if (!mission.objectives?.length)
      issues.push(`${mission.id}.objectives is empty`);
    for (const objective of mission.objectives ?? []) {
      register(objective.id, 'objective', kebabIdPattern);
      requireText(objective.summary, `${objective.id}.summary`);
      requireText(
        objective.feasibleMapping?.kind,
        `${objective.id}.feasibleMapping.kind`,
      );
      requireText(
        objective.feasibleMapping?.referenceId,
        `${objective.id}.feasibleMapping.referenceId`,
      );
    }
    for (const id of [
      ...(mission.dialogueIds ?? []),
      ...(mission.cinematicIds ?? []),
    ]) {
      if (!logicalIdPattern.test(id))
        issues.push(`${mission.id} has invalid content reference "${id}"`);
    }
    for (const dependency of mission.systemDependencies ?? []) {
      if (
        !['implemented', 'roadmap', 'definition-only'].includes(
          dependency.status,
        )
      ) {
        issues.push(
          `${mission.id} has invalid dependency status "${dependency.status}"`,
        );
      }
      requireText(dependency.reason, `${mission.id}.${dependency.id}.reason`);
    }
    for (const prerequisite of mission.prerequisites?.missionIds ?? []) {
      if (!missionIds.has(prerequisite)) {
        issues.push(
          `${mission.id} references unknown prerequisite mission "${prerequisite}"`,
        );
      }
    }
    requireText(mission.failure?.retry, `${mission.id}.failure.retry`);
    requireText(mission.failure?.cancel, `${mission.id}.failure.cancel`);
    requireText(mission.failure?.skip, `${mission.id}.failure.skip`);
    if (!Array.isArray(mission.rewards?.equipmentChanges)) {
      issues.push(`${mission.id}.rewards.equipmentChanges must be an array`);
    }
    if (!mission.persistentFacts?.length) {
      issues.push(`${mission.id}.persistentFacts must not be empty`);
    }
    requireText(mission.sceneChange, `${mission.id}.sceneChange`);
  }

  if (!bible.openCreativeDecisions?.length)
    issues.push('openCreativeDecisions is empty');
  if (!bible.blockedDependencies?.length)
    issues.push('blockedDependencies is empty');
  if (!bible.productionNeeds?.length) issues.push('productionNeeds is empty');
  requireText(bible.nextSlices?.mission001, 'nextSlices.mission001');
  requireText(bible.nextSlices?.cinematic001, 'nextSlices.cinematic001');

  if (issues.length) {
    throw new Error(`Invalid Ashfall story bible:\n- ${issues.join('\n- ')}`);
  }
  return bible;
}

export async function renderStoryBible(bible) {
  const lines = [];
  const add = (...values) => lines.push(...values);
  const bullets = (values) => values.forEach((value) => add(`- ${value}`));
  const field = (label, value) => add(`- **${label}:** ${value}`);

  add(
    '<!-- GENERATED from narrative/ashfall-story-bible.json. Do not edit directly. -->',
    '',
    `# ${bible.title}`,
    '',
    bible.logline,
    '',
    '## Canon authority',
    '',
  );
  field('Setting', `${bible.setting.name}, ${bible.setting.preciseDateRange}`);
  field('Canonical source', '`narrative/ashfall-story-bible.json`');
  field('Playable entity', '`casual`');
  field(
    'Player dialogue identity',
    '`rook` (alias only; never a second playable definition)',
  );
  field(
    'Existing NPC/speakers',
    bible.canonAuthority.authoritativeNpcIds
      .map((id) => `\`${id}\``)
      .join(', '),
  );
  field('Runtime boundary', bible.canonAuthority.runtimeBoundary);

  add(
    '',
    '## Setting, history, and pressure',
    '',
    bible.setting.citySummary,
    '',
  );
  for (const district of bible.districts) {
    add(`### ${district.name} (\`${district.id}\`)`, '', district.history, '');
    field('Current status', district.runtimeStatus);
    field('Current pressures', district.currentPressures.join('; '));
  }

  add('', '## Themes and tone boundaries', '');
  for (const theme of bible.themes) field(theme.name, theme.statement);
  add('', '**Tone boundaries**', '');
  bullets(bible.toneBoundaries);

  add('', '## Factions', '');
  for (const faction of bible.factions) {
    add(`### ${faction.name} (\`${faction.id}\`)`, '');
    field('Goal', faction.goal.join('; '));
    field('Resources', faction.resources.join('; '));
    field('Methods', faction.methods.join('; '));
    field('Relationships', faction.relationships.join('; '));
  }

  add('', '## Recurring cast', '');
  for (const character of bible.characters) {
    add(`### ${character.name} (\`${character.id}\`)`, '');
    field(
      'Speaker / entity',
      `\`${character.speakerId}\` / \`${character.entityId}\``,
    );
    field('Goal', character.goal);
    field('Pressure', character.pressure);
    field('Contradiction', character.contradiction);
    field('Leverage', character.leverage);
    field('Relationship change', character.relationshipChange);
    field('Gameplay function', character.gameplayFunction);
    field('Arc', character.arc);
    field('Voice', character.voicePattern);
    field('Visual dependency', character.visualAssetDependency);
  }

  add('', '## Three-act spine', '');
  for (const beat of bible.threeActSpine) {
    add(
      `### ${beat.act}: ${beat.title} (\`${beat.id}\`)`,
      '',
      beat.summary,
      '',
    );
    field('Irreversible turn', beat.irreversibleTurn);
    field('Relationship / risk / state change', beat.change);
  }

  add('', '## Location glossary', '');
  for (const location of bible.locationGlossary) {
    field(
      `\`${location.id}\` — ${location.name}`,
      `${location.description} Runtime: ${location.runtimeStatus}`,
    );
  }

  add('', '## Chronology and canon facts', '');
  for (const item of bible.chronology) field(item.date, item.event);
  add('', '**World-state facts**', '');
  for (const fact of bible.worldStateFacts)
    field(`\`${fact.id}\``, `${fact.initialValue} — ${fact.meaning}`);

  add('', '## First six mission premises', '');
  for (const mission of bible.missions) {
    add(`### ${mission.id}: ${mission.title}`, '');
    field('Narrative purpose', mission.narrativePurpose);
    field('Character change', mission.characterChange);
    field(
      'Prerequisites',
      [
        ...mission.prerequisites.missionIds,
        ...mission.prerequisites.worldStateFacts,
      ]
        .map((id) => `\`${id}\``)
        .join(', ') || 'None',
    );
    field(
      'Start',
      `${mission.startTrigger.kind} \`${mission.startTrigger.id}\` at \`${mission.startTrigger.locationId}\``,
    );
    add('', '**Objectives**', '');
    for (const objective of mission.objectives) {
      field(
        `\`${objective.id}\``,
        `${objective.summary} Mapping: ${objective.feasibleMapping.kind} \`${objective.feasibleMapping.referenceId}\` (${objective.feasibleMapping.status}).`,
      );
    }
    field(
      'Highlights',
      mission.highlights
        .map((item) => `${item.kind} \`${item.referenceId}\``)
        .join('; '),
    );
    field(
      'Dialogue IDs',
      mission.dialogueIds.map((id) => `\`${id}\``).join(', ') || 'None',
    );
    field(
      'Cinematic IDs',
      mission.cinematicIds.map((id) => `\`${id}\``).join(', ') || 'None',
    );
    field(
      'Gameplay events',
      mission.gameplayEvents
        .map((event) => `\`${event.id}\` via ${event.system} (${event.status})`)
        .join('; '),
    );
    field(
      'System dependencies',
      mission.systemDependencies
        .map(
          (dependency) =>
            `\`${dependency.id}\` ${dependency.status}: ${dependency.reason}`,
        )
        .join('; '),
    );
    field('Failure', mission.failure.conditions.join('; '));
    field('Retry', mission.failure.retry);
    field('Cancel', mission.failure.cancel);
    field('Skip', mission.failure.skip);
    field(
      'Rewards',
      `${mission.rewards.moneyDelta >= 0 ? '+' : ''}${mission.rewards.moneyDelta} money; equipment: ${mission.rewards.equipmentChanges.join(', ') || 'none'}; facts: ${mission.rewards.factChanges.join(', ')}`,
    );
    field('Persistent facts', mission.persistentFacts.join(', '));
    field(
      'Post-mission / hooks',
      `${mission.postMissionAvailability} ${mission.followUpHooks.join('; ')}`,
    );
    field('Scene change', mission.sceneChange);
  }

  add(
    '',
    '## Production boundaries and handoff',
    '',
    '**Open creative decisions**',
    '',
  );
  bullets(bible.openCreativeDecisions);
  add('', '**Blocked dependencies**', '');
  bullets(bible.blockedDependencies);
  add('', '**Production assets and systems needed**', '');
  bullets(bible.productionNeeds);
  add('', '**Next smallest slices**', '');
  field('MISSION-001', bible.nextSlices.mission001);
  field('CINEMATIC-001', bible.nextSlices.cinematic001);
  add('', '## Provenance and originality', '');
  bullets(bible.provenanceAndOriginality);
  add('');
  return format(`${lines.join('\n')}\n`, { parser: 'markdown' });
}
