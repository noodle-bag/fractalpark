import type {
  PublishedFormulaDescriptorV1,
  PublishedFormulaParameterDescriptorV1,
} from '@/engine/formulas/v1';
import type { PluginUniformDescriptor } from '@/engine/plugins/types';
import type { PluginParamRecord, PluginParamValue } from '@/engine/types';

export interface PublishedFormulaParamDomains {
  formula?: PluginParamRecord;
  outside?: PluginParamRecord;
  inside?: PluginParamRecord;
  transform?: PluginParamRecord;
}

export interface PublishedFormulaParamDescriptors {
  outside?: readonly PluginUniformDescriptor[];
  inside?: readonly PluginUniformDescriptor[];
  transform?: readonly PluginUniformDescriptor[];
}

export interface ResolvedPublishedFormulaParamDomains {
  formula: PluginParamRecord;
  outside?: PluginParamRecord;
  inside?: PluginParamRecord;
  transform?: PluginParamRecord;
}

function hasOwn(record: PluginParamRecord | undefined, name: string): boolean {
  return record !== undefined && Object.prototype.hasOwnProperty.call(record, name);
}

function cloneValue(value: PluginParamValue): PluginParamValue {
  return Array.isArray(value) ? [...value] as PluginParamValue : value;
}

function defaultPublishedValue(
  parameter: PublishedFormulaParameterDescriptorV1,
): PluginParamValue {
  if (parameter.type === 'real') {
    return [Number(parameter.default), 0];
  }
  if (parameter.type === 'complex') {
    const value = parameter.default as readonly [number, number];
    return [value[0], value[1]];
  }
  const options = parameter.options ?? [];
  return Math.max(0, options.indexOf(String(parameter.default)));
}

function normalizedPublishedValue(
  parameter: PublishedFormulaParameterDescriptorV1,
  value: PluginParamValue | undefined,
): PluginParamValue {
  const fallback = defaultPublishedValue(parameter);

  if (parameter.type === 'real') {
    const candidate = Array.isArray(value)
      ? value.length === 2 && Number(value[1]) === 0
        ? Number(value[0])
        : Number.NaN
      : typeof value === 'number'
        ? value
        : Number.NaN;
    if (!Number.isFinite(candidate)) return fallback;
    if (
      parameter.hardDomain &&
      (candidate < parameter.hardDomain[0] || candidate > parameter.hardDomain[1])
    ) {
      return fallback;
    }
    return [candidate, 0];
  }

  if (parameter.type === 'complex') {
    if (
      !Array.isArray(value) ||
      value.length !== 2 ||
      !value.every((part) => Number.isFinite(part))
    ) {
      return fallback;
    }
    return [Number(value[0]), Number(value[1])];
  }

  const options = parameter.options ?? [];
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 0 ||
    value >= options.length
  ) {
    return fallback;
  }
  return value;
}

function withinDescriptorRange(
  descriptor: PluginUniformDescriptor,
  values: readonly number[],
): boolean {
  return values.every(
    (value) =>
      Number.isFinite(value) &&
      (descriptor.min === undefined || value >= descriptor.min) &&
      (descriptor.max === undefined || value <= descriptor.max),
  );
}

function normalizedPluginValue(
  descriptor: PluginUniformDescriptor,
  value: PluginParamValue | undefined,
): PluginParamValue | undefined {
  if (descriptor.type === 'bool') {
    return typeof value === 'boolean' ? value : undefined;
  }
  if (descriptor.type === 'float') {
    return typeof value === 'number' && withinDescriptorRange(descriptor, [value])
      ? value
      : undefined;
  }
  if (descriptor.type === 'int') {
    return typeof value === 'number' &&
      Number.isInteger(value) &&
      withinDescriptorRange(descriptor, [value])
      ? value
      : undefined;
  }

  const length = descriptor.type === 'vec2' ? 2 : 3;
  if (
    !Array.isArray(value) ||
    value.length !== length ||
    !withinDescriptorRange(descriptor, value)
  ) {
    return undefined;
  }
  return cloneValue(value);
}

function cleanRecord(record: PluginParamRecord): PluginParamRecord | undefined {
  return Object.keys(record).length > 0 ? record : undefined;
}

function readDomainValue(
  input: PublishedFormulaParamDomains,
  domain: Exclude<keyof PublishedFormulaParamDomains, 'formula'>,
  name: string,
): PluginParamValue | undefined {
  if (hasOwn(input[domain], name)) return input[domain]?.[name];
  return input.formula?.[name];
}

/**
 * Rebuild URL-restored Standard parameters from validated descriptors.
 * Formula values fail closed to published defaults. Valid selected
 * coloring/transform values are moved out of the URL decoder's temporary
 * formula bucket; invalid, ambiguous, and unknown keys are discarded.
 */
export function partitionPublishedFormulaParams(
  descriptor: PublishedFormulaDescriptorV1,
  input: PublishedFormulaParamDomains,
  descriptors: PublishedFormulaParamDescriptors,
): ResolvedPublishedFormulaParamDomains {
  const ownerCounts = new Map<string, number>();
  const countOwner = (name: string) => {
    ownerCounts.set(name, (ownerCounts.get(name) ?? 0) + 1);
  };
  descriptor.parameters.forEach((parameter) => countOwner(parameter.uniformName));
  descriptors.outside?.forEach((uniform) => countOwner(uniform.name));
  descriptors.inside?.forEach((uniform) => countOwner(uniform.name));
  descriptors.transform?.forEach((uniform) => countOwner(uniform.name));

  const formula: PluginParamRecord = {};
  for (const parameter of descriptor.parameters) {
    const value = ownerCounts.get(parameter.uniformName) === 1
      ? input.formula?.[parameter.uniformName]
      : undefined;
    formula[parameter.uniformName] = normalizedPublishedValue(parameter, value);
  }

  const normalizeDomain = (
    domain: Exclude<keyof PublishedFormulaParamDomains, 'formula'>,
    uniforms: readonly PluginUniformDescriptor[] | undefined,
  ): PluginParamRecord | undefined => {
    const normalized: PluginParamRecord = {};
    for (const uniform of uniforms ?? []) {
      if (ownerCounts.get(uniform.name) !== 1) continue;
      const value = normalizedPluginValue(
        uniform,
        readDomainValue(input, domain, uniform.name),
      );
      if (value !== undefined) normalized[uniform.name] = value;
    }
    return cleanRecord(normalized);
  };

  return {
    formula,
    outside: normalizeDomain('outside', descriptors.outside),
    inside: normalizeDomain('inside', descriptors.inside),
    transform: normalizeDomain('transform', descriptors.transform),
  };
}

export function normalizePublishedFormulaParams(
  descriptor: PublishedFormulaDescriptorV1,
  input: PluginParamRecord | undefined,
): PluginParamRecord {
  return partitionPublishedFormulaParams(
    descriptor,
    { formula: input },
    {},
  ).formula;
}
