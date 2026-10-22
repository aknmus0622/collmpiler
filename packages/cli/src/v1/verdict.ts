// The verdict of spec mutation (1.0): the Stage 0 of mutation-verdict. Each changed constant is run under the
// verification seed, then under the extra seeds, until it shows; one that never shows is reported. Running the
// specification is the trial's (`run`), not this file's.

export const EXTRA_SEEDS = 2;

/** One constant to change, and how to run the specification with it changed (extra: added to the verification seed). */
export type Trial = {
  where: string;
  value: string | number | boolean | null;
  run(extra: number): Promise<{ changed: boolean; enablementDiffers: boolean }>;
};
export type Unobservable = { where: string; value: unknown; verdict: "unobserved" | "rare" | "precondition"; severity: "error" | "warning" };

export async function verdictStage0(trials: Trial[]): Promise<Unobservable[]> {
  const found: Unobservable[] = [];
  for (const trial of trials) {
    if (trial.value === null) continue;
    // whether a step falls inside or outside the spec changed, in any run of this value
    let enablementDiffers = false;
    const tried = async (extra: number) => {
      const result = await trial.run(extra);
      enablementDiffers ||= result.enablementDiffers;
      return result.changed;
    };
    if (await tried(0)) continue;
    let elsewhere = false;
    for (let extra = 1; extra <= EXTRA_SEEDS && !elsewhere; extra++) elsewhere = await tried(extra);
    const verdict = elsewhere ? "rare" : enablementDiffers ? "precondition" : "unobserved";
    found.push({ where: trial.where, value: trial.value, verdict, severity: verdict === "rare" || typeof trial.value === "boolean" ? "warning" : "error" });
  }
  return found;
}
