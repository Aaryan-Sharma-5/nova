import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { protectedPostApi } from "@/lib/api";
import { calculateAttritionRisk, calculateBurnoutRisk } from "@/utils/riskCalculation";

type SimulatorInputs = {
  meetingLoadReductionPct: number;
  workHoursNormalizationPct: number;
  teamSizeAdjustmentPct: number;
  managerOneOnOneFrequency: number;
};

export type WhatIfScenarioPayload = {
  interventionLabel: string;
  inputs: SimulatorInputs;
  clientProjection: {
    projectedBurnout: number;
    projectedAttrition: number;
    burnoutDelta: number;
    attritionDelta: number;
  };
  serverProjection: SimulationApiResponse | null;
};

type CurrentRiskContext = {
  burnoutRisk: number; // 0-100
  attritionRisk: number; // 0-100
  workHoursPerWeek: number;
  sentimentScore: number; // -1 to 1
  engagementScore: number; // 0-100
  tenureMonths: number;
  performanceDecline: number; // 0-1
  performanceStagnation: number; // 0-1
  absenceRate: number; // 0-1
  weeksAtHighRisk: number;
  anomalyDetected: boolean;
};

type SimulationApiResponse = {
  employee_id: string;
  current_burnout_score: number;
  current_attrition_score: number;
  projected_burnout_score: number;
  projected_attrition_score: number;
  burnout_delta_pct: number;
  attrition_delta_pct: number;
  explanatory_factors: string[];
  ai_summary?: string | null;
  ai_actions?: string[];
};

type WhatIfSimulatorProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeId: string;
  interventionLabel?: string;
  initialInputs?: Partial<SimulatorInputs>;
  currentContext?: Partial<CurrentRiskContext>;
  onApplyScenario?: (payload: WhatIfScenarioPayload) => Promise<void> | void;
};

const DEFAULT_INPUTS: SimulatorInputs = {
  meetingLoadReductionPct: 15,
  workHoursNormalizationPct: 20,
  teamSizeAdjustmentPct: 0,
  managerOneOnOneFrequency: 2,
};

const DEFAULT_CONTEXT: CurrentRiskContext = {
  burnoutRisk: 62,
  attritionRisk: 48,
  workHoursPerWeek: 48,
  sentimentScore: -0.2,
  engagementScore: 54,
  tenureMonths: 16,
  performanceDecline: 0.35,
  performanceStagnation: 0.3,
  absenceRate: 0.16,
  weeksAtHighRisk: 4,
  anomalyDetected: true,
};

function toPercent(value: number): string {
  return `${Math.round(value)}%`;
}

