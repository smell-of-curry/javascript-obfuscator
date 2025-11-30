import * as ESTree from 'estree';

import { NodeTransformer } from '../../enums/node-transformers/NodeTransformer';
import { NodeTransformationStage } from '../../enums/node-transformers/NodeTransformationStage';

/**
 * Callback for reporting progress within a transformation stage
 * @param completedGroups - Number of transformer groups completed
 * @param totalGroups - Total number of transformer groups in this stage
 */
export type TStageProgressCallback = (completedGroups: number, totalGroups: number) => void;

export interface INodeTransformersRunner {
    /**
     * @param {T} astTree
     * @param {NodeTransformer[]} nodeTransformers
     * @param {NodeTransformationStage} nodeTransformationStage
     * @param {TStageProgressCallback} progressCallback - Optional callback for granular progress
     * @returns {T}
     */
    transform <T extends ESTree.Node = ESTree.Program> (
        astTree: T,
        nodeTransformers: NodeTransformer[],
        nodeTransformationStage: NodeTransformationStage,
        progressCallback?: TStageProgressCallback
    ): T;
}
