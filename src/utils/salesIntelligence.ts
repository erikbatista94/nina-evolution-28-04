/**
 * Centralized Sales Intelligence Utilities
 * Used by ChatInterface, Kanban, and future components (Dashboard, My Day, etc.)
 */

// ============= Close Probability =============

export interface ProbabilitySignal {
  label: string;
  impact: number; // positive = good, negative = bad
  emoji: string;
}

export interface CloseProbability {
  percentage: number;
  band: 'baixa' | 'média' | 'alta';
  signals: ProbabilitySignal[];
}

export interface ProbabilityInput {
  leadScore?: number;
  proposalStatus?: string;
  isUrgent?: boolean;
  hasAppointment?: boolean;
  hasProject?: boolean;
  gapsCount?: number;
  lastInteractionDaysAgo?: number;
  leadTemperature?: string;
  value?: number;
  interestServicesCount?: number;
  city?: string;
  customerType?: string;
}

export function calculateCloseProbability(input: ProbabilityInput): CloseProbability {
  const signals: ProbabilitySignal[] = [];
  let base = 10; // Everyone starts with 10%

  // Lead score (0-100) → weight 25%
  const score = input.leadScore || 0;
  const scoreContrib = Math.round(score * 0.25);
  if (score > 70) {
    signals.push({ label: `Score alto (${score})`, impact: scoreContrib, emoji: '⭐' });
  } else if (score > 40) {
    signals.push({ label: `Score médio (${score})`, impact: scoreContrib, emoji: '📊' });
  } else if (score > 0) {
    signals.push({ label: `Score baixo (${score})`, impact: scoreContrib, emoji: '📉' });
  }
  base += scoreContrib;

  // Proposal sent → +15
  if (input.proposalStatus === 'sent') {
    signals.push({ label: 'Orçamento enviado', impact: 15, emoji: '📄' });
    base += 15;
  } else if (input.proposalStatus === 'accepted') {
    signals.push({ label: 'Orçamento aceito', impact: 25, emoji: '✅' });
    base += 25;
  } else if (input.proposalStatus === 'rejected') {
    signals.push({ label: 'Orçamento recusado', impact: -15, emoji: '❌' });
    base -= 15;
  }

  // Urgency → +15
  if (input.isUrgent) {
    signals.push({ label: 'Lead urgente', impact: 15, emoji: '🔥' });
    base += 15;
  }

  // Appointment → +15
  if (input.hasAppointment) {
    signals.push({ label: 'Visita agendada', impact: 15, emoji: '📅' });
    base += 15;
  }

  // Has project → +10
  if (input.hasProject) {
    signals.push({ label: 'Tem projeto', impact: 10, emoji: '📐' });
    base += 10;
  }

  // Gaps → negative
  if (input.gapsCount && input.gapsCount > 0) {
    const penalty = Math.min(input.gapsCount * 5, 15);
    signals.push({ label: `${input.gapsCount} gap(s) pendente(s)`, impact: -penalty, emoji: '⚠️' });
    base -= penalty;
  }

  // Recency → negative if old
  if (input.lastInteractionDaysAgo !== undefined) {
    if (input.lastInteractionDaysAgo > 14) {
      signals.push({ label: `Sem interação há ${input.lastInteractionDaysAgo}d`, impact: -15, emoji: '⏰' });
      base -= 15;
    } else if (input.lastInteractionDaysAgo > 7) {
      signals.push({ label: `Última interação há ${input.lastInteractionDaysAgo}d`, impact: -8, emoji: '⏳' });
      base -= 8;
    } else if (input.lastInteractionDaysAgo <= 2) {
      signals.push({ label: 'Interação recente', impact: 5, emoji: '💬' });
      base += 5;
    }
  }

  // Value → small bonus if set
  if (input.value && input.value > 0) {
    signals.push({ label: 'Valor definido', impact: 5, emoji: '💰' });
    base += 5;
  }

  const percentage = Math.max(0, Math.min(100, base));
  const band: CloseProbability['band'] = percentage >= 66 ? 'alta' : percentage >= 36 ? 'média' : 'baixa';

  return { percentage, band, signals };
}

// ============= Follow-up Playbook =============

export interface FollowUpSuggestion {
  action: string;
  message: string;
  priority: 'high' | 'medium' | 'low';
  useTemplate: boolean;
  reason: string;
}

export interface FollowUpInput {
  proposalStatus?: string;
  proposalSentDaysAgo?: number;
  hasUpcomingAppointment?: boolean;
  appointmentDate?: string;
  gapsCount?: number;
  gapFields?: string[];
  isUrgent?: boolean;
  lastInteractionDaysAgo?: number;
  leadTemperature?: string;
  windowOpen: boolean;
  stageTitle?: string;
  hasRecentFollowup?: boolean;
}

