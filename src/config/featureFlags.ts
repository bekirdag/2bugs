const importMetaEnv = typeof import.meta !== 'undefined' ? (import.meta as any).env ?? {} : {}
const processEnv = typeof process !== 'undefined' ? process.env ?? {} : {}

const sensesFlag =
  (importMetaEnv.VITE_FEATURE_SENSES_FROM_DNA as string | undefined) ??
  (processEnv.VITE_FEATURE_SENSES_FROM_DNA as string | undefined)

const parseFlag = (value: string | undefined) => value === '1' || value === 'true'

export const featureFlags = {
  sensesFromBodyPlan: parseFlag(sensesFlag),
}
