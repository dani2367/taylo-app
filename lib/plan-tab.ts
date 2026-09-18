import { router } from 'expo-router';

export type PlanTabId = 'radar' | 'schedule' | 'family';

let queuedTab: PlanTabId | null = null;

export function queuePlanTab(tab: PlanTabId) {
  queuedTab = tab;
}

export function takeQueuedPlanTab(): PlanTabId | null {
  const tab = queuedTab;
  queuedTab = null;
  return tab;
}

export function openPlanFamilyPerson(personId: string) {
  router.push({ pathname: '/plan', params: { tab: 'family', person: personId } });
}
