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
  const [simulatorInputs, setSimulatorInputs] = useState<{
    meetingLoadReductionPct: number;
    workHoursNormalizationPct: number;
    teamSizeAdjustmentPct: number;
    managerOneOnOneFrequency: number;
  } | null>(null);

  const urgencyColors: Record<string, string> = {
    low: 'bg-blue-50 border-blue-200 text-blue-700',
    medium: 'bg-yellow-50 border-yellow-200 text-yellow-700',
    high: 'bg-orange-50 border-orange-200 text-orange-700',
    critical: 'bg-red-50 border-red-200 text-red-700',
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
      <div className={`border-l-4 p-4 rounded-r-lg ${urgencyColors[overallUrgency]}`}>
        <div className="flex items-center gap-3 mb-2">
          {urgencyIcons[overallUrgency]}
          <h3 className="font-semibold">Intervention Recommendations for {employeeName}</h3>
        </div>
        <p className="text-sm opacity-90 mb-2">{urgencyBadgeText[overallUrgency]}</p>
        <p className="text-sm italic">{reasoning}</p>
      </div>

      {/* Recommendations List */}
      <div className="space-y-3">
        {recommendations.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <CheckCircle className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>{emptyStateMessage}</p>
          </div>
        ) : (
          recommendations.map((rec, index) => (
            <div
              key={index}
              className={`border rounded-lg overflow-hidden transition-all ${
                expandedIndex === index ? 'border-gray-400 shadow-md' : 'border-gray-200'
              }`}
            >
              {/* Collapsed Header */}
              <button
                onClick={() => setExpandedIndex(expandedIndex === index ? null : index)}
                className="w-full text-left p-4 hover:bg-gray-50 transition-colors flex items-center justify-between"
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
                    <p className="text-sm text-gray-600">{rec.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 ml-4">
                  <div className="text-right mr-2">
                    <div className="text-xs font-semibold text-gray-600 uppercase">
                      {rec.urgency}
                    </div>
                    <div className="text-xs text-gray-500">
                      {Math.round(rec.priority_score * 100)}% priority
                    </div>
                  </div>
                  {expandedIndex === index ? (
                    <ChevronUp className="w-4 h-4 text-gray-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  )}
                </div>
              </button>

              {/* Expanded Details */}
              {expandedIndex === index && (
                <div className="border-t bg-gray-50 p-4 space-y-3">
                  <div>
                    <h5 className="font-semibold text-sm text-gray-700 mb-1">
                      Estimated Impact
                    </h5>
                    <p className="text-sm text-gray-600">{rec.estimated_impact}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <h5 className="font-semibold text-sm text-gray-700 mb-1">
                        Timing Window
                      </h5>
                      <p className="text-sm text-gray-600">{rec.timing_window}</p>
                    </div>
                    <div>
                      <h5 className="font-semibold text-sm text-gray-700 mb-1">
                        Risks If Delayed
                      </h5>
                      <p className="text-sm text-red-600">{rec.risks_if_delayed}</p>
                    </div>
                  </div>

                  {/* Execution Section */}
                  {onExecuteIntervention && executingIndex !== index && (
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => setExecutingIndex(index)}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-semibold"
                      >
                        Mark as Executed
                      </button>
                      <button
                        onClick={() => openSimulatorForRecommendation(rec)}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-semibold"
                      >
                        Simulate Intervention
                      </button>
                    </div>
                  )}

                  {!onExecuteIntervention && (
                    <button
                      onClick={() => openSimulatorForRecommendation(rec)}
                      className="mt-3 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-semibold"
                    >
                      Simulate Intervention
                    </button>
                  )}

                  {executingIndex === index && (
                    <div className="mt-3 p-3 border border-green-200 bg-green-50 rounded space-y-2">
                      <label className="block text-sm font-semibold text-gray-700">
                        Execution Notes (Optional)
                      </label>
                      <textarea
                        value={executionNotes}
                        onChange={(e) => setExecutionNotes(e.target.value)}
                        placeholder="Document any relevant notes about this intervention..."
                        className="w-full p-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                        rows={3}
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleExecute(index)}
                          disabled={isLoading}
                          className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 transition-colors text-sm font-semibold"
                        >
                          {isLoading ? 'Saving...' : 'Confirm Execution'}
                        </button>
                        <button
                          onClick={() => {
                            setExecutingIndex(null);
                            setExecutionNotes('');
                          }}
                          className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 transition-colors text-sm"
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
      <div className="p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-700">
        <p>
          <strong>📋 Tip:</strong> Implement interventions in priority order. Track execution
          in the database for audit trails and impact analysis.
        </p>
      </div>
    </div>
  );
};

export default InterventionRecommendations;
