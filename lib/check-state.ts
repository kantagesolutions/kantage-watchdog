let isChecking = false;
const checkingServices = new Set<string>();

export function setCheckStarted(serviceKeys: string[]) {
  isChecking = true;
  serviceKeys.forEach(k => checkingServices.add(k));
}

export function setServiceDone(key: string) {
  checkingServices.delete(key);
  if (checkingServices.size === 0) isChecking = false;
}

export function getCheckState(): { isChecking: boolean; checkingServices: string[] } {
  return { isChecking, checkingServices: [...checkingServices] };
}
