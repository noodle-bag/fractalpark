import type { FractalParams, GradientStop, PluginParamRecord } from '../types';
import { assembleShader, makeCacheKey } from '../shaders/assembler';
import { ShaderCache } from '../shaders/cache';
import { pluginRegistry } from '../plugins/registry';
import type { PluginCombination, PluginUniformDescriptor } from '../plugins/types';

const ORBIT_TRAP_SHAPE_TO_UNIFORM: Record<string, number> = {
  point: 0,
  cross: 1,
  circle: 2,
};

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.substring(0, 2), 16) / 255,
    parseInt(h.substring(2, 4), 16) / 255,
    parseInt(h.substring(4, 6), 16) / 255,
  ];
}

export class FractalRenderer {
  private gl: WebGLRenderingContext;
  private cache: ShaderCache;
  private currentProgram: WebGLProgram | null = null;
  private currentUniforms: Record<string, WebGLUniformLocation> = {};
  private vbo: WebGLBuffer | null = null;
  private unsubscribeFromFormulaEvents: (() => void) | null = null;

  constructor(gl: WebGLRenderingContext) {
    this.gl = gl;
    this.cache = new ShaderCache(gl);
    this.unsubscribeFromFormulaEvents = pluginRegistry.subscribeToFormulaEvents((event) => {
      this.cache.invalidateFormula(event.formulaId);
    });

    this.vbo = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vbo);
    this.gl.bufferData(
      this.gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      this.gl.STATIC_DRAW
    );
  }

  async precompileDefault(): Promise<void> {
    const combo: PluginCombination = {
      formulaId: 'mandelbrot',
      outsideColoringId: 'smooth',
      insideColoringId: 'black',
      transformId: 'none',
    };
    const key = makeCacheKey(combo);
    if (this.cache.get(key)) return;
    const source = assembleShader(combo);
    await this.cache.compileWithMetrics(key, source, combo.formulaId);
  }

  private setGradientUniforms(uniforms: Record<string, WebGLUniformLocation>, gradient: GradientStop[] | null): void {
    const gl = this.gl;
    if (gradient && gradient.length >= 2) {
      if (uniforms.u_useCustomGradient) gl.uniform1i(uniforms.u_useCustomGradient, 1);
      if (uniforms.u_gradientCount) gl.uniform1i(uniforms.u_gradientCount, gradient.length);
      for (let i = 0; i < 5; i++) {
        const stop = gradient[i] || gradient[gradient.length - 1];
        const [r, g, b] = hexToRgb(stop.color);
        const colorLoc = uniforms[`u_gradientColors[${i}]`];
        const posLoc = uniforms[`u_gradientPositions[${i}]`];
        if (colorLoc) gl.uniform3f(colorLoc, r, g, b);
        if (posLoc) gl.uniform1f(posLoc, stop.position);
      }
    } else if (uniforms.u_useCustomGradient) {
      gl.uniform1i(uniforms.u_useCustomGradient, 0);
    }
  }

  private setPluginUniformValues(
    uniforms: Record<string, WebGLUniformLocation>,
    descriptors: PluginUniformDescriptor[],
    values: PluginParamRecord
  ): void {
    const gl = this.gl;
    for (const descriptor of descriptors) {
      const loc = uniforms[descriptor.name];
      if (!loc) continue;
      const value = values[descriptor.name] ?? descriptor.default;

      switch (descriptor.type) {
        case 'float':
          gl.uniform1f(loc, Number(value));
          break;
        case 'int':
          gl.uniform1i(loc, Number(value));
          break;
        case 'bool':
          gl.uniform1i(loc, value ? 1 : 0);
          break;
        case 'vec2': {
          const vec = Array.isArray(value) ? value : [value, value];
          gl.uniform2f(loc, Number(vec[0] ?? 0), Number(vec[1] ?? 0));
          break;
        }
        case 'vec3': {
          const vec = Array.isArray(value) ? value : [value, value, value];
          gl.uniform3f(loc, Number(vec[0] ?? 0), Number(vec[1] ?? 0), Number(vec[2] ?? 0));
          break;
        }
      }
    }
  }

  async render(params: FractalParams): Promise<void> {
    const combo: PluginCombination = {
      formulaId: params.formula,
      outsideColoringId: params.outsideColoring,
      insideColoringId: params.insideColoring,
      transformId: params.transformId ?? 'none',
    };

    const key = makeCacheKey(combo);
    let compiled = this.cache.get(key);

    if (!compiled) {
      const source = assembleShader(combo);
      compiled = await this.cache.compileWithMetrics(key, source, combo.formulaId);
    }

    this.currentProgram = compiled.program;
    this.currentUniforms = compiled.uniforms;

    const gl = this.gl;
    const uniforms = this.currentUniforms;

    gl.useProgram(this.currentProgram);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    const positionAttr = gl.getAttribLocation(this.currentProgram, 'a_position');
    if (positionAttr >= 0) {
      gl.enableVertexAttribArray(positionAttr);
      gl.vertexAttribPointer(positionAttr, 2, gl.FLOAT, false, 0, 0);
    }

    const tileInfo = params._tileInfo;
    // For tiled export: u_resolution = full image size, u_tileOffset = pixel offset
    if (uniforms.u_resolution) {
      gl.uniform2f(uniforms.u_resolution, tileInfo?.fullWidth ?? gl.canvas.width, tileInfo?.fullHeight ?? gl.canvas.height);
    }
    if (uniforms.u_tileOffset) {
      gl.uniform2f(uniforms.u_tileOffset, tileInfo?.offsetX ?? 0, tileInfo?.offsetY ?? 0);
    }
    if (uniforms.u_center) gl.uniform2f(uniforms.u_center, params.bounds.centerX, params.bounds.centerY);
    if (uniforms.u_zoom) gl.uniform1f(uniforms.u_zoom, params.bounds.zoom);
    if (uniforms.u_rotation) gl.uniform1f(uniforms.u_rotation, params.bounds.rotation ?? 0);
    if (uniforms.u_maxIterations) gl.uniform1i(uniforms.u_maxIterations, params.maxIterations);
    if (uniforms.u_paletteIndex) gl.uniform1i(uniforms.u_paletteIndex, params.paletteIndex);
    if (uniforms.u_colorPipelineVersion) gl.uniform1i(uniforms.u_colorPipelineVersion, params.coloringPipelineVersion === 2 ? 2 : 1);
    if (uniforms.u_modernStyle) {
      gl.uniform1i(
        uniforms.u_modernStyle,
        params.modernColoring?.styleId === 'layeredOrbit' ? 1 : params.modernColoring?.styleId === 'orbitNebula' ? 2 : 0
      );
    }
    if (uniforms.u_isJulia) gl.uniform1i(uniforms.u_isJulia, params.isJulia ? 1 : 0);
    if (uniforms.u_juliaC) gl.uniform2f(uniforms.u_juliaC, params.juliaC[0], params.juliaC[1]);
    if (uniforms.u_power) gl.uniform1f(uniforms.u_power, params.power);
    if (uniforms.u_ssaaLevel) {
      const level = params.ssaaLevel ?? (params.useSSAA ? 4 : 0);
      gl.uniform1i(uniforms.u_ssaaLevel, level);
    }

    if (uniforms.u_lightingEnabled) gl.uniform1i(uniforms.u_lightingEnabled, params.lighting.enabled ? 1 : 0);
    if (uniforms.u_lightingMode) gl.uniform1i(uniforms.u_lightingMode, params.lighting.mode === 'dem' ? 1 : 0);
    if (uniforms.u_lightAzimuth) gl.uniform1f(uniforms.u_lightAzimuth, (params.lighting.azimuth * Math.PI) / 180);
    if (uniforms.u_lightElevation) gl.uniform1f(uniforms.u_lightElevation, (params.lighting.elevation * Math.PI) / 180);
    if (uniforms.u_lightIntensity) gl.uniform1f(uniforms.u_lightIntensity, params.lighting.intensity);

    if (uniforms.u_orbitTrapShape) gl.uniform1i(uniforms.u_orbitTrapShape, ORBIT_TRAP_SHAPE_TO_UNIFORM[params.orbitTrap.shape] ?? 0);
    if (uniforms.u_orbitTrapPoint) gl.uniform2f(uniforms.u_orbitTrapPoint, params.orbitTrap.point[0], params.orbitTrap.point[1]);
    if (uniforms.u_orbitTrapRadius) gl.uniform1f(uniforms.u_orbitTrapRadius, params.orbitTrap.radius);
    if (uniforms.u_orbitTrapWidth) gl.uniform1f(uniforms.u_orbitTrapWidth, params.orbitTrap.width);

    this.setGradientUniforms(uniforms, params.customGradient);

    const post = params.modernColoring?.post;
    if (uniforms.u_postToneMapping) {
      gl.uniform1i(
        uniforms.u_postToneMapping,
        post?.toneMapping === 'filmic' ? 2 : post?.toneMapping === 'none' ? 0 : 1
      );
    }
    if (uniforms.u_postExposure) gl.uniform1f(uniforms.u_postExposure, post?.exposure ?? 0);
    if (uniforms.u_postContrast) gl.uniform1f(uniforms.u_postContrast, post?.contrast ?? 1);
    if (uniforms.u_postSaturation) gl.uniform1f(uniforms.u_postSaturation, post?.saturation ?? 1);
    if (uniforms.u_postTemperature) gl.uniform1f(uniforms.u_postTemperature, post?.temperature ?? 0);
    if (uniforms.u_postTint) gl.uniform1f(uniforms.u_postTint, post?.tint ?? 0);
    if (uniforms.u_postVignette) gl.uniform1f(uniforms.u_postVignette, post?.vignette ?? 0);
    if (uniforms.u_postDither) gl.uniform1i(uniforms.u_postDither, post?.dither === false ? 0 : 1);

    const formula = pluginRegistry.getFormula(combo.formulaId);
    const outside = pluginRegistry.getOutsideColoring(combo.outsideColoringId);
    const inside = pluginRegistry.getInsideColoring(combo.insideColoringId);
    const transform = pluginRegistry.getTransform(combo.transformId);

    const pluginParams = params.pluginParams ?? {};
    this.setPluginUniformValues(uniforms, formula?.uniforms ?? [], pluginParams);
    this.setPluginUniformValues(uniforms, outside?.uniforms ?? [], pluginParams);
    this.setPluginUniformValues(uniforms, inside?.uniforms ?? [], pluginParams);
    this.setPluginUniformValues(uniforms, transform?.uniforms ?? [], pluginParams);

    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  updateParams(): void {
    // compatibility no-op in dynamic pipeline
    if (!this.currentProgram || !this.currentUniforms) return;
    // caller should pass full params to render()
  }

  dispose(): void {
    this.unsubscribeFromFormulaEvents?.();
    this.unsubscribeFromFormulaEvents = null;
    this.cache.dispose();
    if (this.vbo) {
      this.gl.deleteBuffer(this.vbo);
      this.vbo = null;
    }
    this.currentProgram = null;
    this.currentUniforms = {};
  }
}
