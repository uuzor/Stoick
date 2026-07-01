import { Suspense } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { EffectComposer } from '@react-three/postprocessing'
import { useTexture } from '@react-three/drei'
import { VhsGlitchEffect } from './vhs-glitch-effect'

/**
 * The landing subject: the wraith figure, centered (contain) on the warm-black
 * canvas and tinted toward the Mist palette, with the VHS glitch as a post pass.
 * Lazy-loaded (see Landing) so the wallet bundle stays light.
 */
function Backdrop() {
  const { viewport } = useThree()
  const tex = useTexture('/wraith-landing.png')
  const img = tex.image as { width?: number; height?: number } | undefined
  const aspect = img?.width && img?.height ? img.width / img.height : 400 / 600

  const h = viewport.height * 0.94
  const w = h * aspect

  return (
    <mesh scale={[w, h, 1]}>
      <planeGeometry />
      {/* greyscale image kept black & white (white multiply = untinted) */}
      <meshBasicMaterial map={tex} color="#ffffff" toneMapped={false} />
    </mesh>
  )
}

export default function GlitchStage() {
  return (
    <Canvas
      camera={{ position: [0, 0, 5], fov: 50 }}
      dpr={[1, 2]}
      gl={{ antialias: true }}
      style={{ background: '#0F0E09' }}
    >
      <color attach="background" args={['#0F0E09']} />
      <Suspense fallback={null}>
        <Backdrop />
      </Suspense>
      <EffectComposer>
        <VhsGlitchEffect
          grain={0.6}
          glitchBlocks={0.5}
          rgbShift={1.2}
          scanlines={0.4}
          noise={0.5}
          distortion={1.2}
          speed={0.6}
          animated
        />
      </EffectComposer>
    </Canvas>
  )
}
