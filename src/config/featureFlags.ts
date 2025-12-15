const importMetaEnv = typeof import.meta !== 'undefined' ? (import.meta as any).env ?? {} : {}
const processEnv = typeof process !== 'undefined' ? process.env ?? {} : {}

const sensesFlag =
  (importMetaEnv.VITE_FEATURE_SENSES_FROM_DNA as string | undefined) ??
  (processEnv.VITE_FEATURE_SENSES_FROM_DNA as string | undefined)
const landBodyPlanFlag =
  (importMetaEnv.VITE_FEATURE_LAND_BODY_PLAN as string | undefined) ??
  (processEnv.VITE_FEATURE_LAND_BODY_PLAN as string | undefined)
const aquaticBodyPlanFlag =
  (importMetaEnv.VITE_FEATURE_AQUATIC_BODY_PLAN as string | undefined) ??
  (processEnv.VITE_FEATURE_AQUATIC_BODY_PLAN as string | undefined)
const aerialBodyPlanFlag =
  (importMetaEnv.VITE_FEATURE_AERIAL_BODY_PLAN as string | undefined) ??
  (processEnv.VITE_FEATURE_AERIAL_BODY_PLAN as string | undefined)

const parseFlag = (value: string | undefined, fallback = false) =>
  value === undefined ? fallback : value === '1' || value === 'true'

export const featureFlags = {
  sensesFromBodyPlan: parseFlag(sensesFlag, true),
  landBodyPlan: parseFlag(landBodyPlanFlag, true),
  aquaticBodyPlan: parseFlag(aquaticBodyPlanFlag, false),
  aerialBodyPlan: parseFlag(aerialBodyPlanFlag, false),
}
