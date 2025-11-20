import type { ControlState, SimulationSnapshot, WorldConfig } from './sim'

export interface TelemetryPayload {
  timings: Record<string, number>
  geneAverages: Record<string, number>
  fps?: number
}

export type MainToWorkerMessage =
  | { type: 'init'; payload: WorldConfig }
  | { type: 'update-controls'; payload: ControlState }
  | { type: 'set-paused'; payload: boolean }
  | { type: 'request-save' }
  | { type: 'load-snapshot'; payload: SimulationSnapshot }

export type WorkerToMainMessage =
  | { type: 'state'; payload: SimulationSnapshot }
  | { type: 'log'; payload: string }
  | { type: 'snapshot'; payload: SimulationSnapshot }
  | { type: 'telemetry'; payload: TelemetryPayload }