export function getFollowUpSuggestion(input: FollowUpInput): FollowUpSuggestion {
  const useTemplate = !input.windowOpen;
  const templateNote = useTemplate ? ' (usar template — janela 24h fechada)' : '';

  // Priority 1: Proposal sent >48h with no response
  if (input.proposalStatus === 'sent' && (input.proposalSentDaysAgo || 0) >= 2) {
    return {
      action: 'Retomar orçamento',
      message: `Orçamento enviado há ${input.proposalSentDaysAgo}d sem retorno. Sugerir follow-up de validação${templateNote}`,
      priority: 'high',
      useTemplate,
      reason: `Orçamento enviado há ${input.proposalSentDaysAgo} dia(s) sem resposta`
    };
  }

  // Priority 2: Upcoming appointment → confirm
  if (input.hasUpcomingAppointment && input.appointmentDate) {
    const daysUntil = Math.ceil((new Date(input.appointmentDate).getTime() - Date.now()) / 86400000);
    if (daysUntil <= 2 && daysUntil >= 0) {
      return {
        action: 'Confirmar visita',
        message: `Visita agendada em ${daysUntil === 0 ? 'hoje' : daysUntil + ' dia(s)'}. Confirmar presença${templateNote}`,
        priority: 'high',
        useTemplate,
        reason: 'Visita próxima precisa de confirmação'
      };
    }
  }

  // Priority 3: Urgent lead without response >4h
  if (input.isUrgent && (input.lastInteractionDaysAgo || 0) >= 0.17) {
    return {
      action: 'Atender lead urgente',
      message: `Lead urgente sem resposta. Priorizar contato imediato${templateNote}`,
      priority: 'high',
      useTemplate,
      reason: 'Lead urgente aguardando retorno'
    };
  }

  // Priority 4: Missing qualification data
  if (input.gapsCount && input.gapsCount > 0 && input.gapFields?.length) {
    const field = input.gapFields[0];
    return {
      action: `Coletar: ${field}`,
      message: `Faltam ${input.gapsCount} informação(ões). Perguntar sobre: ${field}${templateNote}`,
      priority: 'medium',
      useTemplate,
      reason: `${input.gapsCount} campo(s) pendente(s) de qualificação`
    };
  }

  // Priority 5: Proposal sent recently → wait but track
  if (input.proposalStatus === 'sent' && (input.proposalSentDaysAgo || 0) < 2) {
    return {
      action: 'Aguardar retorno',
      message: `Orçamento enviado há ${input.proposalSentDaysAgo || 0}d. Aguardar retorno do cliente`,
      priority: 'low',
      useTemplate: false,
      reason: 'Orçamento recém-enviado — aguardar'
    };
  }

  // Priority 6: Cold lead >7d → reactivation
  if (input.leadTemperature === 'frio' && (input.lastInteractionDaysAgo || 0) > 7) {
    return {
      action: 'Reativação',
      message: `Lead frio sem interação há ${input.lastInteractionDaysAgo}d. Enviar mensagem de reativação${templateNote}`,
      priority: 'medium',
      useTemplate,
      reason: 'Lead esfriando sem contato recente'
    };
  }

  // Priority 7: No interaction >3d
  if ((input.lastInteractionDaysAgo || 0) > 3) {
    return {
      action: 'Follow-up padrão',
      message: `Sem interação há ${input.lastInteractionDaysAgo}d. Enviar follow-up${templateNote}`,
      priority: 'low',
      useTemplate,
      reason: 'Manter contato ativo'
    };
  }

  // Default
  return {
    action: 'Aguardar',
    message: 'Lead em andamento. Acompanhar evolução da conversa',
    priority: 'low',
    useTemplate: false,
    reason: 'Sem ação imediata necessária'
  };
}

// ============= Win Checklist =============

export interface WinCheckItem {
  field: string;
  label: string;
  passed: boolean;
  value?: string;
}

export interface WinCheckResult {
  canWin: boolean;
  items: WinCheckItem[];
  missingCount: number;
}

export function validateWinChecklist(deal: {
  value?: number;
  userId?: string;
  contactName?: string;
  contactCity?: string;
  contactAddress?: string;
  contactInterestServices?: string[];
}): WinCheckResult {
  const items: WinCheckItem[] = [
    {
      field: 'value',
      label: 'Valor do orçamento',
      passed: (deal.value || 0) > 0,
      value: deal.value ? `R$ ${deal.value.toLocaleString('pt-BR')}` : undefined,
    },
    {
      field: 'contact_name',
      label: 'Nome do contato',
      passed: !!(deal.contactName && deal.contactName.length > 0),
      value: deal.contactName || undefined,
    },
    {
      field: 'address',
      label: 'Endereço / Cidade',
      passed: !!(deal.contactAddress || deal.contactCity),
      value: deal.contactAddress || deal.contactCity || undefined,
    },
    {
      field: 'services',
      label: 'Serviço fechado',
      passed: (deal.contactInterestServices?.length || 0) > 0,
      value: deal.contactInterestServices?.join(', ') || undefined,
    },
    {
      field: 'owner',
      label: 'Responsável definido',
      passed: !!deal.userId,
    },
  ];

  const missingCount = items.filter(i => !i.passed).length;
  return { canWin: missingCount === 0, items, missingCount };
}
