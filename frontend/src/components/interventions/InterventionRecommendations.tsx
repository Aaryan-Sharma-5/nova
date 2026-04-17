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

  return (
    <div className="space-y-4">
      {/* Header */}
      <div
        className="border-l-4 p-4 rounded-r-lg"
        style={{
          backgroundColor: 'var(--alert-banner-bg)',
          borderLeftColor: overallUrgency === 'critical' ? 'var(--alert-critical)' : 'var(--accent-primary)',
          color: 'var(--text-primary)',
          borderTop: '1px solid var(--border-color)',
          borderRight: '1px solid var(--border-color)',
          borderBottom: '1px solid var(--border-color)',
        }}
      >
        <div className="flex items-center gap-3 mb-2">
          {urgencyIcons[overallUrgency]}
          <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
            Intervention Recommendations for {employeeName}
          </h3>
        </div>
        <p className="text-sm opacity-90 mb-2">{urgencyBadgeText[overallUrgency]}</p>
        <p className="text-sm italic">{reasoning}</p>
      </div>

      {/* Recommendations List */}
      <div className="space-y-3">
        {recommendations.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <CheckCircle className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>{emptyStateMessage}</p>
          </div>
        ) : (
          recommendations.map((rec, index) => (
            <div
              key={index}
              className="border rounded-lg overflow-hidden transition-all"
              style={{
                borderColor: expandedIndex === index ? 'var(--accent-primary)' : 'var(--border-color)',
                backgroundColor: 'var(--bg-card)',
              }}
            >
              {/* Collapsed Header */}
              <button
                onClick={() => setExpandedIndex(expandedIndex === index ? null : index)}
                className="w-full text-left p-4 transition-colors flex items-center justify-between"
                style={{ backgroundColor: expandedIndex === index ? 'var(--bg-secondary)' : 'var(--bg-card)' }}
              >
                <div className="flex-1 flex items-center gap-3">
                  <div
                    className={`w-1 h-1 rounded-full ${
                      rec.urgency === 'critical'
                        ? 'bg-red-500'
                        : rec.urgency === 'high'
                        ? 'bg-orange-500'
                        : rec.urgency === 'medium'
                        ? 'bg-yellow-500'
                        : 'bg-blue-500'
                    }`}
                  />
                  <div>
                    <h4 className="font-semibold capitalize">
                      {rec.intervention_type.replace(/-/g, ' ')}
                    </h4>
                    <p className="text-sm text-muted-foreground">{rec.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 ml-4">
                  <div className="text-right mr-2">
                    <div className="text-xs font-semibold text-muted-foreground uppercase">
                      {rec.urgency}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {Math.round(rec.priority_score * 100)}% priority
                    </div>
                  </div>
                  {expandedIndex === index ? (
                    <ChevronUp className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  )}
                </div>
              </button>

              {/* Expanded Details */}
              {expandedIndex === index && (
                <div className="border-t p-4 space-y-3" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
                  <div>
                    <h5 className="font-semibold text-sm text-foreground mb-1">
                      Estimated Impact
                    </h5>
                    <p className="text-sm text-muted-foreground">{rec.estimated_impact}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <h5 className="font-semibold text-sm text-foreground mb-1">
                        Timing Window
                      </h5>
                      <p className="text-sm text-muted-foreground">{rec.timing_window}</p>
                    </div>
                    <div>
                      <h5 className="font-semibold text-sm text-foreground mb-1">
                        Risks If Delayed
                      </h5>
                      <p className="text-sm" style={{ color: 'var(--alert-critical)' }}>{rec.risks_if_delayed}</p>
                    </div>
                  </div>

                  {/* Action Row */}
                  {executingIndex !== index && (
                    <div className="mt-3 flex items-center gap-2">
                      <select
                        value={selectedActionByIndex[index] ?? ''}
                        onChange={(event) => handleRowAction(index, rec, event.target.value as '' | 'execute' | 'simulate')}
                        className="h-9 rounded-md border border-foreground bg-background px-3 text-sm"
                      >
                        <option value="">Select action...</option>
                        {onExecuteIntervention && <option value="execute">Mark as Executed</option>}
                        <option value="simulate">Simulate Intervention</option>
                      </select>
                    </div>
                  )}

                  {executingIndex === index && (
                    <div className="mt-3 p-3 border rounded space-y-2" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-card)' }}>
                      <label className="block text-sm font-semibold text-foreground">
                        Execution Notes (Optional)
                      </label>
                      <textarea
                        value={executionNotes}
                        onChange={(e) => setExecutionNotes(e.target.value)}
                        placeholder="Document any relevant notes about this intervention..."
                        className="w-full p-2 border rounded text-sm focus:outline-none"
                        style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
                        rows={3}
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleExecute(index)}
                          disabled={isLoading}
                          className="px-4 py-2 rounded disabled:opacity-50 transition-colors text-sm font-semibold"
                          style={{ backgroundColor: 'var(--button-primary-bg)', color: 'var(--button-primary-text)' }}
                        >
                          {isLoading ? 'Saving...' : 'Confirm Execution'}
                        </button>
                        <button
                          onClick={() => {
                            setExecutingIndex(null);
                            setExecutionNotes('');
                            setSelectedActionByIndex((prev) => ({ ...prev, [index]: '' }));
                          }}
                          className="px-4 py-2 rounded transition-colors text-sm"
                          style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
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

      {/* Support Text */}
      <div className="p-3 border rounded text-sm" style={{ backgroundColor: 'var(--alert-banner-bg)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}>
        <p>
          <strong>Tip:</strong> Implement interventions in priority order. Track execution
          in the database for audit trails and impact analysis.
        </p>
      </div>
    </div>
  );
};

export default InterventionRecommendations;
