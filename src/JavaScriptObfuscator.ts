import { inject, injectable, } from 'inversify';
import { ServiceIdentifiers } from './container/ServiceIdentifiers';

import * as acorn from 'acorn';
import * as escodegen from '@javascript-obfuscator/escodegen';
import * as ESTree from 'estree';

import { TObfuscationResultFactory } from './types/container/source-code/TObfuscationResultFactory';

import { ICodeTransformersRunner } from './interfaces/code-transformers/ICodeTransformersRunner';
import { IGeneratorOutput } from './interfaces/IGeneratorOutput';
import { IJavaScriptObfuscator } from './interfaces/IJavaScriptObfsucator';
import { ILogger } from './interfaces/logger/ILogger';
import { IObfuscationResult } from './interfaces/source-code/IObfuscationResult';
import { IOptions } from './interfaces/options/IOptions';
import { IRandomGenerator } from './interfaces/utils/IRandomGenerator';
import { INodeTransformersRunner } from './interfaces/node-transformers/INodeTransformersRunner';

import { CodeTransformer } from './enums/code-transformers/CodeTransformer';
import { CodeTransformationStage } from './enums/code-transformers/CodeTransformationStage';
import { LoggingMessage } from './enums/logger/LoggingMessage';
import { NodeTransformer } from './enums/node-transformers/NodeTransformer';
import { NodeTransformationStage } from './enums/node-transformers/NodeTransformationStage';
import { SourceMapSourcesMode } from './enums/source-map/SourceMapSourcesMode';

import { ecmaVersion } from './constants/EcmaVersion';

import { ASTParserFacade } from './ASTParserFacade';
import { NodeGuards } from './node/NodeGuards';
import { Utils } from './utils/Utils';

@injectable()
export class JavaScriptObfuscator implements IJavaScriptObfuscator {
    /**
     * @type {Options}
     */
    private static readonly parseOptions: acorn.Options = {
        ecmaVersion,
        allowHashBang: true,
        allowImportExportEverywhere: true,
        allowReturnOutsideFunction: true,
        locations: true,
        ranges: true
    };

    /**
     * @type {GenerateOptions}
     */
    private static readonly escodegenParams: escodegen.GenerateOptions = {
        comment: true,
        verbatim: 'x-verbatim-property',
        sourceMapWithCode: true
    };

    /**
     * @type {CodeTransformer[]}
     */
    private static readonly codeTransformersList: CodeTransformer[] = [
        CodeTransformer.HashbangOperatorTransformer
    ];

    /**
     * @type {NodeTransformer[]}
     */
    private static readonly nodeTransformersList: NodeTransformer[] = [
        NodeTransformer.BooleanLiteralTransformer,
        NodeTransformer.BlockStatementControlFlowTransformer,
        NodeTransformer.BlockStatementSimplifyTransformer,
        NodeTransformer.ClassFieldTransformer,
        NodeTransformer.CommentsTransformer,
        NodeTransformer.CustomCodeHelpersTransformer,
        NodeTransformer.DeadCodeInjectionTransformer,
        NodeTransformer.EscapeSequenceTransformer,
        NodeTransformer.EvalCallExpressionTransformer,
        NodeTransformer.ExportSpecifierTransformer,
        NodeTransformer.ExpressionStatementsMergeTransformer,
        NodeTransformer.FunctionControlFlowTransformer,
        NodeTransformer.IfStatementSimplifyTransformer,
        NodeTransformer.LabeledStatementTransformer,
        NodeTransformer.RenamePropertiesTransformer,
        NodeTransformer.MemberExpressionTransformer,
        NodeTransformer.MetadataTransformer,
        NodeTransformer.NumberLiteralTransformer,
        NodeTransformer.NumberToNumericalExpressionTransformer,
        NodeTransformer.ObfuscatingGuardsTransformer,
        NodeTransformer.ObjectExpressionKeysTransformer,
        NodeTransformer.ObjectExpressionTransformer,
        NodeTransformer.ObjectPatternPropertiesTransformer,
        NodeTransformer.ParentificationTransformer,
        NodeTransformer.ScopeIdentifiersTransformer,
        NodeTransformer.ScopeThroughIdentifiersTransformer,
        NodeTransformer.SplitStringTransformer,
        NodeTransformer.StringArrayControlFlowTransformer,
        NodeTransformer.StringArrayRotateFunctionTransformer,
        NodeTransformer.StringArrayScopeCallsWrapperTransformer,
        NodeTransformer.StringArrayTransformer,
        NodeTransformer.TemplateLiteralTransformer,
        NodeTransformer.DirectivePlacementTransformer,
        NodeTransformer.VariableDeclarationsMergeTransformer,
        NodeTransformer.VariablePreserveTransformer
    ];

