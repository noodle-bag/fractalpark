# Deprecated Shaders

This folder contains shaders that are no longer used in the application but are kept for reference.

## mandelbrot.frag.glsl

**Status**: Deprecated in M4.1 Phase 1.5  
**Replacement**: `framework.frag.glsl` + plugin system

### Reason for Deprecation

The monolithic `mandelbrot.frag.glsl` (245 lines) contained 4 hardcoded formulas with if/else branches for formula selection, 5 outside coloring modes, and 3 inside coloring modes all in a single file.

M4.1 introduced a plugin architecture that:
- Separates formulas, coloring modes, and transforms into individual plugins
- Uses shader assembly to combine plugins at runtime
- Supports 30 formulas, 8 coloring modes, and 7 transforms via dynamic shader generation
- Eliminates the need for hardcoded branches in GLSL

### Migration Path

All functionality from `mandelbrot.frag.glsl` has been migrated:

| Old (mandelbrot.frag.glsl) | New (Plugin System) |
|---------------------------|---------------------|
| `u_formula` uniform branching | Individual formula plugins in `src/engine/plugins/builtins/formulas/` |
| `u_outsideColoring` branching | Outside coloring plugins in `src/engine/plugins/builtins/coloring/` |
| `u_insideColoring` branching | Inside coloring plugins in `src/engine/plugins/builtins/coloring/` |
| Hardcoded `iterateStep()` logic | Formula-specific GLSL in each plugin |
| Single large shader | `framework.frag.glsl` template + assembled plugins |

### Safe Removal

This file can be safely removed once M4.1 is fully validated in production and no rollback is needed.
