import { serialize, unserialize } from 'php-serialize'

import {
  DEFAULT_WORLD_CONFIG,
  SNAPSHOT_VERSION,
  type AgentMode,
  type AgentState,
  type Biome,
  type SimulationSnapshot,
  type WorldConfig,
} from '@/types/sim'
import { clamp } from '@/utils/math'
import { BODY_PLAN_VERSION, createBaseBodyPlan, prepareDNA } from '@/ecs/bodyPlan'

type LegacyCreature = Record<string, unknown>

export function legacyPhpToSnapshot(raw: string, config?: WorldConfig): SimulationSnapshot {
  const parsed = unserialize(raw) as Record<string, LegacyCreature>
  const agents: AgentState[] = []

  Object.entries(parsed).forEach(([id, creature]) => {
    const agent = normalizeLegacyCreature(id, creature)
    if (agent) {
      agents.push(agent)
    }
  })

  return {
    version: SNAPSHOT_VERSION,
    config: config ? cloneConfig(config) : DEFAULT_WORLD_CONFIG,
    tick: 0,
    agents,
    plants: [],
    stats: {
      totalBirths: agents.length,
      totalDeaths: 0,
      mutations: 0,
      averageFitness: 0,
    },
  }
}

export function snapshotToLegacyPhp(snapshot: SimulationSnapshot): string {
  const record: Record<string, LegacyCreature> = {}
  snapshot.agents.forEach((agent) => {
    if (agent.dna.archetype !== 'hunter' && agent.dna.archetype !== 'prey') return
    record[`agent${agent.id}`] = serializeAgent(agent)
  })
  return serialize(record, 'utf-8')
}