    /**
     * @type {ICodeTransformersRunner}
     */
    private readonly codeTransformersRunner: ICodeTransformersRunner;

    /**
     * @type {ILogger}
     */
    private readonly logger: ILogger;

    /**
     * @type {TObfuscationResultFactory}
     */
    private readonly obfuscationResultFactory: TObfuscationResultFactory;

    /**
     * @type {IOptions}
     */
    private readonly options: IOptions;

    /**
     * @type {IRandomGenerator}
     */
    private readonly randomGenerator: IRandomGenerator;

    /**
     * @type {INodeTransformersRunner}
     */
    private readonly nodeTransformersRunner: INodeTransformersRunner;

    /**
     * @param {ICodeTransformersRunner} codeTransformersRunner
     * @param {INodeTransformersRunner} nodeTransformersRunner
     * @param {IRandomGenerator} randomGenerator
     * @param {TObfuscationResultFactory} obfuscatedCodeFactory
     * @param {ILogger} logger
     * @param {IOptions} options
     */
    public constructor (
        @inject(ServiceIdentifiers.ICodeTransformersRunner) codeTransformersRunner: ICodeTransformersRunner,
        @inject(ServiceIdentifiers.INodeTransformersRunner) nodeTransformersRunner: INodeTransformersRunner,
        @inject(ServiceIdentifiers.IRandomGenerator) randomGenerator: IRandomGenerator,
        @inject(ServiceIdentifiers.Factory__IObfuscationResult) obfuscatedCodeFactory: TObfuscationResultFactory,
        @inject(ServiceIdentifiers.ILogger) logger: ILogger,
        @inject(ServiceIdentifiers.IOptions) options: IOptions
    ) {
        this.codeTransformersRunner = codeTransformersRunner;
        this.nodeTransformersRunner = nodeTransformersRunner;
        this.randomGenerator = randomGenerator;
        this.obfuscationResultFactory = obfuscatedCodeFactory;
        this.logger = logger;
        this.options = options;
    }

    /**
     * @param {string} sourceCode
     * @returns {IObfuscationResult}
     */
    public obfuscate (sourceCode: string): IObfuscationResult {
        if (typeof sourceCode !== 'string') {
            sourceCode = '';
        }

        const timeStart: number = Date.now();
        this.logger.info(LoggingMessage.Version, Utils.buildVersionMessage(process.env.VERSION, process.env.BUILD_TIMESTAMP));
        this.logger.info(LoggingMessage.ObfuscationStarted);
        this.logger.info(LoggingMessage.RandomGeneratorSeed, this.randomGenerator.getInputSeed());

        // preparing code transformations
        sourceCode = this.runCodeTransformationStage(sourceCode, CodeTransformationStage.PreparingTransformers);

        // parse AST tree
        const astTree: ESTree.Program = this.parseCode(sourceCode);

        // obfuscate AST tree
        const obfuscatedAstTree: ESTree.Program = this.transformAstTree(astTree);

        // generate code
        const generatorOutput: IGeneratorOutput = this.generateCode(sourceCode, obfuscatedAstTree);

        // finalizing code transformations
        generatorOutput.code = this.runCodeTransformationStage(generatorOutput.code, CodeTransformationStage.FinalizingTransformers);

        const obfuscationTime: number = (Date.now() - timeStart) / 1000;
        this.logger.success(LoggingMessage.ObfuscationCompleted, obfuscationTime);

        return this.getObfuscationResult(generatorOutput);
    }

    /**
     * @param {string} sourceCode
     * @returns {Program}
     */
    private parseCode (sourceCode: string): ESTree.Program {
        return ASTParserFacade.parse(sourceCode, JavaScriptObfuscator.parseOptions);
    }

