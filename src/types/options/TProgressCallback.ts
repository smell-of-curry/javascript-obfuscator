/**
 * Progress callback type for tracking obfuscation progress.
 * @param progress - Current progress value between 0 and 1
 * @param stage - Current transformation stage name
 * @param stageIndex - Current stage index (0-based)
 * @param totalStages - Total number of stages
 */
export type TProgressCallback = (
    progress: number,
    stage: string,
    stageIndex: number,
    totalStages: number
) => void;