export default function WhatIfSimulator({
  open,
  onOpenChange,
  employeeId,
  interventionLabel,
  initialInputs,
  currentContext,
  onApplyScenario,
}: WhatIfSimulatorProps) {
  const { token } = useAuth();

  const context = useMemo(
    () => ({ ...DEFAULT_CONTEXT, ...(currentContext || {}) }),
    [currentContext],
  );

  const [inputs, setInputs] = useState<SimulatorInputs>({
    ...DEFAULT_INPUTS,
    ...(initialInputs || {}),
  });
  const [serverProjection, setServerProjection] = useState<SimulationApiResponse | null>(null);
  const [serverError, setServerError] = useState<string>("");
  const [isApplyingScenario, setIsApplyingScenario] = useState<boolean>(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    setInputs({ ...DEFAULT_INPUTS, ...(initialInputs || {}) });
  }, [open, initialInputs]);

  const clientProjection = useMemo(() => {
    const meetingPressureReduction = inputs.meetingLoadReductionPct / 100;
    const hoursNormalization = inputs.workHoursNormalizationPct / 100;

    const normalizedHours = Math.max(
      35,
      context.workHoursPerWeek -
        (context.workHoursPerWeek - 40) * hoursNormalization -
        context.workHoursPerWeek * meetingPressureReduction * 0.1,
    );

    const sentimentShift =
      inputs.managerOneOnOneFrequency * 0.035 +
      (inputs.teamSizeAdjustmentPct < 0 ? Math.abs(inputs.teamSizeAdjustmentPct) / 1000 : -inputs.teamSizeAdjustmentPct / 1200);

    const projectedSentiment = Math.max(-1, Math.min(1, context.sentimentScore + sentimentShift));

    const projectedPerformanceDecline = Math.max(
      0,
      context.performanceDecline - meetingPressureReduction * 0.25 - hoursNormalization * 0.2,
    );

    const projectedAbsenceRate = Math.max(
      0,
      context.absenceRate - hoursNormalization * 0.08 - inputs.managerOneOnOneFrequency * 0.01,
    );

    const projectedEngagement = Math.max(
      0,
      Math.min(
        100,
        context.engagementScore +
          inputs.managerOneOnOneFrequency * 2.5 +
          meetingPressureReduction * 12 -
          Math.max(inputs.teamSizeAdjustmentPct, 0) * 0.4,
      ),
    );

    const projectedBurnout = calculateBurnoutRisk(
      normalizedHours,
      projectedSentiment,
      projectedPerformanceDecline,
      projectedAbsenceRate,
    );

    const projectedAttrition = calculateAttritionRisk(
      projectedSentiment,
      projectedEngagement,
      context.tenureMonths,
      Math.max(0, context.performanceStagnation - meetingPressureReduction * 0.1),
    );

    return {
      projectedBurnout,
      projectedAttrition,
      normalizedHours,
      projectedSentiment,
      projectedEngagement,
    };
  }, [context, inputs]);

  useEffect(() => {
    let mounted = true;

    async function runServerSimulation() {
      if (!open || !token) {
        return;
      }

      try {
        const payload = {
          employee_id: employeeId,
          current_burnout_score: context.burnoutRisk / 100,
          current_attrition_score: context.attritionRisk / 100,
          sentiment_score: context.sentimentScore,
          weeks_at_high_risk: context.weeksAtHighRisk,
          anomaly_detected: context.anomalyDetected,
          intervention: {
            meeting_load_reduction_pct: inputs.meetingLoadReductionPct,
            work_hours_normalization_pct: inputs.workHoursNormalizationPct,
            team_size_adjustment_pct: inputs.teamSizeAdjustmentPct,
            manager_one_on_one_frequency: inputs.managerOneOnOneFrequency,
          },
        };

        const result = await protectedPostApi<SimulationApiResponse>("/api/simulate", token, payload);
        if (mounted) {
          setServerProjection(result);
          setServerError("");
        }
      } catch (error) {
        if (mounted) {
          setServerProjection(null);
          setServerError(error instanceof Error ? error.message : "Simulation endpoint failed");
        }
      }
    }

    void runServerSimulation();

    return () => {
      mounted = false;
    };
  }, [open, token, employeeId, context, inputs]);

  const burnoutDelta = clientProjection.projectedBurnout - context.burnoutRisk;
  const attritionDelta = clientProjection.projectedAttrition - context.attritionRisk;

  const handleApplyScenario = async () => {
    if (!onApplyScenario) {
      return;
    }

    setIsApplyingScenario(true);
    try {
      await onApplyScenario({
        interventionLabel: interventionLabel || "custom intervention",
        inputs,
        clientProjection: {
          projectedBurnout: clientProjection.projectedBurnout,
          projectedAttrition: clientProjection.projectedAttrition,
          burnoutDelta,
          attritionDelta,
        },
        serverProjection,
      });
      onOpenChange(false);
    } finally {
      setIsApplyingScenario(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>What-If Intervention Simulator</DialogTitle>
          <DialogDescription>
            {interventionLabel
              ? `Pre-filled from recommendation: ${interventionLabel}`
              : "Adjust intervention levers to project burnout and attrition impact."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border rounded-lg p-4 bg-slate-50">
            <p className="text-sm text-muted-foreground">Current Burnout Risk</p>
            <p className="text-3xl font-bold text-red-600">{toPercent(context.burnoutRisk)}</p>
            <p className="text-xs text-muted-foreground mt-1">Current Attrition: {toPercent(context.attritionRisk)}</p>
          </div>

          <div className="border rounded-lg p-4 bg-emerald-50">
            <p className="text-sm text-muted-foreground">Projected Burnout Risk</p>
            <p className="text-3xl font-bold text-emerald-700">{toPercent(clientProjection.projectedBurnout)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Attrition projection: {toPercent(clientProjection.projectedAttrition)}
            </p>
          </div>
        </div>

        <div className="space-y-5">
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span>Meeting load reduction</span>
              <span className="font-semibold">{inputs.meetingLoadReductionPct}%</span>
            </div>
            <Slider
              min={0}
              max={50}
              step={1}
              value={[inputs.meetingLoadReductionPct]}
              onValueChange={([value]) => setInputs((prev) => ({ ...prev, meetingLoadReductionPct: value }))}
            />
          </div>

          <div>
            <div className="flex justify-between text-sm mb-2">
              <span>Work hours normalization</span>
              <span className="font-semibold">{inputs.workHoursNormalizationPct}%</span>
            </div>
            <Slider
              min={0}
              max={50}
              step={1}
              value={[inputs.workHoursNormalizationPct]}
              onValueChange={([value]) => setInputs((prev) => ({ ...prev, workHoursNormalizationPct: value }))}
            />
          </div>

          <div>
            <div className="flex justify-between text-sm mb-2">
              <span>Team size adjustment</span>
              <span className="font-semibold">{inputs.teamSizeAdjustmentPct}%</span>
            </div>
            <Slider
              min={-30}
              max={30}
              step={1}
              value={[inputs.teamSizeAdjustmentPct]}
              onValueChange={([value]) => setInputs((prev) => ({ ...prev, teamSizeAdjustmentPct: value }))}
            />
          </div>

          <div>
            <div className="flex justify-between text-sm mb-2">
              <span>Manager 1:1 frequency (per month)</span>
              <span className="font-semibold">{inputs.managerOneOnOneFrequency.toFixed(1)}</span>
            </div>
            <Slider
              min={0}
              max={8}
              step={0.5}
              value={[inputs.managerOneOnOneFrequency]}
              onValueChange={([value]) => setInputs((prev) => ({ ...prev, managerOneOnOneFrequency: value }))}
            />
          </div>
        </div>

        <div className="border rounded-lg p-4 bg-white">
          <p className="text-sm font-semibold mb-2">Projected Change (Client-Side)</p>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <p>
              Burnout delta: <span className={burnoutDelta <= 0 ? "text-emerald-700 font-semibold" : "text-red-700 font-semibold"}>{burnoutDelta.toFixed(1)} pts</span>
            </p>
            <p>
              Attrition delta: <span className={attritionDelta <= 0 ? "text-emerald-700 font-semibold" : "text-red-700 font-semibold"}>{attritionDelta.toFixed(1)} pts</span>
            </p>
            <p>Projected weekly hours: {clientProjection.normalizedHours.toFixed(1)}h</p>
            <p>Projected engagement: {clientProjection.projectedEngagement.toFixed(0)}/100</p>
          </div>
        </div>

        {serverProjection && (
          <div className="border rounded-lg p-4 bg-blue-50">
            <p className="text-sm font-semibold mb-2">Server Projection (/api/simulate)</p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <p>Projected burnout: {(serverProjection.projected_burnout_score * 100).toFixed(1)}%</p>
              <p>Projected attrition: {(serverProjection.projected_attrition_score * 100).toFixed(1)}%</p>
              <p>Burnout change: {serverProjection.burnout_delta_pct.toFixed(1)}%</p>
              <p>Attrition change: {serverProjection.attrition_delta_pct.toFixed(1)}%</p>
            </div>
            {serverProjection.explanatory_factors.length > 0 && (
              <ul className="mt-2 text-xs text-slate-700 list-disc list-inside space-y-1">
                {serverProjection.explanatory_factors.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            )}
            {serverProjection.ai_summary && (
              <div className="mt-3 border-t border-blue-200 pt-2">
                <p className="text-xs font-semibold text-blue-800 mb-1">Groq Insight</p>
                <p className="text-xs text-blue-900">{serverProjection.ai_summary}</p>
                {serverProjection.ai_actions && serverProjection.ai_actions.length > 0 && (
                  <ul className="mt-1 text-xs text-blue-900 list-disc list-inside space-y-1">
                    {serverProjection.ai_actions.map((action, index) => (
                      <li key={index}>{action}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}

        {serverError && (
          <p className="text-xs text-red-600">Server simulation unavailable: {serverError}</p>
        )}

        <div className="flex justify-end gap-2">
          {onApplyScenario && (
            <Button onClick={handleApplyScenario} disabled={isApplyingScenario}>
              {isApplyingScenario ? "Applying..." : "Apply This Scenario"}
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