function normalizeLegacyCreature(id: string, creature: LegacyCreature): AgentState | null {
  const type = (creature.type as string)?.toLowerCase()
  if (type !== 'hunter' && type !== 'prey') return null

  const speedGene = Number(creature.speed ?? 50)
  const visionGene = Number(creature.eyesightfactor ?? 30)
  const hunger = Number(creature.threshold ?? 60)
  const maxStorage = Number(creature.max_storage ?? 140)
  const escapeTimer = Number(creature.escape_time ?? 0)
  const dangerTimeShort = Number(creature.danger_time ?? escapeTimer)
  const fallbackDangerLong = dangerTimeShort > 0 ? dangerTimeShort * 2 : 2
  const dangerTimeLong = Number(creature.danger_time_long ?? fallbackDangerLong)
  const lingerGene = Number(creature.linger_rate ?? 50)
  const fightEnergyRate = Number(creature.fight_energy_rate ?? 50)
  const rawMutation = Number(creature.mutation_rate ?? NaN)
  const mutationRate =
    Number.isFinite(rawMutation) && rawMutation > 0
      ? clamp(rawMutation > 1 ? rawMutation / 100 : rawMutation, 0.0001, 0.2)
      : 0.01
  const color = (creature.color as string) ?? '#ffffff'
  const fillColor = (creature.fill as string) ?? color
  const className = (creature.class as string) ?? `org ${color}`
  const genderRaw = ((creature.gender as string) ?? '').toLowerCase()
  const gender = genderRaw === 'm' ? 'm' : 'f'
  const patrol = {
    x: Number(creature.patrolx ?? 0),
    y: Number(creature.patroly ?? 0),
    set: String(creature.patrolset ?? 'false') === 'true',
  }
  const body = {
    width: Number(creature.width ?? (type === 'hunter' ? 20 : 10)),
    height: Number(creature.height ?? (type === 'hunter' ? 20 : 10)),
    radius: Number(creature.r ?? 10),
  }

  const biome: Biome = 'land'
  const dna = {
    archetype: type,
    biome,
    familyColor: color,
    baseSpeed: mapRange(speedGene, 0, 100, 180, 420),
    visionRange: mapRange(visionGene, 0, 100, 140, 360),
    hungerThreshold: hunger,
    fatCapacity: maxStorage,
    fatBurnThreshold: clamp(Number(creature.store_using_threshold ?? maxStorage * 0.6), 0, maxStorage),
    patrolThreshold: Number(creature.patrol_threshold ?? hunger * 0.7),
    aggression: clamp(Number(creature.aggression ?? 50) / 100, 0, 1),
    bravery: clamp(Number(creature.power ?? 50) / 100, 0, 1),
    power: Number(creature.power ?? 50),
    defence: Number(creature.defence ?? 40),
    fightPersistence: clamp(Number(creature.fight_rate ?? 50) / 100, 0, 1),
    escapeTendency: clamp(Number(creature.escape_rate ?? 50) / 100, 0, 1),
    escapeDuration: Number(creature.escape_long ?? 2),
    lingerRate: clamp(Number(creature.linger_rate ?? 50) / 100, 0, 1),
    dangerRadius: Number(creature.danger_distance ?? 120),
    attentionSpan: clamp(dangerTimeLong / 20, 0.2, 1.5),
    libidoThreshold: clamp(Number(creature.sex_threshold ?? 60) / 120, 0.1, 1),
    libidoGainRate: clamp(Number(creature.sex_desire ?? 50) / 500, 0.01, 0.2),
    mutationRate,
    bodyMass: clamp(maxStorage / 100, 0.8, 2),
    metabolism: mapRange(hunger, 0, 100, 4, 12),
    turnRate: clamp(1 + lingerGene / 80, 0.5, 4),
    curiosity: clamp(Number(creature.patrol_threshold ?? 50) / 100, 0.2, 1),
    cohesion: clamp(Number(creature.escape_rate ?? 50) / 120, 0.1, 1),
    fear: clamp(Number(creature.danger_distance ?? 40) / 160, 0.1, 1),
    camo: clamp(Number(creature.defence ?? 40) / 120, 0.05, 0.9),
    awareness: clamp(Number(creature.eyesightfactor ?? 50) / 100, 0.3, 1),
    fertility: clamp(Number(creature.sex_desire ?? 50) / 100, 0.2, 0.9),
    gestationCost: clamp(Number(creature.sex_threshold ?? 60), 5, 40),
    moodStability: clamp(1 - fightEnergyRate / 130, 0.1, 1),
    preferredFood: type === 'hunter' ? ['prey'] : ['plant'],
    stamina: clamp(mapRange(speedGene, 0, 100, 0.6, 1.4), 0.4, 2),
    circadianBias: type === 'hunter' ? 0.4 : -0.3,
    sleepEfficiency: clamp(1 - Number(creature.stress ?? 20) / 120, 0.4, 1),
    scavengerAffinity: type === 'hunter' ? 0.4 : 0.15,
    senseUpkeep: 0,
    bodyPlanVersion: BODY_PLAN_VERSION,
    bodyPlan: createBaseBodyPlan(type, biome),
  }

  const preparedDNA = prepareDNA(dna)

  return {
    id: parseInt(id.replace(/\D+/g, ''), 10) || Math.floor(Math.random() * 100000),
    dna: preparedDNA,
    position: { x: Number(creature.x ?? 0), y: Number(creature.y ?? 0) },
    velocity: { x: 0, y: 0 },
    heading: 0,
    energy: Number(creature.energy ?? 60),
    fatStore: clamp(Number(creature.store ?? 0), 0, preparedDNA.fatCapacity),
    age: Number(creature.age ?? 0),
    mode: legacyMode(creature.mode as string),
    mood: {
      stress: clamp(Number(creature.stress ?? 20) / 100, 0, 1),
      focus: clamp(Number(creature.focus ?? 50) / 100, 0, 1),
      social: clamp(Number(creature.social ?? 50) / 100, 0, 1),
    },
    target: null,
    escapeCooldown: escapeTimer,
    gestationTimer: 0,
    injuries: 0,
    libido: clamp(Number(creature.sex_desire ?? 0) / 100, 0, 1),
    sexCooldown: 0,
    legacy: {
      gender,
      fightEnergyRate,
      patrol,
      dangerTime: dangerTimeShort,
      dangerTimeLong,
      escapeTime: escapeTimer,
      body,
      className,
      fillColor,
    },
    mutationMask: 0,
  }
}

