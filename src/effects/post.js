// Postprocessing chain — loaded as its own chunk only on the medium/high tiers.
//   RenderPass → UnrealBloomPass (HDR, half-res or less) → OutputPass (ACES + sRGB) → cinematic pass
// Based on three.js examples/webgl_postprocessing_unreal_bloom (EffectComposer + UnrealBloomPass + OutputPass).
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import fullscreenVert from '../shaders/fullscreen.vert.glsl?raw';
import cinematicFrag from '../shaders/cinematic.frag.glsl?raw';

export function createPost(renderer, scene, camera, tier) {
  const size = renderer.getSize(new THREE.Vector2());
  const composer = new EffectComposer(renderer);   // HalfFloat targets: bloom sees real HDR values
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x * tier.bloom.scale, size.y * tier.bloom.scale), tier.bloom.strength, tier.bloom.radius, tier.bloom.threshold);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const cinematic = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null }, uResolution: { value: new THREE.Vector2(size.x, size.y) }, uCenter: { value: new THREE.Vector2(0.5, 0.5) },
      uTime: { value: 0 }, uGrain: { value: tier.grain }, uVignette: { value: 0.55 }, uAberration: { value: 0 },
      uBlur: { value: 0 }, uFlash: { value: 0 }, uFlashColor: { value: new THREE.Color(0.86, 0.94, 1.0) },
    },
    vertexShader: fullscreenVert, fragmentShader: cinematicFrag,
  });
  composer.addPass(cinematic);
  const u = cinematic.uniforms;
  let tierRef = tier;
  return {
    composer, bloom, uniforms: u,
    setTier(t) {
      tierRef = t;
      bloom.strength = t.bloom.strength; bloom.radius = t.bloom.radius; bloom.threshold = t.bloom.threshold;
      u.uGrain.value = t.grain;
      this.setSize(renderer.getSize(new THREE.Vector2()).x, renderer.getSize(new THREE.Vector2()).y, renderer.getPixelRatio());
    },
    setSize(w, h, pr) {
      composer.setPixelRatio(pr); composer.setSize(w, h);
      bloom.resolution.set(w * tierRef.bloom.scale, h * tierRef.bloom.scale);
      u.uResolution.value.set(w * pr, h * pr);
    },
    render(dt, elapsed, fx) {
      u.uTime.value = elapsed;
      u.uBlur.value = fx.blur;
      u.uAberration.value = tierRef.aberration ? fx.aberration : 0;
      composer.render(dt);
    },
    dispose() { composer.dispose(); bloom.dispose(); },
  };
}
