import { Types, createComponent } from '@iwsdk/core';

export const SpiritState = { Waking: 'waking', Awake: 'awake', Asleep: 'asleep' } as const;
export const FaceSource = { BuiltIn: 'built-in', Sheet: 'sheet' } as const;

/**
 * A woken object. Lives on the face entity. Tests and the MCP agent tools read it with
 * `ecs query`; the heavy runtime state (rig, audio, meshes) stays in the system.
 */
export const Spirit = createComponent('Spirit', {
  spiritId: { type: Types.String, default: '' },
  targetId: { type: Types.String, default: '' },
  label: { type: Types.String, default: '' },
  name: { type: Types.String, default: '' },
  state: { type: Types.Enum, enum: SpiritState, default: SpiritState.Waking },
  faceSource: { type: Types.Enum, enum: FaceSource, default: FaceSource.BuiltIn },
  hasPersona: { type: Types.Boolean, default: false },
  /** computed face target on the object's bounding box (world, metres) */
  anchor: { type: Types.Vec3, default: [0, 0, 0] },
  /** distance between the rendered face centre and the anchor, cm (placement metric) */
  anchorErrorCm: { type: Types.Float32, default: 0 },
  faceSize: { type: Types.Float32, default: 0 },
  pokes: { type: Types.Int32, default: 0 },
  pets: { type: Types.Int32, default: 0 },
  flicks: { type: Types.Int32, default: 0 },
  lines: { type: Types.Int32, default: 0 },
  speaking: { type: Types.Boolean, default: false },
  voiceMode: { type: Types.String, default: '' },
});