function serializeAgent(agent: AgentState): LegacyCreature {
  const { dna } = agent
  const legacy = agent.legacy
  const speedGene = Math.round(mapRange(dna.baseSpeed, 180, 420, 0, 100))
  const visionGene = Math.round(mapRange(dna.visionRange, 140, 360, 0, 100))
  const hungerThreshold = Math.max(0, Math.round(dna.hungerThreshold))
  const fatCapacity = Math.max(0, Math.round(dna.fatCapacity))
  const store = clamp(Math.round(agent.fatStore), 0, fatCapacity)
  const storeUsingThreshold = clamp(Math.round(dna.fatBurnThreshold), 0, fatCapacity)
  const aggression = Math.round(clamp(dna.aggression, 0, 1) * 100)
  const fightRate = Math.round(clamp(dna.fightPersistence, 0, 1) * 100)
  const escapeRate = Math.round(clamp(dna.escapeTendency, 0, 1) * 100)
  const lingerRate = Math.round(clamp(dna.lingerRate, 0, 1) * 100)
  const libidoThreshold = Math.round(clamp(dna.libidoThreshold, 0, 1) * 120)
  const libido = Math.round(clamp(agent.libido, 0, 1) * 100)
  const attentionSpan = clamp(dna.attentionSpan ?? 0.5, 0.1, 2)
  const dangerTimeLong = Math.max(1, Math.round(attentionSpan * 20))
  const escapeLong = Math.max(1, Math.round(dna.escapeDuration))
  const dangerDistance = Math.max(1, Math.round(dna.dangerRadius))
  const patrolThreshold = Math.max(0, Math.round(dna.patrolThreshold))
  const gender = legacy?.gender ?? (agent.id % 2 === 0 ? 'm' : 'f')
  const className = legacy?.className ?? `org ${dna.familyColor}`
  const fillColor = legacy?.fillColor ?? dna.familyColor
  const energy = Math.max(0, Math.round(agent.energy))
  const age = Math.max(0, Math.round(agent.age))
  const escapeTime = Math.max(0, Math.round(legacy?.escapeTime ?? agent.escapeCooldown))
  const fightEnergyRate = Math.round(
    legacy?.fightEnergyRate ?? clamp(dna.moodStability ?? dna.bravery ?? 0.5, 0, 1) * 100,
  )
  const dangerTime = legacy?.dangerTime ?? escapeTime
  const legacyDangerLong = legacy?.dangerTimeLong
  const body = legacy?.body
  const width = body?.width ?? (dna.archetype === 'hunter' ? 20 : 10)
  const height = body?.height ?? (dna.archetype === 'hunter' ? 20 : 10)
  const radius = body?.radius ?? (dna.archetype === 'hunter' ? 10 : 10)
  const patrol = legacy?.patrol ?? { x: 0, y: 0, set: false }
  const dangerTimeLongValue = legacyDangerLong ?? dangerTimeLong

  return {
    id: `${dna.archetype}${agent.id}`,
    x: agent.position.x,
    y: agent.position.y,
    width,
    height,
    r: radius,
    fill: fillColor,
    mode: exportLegacyMode(agent.mode),
    type: dna.archetype,
    color: dna.familyColor,
    class: className,
    family: dna.familyColor,
    energy,
    threshold: hungerThreshold,
    speed: speedGene,
    eyesightfactor: visionGene,
    sex_desire: libido,
    sex_threshold: libidoThreshold,
    store,
    store_using_threshold: storeUsingThreshold,
    max_storage: fatCapacity,
    patrol_threshold: patrolThreshold,
    danger_distance: dangerDistance,
    danger_time: dangerTime,
    danger_time_long: dangerTimeLongValue,
    linger_rate: lingerRate,
    power: Math.round(dna.power),
    defence: Math.round(dna.defence),
    fight_rate: fightRate,
    fight_energy_rate: fightEnergyRate,
    escape_rate: escapeRate,
    escape_long: escapeLong,
    escape_time: escapeTime,
    aggression,
    gender,
    age,
    patrolx: patrol.x,
    patroly: patrol.y,
    patrolset: patrol.set ? 'true' : 'false',
  }
}

function exportLegacyMode(mode: AgentMode): string {
  switch (mode) {
    case 'hunt':
    case 'graze':
      return 'hunt'
    case 'flee':
      return 'danger'
    case 'mate':
      return 'sex'
    case 'patrol':
      return 'patrol'
    case 'fight':
      return 'fight'
    default:
      return 'sleep'
  }
}

function legacyMode(mode?: string): AgentMode {
  switch (mode) {
    case 'danger':
      return 'flee'
    case 'hunt':
      return 'hunt'
    case 'patrol':
      return 'patrol'
    case 'sex':
      return 'mate'
    default:
      return 'patrol'
  }
}

function mapRange(value: number, inMin: number, inMax: number, outMin: number, outMax: number) {
  const clamped = clamp(value, inMin, inMax)
  const normalized = (clamped - inMin) / (inMax - inMin || 1)
  return outMin + normalized * (outMax - outMin)
}

function cloneConfig(config: WorldConfig): WorldConfig {
  return {
    ...config,
    bounds: { ...config.bounds },
  }
}
