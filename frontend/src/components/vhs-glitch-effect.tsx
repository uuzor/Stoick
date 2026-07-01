import { forwardRef, useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Effect } from 'postprocessing'
import { Uniform } from 'three'

/**
 * VHS Glitch Effect (via Efecto) — adapted for Vite + React Three Fiber (TS).
 * RGB shift / chromatic aberration · scanlines · noise displacement · VHS
 * vertical-bar distortion · glitch blocks · film grain. Shader is unchanged.
 */

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uGrain;
  uniform float uGlitchBlocks;
  uniform float uRgbShift;
  uniform float uScanlines;
  uniform float uNoise;
  uniform float uDistortion;
  uniform float uSpeed;
  uniform bool uAnimated;

  float rand(vec2 co) {
    return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
  }

  float verticalBar(float pos, float uvY, float offset) {
    float edge0 = pos - 0.02;
    float edge1 = pos + 0.02;
    float x = smoothstep(edge0, pos, uvY) * offset;
    x -= smoothstep(pos, edge1, uvY) * offset;
    return x;
  }

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    float t = uAnimated ? uTime * uSpeed : 0.0;
    vec2 texCoord = uv;

    // VHS vertical-bar distortion
    if (uDistortion > 0.0) {
      for (float i = 0.0; i < 0.71; i += 0.1313) {
        float d = mod(t * i, 1.7);
        float o = sin(1.0 - tan(t * 0.24 * i));
        o *= uDistortion * 0.05;
        texCoord.x += verticalBar(d, texCoord.y, o);
      }
    }

    // Noise displacement
    if (uNoise > 0.0) {
      float noiseY = texCoord.y * 250.0;
      noiseY = float(int(noiseY)) * (1.0 / 250.0);
      float noiseVal = rand(vec2(t * 0.00001, noiseY));
      texCoord.x += noiseVal * uNoise * 0.01;
    }

    // RGB shift / chromatic aberration
    vec2 direction = texCoord - 0.5;
    float dist = length(direction) * 0.7;
    vec2 offset = dist * normalize(direction) * uRgbShift * 0.02;

    vec2 offsetR = offset + vec2(sin(t) * 0.003, 0.0) * uRgbShift;
    vec2 offsetB = -offset + vec2(cos(t * 0.97) * 0.003, 0.0) * uRgbShift;

    float r = texture2D(inputBuffer, texCoord + offsetR).r;
    float g = texture2D(inputBuffer, texCoord).g;
    float b = texture2D(inputBuffer, texCoord + offsetB).b;

    vec3 color = vec3(r, g, b);

    // Scanlines
    if (uScanlines > 0.0) {
      float scanline = sin(uv.y * 800.0 + t * 10.0) * 0.5 + 0.5;
      scanline = pow(scanline, 1.5);
      color *= 1.0 - (scanline * uScanlines * 0.15);

      float hLine = sin(uv.y * 300.0) * 0.5 + 0.5;
      hLine = step(0.98, hLine);
      color *= 1.0 - (hLine * uScanlines * 0.1);
    }

    // Random glitch blocks
    if (uGlitchBlocks > 0.0 && uAnimated) {
      float blockThreshold = 1.0 - (uGlitchBlocks * 0.15);
      float blockNoise = rand(vec2(floor(uv.y * 20.0), floor(t * 10.0)));
      if (blockNoise > blockThreshold) {
        float blockOffset = (rand(vec2(floor(t * 30.0), floor(uv.y * 20.0))) - 0.5) * 0.1 * uGlitchBlocks;
        vec2 blockUV = vec2(uv.x + blockOffset, uv.y);
        color = texture2D(inputBuffer, blockUV).rgb;
      }
    }

    // Film grain
    if (uGrain > 0.0) {
      float grain = rand(uv + t) * 0.05 * uGrain;
      color += grain - (0.025 * uGrain);
    }

    outputColor = vec4(color, 1.0);
  }
`

export interface VhsGlitchProps {
  grain?: number
  glitchBlocks?: number
  rgbShift?: number
  scanlines?: number
  noise?: number
  distortion?: number
  speed?: number
  animated?: boolean
}

const DEFAULTS: Required<VhsGlitchProps> = {
  grain: 1.4,
  glitchBlocks: 0.8,
  rgbShift: 0,
  scanlines: 0.55,
  noise: 0.85,
  distortion: 2.45,
  speed: 1,
  animated: true,
}

class VhsGlitchEffectImpl extends Effect {
  constructor(options: VhsGlitchProps = {}) {
    const o = { ...DEFAULTS, ...options }
    super('VhsGlitchEffect', fragmentShader, {
      uniforms: new Map<string, Uniform>([
        ['uTime', new Uniform(0)],
        ['uGrain', new Uniform(o.grain)],
        ['uGlitchBlocks', new Uniform(o.glitchBlocks)],
        ['uRgbShift', new Uniform(o.rgbShift)],
        ['uScanlines', new Uniform(o.scanlines)],
        ['uNoise', new Uniform(o.noise)],
        ['uDistortion', new Uniform(o.distortion)],
        ['uSpeed', new Uniform(o.speed)],
        ['uAnimated', new Uniform(o.animated)],
      ]),
    })
  }
}

export const VhsGlitchEffect = forwardRef<VhsGlitchEffectImpl, VhsGlitchProps>((props, ref) => {
  const effect = useMemo(() => new VhsGlitchEffectImpl(props), []) // eslint-disable-line react-hooks/exhaustive-deps

  // Advance the shader clock every frame — reliable regardless of how the
  // postprocessing pass forwards deltaTime.
  useFrame((_, delta) => {
    effect.uniforms.get('uTime')!.value += delta
  })

  useEffect(() => {
    const o = { ...DEFAULTS, ...props }
    effect.uniforms.get('uGrain')!.value = o.grain
    effect.uniforms.get('uGlitchBlocks')!.value = o.glitchBlocks
    effect.uniforms.get('uRgbShift')!.value = o.rgbShift
    effect.uniforms.get('uScanlines')!.value = o.scanlines
    effect.uniforms.get('uNoise')!.value = o.noise
    effect.uniforms.get('uDistortion')!.value = o.distortion
    effect.uniforms.get('uSpeed')!.value = o.speed
    effect.uniforms.get('uAnimated')!.value = o.animated
  }, [effect, props])

  return <primitive ref={ref} object={effect} dispose={null} />
})

VhsGlitchEffect.displayName = 'VhsGlitchEffect'
