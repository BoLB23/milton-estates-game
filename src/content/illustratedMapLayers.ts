/** @deprecated Map artwork is now part of the canonical map definition. */
import { getIllustratedMapLayers, MAP_DEFINITIONS, type IllustratedMapLayer, validateMapDefinitions } from "./maps";

export { getIllustratedMapLayers, type IllustratedMapLayer };
export const ILLUSTRATED_MAP_LAYERS: readonly IllustratedMapLayer[] = Object.values(MAP_DEFINITIONS).flatMap((map) => map.layers);
export const validateIllustratedMapLayers = validateMapDefinitions;