    /**
     * @param {Program} astTree
     * @returns {Program}
     */
    private transformAstTree (astTree: ESTree.Program): ESTree.Program {
        // Build the list of stages that will actually run based on options
        const stages: NodeTransformationStage[] = [
            NodeTransformationStage.Initializing,
            NodeTransformationStage.Preparing,
            ...(this.options.deadCodeInjection ? [NodeTransformationStage.DeadCodeInjection] : []),
            NodeTransformationStage.ControlFlowFlattening,
            ...(this.options.renameProperties ? [NodeTransformationStage.RenameProperties] : []),
            NodeTransformationStage.Converting,
            NodeTransformationStage.RenameIdentifiers,
            NodeTransformationStage.StringArray,
            ...(this.options.simplify ? [NodeTransformationStage.Simplifying] : []),
            NodeTransformationStage.Finalizing
        ];

        const totalStages = stages.length;
        let currentStageIndex = 0;

        for (const stage of stages) {
            astTree = this.runNodeTransformationStage(astTree, stage, currentStageIndex, totalStages);

            // Check for empty AST after Initializing stage
            if (stage === NodeTransformationStage.Initializing) {
                const isEmptyAstTree: boolean = NodeGuards.isProgramNode(astTree)
                    && !astTree.body.length
                    && !astTree.leadingComments
                    && !astTree.trailingComments;

                if (isEmptyAstTree) {
                    this.logger.warn(LoggingMessage.EmptySourceCode);

                    return astTree;
                }
            }

            currentStageIndex++;
        }

        return astTree;
    }

    /**
     * @param {string} sourceCode
     * @param {Program} astTree
     * @returns {IGeneratorOutput}
     */
    private generateCode (sourceCode: string, astTree: ESTree.Program): IGeneratorOutput {
        const escodegenParams: escodegen.GenerateOptions = {
            ...JavaScriptObfuscator.escodegenParams,
            format: {
                compact: this.options.compact
            },
            ...this.options.sourceMap && {
                ...this.options.sourceMapSourcesMode === SourceMapSourcesMode.SourcesContent
                    ? {
                        sourceMap: 'sourceMap',
                        sourceContent: sourceCode
                    }
                    : {
                        sourceMap: this.options.inputFileName || 'sourceMap'
                    }
            }
        };

        const generatorOutput: IGeneratorOutput = escodegen.generate(astTree, escodegenParams);

        generatorOutput.map = generatorOutput.map ? generatorOutput.map.toString() : '';

        return generatorOutput;
    }

    /**
     * @param {IGeneratorOutput} generatorOutput
     * @returns {IObfuscationResult}
     */
    private getObfuscationResult (generatorOutput: IGeneratorOutput): IObfuscationResult {
        return this.obfuscationResultFactory(generatorOutput.code, generatorOutput.map);
    }

    /**
     * @param {string} code
     * @param {CodeTransformationStage} codeTransformationStage
     * @returns {string}
     */
    private runCodeTransformationStage (code: string, codeTransformationStage: CodeTransformationStage): string {
        this.logger.info(LoggingMessage.CodeTransformationStage, codeTransformationStage);

        return this.codeTransformersRunner.transform(
            code,
            JavaScriptObfuscator.codeTransformersList,
            codeTransformationStage
        );
    }

    /**
     * @param {Program} astTree
     * @param {NodeTransformationStage} nodeTransformationStage
     * @param {number} stageIndex - Current stage index (0-based)
     * @param {number} totalStages - Total number of stages
     * @returns {Program}
     */
    private runNodeTransformationStage (
        astTree: ESTree.Program,
        nodeTransformationStage: NodeTransformationStage,
        stageIndex: number,
        totalStages: number
    ): ESTree.Program {
        this.logger.info(LoggingMessage.NodeTransformationStage, nodeTransformationStage);

        // Create a progress callback that reports granular progress within this stage
        const { progressCallback } = this.options;
        const stageProgressCallback = progressCallback
            ? (completedGroups: number, totalGroups: number): void => {
                // Calculate overall progress: stageIndex + fraction of current stage
                const stageProgress = totalGroups > 0 ? completedGroups / totalGroups : 1;
                const overallProgress = (stageIndex + stageProgress) / totalStages;
                progressCallback(
                    overallProgress,
                    nodeTransformationStage,
                    stageIndex + 1,  // 1-based for user-facing
                    totalStages
                );
            }
            : undefined;

        return this.nodeTransformersRunner.transform(
            astTree,
            JavaScriptObfuscator.nodeTransformersList,
            nodeTransformationStage,
            stageProgressCallback
        );
    }
}
