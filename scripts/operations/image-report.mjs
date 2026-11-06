export function summarizeImageScan(scan) {
  const runs = scan?.runs;
  if (!Array.isArray(runs) || !runs.length)
    throw Error("Incomplete scanner output");
  const advisories = new Map(),
    severities = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, UNSPECIFIED: 0 };
  let occurrences = 0;
  for (const run of runs) {
    if (!Array.isArray(run.tool?.driver?.rules) || !Array.isArray(run.results))
      throw Error("Incomplete scanner run");
    occurrences += run.results.length;
    for (const result of run.results)
      if (!run.tool.driver.rules.some((rule) => rule.id === result.ruleId))
        throw Error("Scanner result without advisory rule");
    for (const rule of run.tool.driver.rules) {
      const properties = rule.properties || {},
        severity = properties.cvssV3_severity || "UNSPECIFIED";
      if (!Object.hasOwn(severities, severity) || !rule.id)
        throw Error("Unknown scanner severity or advisory");
      const key = rule.id + "|" + JSON.stringify(properties.purls || []);
      if (!advisories.has(key))
        advisories.set(key, {
          id: rule.id,
          severity,
          purls: properties.purls || [],
          affected: properties.affected_version || null,
          fixed: properties.fixed_version || null,
        });
    }
  }
  for (const value of advisories.values()) severities[value.severity]++;
  return {
    advisoryPackageRules: advisories.size,
    occurrences,
    severities,
    highCriticalGate:
      severities.HIGH + severities.CRITICAL === 0
        ? "clear-in-scanner-scope"
        : "blocked",
    advisories: [...advisories.values()],
  };
}
