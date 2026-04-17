import React, { useState } from 'react';
import { AlertCircle, CheckCircle, Clock, TrendingUp, ChevronDown, ChevronUp } from 'lucide-react';
import WhatIfSimulator from '@/components/dashboard/WhatIfSimulator';
import type { WhatIfScenarioPayload } from '@/components/dashboard/WhatIfSimulator';
import { Skeleton } from '@/components/ui/skeleton';

export interface InterventionRecommendation {
  intervention_type: string;
  description: string;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  priority_score: number;
  estimated_impact: string;
  timing_window: string;
  risks_if_delayed: string;
}

interface InterventionRecommendationsProps {
  employeeId: string;
  employeeName?: string;
  recommendations: InterventionRecommendation[];
  overallUrgency: 'low' | 'medium' | 'high' | 'critical';
  reasoning: string;
  onExecuteIntervention?: (interventionType: string, notes: string) => Promise<void>;
  isLoading?: boolean;
  currentBurnoutRisk?: number;
  currentAttritionRisk?: number;
  workHoursPerWeek?: number;
  sentimentScore?: number;
  engagementScore?: number;
  tenureMonths?: number;
  emptyStateMessage?: string;
}

const InterventionRecommendations: React.FC<InterventionRecommendationsProps> = ({
  employeeId,
  employeeName = 'Employee',
  recommendations,
  overallUrgency,
  reasoning,
  onExecuteIntervention,
  isLoading = false,
  currentBurnoutRisk = 62,
  currentAttritionRisk = 48,
  workHoursPerWeek = 48,
  sentimentScore = -0.2,
  engagementScore = 54,
  tenureMonths = 16,
  emptyStateMessage = 'No immediate interventions recommended for this employee profile.',
}) => {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(0);
  const [executingIndex, setExecutingIndex] = useState<number | null>(null);
  const [executionNotes, setExecutionNotes] = useState<string>('');
  const [simulatorOpen, setSimulatorOpen] = useState<boolean>(false);
  const [simulatorInterventionLabel, setSimulatorInterventionLabel] = useState<string>('');
  const [simulatorInterventionType, setSimulatorInterventionType] = useState<string>('');
  const [selectedActionByIndex, setSelectedActionByIndex] = useState<Record<number, '' | 'execute' | 'simulate'>>({});
  const [simulatorInputs, setSimulatorInputs] = useState<{
    meetingLoadReductionPct: number;
    workHoursNormalizationPct: number;
    teamSizeAdjustmentPct: number;
    managerOneOnOneFrequency: number;
  } | null>(null);

  const urgencyColors: Record<string, { border: string; badge: string }> = {
    critical: {
      border: '#000000',
      badge: '#FF1744',
    },
    high: {
      border: '#000000',
      badge: '#F5C518',
    },
    medium: {
      border: '#000000',
      badge: '#6B7280',
    },
    low: {
      border: '#000000',
      badge: '#9CA3AF',
    },
  };

  const urgencyIcons: Record<string, React.ReactNode> = {
    low: <Clock className="w-4 h-4" />,
    medium: <AlertCircle className="w-4 h-4" />,
    high: <TrendingUp className="w-4 h-4" />,
    critical: <AlertCircle className="w-4 h-4" />,
  };

  const urgencyBadgeText: Record<string, string> = {
    low: 'Low Priority',
    medium: 'Medium Priority',
    high: 'High Priority',
    critical: 'Critical - Act Immediately',
  };

  const interventionPrefillMap: Record<string, {
    meetingLoadReductionPct: number;
    workHoursNormalizationPct: number;
    teamSizeAdjustmentPct: number;
    managerOneOnOneFrequency: number;
  }> = {
    'workload-reduction': {
      meetingLoadReductionPct: 35,
      workHoursNormalizationPct: 30,
      teamSizeAdjustmentPct: -10,
      managerOneOnOneFrequency: 2,
    },
    'one-on-one': {
      meetingLoadReductionPct: 10,
      workHoursNormalizationPct: 15,
      teamSizeAdjustmentPct: 0,
      managerOneOnOneFrequency: 4,
    },
    mentoring: {
      meetingLoadReductionPct: 8,
      workHoursNormalizationPct: 10,
      teamSizeAdjustmentPct: -5,
      managerOneOnOneFrequency: 3,
    },
    'wellness-program': {
      meetingLoadReductionPct: 12,
      workHoursNormalizationPct: 20,
      teamSizeAdjustmentPct: 0,
      managerOneOnOneFrequency: 2,
    },
    'promotion-discussion': {
      meetingLoadReductionPct: 5,
      workHoursNormalizationPct: 10,
      teamSizeAdjustmentPct: 0,
      managerOneOnOneFrequency: 2,
    },
    sabbatical: {
      meetingLoadReductionPct: 40,
      workHoursNormalizationPct: 45,
      teamSizeAdjustmentPct: -20,
      managerOneOnOneFrequency: 1,
    },
    'team-building': {
      meetingLoadReductionPct: 8,
      workHoursNormalizationPct: 10,
      teamSizeAdjustmentPct: -8,
      managerOneOnOneFrequency: 3,
    },
    'flexible-schedule': {
      meetingLoadReductionPct: 15,
      workHoursNormalizationPct: 30,
      teamSizeAdjustmentPct: 0,
      managerOneOnOneFrequency: 2,
    },
  };

  const handleExecute = async (index: number) => {
    if (!onExecuteIntervention) return;

    setExecutingIndex(index);
    try {
      await onExecuteIntervention(
        recommendations[index].intervention_type,
        executionNotes
      );
      setExecutionNotes('');
      setSelectedActionByIndex((prev) => ({ ...prev, [index]: '' }));
      setExecutingIndex(null);
    } catch (error) {
      console.error('Failed to execute intervention:', error);
    }
  };

  const openSimulatorForRecommendation = (rec: InterventionRecommendation) => {
    setSimulatorInterventionLabel(rec.intervention_type.replace(/-/g, ' '));
    setSimulatorInterventionType(rec.intervention_type);
    setSimulatorInputs(
      interventionPrefillMap[rec.intervention_type] ?? {
        meetingLoadReductionPct: 15,
        workHoursNormalizationPct: 20,
        teamSizeAdjustmentPct: 0,
        managerOneOnOneFrequency: 2,
      },
    );
    setSimulatorOpen(true);
  };

  const handleApplyScenario = async (payload: WhatIfScenarioPayload) => {
    if (!onExecuteIntervention || !simulatorInterventionType) {
      return;
    }

    const notes = [
      `Scenario: ${payload.interventionLabel}`,
      `Inputs -> meeting_reduction=${payload.inputs.meetingLoadReductionPct}%, hours_normalization=${payload.inputs.workHoursNormalizationPct}%, team_adjustment=${payload.inputs.teamSizeAdjustmentPct}%, manager_1on1=${payload.inputs.managerOneOnOneFrequency}/mo`,
      `Client projection -> burnout=${payload.clientProjection.projectedBurnout.toFixed(1)}%, attrition=${payload.clientProjection.projectedAttrition.toFixed(1)}%, burnout_delta=${payload.clientProjection.burnoutDelta.toFixed(1)}pts, attrition_delta=${payload.clientProjection.attritionDelta.toFixed(1)}pts`,
      payload.serverProjection
        ? `Server projection -> burnout=${(payload.serverProjection.projected_burnout_score * 100).toFixed(1)}%, attrition=${(payload.serverProjection.projected_attrition_score * 100).toFixed(1)}%`
        : 'Server projection unavailable',
      'Applied via What-If Intervention Simulator.',
    ].join('\n');

    await onExecuteIntervention(simulatorInterventionType, notes);
  };

  const handleRowAction = (index: number, rec: InterventionRecommendation, action: '' | 'execute' | 'simulate') => {
    setSelectedActionByIndex((prev) => ({ ...prev, [index]: action }));
    if (!action) {
      return;
    }
    if (action === 'simulate') {
      openSimulatorForRecommendation(rec);
      return;
    }
    if (onExecuteIntervention) {
      setExecutingIndex(index);
    } else {
      openSimulatorForRecommendation(rec);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  const colors = urgencyColors[overallUrgency];

  return (
    <div className="space-y-4">
      {/* Header Card — NOVA Brutalist Style */}
      <div
        className="p-4 transition-all"
        style={{
          backgroundColor: '#FFFFFF',
          border: `3px solid ${colors.border}`,
          color: '#000000',
        }}
      >
        <div className="flex items-start gap-3 mb-3">
          <span style={{ color: colors.badge }}>{urgencyIcons[overallUrgency]}</span>
          <div className="flex-1">
            <h3 className="font-bold text-sm uppercase tracking-wider mb-1">
              Intervention Recommendations for {employeeName}
            </h3>
            <div className="inline-flex gap-2 items-center mb-2">
              <span
                className="text-xs font-bold uppercase px-2 py-1"
                style={{
                  backgroundColor: '#F5C518',
                  color: '#000000',
                }}
              >
                {urgencyBadgeText[overallUrgency]}
              </span>
            </div>
            <p className="text-xs leading-relaxed opacity-90">{reasoning}</p>
          </div>
        </div>
      </div>

      {/* Recommendations List */}
      <div className="space-y-3">
        {recommendations.length === 0 ? (
          <div className="text-center py-8 border-2 border-dashed border-gray-300 p-6">
            <CheckCircle className="w-12 h-12 mx-auto mb-2 opacity-30" />
            <p className="text-sm text-gray-600">{emptyStateMessage}</p>
          </div>
        ) : (
          recommendations.map((rec, index) => {
            const recColors = urgencyColors[rec.urgency];
            const isExpanded = expandedIndex === index;

            return (
              <div
                key={index}
                className="overflow-hidden transition-all"
                style={{
                  border: `3px solid ${recColors.border}`,
                  backgroundColor: '#FFFFFF',
                  color: '#000000',
                }}
              >
                {/* Header/Collapsed State */}
                <button
                  onClick={() => setExpandedIndex(isExpanded ? null : index)}
                  className="w-full text-left p-4 transition-colors flex items-center justify-between"
                  style={{
                    backgroundColor: '#FFFFFF',
                    borderBottom: isExpanded ? `3px solid ${recColors.border}` : 'none',
                  }}
                >
                  <div className="flex-1 flex items-start gap-3">
                    <div className="flex flex-col gap-1 mt-0.5">
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: recColors.badge }}
                      />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-bold text-sm uppercase tracking-wider mb-1">
                        {rec.intervention_type.replace(/-/g, ' ')}
                      </h4>
                      <p className="text-xs opacity-75">{rec.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 ml-4 flex-shrink-0">
                    <div className="text-right">
                      <div className="text-xs font-bold uppercase" style={{ color: recColors.badge }}>
                        {rec.urgency}
                      </div>
                      <div className="text-xs opacity-70 font-mono">
                        {Math.round(rec.priority_score * 100)}%
                      </div>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="w-5 h-5 flex-shrink-0" style={{ color: '#000000' }} />
                    ) : (
                      <ChevronDown className="w-5 h-5 flex-shrink-0 opacity-70" style={{ color: '#000000' }} />
                    )}
                  </div>
                </button>

                {/* Expanded Details */}
                {isExpanded && (
                  <div
                    className="p-4 space-y-4 border-t-2"
                    style={{ borderColor: recColors.border }}
                  >
                    <div>
                      <h5 className="font-bold text-xs uppercase tracking-wider mb-2" style={{ color: '#000000' }}>
                        Estimated Impact
                      </h5>
                      <p className="text-xs leading-relaxed opacity-90">{rec.estimated_impact}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <h5 className="font-bold text-xs uppercase tracking-wider mb-2" style={{ color: '#000000' }}>
                          Timing Window
                        </h5>
                        <p className="text-xs opacity-90">{rec.timing_window}</p>
                      </div>
                      <div>
                        <h5 className="font-bold text-xs uppercase tracking-wider mb-2" style={{ color: '#FF1744' }}>
                          Risks If Delayed
                        </h5>
                        <p className="text-xs" style={{ color: '#FF1744' }}>
                          {rec.risks_if_delayed}
                        </p>
                      </div>
                    </div>

                    {/* Action Row */}
                    {executingIndex !== index && (
                      <div className="mt-4 pt-4 border-t-2" style={{ borderColor: recColors.border }}>
                        <select
                          value={selectedActionByIndex[index] ?? ''}
                          onChange={(event) => handleRowAction(index, rec, event.target.value as '' | 'execute' | 'simulate')}
                          className="w-full text-xs font-bold uppercase px-3 py-2 transition-all"
                          style={{
                            backgroundColor: '#FFFFFF',
                            color: '#000000',
                            border: '2px solid #000000',
                          }}
                        >
                          <option value="">Select action...</option>
                          {onExecuteIntervention && <option value="execute">Mark as Executed</option>}
                          <option value="simulate">Simulate Intervention</option>
                        </select>
                      </div>
                    )}

                    {executingIndex === index && (
                      <div
                        className="mt-4 pt-4 space-y-3 border-t-2"
                        style={{
                          borderColor: recColors.border,
                          backgroundColor: '#F9FAFB',
                        }}
                      >
                        <label className="block text-xs font-bold uppercase tracking-wider">
                          Execution Notes (Optional)
                        </label>
                        <textarea
                          value={executionNotes}
                          onChange={(e) => setExecutionNotes(e.target.value)}
                          placeholder="Document any relevant notes about this intervention..."
                          className="w-full p-3 text-xs font-mono border-2 border-gray-400"
                          style={{
                            backgroundColor: '#FFFFFF',
                            color: '#000000',
                            borderColor: '#000000',
                          }}
                          rows={3}
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleExecute(index)}
                            disabled={isLoading}
                            className="flex-1 px-4 py-2 font-bold uppercase text-xs transition-all disabled:opacity-50"
                            style={{
                              backgroundColor: '#F5C518',
                              color: '#000000',
                              border: '2px solid #000000',
                            }}
                          >
                            {isLoading ? 'Saving...' : 'Confirm Execution'}
                          </button>
                          <button
                            onClick={() => {
                              setExecutingIndex(null);
                              setExecutionNotes('');
                              setSelectedActionByIndex((prev) => ({ ...prev, [index]: '' }));
                            }}
                            className="flex-1 px-4 py-2 font-bold uppercase text-xs transition-all"
                            style={{
                              backgroundColor: '#FFFFFF',
                              color: '#000000',
                              border: '2px solid #000000',
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <WhatIfSimulator
        open={simulatorOpen}
        onOpenChange={setSimulatorOpen}
        employeeId={employeeId}
        interventionLabel={simulatorInterventionLabel}
        initialInputs={simulatorInputs ?? undefined}
        onApplyScenario={onExecuteIntervention ? handleApplyScenario : undefined}
        currentContext={{
          burnoutRisk: currentBurnoutRisk,
          attritionRisk: currentAttritionRisk,
          workHoursPerWeek,
          sentimentScore,
          engagementScore,
          tenureMonths,
        }}
      />

      {/* Support Text Card */}
      <div
        className="p-4 text-xs leading-relaxed"
        style={{
          backgroundColor: '#FFFFFF',
          border: '3px solid #F5C518',
          color: '#000000',
          fontWeight: 600,
        }}
      >
        <span className="font-bold">TIP:</span> Implement interventions in priority order. Track execution
        in the database for audit trails and impact analysis.
      </div>
    </div>
  );
};

export default InterventionRecommendations;
