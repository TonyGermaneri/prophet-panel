/**
 * Which of the two instruments the panel is dressed as.
 *
 * The Prophet-5 and Prophet-10 Rev4 are the same synthesizer twice: the same faceplate, the same
 * parameters, the same sysex. They differ in voice count and in the number printed on the logo,
 * and voice count is not something a control surface can observe — the instrument allocates its
 * own voices. So this is presentation only, and deliberately so: no code outside the chrome should
 * ever branch on it, or the two would drift into being two panels to maintain.
 */

export type SynthModel = 'prophet-5' | 'prophet-10'

export interface ModelInfo {
  id: SynthModel
  /** As printed and as written in prose. */
  name: string
  voices: number
}

export const MODELS: Record<SynthModel, ModelInfo> = {
  'prophet-5': { id: 'prophet-5', name: 'Prophet-5', voices: 5 },
  'prophet-10': { id: 'prophet-10', name: 'Prophet-10', voices: 10 },
}

export const MODEL_IDS = Object.keys(MODELS) as SynthModel[]

export const DEFAULT_MODEL: SynthModel = 'prophet-10'

export function modelInfo(model: SynthModel): ModelInfo {
  return MODELS[model] ?? MODELS[DEFAULT_MODEL]
}

export function modelName(model: SynthModel): string {
  return modelInfo(model).name
}

/** The one the logo switches to when clicked. */
export function otherModel(model: SynthModel): SynthModel {
  return model === 'prophet-5' ? 'prophet-10' : 'prophet-5'
}

export function documentTitle(model: SynthModel): string {
  return `${modelName(model)} Control Panel`
}
